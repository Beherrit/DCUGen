// The World: a wiki of everyone and everything in a campaign, built from the roster and kept in
// a vault (saved world data) that the user extends by hand.
//
// Entities: people, factions, locations, events and items. Links are typed and directed; each
// relation has an inverse, so "Alleycat is Nightfang's mentor" also reads "Nightfang is Alleycat's
// student" on the other page. Everything from the roster and the bios is rebuilt on every build
// (so it is always current) and merged with what the user wrote by hand.
//
// buildWorld(saved, roster, R) -> { entities: Map, links: [], name, ... } with backlinks and
// timelines ready for the UI and for the Markdown vault export.

import { personKey } from './keys.js';

export const ENTITY_TYPES = {
  person: { label: 'People', one: 'Person', glyph: '🧑', color: '#2f6fde' },
  faction: { label: 'Factions', one: 'Faction', glyph: '🏛', color: '#8a5cd6' },
  location: { label: 'Locations', one: 'Location', glyph: '📍', color: '#1a7f4b' },
  event: { label: 'Events', one: 'Event', glyph: '📅', color: '#c2410c' },
  item: { label: 'Items', one: 'Item', glyph: '🗝', color: '#a8670b' },
};

// rel = what `to` is to `from`. inverse = what `from` is to `to`.
export const RELATIONS = {
  friend: { label: 'Friend', inverse: 'friend', group: 'Friends & allies', color: '#1a7f4b' },
  ally: { label: 'Ally', inverse: 'ally', group: 'Friends & allies', color: '#1a7f4b' },
  teammate: { label: 'Teammate', inverse: 'teammate', group: 'Friends & allies', color: '#1a7f4b' },
  contact: { label: 'Contact', inverse: 'contact', group: 'Friends & allies', color: '#3aa17e' },
  love: { label: 'Love', inverse: 'love', group: 'Family & loves', color: '#d1495b' },
  ex: { label: 'Ex', inverse: 'ex', group: 'Family & loves', color: '#b56576' },
  parent: { label: 'Parent', inverse: 'child', group: 'Family & loves', color: '#8a5a44' },
  child: { label: 'Child', inverse: 'parent', group: 'Family & loves', color: '#8a5a44' },
  sibling: { label: 'Sibling', inverse: 'sibling', group: 'Family & loves', color: '#8a5a44' },
  family: { label: 'Family', inverse: 'family', group: 'Family & loves', color: '#8a5a44' },
  dependent: { label: 'Dependent', inverse: 'guardian', group: 'Family & loves', color: '#8a5a44' },
  guardian: { label: 'Guardian', inverse: 'dependent', group: 'Family & loves', color: '#8a5a44' },
  mentor: { label: 'Mentor', inverse: 'student', group: 'Mentors & students', color: '#2f6fde' },
  student: { label: 'Student', inverse: 'mentor', group: 'Mentors & students', color: '#2f6fde' },
  rival: { label: 'Rival', inverse: 'rival', group: 'Rivals & enemies', color: '#e0a030' },
  enemy: { label: 'Enemy', inverse: 'enemy', group: 'Rivals & enemies', color: '#b42318' },
  nemesis: { label: 'Nemesis', inverse: 'nemesis', group: 'Rivals & enemies', color: '#8e1b1b' },
  fought: { label: 'Fought', inverse: 'fought', group: 'Rivals & enemies', color: '#db3a2f' },
  employer: { label: 'Employer', inverse: 'employee', group: 'Work & factions', color: '#5b6470' },
  employee: { label: 'Employee', inverse: 'employer', group: 'Work & factions', color: '#5b6470' },
  member: { label: 'Member of', inverse: 'hasMember', group: 'Work & factions', color: '#8a5cd6' },
  hasMember: { label: 'Member', inverse: 'member', group: 'Work & factions', color: '#8a5cd6' },
  leader: { label: 'Leads', inverse: 'ledBy', group: 'Work & factions', color: '#8a5cd6' },
  ledBy: { label: 'Led by', inverse: 'leader', group: 'Work & factions', color: '#8a5cd6' },
  allied: { label: 'Allied with', inverse: 'allied', group: 'Work & factions', color: '#1a7f4b' },
  atWar: { label: 'At war with', inverse: 'atWar', group: 'Rivals & enemies', color: '#b42318' },
  basedIn: { label: 'Based in', inverse: 'baseOf', group: 'Places', color: '#1a7f4b' },
  baseOf: { label: 'Base of', inverse: 'basedIn', group: 'Places', color: '#1a7f4b' },
  livesIn: { label: 'Lives in', inverse: 'homeOf', group: 'Places', color: '#1a7f4b' },
  homeOf: { label: 'Home of', inverse: 'livesIn', group: 'Places', color: '#1a7f4b' },
  from: { label: 'From', inverse: 'birthplaceOf', group: 'Places', color: '#3f7d3a' },
  birthplaceOf: { label: 'Birthplace of', inverse: 'from', group: 'Places', color: '#3f7d3a' },
  worksAt: { label: 'Works at', inverse: 'workplaceOf', group: 'Places', color: '#5b6470' },
  workplaceOf: { label: 'Workplace of', inverse: 'worksAt', group: 'Places', color: '#5b6470' },
  locatedIn: { label: 'Located in', inverse: 'contains', group: 'Places', color: '#1a7f4b' },
  contains: { label: 'Contains', inverse: 'locatedIn', group: 'Places', color: '#1a7f4b' },
  sceneOf: { label: 'Scene of', inverse: 'happenedAt', group: 'Places', color: '#c2410c' },
  happenedAt: { label: 'Happened at', inverse: 'sceneOf', group: 'Places', color: '#c2410c' },
  owns: { label: 'Owns', inverse: 'ownedBy', group: 'Things', color: '#a8670b' },
  ownedBy: { label: 'Owned by', inverse: 'owns', group: 'Things', color: '#a8670b' },
  created: { label: 'Created', inverse: 'createdBy', group: 'Things', color: '#a8670b' },
  createdBy: { label: 'Created by', inverse: 'created', group: 'Things', color: '#a8670b' },
  involved: { label: 'Involved in', inverse: 'involves', group: 'Events', color: '#c2410c' },
  involves: { label: 'Involves', inverse: 'involved', group: 'Events', color: '#c2410c' },
  related: { label: 'Related to', inverse: 'related', group: 'Other', color: '#6b7480' },
};
export const RELATION_GROUPS = [...new Set(Object.values(RELATIONS).map((r) => r.group))];

const BIO_REL = { Mentor: 'mentor', Student: 'student', Rival: 'rival', Enemy: 'enemy', Nemesis: 'nemesis', Ally: 'ally', Ex: 'ex', Love: 'love', Dependent: 'dependent', Guardian: 'guardian', Friend: 'friend', Contact: 'contact', Employer: 'employer', Teammate: 'teammate', Family: 'family', Parent: 'parent', Sibling: 'sibling', Child: 'child', Daughter: 'child', Son: 'child', Sister: 'sibling', Brother: 'sibling' };

export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

export function emptyWorld() {
  return { v: 1, name: 'My World', tagline: 'Everyone, everywhere, and how they are tied together', description: '', entities: {}, links: [], overrides: {}, hidden: [] };
}

const newId = (prefix) => `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---- building ---------------------------------------------------------------------------------------------------

function makeEntity(id, type, name, extra = {}) {
  return { id, type, name, aliases: [], tags: [], summary: '', body: '', fields: {}, source: 'auto', ...extra };
}

/** Build the live world from the saved vault plus the roster. */
export function buildWorld(saved, roster, R, { openTabs = [] } = {}) {
  const w = { ...emptyWorld(), ...(saved || {}) };
  const entities = new Map();
  const links = [];
  const byName = new Map(); // lower name -> entity (people only), for merging bio people across characters
  const add = (e) => { entities.set(e.id, e); return e; };
  const link = (from, to, rel, extra = {}) => {
    if (!from || !to || from === to) return null;
    if (links.some((l) => l.from === from && l.to === to && l.rel === rel)) return null;
    const l = { id: `${from}|${to}|${rel}`, from, to, rel, source: 'auto', ...extra };
    links.push(l);
    return l;
  };
  const chars = [...roster];
  for (const t of openTabs) if (!chars.some((c) => (c.rosterId && c.rosterId === t.rosterId) || c === t)) chars.push(t);

  // 1. Roster characters are people pages
  const charId = (ch) => `char:${ch.rosterId || ch.seed || slug(ch.identity?.codename || ch.identity?.realName || 'x')}`;
  for (const ch of chars) {
    const id = charId(ch);
    const name = ch.identity?.codename || ch.identity?.realName || 'Unnamed';
    const e = add(makeEntity(id, 'person', name, {
      source: ch.rosterId ? 'roster' : 'open',
      rosterId: ch.rosterId || null,
      character: ch,
      color: ch.theme?.color || null,
      aliases: [ch.identity?.realName].filter((x) => x && x !== name),
      summary: ch.bio?.summary || ch.origin?.text || ch.summary || '',
      fields: {
        'Power level': ch.pl, Side: ch.alignment === 'villain' ? 'Villain' : ch.minion ? 'Minion' : 'Hero', Archetype: ch.archetype?.name, Theme: ch.theme?.name,
        Age: ch.identity?.age, Occupation: ch.identity?.occupation, Base: ch.identity?.base, Homeland: ch.identity?.homeland?.country, Team: ch.team, Status: ch.status,
      },
      tags: [ch.alignment === 'villain' ? 'villain' : 'hero', ch.archetype?.name, ch.theme?.name, ch.team, ...(ch.kind ? [ch.kind] : [])].filter(Boolean).map((x) => String(x).toLowerCase()),
    }));
    byName.set(name.toLowerCase(), e);
    if (ch.identity?.realName) byName.set(String(ch.identity.realName).toLowerCase(), e);
  }

  const personFor = (name, ctx) => {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    const hit = byName.get(key);
    if (hit) return hit;
    const id = `npc:${slug(name)}`;
    const e = entities.get(id) || add(makeEntity(id, 'person', String(name).trim(), { source: 'bio', keys: {}, knownBy: [] }));
    byName.set(key, e);
    void ctx;
    return e;
  };
  const locationFor = (name, kind) => {
    const key = String(name || '').trim();
    if (!key || /^the city$/i.test(key)) return null;
    const id = `loc:${slug(key)}`;
    return entities.get(id) || add(makeEntity(id, 'location', key, { source: 'auto', fields: { Kind: kind } }));
  };
  const factionFor = (name) => {
    const key = String(name || '').trim();
    if (!key) return null;
    const id = `faction:${slug(key)}`;
    return entities.get(id) || add(makeEntity(id, 'faction', key, { source: 'auto' }));
  };

  // 2. Everyone in the bios, journals, families; places and teams
  for (const ch of chars) {
    const me = entities.get(charId(ch));
    const bio = ch.bio || {};
    const note = (p) => [p.who || p.note, p.status].filter(Boolean).join(' ');
    const people = [
      ...(bio.family?.parents || []).map((p) => ({ ...p, kind: 'parent', rel: 'parent' })),
      ...(bio.family?.siblings || []).map((p) => ({ ...p, kind: 'sibling', rel: 'sibling' })),
      ...(bio.people || []).map((p) => ({ ...p, kind: 'person', rel: BIO_REL[p.relation] || 'contact' })),
    ];
    for (const p of people) {
      const other = personFor(p.name, ch);
      if (!other || other === me) continue;
      if (other.source === 'bio') {
        other.knownBy.push({ id: me.id, name: me.name, relation: p.relation || p.role, who: p.who || p.note || '', status: p.status || '', role: p.role, occupation: p.occupation, age: p.age, trait: p.trait });
        if (!other.summary && (p.who || p.note)) other.summary = p.who || p.note;
        if (p.occupation && !other.fields.Occupation) other.fields.Occupation = p.occupation;
        if (p.status && !other.fields.Status) other.fields.Status = p.status;
        if (p.age != null && !other.fields.Age) other.fields.Age = p.age;
        try { other.keys[me.id] = p.key || personKey(ch, p, p.kind); } catch { /* no key */ }
        if (!other.tags.includes(p.relation?.toLowerCase())) other.tags.push((p.relation || p.role || 'npc').toLowerCase());
      }
      link(me.id, other.id, p.rel, { note: note(p), label: p.relation || p.role, via: me.id });
    }
    if (ch.identity?.base) { const l = locationFor(ch.identity.base, 'City'); if (l) { link(me.id, l.id, 'basedIn'); l.tags = [...new Set([...l.tags, 'city'])]; } }
    if (ch.identity?.homeland?.country) { const l = locationFor(ch.identity.homeland.country, 'Country'); if (l) { link(me.id, l.id, 'from'); if (ch.identity.homeland.region && ch.identity.homeland.region !== ch.identity.homeland.country) { const r = locationFor(ch.identity.homeland.region, 'Region'); if (r) { link(r.id, l.id, 'locatedIn'); link(me.id, r.id, 'from'); } } } }
    if (ch.team) { const f = factionFor(ch.team); if (f) { link(me.id, f.id, 'member'); f.tags = [...new Set([...f.tags, 'team'])]; } }
    // Journal sessions are events
    for (const j of ch.journal?.entries || []) {
      const id = `event:${me.id}:${j.id}`;
      const ev = add(makeEntity(id, 'event', j.title || `Session ${j.session}`, { source: 'journal', summary: j.text || '', fields: { Session: j.session, Date: j.date, Character: me.name }, tags: ['session', ...(j.tags || [])], session: j.session, date: j.date, journal: j, character: me.id }));
      if (j.downtime) ev.fields['Between adventures'] = j.downtime;
      link(me.id, ev.id, 'involved');
      for (const p of j.people || []) { const o = personFor(p.name, ch); if (o) link(o.id, ev.id, 'involved', { note: [p.who, p.status].filter(Boolean).join(' ') }); }
      const pts = (ch.advancement?.log || []).filter((x) => x.journalId === j.id);
      if (pts.length) ev.fields.Points = pts.map((x) => (x.type === 'award' ? `+${x.points} earned` : `${x.points} spent: ${(x.changes || []).join('; ')}`)).join(' · ');
    }
  }

  // 3. Hand-made entities and links from the vault
  for (const e of Object.values(w.entities || {})) {
    const existing = entities.get(e.id);
    if (existing) Object.assign(existing, { summary: e.summary ?? existing.summary, body: e.body ?? existing.body });
    else add({ ...makeEntity(e.id, e.type, e.name), ...e, source: 'manual', fields: { ...(e.fields || {}) }, tags: [...(e.tags || [])], aliases: [...(e.aliases || [])] });
    if (e.type === 'person') byName.set(String(e.name).toLowerCase(), entities.get(e.id));
  }
  for (const l of w.links || []) {
    if (!entities.has(l.from) || !entities.has(l.to)) continue;
    if (!RELATIONS[l.rel]) continue;
    const prev = links.find((x) => x.from === l.from && x.to === l.to && x.rel === l.rel);
    if (prev) { prev.note = l.note || prev.note; prev.source = 'manual'; prev.id = l.id || prev.id; continue; }
    links.push({ ...l, id: l.id || `${l.from}|${l.to}|${l.rel}`, source: 'manual' });
  }
  // Overrides on automatic pages (summary, body, tags, color, aliases, fields)
  for (const [id, o] of Object.entries(w.overrides || {})) {
    const e = entities.get(id);
    if (!e) continue;
    if (o.summary != null) e.summary = o.summary;
    if (o.body != null) e.body = o.body;
    if (o.color) e.color = o.color;
    if (o.aliases) e.aliases = [...new Set([...e.aliases, ...o.aliases])];
    if (o.tags) e.tags = [...new Set([...e.tags, ...o.tags])];
    if (o.fields) e.fields = { ...e.fields, ...o.fields };
    if (o.type && o.type !== e.type) e.type = o.type;
    e.edited = true;
  }
  for (const id of w.hidden || []) entities.delete(id);
  const live = links.filter((l) => entities.has(l.from) && entities.has(l.to));

  // 4. Backlinks: every link also appears from the other end, as its inverse
  for (const e of entities.values()) { e.out = []; e.in = []; e.color = e.color || ENTITY_TYPES[e.type]?.color; }
  for (const l of live) {
    const a = entities.get(l.from); const b = entities.get(l.to);
    a.out.push({ ...l, other: b, rel: l.rel, label: RELATIONS[l.rel]?.label || l.rel });
    b.in.push({ ...l, other: a, rel: RELATIONS[l.rel]?.inverse || 'related', label: RELATIONS[RELATIONS[l.rel]?.inverse]?.label || 'Related' });
  }
  for (const e of entities.values()) {
    e.connections = dedupe([...e.out, ...e.in]);
    e.degree = e.connections.length;
  }
  return { ...w, entities, links: live, roster: chars };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((c) => { const k = `${c.other.id}|${c.rel}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Connections of a page grouped by relation group, in a stable order. */
export function groupedConnections(e) {
  const groups = new Map();
  for (const c of e.connections || []) {
    const g = RELATIONS[c.rel]?.group || 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  }
  return RELATION_GROUPS.filter((g) => groups.has(g)).map((g) => ({ group: g, items: groups.get(g).sort((a, b) => a.other.name.localeCompare(b.other.name)) }));
}

// ---- timelines ------------------------------------------------------------------------------------------------------

/** A person's whole story in order: life events by age, then play by session, with points and battles. */
export function entityTimeline(world, e) {
  const out = [];
  const ch = e.character;
  if (ch) {
    for (const t of ch.bio?.timeline || []) {
      if (t.journalId) continue;
      out.push({ kind: 'life', when: `Age ${t.age}`, sortA: 0, sortB: t.age ?? 0, stage: t.stage, text: t.text, tags: t.tags || [] });
    }
    for (const j of ch.journal?.entries || []) {
      const pts = (ch.advancement?.log || []).filter((x) => x.journalId === j.id);
      out.push({ kind: 'play', when: `Session ${j.session}`, date: j.date, sortA: 1, sortB: j.session || 0, stage: 'In play', text: [j.title, j.text].filter(Boolean).join(': '), people: j.people || [], points: pts, downtime: j.downtime, eventId: `event:${e.id}:${j.id}` });
    }
    for (const a of ch.advancement?.log || []) {
      if (a.journalId && (ch.journal?.entries || []).some((j) => j.id === a.journalId)) continue;
      out.push({ kind: 'points', when: a.date || '', sortA: 1, sortB: 0.5, stage: a.type === 'award' ? 'Points earned' : a.type === 'pl' ? 'Power level' : 'Points spent', text: `${a.type === 'award' ? `+${a.points} pp` : a.type === 'pl' ? '' : `${a.points > 0 ? `−${a.points}` : `+${-a.points}`} pp`}${a.note ? ` · ${a.note}` : ''}${a.changes?.length ? `: ${a.changes.join('; ')}` : ''}`, date: a.date });
    }
  }
  // Events this page is tied to (from other people's journals, battles, hand-made events)
  for (const c of e.connections || []) {
    if (c.other.type !== 'event') continue;
    if (c.other.character === e.id) continue;
    const ev = c.other;
    out.push({ kind: 'event', when: ev.session ? `Session ${ev.session}` : ev.date || '', date: ev.date, sortA: 1, sortB: ev.session || 0, stage: ev.fields?.Kind || 'Event', text: `${ev.name}${ev.summary ? `: ${ev.summary}` : ''}${c.note ? ` (${c.note})` : ''}`, eventId: ev.id });
  }
  // What the people who know this NPC say about them
  if (e.source === 'bio') for (const k of e.knownBy || []) out.push({ kind: 'known', when: '', sortA: 0.5, sortB: 0, stage: `As ${k.name}'s ${(k.relation || '').toLowerCase()}`, text: [k.who, k.status].filter(Boolean).join(' '), by: k.id });
  return out.sort((a, b) => a.sortA - b.sortA || a.sortB - b.sortB || String(a.date || '').localeCompare(String(b.date || '')));
}

/** The campaign's own timeline: every session and event across the whole world. */
export function campaignTimeline(world) {
  const events = [...world.entities.values()].filter((e) => e.type === 'event');
  return events.sort((a, b) => (a.session || 0) - (b.session || 0) || String(a.date || '').localeCompare(String(b.date || '')) || a.name.localeCompare(b.name));
}

// ---- search ------------------------------------------------------------------------------------------------------------

export function searchWorld(world, q, { type = null, limit = 50 } = {}) {
  const term = String(q || '').trim().toLowerCase();
  const all = [...world.entities.values()].filter((e) => !type || e.type === type);
  if (!term) return all.sort((a, b) => b.degree - a.degree || a.name.localeCompare(b.name)).slice(0, limit);
  const score = (e) => {
    const name = e.name.toLowerCase();
    if (name === term) return 100;
    if (name.startsWith(term)) return 80;
    if (name.includes(term)) return 60;
    if (e.aliases.some((a) => String(a).toLowerCase().includes(term))) return 50;
    if (e.tags.some((t) => String(t).toLowerCase().includes(term))) return 30;
    if (`${e.summary} ${e.body}`.toLowerCase().includes(term)) return 20;
    if (Object.values(e.fields || {}).some((v) => String(v ?? '').toLowerCase().includes(term))) return 15;
    return 0;
  };
  return all.map((e) => ({ e, s: score(e) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.e.degree - a.e.degree || a.e.name.localeCompare(b.e.name)).slice(0, limit).map((x) => x.e);
}

// ---- editing the vault -------------------------------------------------------------------------------------------------

export function createEntity(saved, { type, name, summary = '', body = '', tags = [], fields = {}, aliases = [], color = null }) {
  const id = newId(type);
  saved.entities[id] = { id, type, name: String(name).trim(), summary, body, tags, fields, aliases, color, created: new Date().toISOString() };
  return saved.entities[id];
}

export function updateEntity(saved, world, id, patch) {
  const live = world.entities.get(id);
  if (saved.entities[id]) { Object.assign(saved.entities[id], patch, { updated: new Date().toISOString() }); return; }
  if (!live) return;
  saved.overrides[id] = { ...(saved.overrides[id] || {}), ...patch };
}

export function deleteEntity(saved, id) {
  if (saved.entities[id]) delete saved.entities[id];
  else if (!saved.hidden.includes(id)) saved.hidden.push(id);
  saved.links = saved.links.filter((l) => l.from !== id && l.to !== id);
}

export function restoreHidden(saved, id) { saved.hidden = saved.hidden.filter((x) => x !== id); }

export function addLink(saved, { from, to, rel, note = '' }) {
  if (!from || !to || from === to || !RELATIONS[rel]) return null;
  const id = `${from}|${to}|${rel}`;
  saved.links = saved.links.filter((l) => l.id !== id);
  const l = { id, from, to, rel, note, created: new Date().toISOString() };
  saved.links.push(l);
  return l;
}

export function removeLink(saved, world, id) {
  const before = saved.links.length;
  saved.links = saved.links.filter((l) => l.id !== id);
  if (saved.links.length === before) {
    // an automatic link: hide it
    saved.hiddenLinks = [...new Set([...(saved.hiddenLinks || []), id])];
  }
}

/** Record a Battle Room fight as an event with everyone who fought in it. */
export function recordBattle(saved, battle, world) {
  const name = `${battle.name || 'Battle'}: ${battle.winner ? `team ${battle.winner} wins` : 'stalemate'}`;
  const teams = [...new Set(battle.combatants.map((c) => c.team))].sort();
  const sides = teams.map((t) => `Team ${t}: ${battle.combatants.filter((c) => c.team === t).map((c) => c.name).join(', ')}`).join(' vs ');
  const standing = battle.combatants.filter((c) => !c.out && !c.fled).map((c) => c.name);
  const ev = createEntity(saved, { type: 'event', name, summary: `${sides}. ${battle.round} rounds. ${standing.length ? `Still standing: ${standing.join(', ')}.` : ''}`, tags: ['battle'], fields: { Kind: 'Battle', Date: new Date().toISOString().slice(0, 10), Seed: battle.seed, Rounds: battle.round } });
  const ids = [];
  const made = new Map();
  for (const c of battle.combatants) {
    const plain = c.name.replace(/ #\d+$/, '');
    let e = c.ch.rosterId ? world.entities.get(`char:${c.ch.rosterId}`) : null;
    if (!e) e = [...world.entities.values()].find((x) => x.type === 'person' && x.name.toLowerCase() === plain.toLowerCase()) || Object.values(saved.entities).find((x) => x.type === 'person' && x.name.toLowerCase() === plain.toLowerCase()) || made.get(plain.toLowerCase());
    if (!e) { e = createEntity(saved, { type: 'person', name: plain, summary: `PL ${c.pl} ${c.ch.alignment === 'villain' ? 'villain' : 'fighter'} from the Battle Room.`, tags: [c.ch.alignment === 'villain' ? 'villain' : 'hero', 'battle'] }); made.set(plain.toLowerCase(), e); }
    if (ids.some((x) => x.id === e.id)) continue;
    ids.push({ id: e.id, team: c.team });
    const same = battle.combatants.filter((x) => x.name.replace(/ #\d+$/, '') === plain);
    const fate = same.length > 1 ? `${same.length} of them: ${same.filter((x) => x.out).length} knocked out, ${same.filter((x) => x.fled).length} fled` : c.out ? 'knocked out' : c.fled ? 'fled' : 'still standing';
    addLink(saved, { from: e.id, to: ev.id, rel: 'involved', note: `Team ${c.team}, ${fate}` });
  }
  for (const a of ids) for (const b of ids) if (a.team !== b.team && a.id < b.id) addLink(saved, { from: a.id, to: b.id, rel: 'fought', note: name });
  return ev;
}

// ---- graph layout ------------------------------------------------------------------------------------------------------

/** A simple force layout. nodes: [{id}], edges: [{from,to}]. Returns Map id -> {x,y} in [0,w]x[0,h]. */
export function layoutGraph(nodes, edges, { width = 800, height = 600, iterations = 220, seed = 1, center = null, margin = 24 } = {}) {
  const pos = new Map();
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const n = nodes.length;
  nodes.forEach((nd, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const r = Math.min(width, height) * (0.25 + rnd() * 0.2);
    pos.set(nd.id, { x: width / 2 + Math.cos(a) * r, y: height / 2 + Math.sin(a) * r, vx: 0, vy: 0 });
  });
  if (center && pos.has(center)) { const c = pos.get(center); c.x = width / 2; c.y = height / 2; }
  const k = Math.sqrt((width * height) / Math.max(1, n)) * 0.9;
  const adj = edges.filter((e) => pos.has(e.from) && pos.has(e.to));
  for (let it = 0; it < iterations; it++) {
    const t = 1 - it / iterations;
    const temp = Math.max(2, k * t * 0.6);
    for (const a of nodes) {
      const pa = pos.get(a.id);
      let fx = 0; let fy = 0;
      for (const b of nodes) {
        if (a === b) continue;
        const pb = pos.get(b.id);
        let dx = pa.x - pb.x; let dy = pa.y - pb.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = rnd() - 0.5; dy = rnd() - 0.5; d2 = 1; }
        const d = Math.sqrt(d2);
        const f = (k * k) / d;
        fx += (dx / d) * f; fy += (dy / d) * f;
      }
      pa.vx = fx; pa.vy = fy;
    }
    for (const e of adj) {
      const pa = pos.get(e.from); const pb = pos.get(e.to);
      const dx = pa.x - pb.x; const dy = pa.y - pb.y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const f = (d * d) / k * 0.5;
      pa.vx -= (dx / d) * f; pa.vy -= (dy / d) * f;
      pb.vx += (dx / d) * f; pb.vy += (dy / d) * f;
    }
    for (const a of nodes) {
      const p = pos.get(a.id);
      if (center && a.id === center) { p.x = width / 2; p.y = height / 2; continue; }
      // gravity to the middle
      p.vx += (width / 2 - p.x) * 0.02; p.vy += (height / 2 - p.y) * 0.02;
      const v = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      const step = Math.min(v, temp);
      p.x = Math.max(margin, Math.min(width - margin, p.x + (p.vx / v) * step));
      p.y = Math.max(margin, Math.min(height - margin, p.y + (p.vy / v) * step));
    }
  }
  return pos;
}

// ---- Markdown vault (Obsidian) ----------------------------------------------------------------------------------------------

const safeName = (s) => String(s).replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim() || 'Untitled';
const FOLDER = { person: 'People', faction: 'Factions', location: 'Locations', event: 'Events', item: 'Items' };

function mdPage(world, e) {
  const name = safeName(e.name);
  const out = [];
  out.push('---');
  out.push(`type: ${e.type}`);
  if (e.aliases?.length) out.push(`aliases: [${e.aliases.map((a) => JSON.stringify(a)).join(', ')}]`);
  if (e.tags?.length) out.push(`tags: [${e.tags.map((t) => JSON.stringify(String(t))).join(', ')}]`);
  for (const [k, v] of Object.entries(e.fields || {})) if (v != null && v !== '') out.push(`${slug(k).replace(/-/g, '_')}: ${JSON.stringify(String(v))}`);
  out.push('---', '', `# ${name}`, '');
  if (e.summary) out.push(e.summary, '');
  const fields = Object.entries(e.fields || {}).filter(([, v]) => v != null && v !== '');
  if (fields.length) { out.push('| | |', '|---|---|'); for (const [k, v] of fields) out.push(`| **${k}** | ${String(v).replace(/\|/g, '\\|')} |`); out.push(''); }
  const groups = groupedConnections(e);
  if (groups.length) {
    out.push('## Connections', '');
    for (const g of groups) {
      out.push(`### ${g.group}`);
      for (const c of g.items) out.push(`- **${c.label}:** [[${safeName(c.other.name)}]]${c.note ? ` — ${c.note}` : ''}`);
      out.push('');
    }
  }
  const tl = entityTimeline(world, e);
  if (tl.length) {
    out.push('## Timeline', '');
    for (const t of tl) {
      let line = `- **${t.when || t.stage}**${t.when && t.stage ? ` (${t.stage})` : ''}: ${t.text}`;
      if (t.people?.length) line += ` — with ${t.people.map((p) => `[[${safeName(p.name)}]]`).join(', ')}`;
      if (t.points?.length) line += ` — ${t.points.map((x) => (x.type === 'award' ? `+${x.points} pp earned` : `${x.points} pp spent: ${(x.changes || []).join('; ')}`)).join('; ')}`;
      out.push(line);
      if (t.downtime) out.push(`  - Between adventures: ${t.downtime}`);
    }
    out.push('');
  }
  if (e.character) {
    const ch = e.character;
    out.push('## Character', '');
    out.push(`- PL ${ch.pl} ${ch.archetype?.name || ''} ${ch.theme?.name ? `(${ch.theme.name})` : ''}`.trim());
    if (ch.powers?.length) out.push(`- Powers: ${ch.powers.map((p) => `${p.name} (${p.effect} ${p.rank})`).join(', ')}`);
    if (ch.advantages?.length) out.push(`- Advantages: ${ch.advantages.map((a) => `${a.name}${a.rank > 1 ? ` ${a.rank}` : ''}`).join(', ')}`);
    if (ch.complications?.length) out.push(`- Complications: ${ch.complications.map((c) => `${c.type}: ${c.text}`).join(' ')}`);
    out.push('');
  }
  if (e.body) out.push('## Notes', '', e.body, '');
  return out.join('\n');
}

/** { 'People/Name.md': markdown, ... } for the whole world. */
export function vaultMarkdown(world) {
  const files = {};
  const used = new Set();
  for (const e of world.entities.values()) {
    let name = safeName(e.name);
    if (used.has(`${FOLDER[e.type]}/${name}`)) name = `${name} (${e.id.split(':')[0]})`;
    used.add(`${FOLDER[e.type]}/${name}`);
    files[`${FOLDER[e.type] || 'Other'}/${name}.md`] = mdPage(world, e);
  }
  const home = [`# ${world.name || 'World'}`, '', world.tagline || '', '', world.description || '', ''];
  for (const [type, meta] of Object.entries(ENTITY_TYPES)) {
    const list = [...world.entities.values()].filter((e) => e.type === type).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    home.push(`## ${meta.label}`, '');
    for (const e of list) home.push(`- [[${safeName(e.name)}]]${e.summary ? ` — ${String(e.summary).split(/(?<=[.!?])\s/)[0]}` : ''}`);
    home.push('');
  }
  const tl = campaignTimeline(world);
  if (tl.length) { home.push('## Campaign timeline', ''); for (const ev of tl) home.push(`- ${ev.session ? `Session ${ev.session}` : ev.date || ''}: [[${safeName(ev.name)}]]${ev.summary ? ` — ${ev.summary}` : ''}`); home.push(''); }
  files[`${safeName(world.name || 'World')}.md`] = home.join('\n');
  return files;
}
