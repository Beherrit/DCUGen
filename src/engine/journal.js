// The campaign journal: what happened to a character in play, session by session.
//
// ch.journal = { entries: [{ id, date, session, title, text, people: [{ name, relation, who, status }],
//                            downtime, tags, created }] }
//
// Each entry also lives on the bio's life timeline (stage "In play"), so it shows up with the rest
// of the character's life, in exports and in the World wiki. People named in an entry join
// "People in their life" (or have their status updated), and GM awards made for the entry carry
// its id so the journal can show what the session paid for.

import { awardPoints } from './advancement.js';

const newId = () => `j-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const today = () => new Date().toISOString().slice(0, 10);
const endStop = (s) => (/[.!?]['"]?$/.test(String(s).trim()) ? String(s).trim() : `${String(s).trim()}.`);

export const JOURNAL_RELATIONS = ['Ally', 'Friend', 'Enemy', 'Rival', 'Mentor', 'Student', 'Love', 'Ex', 'Dependent', 'Contact', 'Employer', 'Teammate', 'Nemesis', 'Family'];

/** A bio shell for characters that never rolled one (hand-built, imported, creatures). */
export function ensureBio(ch) {
  if (!ch.bio) ch.bio = { version: 1, manual: true, summary: '', sections: [], timeline: [], family: { parents: [], siblings: [], structure: '' }, people: [], personality: {}, motivations: [], secrets: [], regrets: [], hopes: [], hooks: [], complications: [], benefits: {} };
  ch.bio.timeline = ch.bio.timeline || [];
  ch.bio.people = ch.bio.people || [];
  return ch.bio;
}

export function ensureJournal(ch) {
  if (!ch.journal) ch.journal = { entries: [] };
  ch.journal.entries = ch.journal.entries || [];
  return ch.journal;
}

function timelineText(e) {
  const head = e.title ? e.title.trim() : '';
  const body = e.text ? e.text.trim() : '';
  return endStop(head && body ? `${head}: ${body}` : head || body || 'Session played');
}

function syncTimeline(ch, e) {
  const bio = ensureBio(ch);
  const age = Number.isFinite(Number(ch.identity?.age)) ? Number(ch.identity.age) : null;
  const row = { age: age ?? (bio.timeline.length ? Math.max(...bio.timeline.map((t) => t.age || 0)) : 0), stage: 'In play', text: timelineText(e), tags: ['play', ...(e.tags || [])], journalId: e.id, session: e.session, date: e.date };
  const i = bio.timeline.findIndex((t) => t.journalId === e.id);
  if (i >= 0) bio.timeline[i] = { ...bio.timeline[i], ...row };
  else bio.timeline.push(row);
  if (e.downtime) {
    const dt = { age: row.age, stage: 'Between adventures', text: endStop(e.downtime), tags: ['downtime'], journalId: e.id, downtime: true, session: e.session, date: e.date };
    const j = bio.timeline.findIndex((t) => t.journalId === e.id && t.downtime);
    if (j >= 0) bio.timeline[j] = { ...bio.timeline[j], ...dt }; else bio.timeline.push(dt);
  } else bio.timeline = bio.timeline.filter((t) => !(t.journalId === e.id && t.downtime));
}

function findPerson(bio, name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  for (const p of bio.people || []) if (String(p.name).toLowerCase() === n) return { p, list: 'people' };
  for (const p of bio.family?.parents || []) if (String(p.name).toLowerCase() === n) return { p, list: 'parents' };
  for (const p of bio.family?.siblings || []) if (String(p.name).toLowerCase() === n) return { p, list: 'siblings' };
  return null;
}

function syncPeople(ch, e) {
  const bio = ensureBio(ch);
  for (const person of e.people || []) {
    const name = String(person.name || '').trim();
    if (!name) continue;
    const found = findPerson(bio, name);
    const label = e.session ? `Session ${e.session}` : e.date || 'In play';
    if (found) {
      if (person.status) found.p.status = endStop(person.status);
      if (person.relation && found.list === 'people' && person.relation !== found.p.relation) { found.p.relation = person.relation; found.p.changed = label; }
      if (person.who && !(found.p.who || '').includes(person.who)) found.p.who = `${found.p.who ? `${endStop(found.p.who)} ` : ''}${label}: ${endStop(person.who)}`;
      found.p.lastSeen = label;
    } else {
      bio.people.push({ name, relation: person.relation || 'Contact', who: endStop(person.who || `Met in play (${label}).`), status: endStop(person.status || 'Still around.'), journalId: e.id, met: label });
    }
  }
}

/** Add a session to the journal (and to the life timeline, the people list and the point log). */
export function addJournalEntry(ch, R, data = {}) {
  const j = ensureJournal(ch);
  const e = {
    id: newId(),
    date: data.date || today(),
    session: data.session != null && data.session !== '' ? Number(data.session) : j.entries.length + 1,
    title: String(data.title || '').trim(),
    text: String(data.text || '').trim(),
    people: (data.people || []).filter((p) => p && String(p.name || '').trim()).map((p) => ({ name: String(p.name).trim(), relation: p.relation || '', who: String(p.who || '').trim(), status: String(p.status || '').trim() })),
    downtime: String(data.downtime || '').trim(),
    tags: data.tags || [],
    created: new Date().toISOString(),
  };
  j.entries.push(e);
  syncTimeline(ch, e);
  syncPeople(ch, e);
  const pts = Number(data.pointsEarned);
  if (pts) {
    awardPoints(ch, R, pts, `Session ${e.session}${e.title ? `: ${e.title}` : ''}`);
    ch.advancement.log[ch.advancement.log.length - 1].journalId = e.id;
  }
  return e;
}

export function updateJournalEntry(ch, R, id, patch = {}) {
  const j = ensureJournal(ch);
  const e = j.entries.find((x) => x.id === id);
  if (!e) return null;
  for (const k of ['date', 'title', 'text', 'downtime', 'tags']) if (patch[k] !== undefined) e[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
  if (patch.session !== undefined && patch.session !== '') e.session = Number(patch.session);
  if (patch.people) e.people = patch.people.filter((p) => p && String(p.name || '').trim()).map((p) => ({ name: String(p.name).trim(), relation: p.relation || '', who: String(p.who || '').trim(), status: String(p.status || '').trim() }));
  syncTimeline(ch, e);
  syncPeople(ch, e);
  const pts = Number(patch.pointsEarned);
  if (pts) {
    awardPoints(ch, R, pts, `Session ${e.session}${e.title ? `: ${e.title}` : ''}`);
    ch.advancement.log[ch.advancement.log.length - 1].journalId = e.id;
  }
  return e;
}

export function removeJournalEntry(ch, id) {
  const j = ensureJournal(ch);
  j.entries = j.entries.filter((x) => x.id !== id);
  if (ch.bio) {
    ch.bio.timeline = (ch.bio.timeline || []).filter((t) => t.journalId !== id);
    ch.bio.people = (ch.bio.people || []).filter((p) => p.journalId !== id);
  }
  for (const e of ch.advancement?.log || []) if (e.journalId === id) delete e.journalId;
  return ch;
}

/** Advancement entries that belong to a journal entry. */
export function journalPoints(ch, id) {
  return (ch.advancement?.log || []).filter((e) => e.journalId === id);
}

/** Spending entries not yet tied to a session. */
export function unlinkedSpends(ch) {
  return (ch.advancement?.log || []).filter((e) => (e.type === 'spend' || e.type === 'refund') && !e.journalId);
}

export function linkPoints(ch, logId, journalId) {
  const e = (ch.advancement?.log || []).find((x) => x.id === logId);
  if (e) { if (journalId) e.journalId = journalId; else delete e.journalId; }
  return ch;
}

/** Entries newest first. */
export function journalEntries(ch) {
  return [...(ch.journal?.entries || [])].sort((a, b) => (b.session || 0) - (a.session || 0) || String(b.date || '').localeCompare(String(a.date || '')));
}

export function journalText(ch) {
  const out = [];
  for (const e of [...(ch.journal?.entries || [])].sort((a, b) => (a.session || 0) - (b.session || 0))) {
    out.push(`Session ${e.session}${e.date ? ` (${e.date})` : ''}${e.title ? `: ${e.title}` : ''}`);
    if (e.text) out.push(`  ${e.text}`);
    for (const p of e.people || []) out.push(`  - ${p.name}${p.relation ? ` (${p.relation})` : ''}${p.who ? `: ${p.who}` : ''}${p.status ? ` [${p.status}]` : ''}`);
    for (const a of journalPoints(ch, e.id)) out.push(`  * ${a.type === 'award' ? `+${a.points} pp earned` : `${a.points} pp spent`}${a.changes?.length ? `: ${a.changes.join('; ')}` : a.note ? `: ${a.note}` : ''}`);
    if (e.downtime) out.push(`  Between adventures: ${e.downtime}`);
    out.push('');
  }
  return out.join('\n').trim();
}
