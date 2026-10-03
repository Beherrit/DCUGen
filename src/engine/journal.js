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
import { generateCharacter } from './generator.js';
import { characterKey } from './keys.js';
import { makeRng } from './rng.js';

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

// ---- enemies ----------------------------------------------------------------------------------
//
// Some heroes collect enemies. A nuisance keeps turning up; a threat means it; a nemesis has made
// it personal. The enemy is a full villain rolled at a power level that fits the threat, and the
// person entry carries their key, so they open as a complete character with their own bio.

export const ENEMY_LEVELS = {
  nuisance: { label: 'Nuisance', plShift: [-4, -2], relation: 'Enemy', blurb: 'Outclassed, annoying, and never quite gone.' },
  threat: { label: 'Threat', plShift: [-1, 1], relation: 'Enemy', blurb: 'A real danger who means every word.' },
  nemesis: { label: 'Nemesis', plShift: [0, 2], relation: 'Nemesis', blurb: 'Their opposite number. It\'s personal, and it will not end well for one of them.' },
};

const ENEMY_REASONS = {
  nuisance: [
    'keeps robbing the same three banks and takes it personally every time {hero} shows up',
    'blames {hero} for a job that went wrong years ago and has never let it go',
    'runs a small crew that {hero} keeps breaking up, and keeps rebuilding it',
    'sees {hero} as the one thing standing between them and the big leagues',
    'picked a fight with {hero} on a dare and has been losing it ever since',
    'got {hero} on camera at a bad moment and has milked it for all it is worth',
    'is convinced {hero} is a fraud and keeps trying to prove it in public',
    'wants {hero}\'s territory, costume, name, or all three',
    'escapes every month, calls {hero} out every month, and loses every month',
    'thinks {hero} owes them money, and has started charging interest',
  ],
  threat: [
    'wants {hero} out of the way and has the means to do it',
    'runs the operation {hero} has been dismantling piece by piece, and has had enough',
    'was put away by {hero} once, and came back with friends',
    'has been hired, by someone who will not give a name, to make {hero} stop',
    'believes {hero} is a danger to the city and intends to prove it the hard way',
    'has studied {hero}\'s every fight and found the weak point',
    'needs something only {hero} is protecting, and will go through anyone to get it',
    'shares {hero}\'s origin and none of {hero}\'s scruples',
    'has already hurt someone close to {hero}, and promised that was only the start',
    'is building toward something big, and {hero} is the loose end',
  ],
  nemesis: [
    'is everything {hero} might have become, and knows it',
    'was there the day {hero} got powers, and got the mirror image',
    'blames {hero} for the loss that made them, and has built a life around paying it back',
    'was once {hero}\'s closest ally, and has never forgiven the betrayal, real or imagined',
    'cannot be beaten for good: every defeat only teaches them more about {hero}',
    'knows {hero}\'s real name, and is saving it for the right moment',
    'wants {hero} to join them, and will burn the city down to make the offer convincing',
    'has decided the two of them are the only ones who matter, and the rest of the world is scenery',
    'kills what {hero} protects, slowly, to see what it takes to make {hero} break the rules',
    'was made by the same hands as {hero}, and intends to be the only one left',
  ],
};
const ENEMY_STATUS = {
  nuisance: ['At large, and probably planning something small.', 'Back in a cell, for now.', 'Lying low after the last beating.', 'Sending threatening letters from a holding cell.'],
  threat: ['At large.', 'Escaped custody last month.', 'Running the operation from somewhere {hero} cannot reach.', 'Watching, waiting for the right moment.'],
  nemesis: ['At large, and {hero} can feel it.', 'Locked away, for whatever that is worth.', 'Missing, presumed plotting.', 'Closer than {hero} thinks.'],
};

/**
 * Roll an enemy for a character and add them to their life (people, timeline, and a complication if asked).
 * opts: { level: 'nuisance'|'threat'|'nemesis', seed, name, complication, theme, archetype }
 * Returns { person, villain }.
 */
export function addEnemy(ch, R, { level = 'threat', seed = randomSeedFor(ch), name, complication = true, theme = null, archetype = null } = {}) {
  const L = ENEMY_LEVELS[level] || ENEMY_LEVELS.threat;
  const rng = makeRng(`${seed}::enemy`);
  const basePl = Math.max(1, Number(ch.pl) || 10);
  const pl = Math.max(1, Math.min(20, basePl + rng.int(L.plShift[0], L.plShift[1])));
  const villain = generateCharacter(R, { seed: `${seed}::villain`, pl, alignment: 'villain', chaos: 0.35, theme, archetype });
  if (name) villain.identity = { ...villain.identity, codename: name };
  const hero = ch.identity?.codename || ch.identity?.realName || 'them';
  const fill = (t) => t.replace(/\{hero\}/g, hero);
  const reason = fill(rng.pick(ENEMY_REASONS[level] || ENEMY_REASONS.threat));
  const status = fill(rng.pick(ENEMY_STATUS[level] || ENEMY_STATUS.threat));
  const codename = villain.identity.codename;
  const who = `${codename}${villain.identity.realName && villain.identity.realName !== codename ? ` (${villain.identity.realName})` : ''}, a PL ${pl} ${String(villain.archetype?.name || 'villain').toLowerCase()}${villain.theme?.name ? ` with ${villain.theme.name.toLowerCase()} powers` : ''}, who ${reason}.`;
  const bio = ensureBio(ch);
  const person = { name: codename, relation: L.relation, who, status, key: characterKey(R, villain), enemy: { level, pl, seed } };
  bio.people = [...bio.people.filter((p) => p.name !== codename), person];
  const age = Number.isFinite(Number(ch.identity?.age)) ? Number(ch.identity.age) : (bio.timeline.length ? Math.max(...bio.timeline.map((t) => t.age || 0)) : 0);
  bio.timeline.push({ age, stage: 'In play', text: `Made an enemy: ${codename}, who ${reason}.`, tags: ['play', 'enemy', level], enemyOf: codename });
  if (complication) {
    const type = level === 'nemesis' ? 'Enemy' : 'Enemy';
    const text = `${level === 'nemesis' ? 'Nemesis' : L.label}: ${codename} ${reason}.`;
    ch.complications = [...(ch.complications || []).filter((c) => !(c.type === type && c.text === text)), { type, text }];
  }
  return { person, villain };
}

function randomSeedFor(ch) {
  return `${ch.seed || ch.identity?.codename || 'enemy'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
