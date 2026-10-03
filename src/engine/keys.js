// Character keys: short codes that rebuild a character from its seed, so anyone with the app can
// open exactly the same person without sending the whole file.
//
//   DCUK1.<seed>.<pl>.<archetype>.<theme>.<alignment>.<chaos>.<gender>.<data version>
//       a rolled character (unedited), rebuilt with generateCharacter.
//   DCUP1.<base64url JSON>
//       a person from someone's bio (parent, sibling, rival, mentor...), rebuilt with generatePerson.
//
// Keys only reproduce a character while the random tables stay the same, so each one carries the
// data version it was made with. Edited characters can't be rebuilt from a seed: share those with
// the full share code instead (characterKey returns null for them).

import { DATA_VERSION } from '../generated/rulesdata.js';
import { generateCharacter } from './generator.js';
import { generateBio } from './lifepath.js';
import { catalogToCharacter } from './catalog.js';
import { makeRng } from './rng.js';

export { DATA_VERSION };

const enc = (s) => encodeURIComponent(String(s ?? '')).replace(/\./g, '%2E');
const dec = (s) => decodeURIComponent(s || '');

function toB64url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** The parts of a character that a key must reproduce exactly. */
function fingerprint(ch) {
  const pick = (({ pl, abilities, defenses, skills, advantages, powers, devices, equipment, identity, alignment, complications, notes }) =>
    ({ pl, abilities, defenses, skills, advantages, powers, devices, equipment, identity, alignment, complications, notes }))(ch);
  return JSON.stringify([pick, ch.bio?.summary || null, ch.bio?.timeline?.length || 0, ch.journal?.entries?.length || 0]);
}

// ---- rolled characters ----------------------------------------------------------------------------

export function rollKey(ch) {
  const o = ch.options || {};
  const chaos = Math.round((o.chaos ?? 0.35) * 100);
  return ['DCUK1', enc(ch.seed), o.pl ?? '', enc(o.archetype || ''), enc(o.theme || ''), o.alignment || 'random', chaos, enc(o.gender || 'random'), DATA_VERSION].join('.');
}

function parseRollKey(key) {
  const [, seed, pl, archetype, theme, alignment, chaos, gender, version] = key.split('.');
  return {
    opts: { seed: dec(seed), pl: pl ? Number(pl) : null, archetype: dec(archetype) || null, theme: dec(theme) || null, alignment: alignment || 'random', chaos: Number(chaos) / 100, gender: dec(gender) || 'random' },
    version,
  };
}

// ---- people from a bio ------------------------------------------------------------------------------

const INVERSE = {
  Mentor: 'Student', Student: 'Mentor', Dependent: 'Guardian', Guardian: 'Dependent',
  Rival: 'Rival', Enemy: 'Enemy', Ally: 'Ally', Friend: 'Friend', Ex: 'Ex', Love: 'Love',
};

/** Who this person is to the character, as stored in their key. */
export function personContext(ch, person, kind) {
  const id = ch.identity || {};
  return {
    v: 1,
    d: DATA_VERSION,
    k: kind,                                  // 'parent' | 'sibling' | 'person'
    s: ch.bio?.seed || ch.seed || id.realName,
    n: person.name,
    r: person.role || person.relation || '',  // "Adoptive mother", "Older brother", "Rival"...
    w: person.who || person.note || '',
    o: person.occupation || '',
    t: person.trait || '',
    st: person.status || '',
    a: person.age ?? null,
    of: { n: id.realName || id.codename || '', g: id.gender || '', a: id.age ?? null, pl: ch.pl || 10, al: ch.alignment || 'hero', c: id.homeland || null, b: id.base || '', l: id.languages || null, key: characterKeyCached(ch) },
  };
}

export function personKey(ch, person, kind) {
  return `DCUP1.${toB64url(JSON.stringify(personContext(ch, person, kind)))}`;
}

// Only people who ARE from the super world get powers, not people who merely met a hero or a villain.
const SUPER_WORDS = '(super ?hero|hero|heroine|villain|super ?villain|vigilante|metahuman|meta-human|superhuman|speedster|telepath|sorcerer|sorceress|witch|wizard|mutant|alien|cyborg|android)';
const SUPER = new RegExp(`^(an?|the)\\s+(?!hero who|villain who)([\\w'-]+\\s+){0,3}${SUPER_WORDS}\\b(?! who (humiliated|attacked|hurt|saved|rescued|arrested|killed))|\\b(has|with|gained|developed|manifested) (super ?)?powers\\b|\\b(is|was|became) an? ([\\w'-]+\\s+){0,2}${SUPER_WORDS}\\b`, 'i');
const CONSTRUCTISH = /\b(robot|android|cyborg|synthetic|machine)\b/i;

const JOBS = [
  [/swat/i, 'swat-officer'], [/police chief|commissioner|captain of police/i, 'police-chief'],
  [/\b(police|cop|detective|officer|sheriff|deputy|trooper)\b/i, 'police-officer'],
  [/special forces|navy seal|commando/i, 'special-forces'], [/sniper/i, 'sniper'],
  [/\b(soldier|army|marine|veteran|military|sergeant|private|airman|sailor)\b/i, 'soldier'],
  [/\b(spy|cia|secret agent)\b/i, 'secret-agent'], [/\b(agent|fbi|federal|government|bureaucrat|official)\b/i, 'government-agent'],
  [/\b(reporter|journalist|news|anchor|blogger|photographer|podcaster|content creator)\b/i, 'reporter'],
  [/\b(scientist|researcher|professor|doctor|physician|surgeon|engineer|chemist|physicist|biologist|lab)\b/i, 'scientist'],
  [/\b(crime boss|mob boss|kingpin|crime lord|mafia|don\b|cartel)/i, 'crime-lord'],
  [/\b(gang leader|crew boss)\b/i, 'gang-leader'], [/\bgang\b/i, 'gang-member'],
  [/\b(enforcer|leg-breaker|muscle)\b/i, 'mob-enforcer'], [/\bthug\b/i, 'thug'],
  [/\b(hacker|programmer|coder|developer)\b/i, 'hacker'], [/\bmercenar/i, 'mercenary'], [/\bassassin|hitman|hit man/i, 'assassin'],
  [/\bninja\b/i, 'ninja'], [/\bcult leader|guru|prophet\b/i, 'cult-leader'], [/\bcult/i, 'cultist'],
  [/\bbodyguard\b/i, 'bodyguard'], [/\b(security guard|guard|bouncer)\b/i, 'security-guard'],
  [/\b(boxer|fighter|martial|athlete|wrestler|coach|trainer|sensei)\b/i, 'street-martial-artist'],
  [/\b(driver|trucker|cabbie|mechanic)\b/i, 'getaway-driver'], [/\bpirate\b/i, 'pirate'], [/\bbounty hunter\b/i, 'bounty-hunter'],
  [/\binformant|snitch\b/i, 'street-informant'], [/\b(dealer|thief|crook|con artist|smuggler|fence|burglar|criminal|felon|ex-con)\b/i, 'criminal'],
  [/\b(lab tech|technician)\b/i, 'lab-technician'], [/\bhenchm/i, 'jumpsuit-henchman'],
];

function genderFor(ctx, R, rng) {
  const r = `${ctx.r} ${ctx.w}`.toLowerCase();
  if (/\b(mother|sister|daughter|aunt|grandmother|wife|girlfriend|she|her)\b/.test(r)) return 'Female';
  if (/\b(father|brother|son|uncle|grandfather|husband|boyfriend|he|his)\b/.test(r)) return 'Male';
  const first = String(ctx.n || '').split(' ')[0];
  const fem = R.raw.flavor?.female_names || [];
  const mal = R.raw.flavor?.male_names || [];
  if (fem.includes(first) && !mal.includes(first)) return 'Female';
  if (mal.includes(first) && !fem.includes(first)) return 'Male';
  return rng.pick(['Female', 'Male']);
}

function ageFor(ctx, rng) {
  const base = ctx.of.a ?? 30;
  if (ctx.a != null) return ctx.a;
  if (ctx.k === 'parent') return base + rng.int(20, 38);
  if (/mentor|teacher|coach/i.test(`${ctx.r} ${ctx.w}`)) return base + rng.int(10, 30);
  if (/dependent|child|kid/i.test(`${ctx.r} ${ctx.w}`)) return Math.max(4, base - rng.int(15, 30));
  return Math.max(16, base + rng.int(-8, 10));
}

function inverseRelation(ctx, myGender) {
  const theirs = ctx.of.g;
  if (ctx.k === 'parent') return theirs === 'Female' ? 'Daughter' : theirs === 'Male' ? 'Son' : 'Child';
  if (ctx.k === 'sibling') return theirs === 'Female' ? 'Sister' : theirs === 'Male' ? 'Brother' : 'Sibling';
  void myGender;
  return INVERSE[ctx.r] || ctx.r || 'Acquaintance';
}

/** Build the full character for a person named in someone's bio. Deterministic for the same context. */
export function generatePerson(R, ctx) {
  const rng = makeRng(`${ctx.s}::person::${ctx.n}::${ctx.r}`);
  const text = `${ctx.r} ${ctx.w} ${ctx.o} ${ctx.st}`;
  const gender = genderFor(ctx, R, rng);
  const age = ageFor(ctx, rng);
  const occupation = ctx.o || (ctx.w.match(/^an? ([^,.;]+?)(?: who| whose| that|,|\.|$)/i)?.[1]) || '';
  const isSuper = (SUPER.test(ctx.w) || SUPER.test(ctx.o)) && !/fan of|scrapbook|idoliz|obsessed with/i.test(ctx.w);
  let ch;
  if (isSuper) {
    // Someone from the super world: a full powered character near the original's power level.
    const pl = Math.max(4, Math.min(16, (ctx.of.pl || 10) + rng.int(-3, 1)));
    const villain = /enemy|rival|villain|crime|criminal/i.test(text) && !/hero\b/i.test(ctx.w);
    const pool = R.raw.archetypes.filter((a) => !a.hidden && (CONSTRUCTISH.test(ctx.w) ? a.construct : !a.construct));
    const archetype = rng.pick(pool.length ? pool : R.raw.archetypes.filter((a) => !a.hidden))?.id;
    ch = generateCharacter(R, { seed: `${ctx.s}::person::${ctx.n}`, pl, archetype, alignment: villain ? 'villain' : /hero|vigilante/i.test(text) ? 'hero' : 'random', gender, chaos: 0.35 });
  } else {
    const id = (JOBS.find(([re]) => re.test(`${ctx.o} ${ctx.w}`)) || [null, 'bystander'])[1];
    const entry = (R.raw.catalog?.minions || []).find((e) => e.id === id) || (R.raw.catalog?.minions || [])[0];
    ch = catalogToCharacter(entry);
    ch.minion = false;
    ch.npc = true;
    ch.archetype = { id: `npc-${entry.id}`, name: entry.name };
    ch.alignment = /enemy|crime|criminal|cult|villain/i.test(text) ? 'villain' : 'hero';
    ch.theme = { name: entry.name, color: '#8a5a44' };
    ch.summary = entry.summary;
  }
  const realName = ctx.n;
  ch.identity = {
    ...(ch.identity || {}),
    codename: isSuper && /goes by ([A-Z][\w'-]*(?: [A-Z][\w'-]*){0,2})/.exec(ctx.w)?.[1] ? /goes by ([A-Z][\w'-]*(?: [A-Z][\w'-]*){0,2})/.exec(ctx.w)[1] : isSuper && ch.identity?.codename && ch.identity.codename !== realName ? ch.identity.codename : realName,
    realName,
    gender,
    age,
    occupation: occupation ? occupation.replace(/^./, (c) => c.toUpperCase()) : ch.identity?.occupation || '',
    homeland: ctx.k !== 'person' ? ctx.of.c : ch.identity?.homeland || ctx.of.c,
    base: ctx.of.b || ch.identity?.base || '',
    languages: ctx.k !== 'person' && ctx.of.l ? ctx.of.l : ch.identity?.languages || ['English'],
  };
  delete ch.catalogId;
  // Their own life story, tied back to the person whose bio they came from.
  ch.bio = generateBio(R, ch, { seed: `${ctx.s}::person::${ctx.n}::bio` });
  const inv = inverseRelation(ctx, gender);
  const back = { name: ctx.of.n, relation: inv, who: ctx.k === 'person' ? `${ctx.r ? `Their ${ctx.r.toLowerCase()}. ` : ''}${ctx.w ? `In ${ctx.of.n.split(' ')[0]}'s words: ${ctx.w}` : ''}`.trim() : `Their ${inv.toLowerCase()}.`, status: '', key: ctx.of.key || null };
  ch.bio.people = [back, ...(ch.bio.people || []).filter((p) => p.name !== ctx.of.n)];
  if (ctx.st) ch.bio.sections = [{ id: 'now', title: 'Where they are now', items: [{ label: 'Status', text: ctx.st }, ctx.t ? { label: 'Known for', text: ctx.t } : null, ctx.w ? { label: `As ${ctx.of.n} knows them`, text: ctx.w } : null].filter(Boolean) }, ...(ch.bio.sections || [])];
  ch.personKey = `DCUP1.${toB64url(JSON.stringify(ctx))}`;
  ch.seed = undefined;
  return ch;
}

// ---- keys for any character -------------------------------------------------------------------------

const cache = new Map();

/** The short key for a character, or null if it has been edited (then share the full code). */
export function characterKey(R, ch) {
  if (!ch) return null;
  const candidate = ch.personKey || (ch.seed && ch.options ? rollKey(ch) : null);
  if (!candidate) return null;
  const fp = fingerprint(ch);
  const hit = cache.get(candidate);
  if (hit != null) return hit === fp ? candidate : null;
  let rebuilt;
  try { rebuilt = fromKeySync(R, candidate).character; } catch { return null; }
  const want = fingerprint(rebuilt);
  cache.set(candidate, want);
  return want === fp ? candidate : null;
}

// characterKey for use inside personContext (no rules object there; uses the last known answer).
function characterKeyCached(ch) {
  const candidate = ch.personKey || (ch.seed && ch.options ? rollKey(ch) : null);
  if (!candidate) return null;
  return cache.get(candidate) === fingerprint(ch) ? candidate : null;
}

export function isKey(text) {
  return /^DCU[KP]1\./.test(String(text || '').trim());
}

/** Rebuild a character from a key. Returns { character, versionMatch }. */
export function fromKeySync(R, key) {
  const k = String(key).trim();
  if (k.startsWith('DCUK1.')) {
    const { opts, version } = parseRollKey(k);
    return { character: generateCharacter(R, opts), versionMatch: version === DATA_VERSION };
  }
  if (k.startsWith('DCUP1.')) {
    const ctx = JSON.parse(fromB64url(k.slice(6)));
    return { character: generatePerson(R, ctx), versionMatch: ctx.d === DATA_VERSION };
  }
  throw new Error('That is not a DCUGen character key.');
}
