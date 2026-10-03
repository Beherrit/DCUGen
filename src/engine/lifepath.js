// Random life histories ("lifepaths") for characters and NPCs.
//
// The tables live in data/lifepath/*.json (R.raw.lifepath.<file>). Generation runs in fixed
// stages; each stage draws from its own seeded stream, so re-rolling one section leaves the
// others as they were wherever the story still fits:
//   origins     social standing, hometown, birth, siblings, family structure, parents, family secret
//   youth       childhood (0-12) and adolescent (13-19) events; constructs get an activation history
//   career      education, earlier jobs, the current occupation
//   life        adult events (by age) and the character's first brush with the super world
//   people      mentors, rivals, enemies, allies, exes, loves, dependents and friends
//   personality traits (light/dark/neutral/exotic with strength), values, fears, habits, voice
//   drives      motivations, secrets, regrets, hopes
//   game        GM hooks, DC Adventures complications, suggested skills and advantages
//
// Events carry a personality hint (L light, D dark, N neutral, R random, X exotic); the traits a
// character ends up with grow out of what happened to them. Benefits are suggestions only.

import { makeRng, randomSeed } from './rng.js';
import { makeCodename } from './flavor.js';

export const BIO_VERSION = 1;

const STAGES = ['origins', 'youth', 'career', 'life', 'people', 'personality', 'drives', 'game'];
const SECTION_TITLES = {
  origins: 'Origins & Family',
  youth: 'Childhood & Youth',
  career: 'Education & Career',
  life: 'Adult Life',
  people: 'People in Their Life',
  personality: 'Personality',
  drives: 'Motivations, Secrets & Hopes',
  game: 'Game Notes',
};
const SECTION_ALIASES = { family: 'origins', childhood: 'youth', adolescence: 'youth', education: 'career', adult: 'life', events: 'life', relationships: 'people', motivations: 'drives', secrets: 'drives', hooks: 'game', complications: 'game', benefits: 'game' };

export const DCA_COMPLICATIONS = ['Accident', 'Addiction', 'Disability', 'Enemy', 'Fame', 'Hatred', 'Honor', 'Identity', 'Motivation', 'Obsession', 'Phobia', 'Power Loss', 'Prejudice', 'Quirk', 'Relationship', 'Reputation', 'Responsibility', 'Rivalry', 'Secret', 'Temper', 'Weakness'];
export const BIO_RELATIONS = ['Mentor', 'Rival', 'Enemy', 'Ally', 'Ex', 'Love', 'Dependent', 'Friend'];

const ANGLO = /united states|canada|great britain|britain|england|ireland|australia|new zealand|unknown/i;
const CITY_COUNTRY = { London: 'Great Britain', Paris: 'France', Tokyo: 'Japan', Lagos: 'Nigeria', Mumbai: 'India', 'São Paulo': 'Brazil', 'Mexico City': 'Mexico', Cairo: 'Egypt', Seoul: 'Korea', Sydney: 'Australia', Berlin: 'Germany', Toronto: 'Canada', Kharamesh: 'Kharamesh' };
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);
const lowerFirst = (s) => (s ? String(s).charAt(0).toLowerCase() + String(s).slice(1) : s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const norm = (e) => (typeof e === 'string' ? { text: e } : e || { text: '' });
const article = (w) => (/^[aeiou]/i.test(String(w)) ? 'an' : 'a');
const withArticle = (w) => `${article(w)} ${w}`;
const endStop = (s) => (/[.!?]['"]?$/.test(String(s).trim()) ? String(s).trim() : `${String(s).trim()}.`);
const noStop = (s) => String(s).trim().replace(/[.!?]+(['"]?)$/, '$1');
const firstSentence = (s) => {
  const m = String(s).match(/^.*?[.!?]['"]?(?=\s|$)/);
  return noStop(m ? m[0] : s);
};
const shorten = (s, n = 80) => {
  const t = firstSentence(s);
  if (t.length <= n) return t;
  return `${t.slice(0, n).replace(/\s+\S*$/, '')}…`;
};
function hashKey(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

// ---- pronouns ---------------------------------------------------------------------------------

function pronounsFor(gender) {
  if (gender === 'Female') return { they: 'she', them: 'her', their: 'her', theirs: 'hers', themself: 'herself', they_were: 'she was', they_are: 'she is', they_have: 'she has', "they'd": "she'd", plural: false };
  if (gender === 'Male') return { they: 'he', them: 'him', their: 'his', theirs: 'his', themself: 'himself', they_were: 'he was', they_are: 'he is', they_have: 'he has', "they'd": "he'd", plural: false };
  if (gender === 'None') return { they: 'it', them: 'it', their: 'its', theirs: 'its', themself: 'itself', they_were: 'it was', they_are: 'it is', they_have: 'it has', "they'd": "it'd", plural: false };
  return { they: 'they', them: 'them', their: 'their', theirs: 'theirs', themself: 'themself', they_were: 'they were', they_are: 'they are', they_have: 'they have', "they'd": "they'd", plural: true };
}

function conjugate(verb, plural) {
  if (plural) return verb;
  const irregular = { have: 'has', do: 'does', go: 'goes', be: 'is' };
  if (irregular[verb]) return irregular[verb];
  if (/(s|sh|ch|x|z|o)$/.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

// ---- context ----------------------------------------------------------------------------------

function tables(R) {
  const L = R?.raw?.lifepath || {};
  return {
    standing: L.standing || { tiers: [], shifts: [] },
    birth: L.birth || {},
    parents: L.parents || {},
    hometown: L.hometown || { kinds: [] },
    names: L.names || {},
    childhood: L.childhood?.events || [],
    adolescence: L.adolescence?.events || [],
    adult: L.adult?.events || [],
    special: L.special || {},
    firstbrush: L.firstbrush?.events || [],
    career: L.career || {},
    people: L.people || {},
    personality: L.personality || {},
    drives: L.drives || {},
    hooks: L.hooks?.hooks || [],
    game: L.gamenotes || {},
    other: L.other || {},
  };
}

function detectMode(R, ch) {
  const arch = (R?.raw?.archetypes || []).find((a) => a.id === ch?.archetype?.id) || {};
  const kind = String(ch?.kind || '').toLowerCase();
  if (ch?.construct === 'automaton' || arch.automaton) return 'automaton';
  if (ch?.construct || arch.construct || kind === 'construct' || kind === 'robot' || kind === 'android') return 'construct';
  if (['creature', 'monster', 'animal', 'beast'].includes(kind)) return 'creature';
  return 'person';
}

function makeContext(R, ch, seed, seeds) {
  const T = tables(R);
  const flavor = R?.raw?.flavor || {};
  const story = flavor.story || {};
  const id = ch?.identity || {};
  const mode = detectMode(R, ch);
  const realName = String(id.realName || id.codename || 'Unknown').trim();
  const parts = realName.split(/\s+/);
  const isDesignation = mode === 'construct' || mode === 'automaton' || /^(Model|Unit)\b/.test(realName);
  const first = isDesignation ? realName : parts[0];
  const surname = isDesignation ? '' : (parts.length > 1 ? parts[parts.length - 1] : (story.surnames || ['Doe'])[Math.abs(hashKey(realName)) % Math.max(1, (story.surnames || []).length)] || 'Doe');
  let age = Number.isFinite(Number(id.age)) && id.age !== null ? Number(id.age) : null;
  if (mode === 'person' && (age === null || age < 1)) age = 25;
  if (age === null) age = mode === 'creature' ? 10 : 3;
  const gender = mode === 'automaton' ? 'None' : (id.gender || 'Nonbinary');
  const p = pronounsFor(mode === 'construct' && (gender === 'None' || !id.gender) ? 'None' : gender);
  const base = String(id.base || '').trim();
  const baseOk = base && !/^the\s/i.test(base) && !/Atlantis|Hidden Isle|Hidden Monastery|Kharamesh|Sky Station/i.test(base);
  return {
    R, ch, T, flavor, story, seed, seeds, mode,
    minion: !!ch?.minion,
    alignment: ch?.alignment === 'villain' || ch?.minion ? 'villain' : 'hero',
    powered: !!ch?.archetype && !/crimefighter|^m-/.test(ch?.archetype?.id || '') && !ch?.minion,
    realName, first, surname, fullName: realName, age, gender, p,
    city: baseOk ? base : (base || 'the city'), baseOk,
    country: id.homeland?.country || '', region: id.homeland?.region || '',
    occupation: id.occupation || '',
    level: 3, birthLevel: 3, tier: null,
    hometownName: baseOk ? base : 'home', hometownDesc: '',
    family: { parents: [], siblings: [], structure: '' },
    parentRoles: [], deaths: {},
    people: [], timeline: [], items: {},
    traitTags: { L: 0, D: 0, N: 0, X: 0 },
    skills: new Map(), advantages: new Map(),
    comps: [], secrets: [], regrets: [], hopes: [], hooks: [], motives: [], fears: [], keepsakes: [],
    used: new Set(), memo: {},
    summaryBits: {},
    rng: makeRng(`${seed}::bio`),
  };
}

// ---- text filling -----------------------------------------------------------------------------

function randomFirst(ctx, rng, gender) {
  const f = ctx.flavor;
  if (gender === 'Female') return rng.pick(f.female_names || ['Ana']);
  if (gender === 'Male') return rng.pick(f.male_names || ['Sam']);
  return rng.pick(ctx.story.neutral_names || ['Alex']);
}

function newPerson(ctx, { gender, surname } = {}) {
  const rng = ctx.rng;
  const g = gender || rng.weighted([{ v: 'Female', weight: 47 }, { v: 'Male', weight: 47 }, { v: 'Nonbinary', weight: 6 }]).v;
  const last = surname || rng.pick((ctx.story.surnames || ['Smith']).filter((s) => s !== ctx.surname)) || 'Smith';
  const first = randomFirst(ctx, rng, g);
  return { name: `${first} ${last}`, first, gender: g };
}

function codename(ctx, alignment) {
  const themes = ctx.R?.raw?.themes || [];
  const theme = ctx.rng.pick(themes);
  try {
    return makeCodename(ctx.story, theme, alignment, ctx.rng, ctx.rng.pick(['Female', 'Male']));
  } catch {
    return alignment === 'villain' ? 'the Gray Mask' : 'the Night Lantern';
  }
}

function memoName(ctx, key) {
  if (ctx.memo[key] !== undefined) return ctx.memo[key];
  const list = ctx.T.names[key];
  if (!Array.isArray(list) || !list.length) return null;
  const v = makeRng(`${ctx.seed}::name::${key}`).pick(list);
  ctx.memo[key] = v;
  return v;
}

function personByRelation(ctx, rel) {
  const want = rel.toLowerCase();
  const p = ctx.people.find((x) => x.relation.toLowerCase() === want && !/deceased/i.test(x.status));
  return p ? p.name : null;
}

function resolveKey(key, ctx, local) {
  const p = ctx.p;
  if (Object.prototype.hasOwnProperty.call(p, key) && key !== 'plural') return p[key];
  if (key.startsWith('they+')) return `${p.they} ${conjugate(key.slice(5), p.plural)}`;
  switch (key) {
    case 'name': return ctx.first;
    case 'fullname': return ctx.fullName;
    case 'surname': return ctx.surname || ctx.first;
    case 'city': return ctx.city;
    case 'hometown': return ctx.hometownName;
    case 'country': return ctx.country || 'abroad';
    case 'role': return local.role || 'parent';
    case 'number': return String(ctx.rng.int(100, 999));
    case 'parent':
      if (!local.parent) local.parent = ctx.rng.pick(local.parentPool || ctx.parentRoles) || 'guardian';
      return local.parent;
    case 'sibling': {
      if (!local.sibling) {
        const sib = ctx.rng.pick(ctx.family.siblings.filter((s) => !/deceased/i.test(s.status))) || ctx.rng.pick(ctx.family.siblings);
        local.sibling = sib ? (ctx.mode === 'person' ? sib.name.split(' ')[0] : sib.name) : 'a cousin';
      }
      return local.sibling;
    }
    case 'npc': case 'npc2': {
      if (!local[key]) { const np = newPerson(ctx); local[key] = np.name; local[`${key}Gender`] = np.gender; }
      return local[key];
    }
    case 'first':
      if (!local.first) local.first = randomFirst(ctx, ctx.rng, ctx.rng.pick(['Female', 'Male']));
      return local.first;
    case 'hero':
      if (!local.hero) local.hero = codename(ctx, 'hero');
      return local.hero;
    case 'villain':
      if (!local.villain) local.villain = codename(ctx, 'villain');
      return local.villain;
    case 'mentor': case 'rival': case 'enemy': case 'ex': case 'love': case 'ally': case 'friend': case 'dependent':
      return personByRelation(ctx, key) || (key === 'ex' ? 'an old flame' : `an old ${key}`);
    default:
      return memoName(ctx, key);
  }
}

function fill(text, ctx, local = {}) {
  let s = String(text ?? '');
  for (let i = 0; i < 5 && s.includes('{'); i++) {
    s = s.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, opts) => ctx.rng.pick(opts.split('|')));
    s = s.replace(/\{([A-Za-z_][\w+']*)\}/g, (m, key) => {
      const v = resolveKey(key, ctx, local);
      return v == null ? m : v;
    });
  }
  // Safety net: never let a stray placeholder reach the reader.
  s = s.replace(/\{[^{}]*\}/g, '').replace(/\s{2,}/g, ' ').trim();
  return fixArticles(s);
}

/** "a amulet" -> "an amulet", "a the lab" -> "the lab", "an MBA" stays. */
function fixArticles(s) {
  return s
    .replace(/\b(a|an|the) (a|an|the) /gi, (m, x, y) => `${x[0] === x[0].toUpperCase() ? cap(y) : y} `)
    .replace(/\b([Aa])n? ([A-Za-z][\w-]*)/g, (m, a, word) => {
      const an = /^[A-Z]{2,}/.test(word)
        ? /^[AEFHILMNORSX]/.test(word)
        : /^[aeiou]/i.test(word) ? !/^(uni|use|usu|uti|one|once|eu|ur[aio])/i.test(word) : /^(hour|honest|heir)/i.test(word);
      return `${a}${an ? 'n' : ''} ${word}`;
    });
}

// ---- weighted picking -------------------------------------------------------------------------

function biasMult(e, level) {
  if (e.bias === 'low') return level <= 1 ? 2.5 : level === 2 ? 1.3 : level >= 4 ? 0.25 : 0.8;
  if (e.bias === 'high') return level >= 5 ? 2.5 : level === 4 ? 1.6 : level <= 1 ? 0.15 : 0.6;
  return 1;
}

function alignMult(e, ctx) {
  const tags = e.tags || [];
  let m = 1;
  if (ctx.alignment === 'villain') {
    if (e.trait === 'D') m *= 1.5;
    if (e.trait === 'L') m *= 0.8;
    if (tags.includes('dark')) m *= 2.5;
    if (tags.includes('redemptive')) m *= 0.6;
    if (e.align === 'villain') m *= 2.5;
    if (e.align === 'hero') m *= 0.4;
  } else {
    if (e.trait === 'L') m *= 1.25;
    if (tags.includes('redemptive')) m *= 1.8;
    if (tags.includes('dark')) m *= 0.35;
    if (e.align === 'hero') m *= 2;
    if (e.align === 'villain') m *= 0.35;
  }
  if (ctx.minion && (tags.includes('super') || tags.includes('cosmic') || tags.includes('mystic'))) m *= 0.6;
  return m;
}

function livingRoles(ctx, age = Infinity) {
  return ctx.parentRoles.filter((r) => ctx.deaths[r] === undefined || ctx.deaths[r] > age);
}

function needsMet(e, ctx, age = null) {
  const usesParent = (e.needs || []).includes('parent') || /\{parent\}/.test(e.text || '');
  if (usesParent && !livingRoles(ctx, age ?? ctx.age).length) return false;
  for (const n of e.needs || []) {
    if (n === 'sibling' && !ctx.family.siblings.length) return false;
    if (BIO_RELATIONS.map((r) => r.toLowerCase()).includes(n) && !personByRelation(ctx, n)) return false;
  }
  return true;
}

function pickEntry(ctx, list, { age = null, filter = null, unique = true } = {}) {
  const items = (list || []).map(norm).filter((e) => {
    if (unique && ctx.used.has(e.text)) return false;
    if (age !== null && Array.isArray(e.age) && (age < e.age[0] || age > e.age[1])) return false;
    if (!needsMet(e, ctx, age)) return false;
    return filter ? filter(e) : true;
  });
  const e = ctx.rng.weighted(items, (x) => (x.weight ?? 1) * biasMult(x, ctx.level) * alignMult(x, ctx));
  if (e && unique) ctx.used.add(e.text);
  return e;
}

// ---- recording effects ------------------------------------------------------------------------

function addTrait(ctx, t) {
  if (!t) return;
  let side = t;
  if (t === 'R') {
    side = ctx.rng.weighted(ctx.alignment === 'villain'
      ? [{ v: 'L', weight: 20 }, { v: 'N', weight: 30 }, { v: 'D', weight: 50 }]
      : [{ v: 'L', weight: 40 }, { v: 'N', weight: 35 }, { v: 'D', weight: 25 }]).v;
  }
  if (ctx.traitTags[side] !== undefined) ctx.traitTags[side]++;
}

function addBenefit(ctx, kind, str, why) {
  const [name, spec] = String(str).split(/:\s*/);
  const valid = kind === 'skill'
    ? (ctx.R?.raw?.skills || []).some((s) => s.name === name)
    : (ctx.R?.raw?.advantages || []).some((a) => a.name === name);
  if (!valid) return;
  const map = kind === 'skill' ? ctx.skills : ctx.advantages;
  const key = `${name}|${spec || ''}`;
  const cur = map.get(key) || { name, spec: spec || undefined, why: [], n: 0 };
  cur.n++;
  if (why && !cur.why.includes(why)) cur.why.push(why);
  map.set(key, cur);
}

function addComp(ctx, type, text) {
  if (!DCA_COMPLICATIONS.includes(type) || !text) return;
  ctx.comps.push({ type, text: endStop(cap(text)) });
}

function stripLead(who, name) {
  if (name && who.startsWith(`${name}, `)) return cap(who.slice(name.length + 2));
  return cap(who);
}

function defaultStatus(ctx, relation, local) {
  const list = ctx.T.people?.[relation]?.status || ['Still around.'];
  return fill(ctx.rng.pick(list), ctx, local);
}

function addPerson(ctx, spec, local, { status, age } = {}) {
  if (!spec?.who || !BIO_RELATIONS.includes(spec.relation)) return null;
  const whoFilled = fill(spec.who, ctx, local);
  let name = spec.name ? fill(spec.name, ctx, local) : null;
  if (name) { /* given */ } else if (/^\{hero\}/.test(spec.who)) name = local.hero;
  else if (/^\{villain\}/.test(spec.who)) name = local.villain;
  else if (spec.who.includes('{npc}')) name = local.npc;
  else if (spec.who.includes('{hero}')) name = local.hero;
  else if (spec.who.includes('{villain}')) name = local.villain;
  else if (local.first && spec.who.includes('{first}')) name = local.first;
  name = name || 'Unknown';
  const person = {
    name,
    relation: spec.relation,
    who: endStop(stripLead(whoFilled, name)),
    status: endStop(cap(status || (spec.status ? fill(spec.status, ctx, local) : defaultStatus(ctx, spec.relation, local)))),
  };
  if (age != null) person.since = age;
  if (!ctx.people.some((x) => x.name === person.name && x.relation === person.relation)) ctx.people.push(person);
  return person;
}

function parentSkillFor(ctx, occupation) {
  const rows = ctx.T.career.occupationSkills || [];
  const row = rows.find((r) => new RegExp(r.match, 'i').test(occupation || ''));
  return row ? row.skills[0] : 'Expertise: Family Trade';
}

function applyEffects(ctx, e, { age, stage, local, why }) {
  addTrait(ctx, e.trait);
  const reason = why || `${stage}${age != null ? `, age ${age}` : ''}`;
  for (const s of e.effects?.skills || []) addBenefit(ctx, 'skill', s, reason);
  for (const a of e.effects?.advantages || []) addBenefit(ctx, 'advantage', a, reason);
  const comp = e.complication || e.effects?.complication;
  if (comp) addComp(ctx, comp.type, fill(comp.text, ctx, local));
  if (e.person) addPerson(ctx, e.person, local, { age });
  if (e.deadPerson) addPerson(ctx, e.deadPerson, local, { status: `Deceased; died when ${ctx.first} was ${age}.`, age });
  if (e.dependent) {
    const who = fill(e.dependent, ctx, local);
    ctx.people.push({ name: cap(who), relation: 'Dependent', who: `${cap(who)}, in ${ctx.p.their} care since ${ctx.first} was ${age}.`, status: endStop(defaultStatus(ctx, 'Dependent', local)) });
  }
  if (e.child) {
    const g = ctx.rng.pick(['Female', 'Male']);
    const kid = newPerson(ctx, { gender: g, surname: ctx.surname || undefined });
    const kidAge = Math.max(0, ctx.age - age);
    const word = g === 'Female' ? 'daughter' : 'son';
    ctx.people.push({ name: kid.name, relation: kidAge < 18 ? 'Dependent' : 'Ally', who: `${cap(ctx.first)}'s ${word}, now ${kidAge === 0 ? 'a newborn' : `${kidAge}`}.`, status: kidAge < 18 ? 'Lives with family and needs looking after.' : 'Grown, and closer to the truth than anyone else.' });
    if (kidAge < 18) addComp(ctx, 'Responsibility', `Has a ${kidAge}-year-old ${word}, ${kid.first}, who needs ${ctx.p.them}.`);
  }
  if (e.parentSkill) {
    const parent = ctx.family.parents.find((x) => x.present);
    addBenefit(ctx, 'skill', parentSkillFor(ctx, parent?.occupation), `Picked up a parent's trade`);
  }
  if (e.parentDies && local.parent && ctx.deaths[local.parent] === undefined && age != null) {
    ctx.deaths[local.parent] = age;
    const par = ctx.family.parents.find((x) => x.present && x.role.toLowerCase().replace(/^adoptive /, '') === local.parent);
    if (par) par.status = `Deceased, when ${ctx.first} was ${age}.`;
  }
  if (e.secret) ctx.secrets.push(endStop(cap(fill(e.secret, ctx, local))));
  if (e.regret) ctx.regrets.push(endStop(cap(fill(e.regret, ctx, local))));
  if (e.hope) ctx.hopes.push(endStop(cap(fill(e.hope, ctx, local))));
  if (e.hook && typeof e.hook === 'string') ctx.hooks.push(endStop(cap(fill(e.hook, ctx, local))));
  if (e.motive) ctx.motives.push(endStop(cap(fill(e.motive, ctx, local))));
  if (e.fear) ctx.fears.push(cap(fill(e.fear, ctx, local)));
  if (e.keepsake) ctx.keepsakes.push(fill(e.keepsake, ctx, local));
  if (typeof e.standing === 'number') ctx.level = clamp(ctx.level + e.standing, 0, 6);
}

/** Roll an event into the timeline (with its follow-up, if any). Returns the final text. */
function happen(ctx, e, { age, stage, timeline = true, local = {} } = {}) {
  if (!local.parentPool) local.parentPool = livingRoles(ctx, age);
  let text = endStop(cap(fill(e.text, ctx, local)));
  applyEffects(ctx, e, { age, stage, local, why: `${stage}, age ${age}: ${shorten(text, 64)}` });
  let follow = e.follow;
  for (let depth = 0; follow && depth < 2; depth++) {
    const sub = pickEntry(ctx, ctx.T.special[follow] || []);
    if (!sub) break;
    const subLocal = { parent: local.parent, parentPool: local.parentPool, sibling: local.sibling };
    const subText = endStop(cap(fill(sub.text, ctx, subLocal)));
    applyEffects(ctx, sub, { age, stage, local: subLocal, why: `${stage}, age ${age}: ${shorten(subText, 64)}` });
    text = `${text} ${subText}`;
    follow = sub.follow;
  }
  if (timeline) ctx.timeline.push({ age, stage, text, tags: [...(e.tags || [])] });
  return text;
}

function stageOf(age) {
  return age <= 0 ? 'Birth' : age <= 12 ? 'Childhood' : age <= 19 ? 'Adolescence' : 'Adulthood';
}

function spreadAges(rng, lo, hi, n) {
  if (hi < lo || n <= 0) return [];
  const span = hi - lo + 1;
  const pool = Array.from({ length: span }, (_, i) => lo + i);
  const out = span >= n ? rng.sample(pool, n) : Array.from({ length: n }, () => rng.int(lo, hi));
  return out.sort((a, b) => a - b);
}

// ---- stage: origins ---------------------------------------------------------------------------

function pickStanding(ctx) {
  const tiers = ctx.T.standing.tiers || [];
  const occ = ctx.occupation;
  const rich = /billionaire|heir|philanthropist|magnate|ceo/i.test(occ);
  const poor = /unemployed|street|drifter|thug|hench/i.test(occ);
  return ctx.rng.weighted(tiers, (t) => {
    let w = t.weight ?? 1;
    if (rich) w *= t.level >= 5 ? 12 : t.level === 4 ? 2 : 0.2;
    if (poor) w *= t.level <= 2 ? 2 : 0.6;
    if (ctx.alignment === 'villain' && t.level <= 1) w *= 1.3;
    return w;
  }) || { id: 'comfortable', level: 3, label: 'Middle class', home: ['a house'], shaped: [] };
}

function nameTown(ctx) {
  const h = ctx.T.hometown;
  const a = ctx.rng.pick(h.townFirst || ['Mill']);
  const b = ctx.rng.pick(h.townLast || ['ton']);
  return `${a}${b}`;
}

function originsPerson(ctx) {
  const rng = ctx.rng;
  const T = ctx.T;
  const items = [];

  // Social standing
  const anglo = !ctx.country || ANGLO.test(ctx.country);
  const tier = pickStanding(ctx);
  ctx.tier = tier;
  ctx.level = ctx.birthLevel = tier.level ?? 3;
  const shaped = fill(rng.pick(tier.shaped || ['']), ctx);
  const standingItem = { label: 'Social standing', text: `${tier.label}. ${shaped}`.trim() };
  items.push(standingItem);
  for (const s of tier.effects?.skills || []) addBenefit(ctx, 'skill', s, `Grew up ${tier.label.toLowerCase()}`);
  for (const a of tier.effects?.advantages || []) addBenefit(ctx, 'advantage', a, `Grew up ${tier.label.toLowerCase()}`);

  // Hometown
  const kind = pickEntry(ctx, T.hometown.kinds || [], { filter: (k) => anglo || !k.us }) || { text: 'an ordinary town' };
  const baseCountry = CITY_COUNTRY[ctx.city];
  const sameCountryBase = ctx.baseOk && (baseCountry ? ctx.country && baseCountry.toLowerCase().includes(ctx.country.toLowerCase().split(' ')[0]) : anglo && /united states|unknown|^$/i.test(ctx.country || ''));
  if (kind.urban && ctx.baseOk && sameCountryBase && rng.chance(0.5)) ctx.hometownName = ctx.city;
  else if (anglo) ctx.hometownName = nameTown(ctx);
  else ctx.hometownName = ctx.country;
  const kindText = fill(kind.text, ctx);
  ctx.hometownKind = kindText;
  ctx.hometownDesc = anglo ? `${ctx.hometownName}, ${kindText}` : `${ctx.country}, in ${kindText}`;
  items.push({ label: 'Hometown', text: endStop(cap(ctx.hometownDesc)) });
  const kt = kind.tags || [];
  const homes = (tier.home || []).filter((h) => {
    if (kt.includes('urban') && /suburb|cul-de-sac|ranch|country|lake|island|farm|trailer|hill|estate|compound|bungalow|cottage/i.test(h)) return false;
    if ((kt.includes('rural') || kt.includes('town') || kt.includes('suburb')) && /penthouse|skyscraper|brownstone|projects|walk-up|townhouse|overpass|embassy/i.test(h)) return false;
    return true;
  });
  if (homes.length) standingItem.text = `${tier.label}. Grew up in ${fill(rng.pick(homes), ctx)}. ${shaped}`.trim();
  applyEffects(ctx, kind, { age: 0, stage: 'Hometown', local: {}, why: `Grew up in ${shorten(kindText, 50)}` });

  // Birth
  const place = pickEntry(ctx, T.birth.places || []) || { text: 'in a hospital' };
  const placeText = fill(place.text, ctx);
  ctx.summaryBits.place = placeText;
  applyEffects(ctx, place, { age: 0, stage: 'Birth', local: {} });
  ctx.timeline.push({ age: 0, stage: 'Birth', text: endStop(`Born ${placeText}`), tags: ['birth'] });
  let unusual = null;
  const unusualChance = ctx.minion ? 0.08 : ctx.powered ? 0.35 : 0.15;
  if (rng.chance(unusualChance)) {
    unusual = pickEntry(ctx, T.birth.unusual || []);
    if (unusual) {
      const local = {};
      const t = endStop(cap(fill(unusual.text, ctx, local)));
      applyEffects(ctx, unusual, { age: 0, stage: 'Birth', local, why: shorten(t, 60) });
      ctx.timeline.push({ age: 0, stage: 'Birth', text: t, tags: ['birth', ...(unusual.tags || [])] });
      ctx.summaryBits.unusual = t;
    }
  }
  items.push({ label: 'Born', text: `${endStop(cap(`Born ${placeText}`))}${ctx.summaryBits.unusual ? ` ${ctx.summaryBits.unusual}` : ''}` });

  // Emigration
  if (!anglo && ctx.baseOk && !(baseCountry && ctx.country && baseCountry.toLowerCase().includes(ctx.country.toLowerCase().split(' ')[0])) && rng.chance(0.6) && ctx.age >= 2) {
    const at = rng.int(1, Math.min(ctx.age, 30));
    ctx.timeline.push({ age: at, stage: stageOf(at), text: at < 18 ? `Moved with family from ${ctx.country} to ${ctx.city}.` : `Emigrated from ${ctx.country} to ${ctx.city} with two suitcases.`, tags: ['travel'] });
    if (rng.chance(0.4)) addComp(ctx, 'Prejudice', `Is treated as an outsider by some in ${ctx.city} because of where ${ctx.p.they_were} born.`);
  }

  // Siblings
  const longLived = ctx.age > 100;
  const count = (rng.weighted(T.birth.siblingCount || [{ n: 1 }]) || { n: 0 }).n;
  const siblings = [];
  let hasTwin = false;
  for (let i = 0; i < count; i++) {
    const twin = !hasTwin && rng.chance(0.05);
    let offset = twin ? 0 : (rng.chance(0.5) ? rng.int(1, 11) : -rng.int(1, 11));
    if (ctx.age + offset < 0) offset = rng.int(1, 8);
    hasTwin = hasTwin || twin;
    const g = rng.weighted([{ v: 'Female', weight: 48 }, { v: 'Male', weight: 48 }, { v: 'Nonbinary', weight: 4 }]).v;
    const firstName = randomFirst(ctx, rng, g);
    const word = g === 'Female' ? 'sister' : g === 'Male' ? 'brother' : 'sibling';
    const relation = `${twin ? 'twin' : offset > 0 ? 'older' : 'younger'} ${word}`;
    const sibAge = ctx.age + offset;
    const fates = (T.birth.siblingFates || []).map(norm).filter((f) => {
      if (f.adult && sibAge < 18) return false;
      if (f.young && (sibAge < 6 || sibAge >= 18)) return false;
      if (f.toddler && sibAge >= 6) return false;
      if (sibAge < 6 && !f.toddler && !f.dead) return false;
      return true;
    });
    let fate = rng.weighted(fates, (f) => (f.weight ?? 1) * (f.dead ? (ctx.alignment === 'villain' ? 1.4 : 1) : 1) * (f.dark ? (ctx.alignment === 'villain' ? 1.5 : 0.8) : 1)) || { text: 'is doing fine' };
    const local = { sibling: firstName };
    let status = fate.status || 'Alive';
    let shownAge = sibAge;
    let note = fill(fate.text, ctx, local);
    if (fate.dead) {
      const lo = Math.max(1, -offset + 1);
      if (lo > ctx.age) { fate = { text: 'is doing fine' }; note = 'is doing fine'; status = 'Alive'; } else {
        const d = rng.int(lo, ctx.age);
        shownAge = d + offset;
        ctx.timeline.push({ age: d, stage: stageOf(d), text: `Lost ${ctx.p.their} ${relation} ${firstName}, who ${note}.`, tags: ['grief', 'family'] });
        addTrait(ctx, 'D');
      }
    }
    if (longLived && status !== 'Deceased') { status = 'Deceased (long ago)'; note = `${note}, generations ago`; }
    if (fate.hook) ctx.hooks.push(`${cap(ctx.first)}'s ${relation} ${firstName} ${note}; a new lead has just surfaced.`);
    if (fate.dependent) addComp(ctx, 'Responsibility', `Helps care for ${ctx.p.their} ${relation} ${firstName}.`);
    siblings.push({ name: `${firstName} ${ctx.surname}`, relation: cap(relation), age: shownAge, note: endStop(cap(note)), status, _offset: offset });
  }
  siblings.sort((a, b) => b._offset - a._offset);
  ctx.family.siblings = siblings.map(({ _offset, ...s }) => s);
  const older = siblings.filter((s) => s._offset > 0).length;
  const younger = siblings.filter((s) => s._offset < 0).length;
  const twins = siblings.filter((s) => s._offset === 0).length;
  const total = siblings.length + 1;
  const orderKey = !siblings.length ? 'only' : twins && total === 2 ? 'twin' : older === 0 ? 'eldest' : younger === 0 ? 'youngest' : 'middle';
  const totalWord = NUMBER_WORDS[total] || String(total);
  ctx.summaryBits.order = orderKey === 'only' ? 'an only child'
    : orderKey === 'twin' ? 'one of a pair of twins'
      : orderKey === 'eldest' ? `the eldest of ${totalWord} children`
        : orderKey === 'youngest' ? `the youngest of ${totalWord} children`
          : `a middle child of ${totalWord}`;
  const orderNote = fill(rng.pick(T.birth.orderNotes?.[orderKey] || ['']), ctx);

  // Family structure
  const forced = unusual?.structure;
  let structure = forced && (T.birth.structures || []).find((s) => s.id === forced);
  if (!structure) {
    structure = rng.weighted((T.birth.structures || []).filter((s) => !s.needsOlderSibling || older > 0),
      (s) => (s.weight ?? 1) * biasMult(s, ctx.level) * (s.trait === 'D' && ctx.alignment === 'villain' ? 1.5 : 1)) || { id: 'two', text: 'Was raised by both parents.', parents: ['mother', 'father'] };
  }
  const structText = endStop(cap(fill(structure.text, ctx)));
  ctx.family.structure = structText;
  ctx.summaryBits.structure = structText;
  items.push({ label: 'Family', text: structText });
  applyEffects(ctx, structure, { age: 0, stage: 'Family', local: {}, why: shorten(structText, 60) });
  if (structure.event && ctx.age >= structure.event.age[0]) {
    happen(ctx, { text: structure.event.text }, { age: rng.int(structure.event.age[0], Math.min(structure.event.age[1], ctx.age)), stage: 'Childhood' });
  }

  // Parents and caregivers
  const statusList = (T.parents.status || []).map(norm);
  const occupations = (T.parents.occupations || []).map(norm);
  const pickOcc = (override) => {
    if (override) return override;
    const lv = ctx.birthLevel;
    const pool = occupations.filter((o) => (o.min ?? 0) <= lv && lv <= (o.max ?? 6));
    const o = rng.weighted(pool, (x) => (x.dark ? (ctx.alignment === 'villain' ? 2 : 0.5) : 1) * (x.super ? 0.6 : 1)) || { text: 'office worker' };
    return fill(o.text, ctx);
  };
  const pickStatus = (role) => {
    if (longLived) return { text: `Deceased, long ago.` };
    const pool = statusList.filter((s) => !s.minAge || ctx.age >= s.minAge);
    const s = rng.weighted(pool, (x) => (x.weight ?? 1) * (x.dies && ctx.alignment === 'villain' ? 1.4 : 1) * (x.dies ? clamp(ctx.age / 30, 0.4, 2.5) : 1));
    if (!s) return { text: 'Alive and well.' };
    if (s.dies) {
      let d = rng.int(1, Math.max(1, ctx.age));
      const early = Object.values(ctx.deaths).filter((x) => x < 18).length;
      if (d < 18 && early >= 1) {
        if (ctx.age < 22) return { text: 'Alive and well.' };
        d = rng.int(18, ctx.age);
      }
      ctx.deaths[role] = d;
      const local = { role };
      const t = endStop(cap(fill(s.dies, ctx, local)));
      ctx.timeline.push({ age: d, stage: stageOf(d), text: t, tags: ['grief', 'family'] });
      addTrait(ctx, s.trait || 'D');
      if (s.motive) ctx.motives.push(fill(s.motive, ctx));
      if (s.hook) ctx.hooks.push(fill(s.hook, ctx));
      return { text: `${noStop(s.text)}, when ${ctx.first} was ${d}.`, died: d };
    }
    return { text: s.text };
  };
  const temperament = () => fill(rng.pick(T.parents.temperament || ['ordinary']), ctx);
  const parents = [];
  const bio = { mother: 'Female', father: 'Male' };
  for (const role of ['mother', 'father']) {
    const present = (structure.parents || []).includes(role);
    const roleLabel = structure.adoptive && present ? `Adoptive ${role}` : cap(role);
    if (structure.unknownParents) {
      parents.push({ name: 'Unknown', role: `Birth ${role}`, occupation: 'Unknown', trait: 'Never known.', status: 'Unknown.', present: false });
      continue;
    }
    const first = randomFirst(ctx, rng, bio[role]);
    const surname = structure.adoptive && present ? ctx.surname : ctx.surname;
    const entry = { name: `${first} ${surname}`, role: roleLabel, occupation: pickOcc(present && role === 'father' && structure.parentJob ? structure.parentJob : present && role === 'mother' && structure.parentJob && !(structure.parents || []).includes('father') ? structure.parentJob : null), trait: cap(temperament()), present };
    if (present) {
      const st = pickStatus(role);
      entry.status = st.text;
      ctx.parentRoles.push(role);
    } else {
      const reason = fill(rng.pick(T.parents.absentReason || ['was not around']), ctx);
      entry.status = endStop(`Absent; ${reason}`);
      if (structure.absent?.includes(role) && /died/i.test(reason)) entry.status = 'Deceased; died young.';
    }
    parents.push(entry);
  }
  if (structure.adoptive) {
    ctx.secrets.push(`Has never found ${ctx.p.their} birth parents, and isn't sure ${ctx.p.they_were} ready to.`);
  }
  for (const role of structure.caregivers || []) {
    const g = /Grandmother|Aunt|Nanny/.test(role) ? 'Female' : /Grandfather|Uncle/.test(role) ? 'Male' : rng.pick(['Female', 'Male']);
    const sameName = /Grand|Aunt|Uncle/.test(role);
    const np = newPerson(ctx, { gender: g, surname: sameName ? ctx.surname : undefined });
    let label = role;
    if (role === 'Foster parent') label = g === 'Female' ? 'Foster mother' : 'Foster father';
    const st = pickStatus(label.toLowerCase());
    parents.push({ name: np.name, role: label, occupation: /Grand/.test(role) ? `retired ${pickOcc()}` : role === 'Home director' ? 'director of the children\'s home' : role === 'Nanny' ? 'the family nanny' : pickOcc(), trait: cap(temperament()), status: st.text, present: true });
    ctx.parentRoles.push(label === 'Home director' ? 'guardian' : label.toLowerCase());
  }
  if (structure.step) {
    const g = rng.pick(['Female', 'Male']);
    const np = newPerson(ctx, { gender: g });
    parents.push({ name: np.name, role: g === 'Female' ? 'Stepmother' : 'Stepfather', occupation: pickOcc(), trait: cap(temperament()), status: 'Alive and well.', present: true });
    ctx.parentRoles.push(g === 'Female' ? 'stepmother' : 'stepfather');
  }
  if (!ctx.parentRoles.length) ctx.parentRoles.push('guardian');
  const notableTarget = rng.chance(0.65) ? rng.pick(parents.filter((x) => x.name !== 'Unknown')) : null;
  if (notableTarget) notableTarget.note = endStop(cap(fill(rng.pick(T.parents.notable || ['']), ctx)));
  ctx.family.parents = parents;
  for (const par of parents) {
    const bits = [`${par.name}, ${par.occupation}`, par.trait ? lowerFirst(noStop(par.trait)) : null].filter(Boolean).join('; ');
    items.push({ label: par.role, text: `${endStop(cap(bits))}${par.note ? ` ${par.note}` : ''} ${par.status || ''}`.trim() });
  }

  // Siblings section line
  const sibText = siblings.length
    ? `${ctx.family.siblings.map((s) => `${s.name} (${lowerFirst(s.relation)}, ${s.age}): ${noStop(s.note)}${/alive/i.test(s.status) ? '' : ` [${noStop(s.status)}]`}.`).join(' ')} ${orderNote}`
    : `None. ${orderNote}`;
  items.push({ label: 'Siblings', text: sibText.trim() });

  // Standing shift during youth
  if (ctx.age >= 4 && rng.chance(0.25) && (T.standing.shifts || []).length) {
    const shift = norm(rng.pick(T.standing.shifts));
    const at = rng.int(2, Math.min(ctx.age, 18));
    ctx.level = clamp(ctx.level + (shift.delta || 0), 0, 6);
    ctx.timeline.push({ age: at, stage: stageOf(at), text: endStop(cap(fill(shift.text, ctx))), tags: ['standing'] });
  }

  // Family secret
  if (rng.chance(0.6)) {
    const sec = rng.weighted((T.parents.secrets || []).map(norm), (x) => (x.weight ?? 1) * (x.tags?.includes('super') && ctx.powered ? 1.5 : 1));
    if (sec && !sec.tags?.includes('none')) {
      const local = {};
      const t = endStop(cap(fill(sec.text, ctx, local)));
      ctx.familySecret = t;
      items.push({ label: 'Family secret (GM)', text: t });
      if (sec.hook) ctx.hooks.push(endStop(cap(fill(sec.hook, ctx, local))));
      if (sec.complication) addComp(ctx, sec.complication.type, fill(sec.complication.text, ctx, local));
    } else if (sec) {
      items.push({ label: 'Family secret (GM)', text: 'None. Ordinary to the bone, as far as anyone knows.' });
    }
  }
  ctx.items.origins = items;
}

function originsConstruct(ctx) {
  const rng = ctx.rng;
  const O = ctx.T.other;
  const local = {};
  const maker = norm(rng.pick(O.makers || [{ text: 'an unknown maker' }]));
  const makerText = fill(maker.text, ctx, local);
  const activation = endStop(cap(fill(rng.pick(O.activation || ['Came online.']), ctx)));
  const directive = endStop(rng.pick(O.firstDirective || ['Serve.']));
  ctx.summaryBits.maker = makerText;
  ctx.summaryBits.activation = activation;
  ctx.summaryBits.directive = directive;
  ctx.level = ctx.birthLevel = 3;
  ctx.hometownName = ctx.baseOk ? ctx.city : 'the lab';
  ctx.timeline.push({ age: 0, stage: 'Activation', text: activation, tags: ['activation'] });
  const makerName = local.npc || local.villain || cap(makerText);
  const makerStatus = rng.pick(['Active; still monitoring its creation.', 'Deceased.', 'Missing.', 'Estranged; wants the construct returned.', 'Unknown.', 'In custody.']);
  ctx.family.parents = [{ name: makerName, role: 'Creator', occupation: maker.person ? 'inventor' : maker.villain ? 'costumed villain' : 'organization', trait: cap(makerText), status: makerStatus }];
  ctx.family.structure = 'Built, not born.';
  if (maker.person || maker.villain) {
    ctx.parentRoles.push('maker');
    ctx.people.push({ name: makerName, relation: maker.villain ? 'Enemy' : 'Mentor', who: `${cap(makerText)}, who built ${ctx.first}.`, status: makerStatus });
  }
  if (rng.chance(0.3)) {
    ctx.family.siblings = [{ name: `Unit ${rng.int(1, 9)}`, relation: 'Sister unit', age: rng.int(0, ctx.age + 2), note: rng.pick(['Was decommissioned.', 'Serves another master.', 'Went rogue.', 'Was never activated.', 'Joined a hero team.']), status: rng.pick(['Active', 'Offline', 'Missing']) }];
  }
  ctx.items.origins = [
    { label: 'Built by', text: endStop(cap(makerText)) },
    { label: 'Activation', text: activation },
    { label: 'First directive', text: directive },
    { label: 'Nature', text: 'Built, not born: no childhood, no parents in the usual sense.' },
  ];
}

function originsSimple(ctx, table, label) {
  const line = endStop(cap(fill(ctx.rng.pick(ctx.T.other[table] || ['Simply exists.']), ctx)));
  ctx.summaryBits.activation = line;
  ctx.family.structure = 'None.';
  ctx.timeline.push({ age: 0, stage: label, text: line, tags: [table] });
  ctx.items.origins = [{ label, text: line }];
}

// ---- stage: youth -----------------------------------------------------------------------------

function youth(ctx) {
  const rng = ctx.rng;
  if (ctx.mode === 'construct') {
    const n = clamp(1 + Math.floor(ctx.age / 4), 2, 5);
    for (const at of spreadAges(rng, 0, Math.max(0, ctx.age), n)) {
      const e = pickEntry(ctx, ctx.T.other.events || []);
      if (e) happen(ctx, e, { age: at, stage: 'Activation history' });
    }
    ctx.items.youth = ctx.timeline.filter((t) => t.stage === 'Activation history').map((t) => ({ label: t.age ? `Year ${t.age}` : 'First days', text: t.text }));
    return;
  }
  if (ctx.mode !== 'person') { ctx.items.youth = []; return; }
  const kids = ctx.minion ? 1 : rng.int(2, 4);
  if (ctx.age >= 4) {
    for (const at of spreadAges(rng, 3, Math.min(12, ctx.age), kids)) {
      const e = pickEntry(ctx, ctx.T.childhood, { age: at });
      if (e) { const t = happen(ctx, e, { age: at, stage: 'Childhood' }); if (!ctx.summaryBits.child || e.trait === 'X' || (e.tags || []).length) ctx.summaryBits.child = t; }
    }
  }
  if (ctx.age >= 13) {
    const hi = Math.min(19, ctx.age);
    const n = ctx.minion ? 1 : hi - 13 >= 3 ? rng.int(2, 4) : rng.int(1, 2);
    for (const at of spreadAges(rng, 13, hi, n)) {
      const e = pickEntry(ctx, ctx.T.adolescence, { age: at });
      if (e) { const t = happen(ctx, e, { age: at, stage: 'Adolescence' }); if (!ctx.summaryBits.teen || (e.tags || []).length) ctx.summaryBits.teen = t; }
    }
  }
  ctx.items.youth = ctx.timeline
    .filter((t) => t.stage === 'Childhood' || t.stage === 'Adolescence')
    .sort((a, b) => a.age - b.age)
    .map((t) => ({ label: `Age ${t.age}`, text: t.text }));
}

// ---- stage: career ----------------------------------------------------------------------------

function career(ctx) {
  const rng = ctx.rng;
  const C = ctx.T.career;
  const items = [];
  const occ = ctx.occupation;
  if (ctx.mode !== 'person') {
    if (occ) items.push({ label: 'Current role', text: endStop(cap(occ)) });
    ctx.items.career = items;
    return;
  }
  let lastAge = 16;
  if (ctx.age >= 16 && !(ctx.minion && rng.chance(0.5))) {
    const stillStudent = /student/i.test(occ) && ctx.age < 23;
    const pool = (C.education || []).map(norm).filter((e) => (e.min ?? 0) <= ctx.birthLevel && ctx.birthLevel <= (e.max ?? 6) && (e.age ?? 18) <= ctx.age);
    const edu = stillStudent && ctx.age < 18 ? null : rng.weighted(pool, (e) => (e.weight ?? 1) * (e.trait === 'D' && ctx.alignment === 'villain' ? 1.5 : 1));
    if (edu) {
      const at = Math.min(ctx.age, edu.age ?? 18);
      const t = happen(ctx, edu, { age: at, stage: 'Education' });
      items.push({ label: 'Education', text: t });
      lastAge = at;
    } else {
      items.push({ label: 'Education', text: endStop(fill(`Still attending {school}`, ctx)) });
    }
  } else if (ctx.age < 16) {
    items.push({ label: 'Education', text: endStop(fill(`Still attending {school}`, ctx)) });
  }
  // Earlier jobs
  const start = Math.max(16, lastAge);
  const years = ctx.age - start;
  let nJobs = years < 2 ? 0 : clamp(Math.floor(years / 7) + rng.int(0, 1), 0, 4);
  if (ctx.minion) nJobs = Math.min(nJobs, 1);
  const jobs = [];
  for (const at of spreadAges(rng, start, Math.max(start, ctx.age - 1), nJobs)) {
    const j = pickEntry(ctx, C.jobs || [], { filter: (x) => !x.dark || ctx.alignment === 'villain' || rng.chance(0.3) });
    if (!j) continue;
    const local = {};
    const name = fill(j.text, ctx, local);
    jobs.push(name);
    ctx.timeline.push({ age: at, stage: stageOf(at) === 'Adulthood' ? 'Career' : stageOf(at), text: `Worked as ${withArticle(name)}.`, tags: ['career', ...(j.tags || [])] });
    applyEffects(ctx, j, { age: at, stage: 'Career', local, why: `Worked as ${withArticle(name)}` });
    lastAge = at;
  }
  if (jobs.length) items.push({ label: 'Earlier jobs', text: endStop(cap(jobs.join('; '))) });
  // Current occupation
  if (occ) {
    const row = (C.occupationSkills || []).find((r) => new RegExp(r.match, 'i').test(occ));
    for (const s of row?.skills || []) addBenefit(ctx, 'skill', s, `Works as ${withArticle(occ.toLowerCase())}`);
    if (ctx.minion) {
      const at = rng.int(Math.max(18, ctx.age - 6), Math.max(18, ctx.age));
      if (at <= ctx.age) ctx.timeline.push({ age: at, stage: 'Career', text: rng.pick([`Signed on with a costumed villain's crew as ${withArticle(occ.toLowerCase())}.`, `Answered a 'no questions asked' job listing and became ${withArticle(occ.toLowerCase())}.`, `Was recruited off the street to work as ${withArticle(occ.toLowerCase())}.`]), tags: ['career', 'crime'] });
      items.push({ label: 'Current work', text: endStop(cap(occ)) });
    } else if (!/student|unemployed/i.test(occ) && ctx.age >= 18) {
      const at = clamp(rng.int(lastAge + 1, Math.max(lastAge + 1, ctx.age)), 18, ctx.age);
      ctx.timeline.push({ age: at, stage: 'Career', text: `Started work as ${withArticle(occ.toLowerCase())}.`, tags: ['career'] });
      items.push({ label: 'Current occupation', text: endStop(`${cap(occ)}, in ${ctx.city}`) });
    } else {
      items.push({ label: 'Current occupation', text: endStop(cap(occ)) });
    }
  }
  ctx.items.career = items;
}

// ---- stage: life ------------------------------------------------------------------------------

function life(ctx) {
  const rng = ctx.rng;
  const items = [];
  if (ctx.mode === 'person') {
    if (ctx.age >= 20) {
      const top = Math.min(ctx.age, 95);
      let n = ctx.minion ? rng.int(1, 2) : clamp(Math.round((top - 19) / 6) + rng.int(0, 2), 1, 9);
      for (const at of spreadAges(rng, 20, top, n)) {
        const e = pickEntry(ctx, ctx.T.adult, { age: at });
        if (!e) continue;
        const t = happen(ctx, e, { age: at, stage: 'Adulthood' });
        items.push({ label: `Age ${at}`, text: t });
        if (!ctx.summaryBits.adult || (e.tags || []).some((x) => ['super', 'crime', 'tragedy', 'redemptive', 'dark', 'military'].includes(x))) ctx.summaryBits.adult = t;
      }
      if (ctx.age > 100) {
        const nl = rng.int(3, 4);
        for (const at of spreadAges(rng, 100, ctx.age, nl)) {
          const e = pickEntry(ctx, ctx.T.other.longlived || []);
          if (!e) continue;
          const t = happen(ctx, e, { age: at, stage: 'Long life' });
          items.push({ label: `Age ${at}`, text: t });
        }
        ctx.summaryBits.long = true;
      }
    }
    if (!(ctx.minion && rng.chance(0.4))) {
      const fb = pickEntry(ctx, ctx.T.firstbrush, { filter: (e) => !Array.isArray(e.age) || e.age[0] <= Math.max(3, ctx.age) });
      if (fb) {
        const lo = Math.max(Array.isArray(fb.age) ? fb.age[0] : 3, Math.min(3, ctx.age));
        const hi = Math.max(lo, Math.min(Array.isArray(fb.age) ? fb.age[1] : ctx.age, ctx.age));
        const at = Math.min(rng.int(lo, hi), rng.int(lo, hi), ctx.age);
        const t = happen(ctx, fb, { age: at, stage: 'First brush' });
        ctx.summaryBits.firstBrush = { age: at, text: t };
        items.push({ label: 'First brush with the extraordinary', text: `At ${at}: ${t}` });
      }
    }
  }
  const origin = ctx.ch?.origin;
  if (origin?.text && origin.type !== 'minion') items.push({ label: `Power origin${origin.label ? ` (${origin.label})` : ''}`, text: endStop(origin.text) });
  ctx.items.life = items;
}

// ---- stage: people ----------------------------------------------------------------------------

function people(ctx) {
  const rng = ctx.rng;
  if (ctx.mode === 'automaton' || ctx.mode === 'creature') { ctx.items.people = ctx.people.map(personItem); return; }
  const P = ctx.T.people;
  const target = ctx.minion ? rng.int(1, 2) : ctx.mode === 'construct' ? rng.int(2, 4) : rng.int(4, 7);
  const count = (rel) => ctx.people.filter((x) => x.relation === rel).length;
  for (let guard = 0; ctx.people.length < target && guard < 12; guard++) {
    const weights = [
      { v: 'Friend', weight: 3 }, { v: 'Ally', weight: 3 }, { v: 'Rival', weight: 2 },
      { v: 'Enemy', weight: ctx.alignment === 'villain' ? 2.5 : 2 }, { v: 'Mentor', weight: 2 },
      { v: 'Love', weight: ctx.age >= 17 && ctx.mode === 'person' ? 2.5 : 0 },
      { v: 'Ex', weight: ctx.age >= 18 && ctx.mode === 'person' ? 2 : 0 },
      { v: 'Dependent', weight: ctx.age >= 16 ? 1 : 0 },
    ].map((w) => ({ ...w, weight: w.weight * (count(w.v) >= 2 || (w.v === 'Love' && count('Love') >= 1) ? 0 : count(w.v) === 1 ? 0.4 : 1) }));
    const rel = rng.weighted(weights)?.v;
    if (!rel || !P[rel]) break;
    const local = {};
    const whoT = rng.pick(P[rel].who || []);
    if (!whoT) continue;
    let who = fill(whoT, ctx, local);
    let status = fill(rng.pick(P[rel].status || ['Around.']), ctx, local);
    if (P[rel].why) who = `${noStop(who)}. ${endStop(cap(fill(rng.pick(P[rel].why), ctx, local)))}`;
    if (rel === 'Rival' && P.Rival.intensity) {
      const it = rng.weighted(P.Rival.intensity);
      if (it) {
        status = `${fill(it.text, ctx, local)} ${endStop(cap(status))}`;
        if (it.complication && !ctx.comps.some((c) => c.type === it.complication)) addComp(ctx, it.complication, `Is the obsession of a rival who will stop at nothing.`);
      }
    }
    let name = /^\{hero\}/.test(whoT) ? local.hero : /^\{villain\}/.test(whoT) ? local.villain : local.npc;
    name = name || 'Unknown';
    if (ctx.people.some((x) => x.name === name)) continue;
    ctx.people.push({ name, relation: rel, who: endStop(stripLead(who, name)), status: endStop(cap(status)) });
  }
  ctx.items.people = ctx.people.map(personItem);
}

function personItem(p) {
  return { label: `${p.name} (${p.relation})`, text: `${p.who} ${p.status}`.trim() };
}

// ---- stage: personality -----------------------------------------------------------------------

function personality(ctx) {
  const rng = ctx.rng;
  const P = ctx.T.personality;
  const strength = () => rng.weighted(P.strength || [{ v: 'mild' }]).v;
  const traits = [];
  const has = (name) => traits.some((t) => t.name.toLowerCase() === String(name).toLowerCase());
  const push = (t, side, s) => {
    if (!t?.name || has(t.name)) return;
    traits.push({ name: cap(fill(t.name, ctx)), side, strength: s || strength(), ...(t.gloss ? { note: fill(t.gloss, ctx) } : {}) });
  };
  const given = ctx.ch?.personality || {};
  for (const x of given.positive || []) push({ name: x }, 'light');
  for (const x of given.negative || []) push({ name: x }, 'dark');
  if (ctx.mode === 'automaton' || ctx.mode === 'creature') {
    if (!traits.length) push({ name: ctx.mode === 'automaton' ? 'Single-minded' : 'Territorial', gloss: ctx.mode === 'automaton' ? 'does only what it was made or ordered to do' : 'defends its lair against all comers' }, 'neutral', 'obsessive');
  } else {
    const max = ctx.minion ? 3 : rng.int(4, 6);
    const pool = [];
    const tags = ctx.traitTags;
    for (const [k, side] of [['L', 'light'], ['D', 'dark'], ['N', 'neutral']]) for (let i = 0; i < tags[k]; i++) pool.push(side);
    if (!pool.length) pool.push('neutral', ctx.alignment === 'villain' ? 'dark' : 'light');
    for (const side of rng.shuffle(pool)) {
      if (traits.length >= max) break;
      const list = (P[side] || []).filter((t) => !has(t.name));
      push(rng.pick(list), side);
    }
    if (ctx.alignment === 'villain' && !traits.some((t) => t.side === 'dark')) push(rng.pick(P.dark || []), 'dark');
    if (ctx.alignment === 'hero' && !traits.some((t) => t.side === 'light')) push(rng.pick(P.light || []), 'light');
    const exoticN = Math.min(2, tags.X ? (rng.chance(0.6) ? 1 : 0) + (tags.X > 1 && rng.chance(0.3) ? 1 : 0) : rng.chance(0.1) ? 1 : 0);
    for (let i = 0; i < exoticN; i++) push(rng.pick((P.exotic || []).filter((t) => !has(t.name))), 'exotic');
  }

  // Values: two ideals, a person and a keepsake
  const values = [];
  if (ctx.mode !== 'automaton' && ctx.mode !== 'creature') {
    const ideals = (P.ideals || []).slice();
    const darkIdeals = /Money|Power|Revenge|Survival|Reputation|Possess/;
    const iw = (x) => (ctx.alignment === 'villain' ? (darkIdeals.test(x) ? 3 : 1) : (darkIdeals.test(x) ? 0.4 : 1));
    for (let i = 0; i < 2; i++) {
      const v = rng.weighted(ideals.filter((x) => !values.includes(x)), iw);
      if (v) values.push(v);
    }
    const candidates = [
      ...ctx.family.parents.filter((x) => x.name !== 'Unknown' && !/^deceased/i.test(x.status || '')).map((x) => `${x.name}, ${ctx.p.their} ${x.role.toLowerCase()}`),
      ...ctx.family.siblings.map((x) => `${x.name}, ${ctx.p.their} ${x.relation.toLowerCase()}`),
      ...ctx.people.filter((x) => ['Love', 'Friend', 'Mentor', 'Dependent', 'Ally'].includes(x.relation) && !/deceased/i.test(x.status)).map((x) => `${x.name} (${x.relation.toLowerCase()})`),
    ];
    if (candidates.length) values.push(`Most treasured person: ${rng.pick(candidates)}`);
    const keep = ctx.keepsakes.length ? rng.pick(ctx.keepsakes) : fill(rng.pick(P.keepsakes || ['an old photograph']), ctx);
    values.push(`Most treasured thing: ${keep}`);
  }

  const fears = [];
  if (ctx.fears.length) fears.push(rng.pick(ctx.fears));
  const nFears = ctx.mode === 'automaton' ? 0 : rng.int(1, 2);
  while (fears.length < nFears) {
    const f = cap(fill(rng.pick(P.fears || ['The dark']), ctx));
    if (!fears.includes(f)) fears.push(f);
  }
  const sampleFill = (list, n) => rng.sample(list || [], n).map((x) => cap(fill(x, ctx)));
  const habits = ctx.mode === 'automaton' ? [] : sampleFill(P.habits, 2);
  if (given.quirk) habits.unshift(cap(personalize(ctx, given.quirk)));
  const out = {
    traits,
    values,
    fears,
    habits,
    likes: ctx.mode === 'automaton' ? [] : sampleFill(P.likes, 3),
    dislikes: ctx.mode === 'automaton' ? [] : sampleFill(P.dislikes, 2),
    voice: ctx.mode === 'automaton' ? 'Silent, or a flat, repeated phrase.' : fill(rng.pick(P.voices || ['Ordinary.']), ctx),
  };
  ctx.personality = out;
  const items = [];
  if (traits.length) items.push({ label: 'Traits', text: traits.map((t) => `${t.name} (${t.side}, ${t.strength})`).join('; ') });
  if (values.length) items.push({ label: 'Values', text: values.join('; ') });
  if (fears.length) items.push({ label: 'Fears', text: fears.join('; ') });
  if (habits.length) items.push({ label: 'Habits', text: habits.join('; ') });
  if (out.likes.length) items.push({ label: 'Likes', text: out.likes.join('; ') });
  if (out.dislikes.length) items.push({ label: 'Dislikes', text: out.dislikes.join('; ') });
  items.push({ label: 'Voice & mannerism', text: out.voice });
  ctx.items.personality = items;
}

// ---- stage: drives ----------------------------------------------------------------------------

function drives(ctx) {
  const rng = ctx.rng;
  const D = ctx.T.drives;
  const motivations = [];
  const goal = ctx.ch?.goal ? personalize(ctx, ctx.ch.goal) : '';
  if (ctx.motives.length) motivations.push(rng.pick(ctx.motives));
  const pool = (D.motivations || []).map(norm).filter((m) => !m.align || m.align === ctx.alignment);
  const first = rng.pick(pool.filter((m) => m.align));
  if (first && motivations.length === 0) motivations.push(endStop(cap(fill(first.text, ctx))));
  if (goal) motivations.push(endStop(`Wants to ${goal}`));
  if (!ctx.minion && rng.chance(0.6)) {
    const extra = rng.pick(pool.filter((m) => !motivations.includes(m.text)));
    if (extra) motivations.push(endStop(cap(fill(extra.text, ctx))));
  }
  if (ctx.mode === 'construct' && ctx.summaryBits.directive) motivations.push(`Original directive: ${ctx.summaryBits.directive}`);
  const uniq = (list) => Array.from(new Set(list));
  const take = (own, table, lo, hi) => {
    const out = uniq(own).slice(0, hi);
    const n = rng.int(lo, hi);
    const avail = rng.shuffle((table || []).map((x) => endStop(cap(fill(x, ctx, { parentPool: livingRoles(ctx) })))));
    for (const x of avail) { if (out.length >= n) break; if (!out.includes(x)) out.push(x); }
    return out;
  };
  const simple = ctx.mode === 'automaton' || ctx.mode === 'creature';
  if (simple) motivations.splice(0, motivations.length, goal ? endStop(`To ${goal}`) : (ctx.mode === 'automaton' ? 'To obey.' : 'Survival.'));
  ctx.motivations = uniq(motivations.length ? motivations : ['Survival.']);
  const O = ctx.T.other;
  if (ctx.mode === 'construct') {
    ctx.secretsOut = take(ctx.secrets, O.constructSecrets, 1, 2);
    ctx.regretsOut = take(ctx.regrets, O.constructRegrets, 1, 1);
    ctx.hopesOut = take(ctx.hopes, O.constructHopes, 1, 2);
  }
  if (ctx.mode !== 'construct') ctx.secretsOut = simple ? [] : take(ctx.secrets, D.secrets, 1, ctx.minion ? 1 : 3);
  if (ctx.mode !== 'construct') ctx.regretsOut = simple ? [] : take(ctx.regrets.filter((r) => !/\{/.test(r)), (D.regrets || []).filter((r) => (!/\{sibling\}/.test(r) || ctx.family.siblings.length) && (!/\{parent\}/.test(r) || livingRoles(ctx).length)), 1, 2);
  if (ctx.mode !== 'construct') ctx.hopesOut = simple ? [] : take(ctx.hopes, (D.hopes || []).filter((r) => (!/\{sibling\}/.test(r) || ctx.family.siblings.length) && (!/\{parent\}/.test(r) || livingRoles(ctx).length) && (!/Ruling the city/.test(r) || ctx.alignment === 'villain')), 1, 2);
  const items = [{ label: 'Motivations', text: ctx.motivations.join(' ') }];
  if (ctx.secretsOut.length) items.push({ label: 'Secrets', text: ctx.secretsOut.join(' ') });
  if (ctx.regretsOut.length) items.push({ label: 'Regrets', text: ctx.regretsOut.join(' ') });
  if (ctx.hopesOut.length) items.push({ label: 'Hopes', text: ctx.hopesOut.join(' ') });
  ctx.items.drives = items;
}

/** Turn generic "they/their/them" wording from other generators into this character's pronouns. */
function personalize(ctx, text) {
  const p = ctx.p;
  return String(text)
    .replace(/\bthey are\b/g, p.they_are)
    .replace(/\bthey (\w+)/g, (_, v) => `${p.they} ${conjugate(v, p.plural)}`)
    .replace(/\btheir\b/g, p.their)
    .replace(/\bthemselves\b/g, p.themself)
    .replace(/\bthem\b/g, p.them);
}

// ---- stage: game ------------------------------------------------------------------------------

function game(ctx) {
  const rng = ctx.rng;
  // Hooks
  const hooks = Array.from(new Set(ctx.hooks)).slice(0, 2);
  const want = ctx.minion || ctx.mode === 'automaton' ? 1 : rng.int(3, 5);
  const humanOnly = /money|their eyes|grew up|\{school\}|\{hometown\}|old neighborhood|childhood|kid from the future|\{sibling\}|\{parent\}/;
  for (const h of rng.shuffle(ctx.T.hooks.map(norm).filter((e) => needsMet(e, ctx) && (ctx.mode === 'person' || !humanOnly.test(e.text))))) {
    if (hooks.length >= want) break;
    const t = endStop(cap(fill(h.text, ctx)));
    if (!hooks.includes(t)) hooks.push(t);
  }
  ctx.hooksOut = hooks;

  // Complications
  const comps = [];
  const seen = new Set();
  const add = (type, text) => {
    if (!DCA_COMPLICATIONS.includes(type) || !text) return;
    const limit = type === 'Enemy' ? 2 : 1;
    if (comps.filter((c) => c.type === type).length >= limit) return;
    if (seen.has(text)) return;
    seen.add(text);
    comps.push({ type, text: endStop(cap(text)) });
  };
  if (ctx.motivations?.[0]) add('Motivation', ctx.motivations[0]);
  for (const c of rng.shuffle(ctx.comps)) add(c.type, c.text);
  const firstOf = (rel) => ctx.people.find((p) => p.relation === rel && !/deceased/i.test(p.status));
  const enemy = firstOf('Enemy');
  if (enemy) add('Enemy', `${enemy.name}: ${lowerFirst(noStop(enemy.who))}.`);
  const rival = firstOf('Rival');
  if (rival) add('Rivalry', `${rival.name}: ${lowerFirst(noStop(rival.who))}.`);
  const love = firstOf('Love') || firstOf('Dependent');
  if (love) add(love.relation === 'Dependent' ? 'Responsibility' : 'Relationship', `${love.name}: ${lowerFirst(noStop(love.who))}.`);
  const strongFear = ctx.personality?.fears?.[0];
  if (strongFear && rng.chance(ctx.T.game.fearToPhobia ?? 0.35)) add('Phobia', `${strongFear}.`);
  const tr = ctx.personality?.traits || [];
  if (tr.some((t) => /temper/i.test(t.name) && t.strength !== 'mild')) add('Temper', 'Loses control when provoked.');
  const exotic = tr.find((t) => t.side === 'exotic');
  if (exotic) add('Quirk', `${exotic.name}${exotic.note ? `: ${exotic.note}` : ''}.`);
  const obsessive = tr.find((t) => t.strength === 'obsessive' && t.side !== 'exotic');
  if (obsessive) add('Obsession', `${obsessive.name}, to an obsessive degree${obsessive.note ? `: ${obsessive.note}` : ''}.`);
  if (ctx.secretsOut?.[0] && rng.chance(0.5)) add('Secret', ctx.secretsOut[0]);
  if (ctx.ch?.alignment === 'hero' && ctx.mode === 'person' && !ctx.minion && rng.chance(0.3)) add('Identity', `Keeps ${ctx.p.their} costumed life hidden from ${love ? love.name : 'family and coworkers'}.`);
  if (comps.length < 3) {
    const fb = ctx.T.game.fallback || {};
    for (const type of rng.shuffle(Object.keys(fb))) {
      if (comps.length >= 3) break;
      if (comps.some((c) => c.type === type)) continue;
      add(type, fill(rng.pick(fb[type]), ctx));
    }
  }
  const maxComps = ctx.minion ? 3 : 7;
  ctx.compsOut = comps.slice(0, maxComps);

  // Benefits
  const rank = (map, n) => Array.from(map.values())
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, n)
    .map((x) => ({ name: x.name, ...(x.spec ? { spec: x.spec } : {}), why: x.why.slice(0, 2).join('; ') }));
  ctx.benefits = { skills: rank(ctx.skills, ctx.minion ? 4 : 8), advantages: rank(ctx.advantages, ctx.minion ? 2 : 5) };

  const items = [];
  for (const h of hooks) items.push({ label: 'Story hook', text: h });
  for (const c of ctx.compsOut) items.push({ label: `Complication: ${c.type}`, text: c.text });
  if (ctx.benefits.skills.length) items.push({ label: 'Suggested skills', text: ctx.benefits.skills.map((s) => `${s.name}${s.spec ? ` (${s.spec})` : ''}`).join(', ') });
  if (ctx.benefits.advantages.length) items.push({ label: 'Suggested advantages', text: ctx.benefits.advantages.map((a) => a.name).join(', ') });
  ctx.items.game = items;
}

// ---- summary ----------------------------------------------------------------------------------

function verbClause(text) {
  // "Was rescued from a fire." -> "was rescued from a fire"
  return lowerFirst(firstSentence(text));
}

function buildSummary(ctx) {
  const b = ctx.summaryBits;
  const name = ctx.fullName;
  const first = ctx.first;
  const s = [];
  const occ = ctx.occupation;
  const occPhrase = () => {
    if (!occ) return '';
    if (/student/i.test(occ)) return `is now a student in ${ctx.city}`;
    if (/unemployed/i.test(occ)) return `is currently out of work in ${ctx.city}`;
    return `now works as ${withArticle(occ.toLowerCase())} in ${ctx.city}`;
  };
  if (ctx.mode === 'construct') {
    s.push(`${name} ${verbClause(b.activation || 'Came online.')}.`);
    s.push(`${cap(ctx.p.they)} ${ctx.p.plural ? 'were' : 'was'} built by ${b.maker}, and ${ctx.p.their} first directive was simple: ${noStop(b.directive || 'Serve')}.`);
    const ev = ctx.timeline.find((t) => t.stage === 'Activation history');
    if (ev) s.push(`Since then ${first} ${verbClause(ev.text)}.`);
    const motive = ctx.motivations?.[0];
    s.push(`${occ ? `Today ${first} ${occPhrase().replace(/^now /, '')}` : `Today ${first} operates out of ${ctx.city}`}${motive ? `, driven by ${lowerFirst(noStop(motive))}` : ''}.`);
    return s.join(' ');
  }
  if (ctx.mode === 'automaton' || ctx.mode === 'creature') {
    s.push(`${name} ${verbClause(b.activation || 'Simply exists.')}.`);
    const purpose = personalize(ctx, noStop(ctx.ch?.goal || 'obey its orders'));
    s.push(ctx.mode === 'automaton' ? `It has no past to speak of, only a purpose: to ${purpose.replace(/^to /, '')}.` : `What it wants is simple: ${lowerFirst(noStop(ctx.motivations?.[0] || 'survival'))}.`);
    s.push(`It is now found in ${ctx.city}.`);
    return s.join(' ');
  }
  const standing = (ctx.tier?.label || 'ordinary').toLowerCase();
  const place = b.place || 'in a hospital';
  const grewUp = ctx.hometownName && place.includes(ctx.hometownName) && ctx.hometownKind ? `there, in ${ctx.hometownKind}` : `in ${ctx.hometownDesc || ctx.hometownName}`;
  s.push(`${name} was born ${place}, into ${withArticle(standing)} family, and grew up ${grewUp}.`);
  s.push(`${first} ${lowerFirst(noStop(b.structure || 'Was raised by family'))}, ${b.order || 'an only child'}.`);
  const youthBit = b.teen || b.child;
  if (youthBit) s.push(`As ${b.teen ? 'a teenager' : 'a child'}, ${first} ${verbClause(youthBit)}.`);
  const op = occPhrase();
  if (b.adult) s.push(`Later, ${first} ${verbClause(b.adult)}${op ? `, and ${op}` : ''}.`);
  else if (op) s.push(`${first} ${op}.`);
  if (s.length < 5 && b.firstBrush) s.push(`${first}'s first brush with the extraordinary came at ${b.firstBrush.age}: ${first} ${verbClause(b.firstBrush.text)}.`);
  const motive = ctx.motivations?.[0];
  if (s.length < 5 && motive) s.push(`Today ${first} is driven by ${lowerFirst(noStop(motive))}.`);
  return s.slice(0, 5).join(' ');
}

// ---- assembly ---------------------------------------------------------------------------------

function defaultSeeds(seed) {
  return Object.fromEntries(STAGES.map((k) => [k, `${seed}::bio::${k}`]));
}

function build(R, ch, seed, seeds) {
  const ctx = makeContext(R, ch, seed, seeds);
  const run = (stage, fn) => { ctx.rng = makeRng(seeds[stage]); fn(ctx); };
  run('origins', (c) => {
    if (c.mode === 'construct') originsConstruct(c);
    else if (c.mode === 'automaton') originsSimple(c, 'automaton', 'Origin');
    else if (c.mode === 'creature') originsSimple(c, 'creature', 'Origin');
    else originsPerson(c);
  });
  run('youth', youth);
  run('career', career);
  run('life', life);
  run('people', people);
  run('personality', personality);
  run('drives', drives);
  run('game', game);
  ctx.rng = makeRng(`${seed}::bio::summary`);

  const timeline = ctx.timeline
    .map((t, i) => ({ ...t, age: Math.max(0, Math.min(Math.round(t.age), ctx.age)), _i: i }))
    .sort((a, b) => a.age - b.age || a._i - b._i)
    .map(({ _i, ...t }) => t);
  const titles = { ...SECTION_TITLES };
  if (ctx.mode === 'construct') { titles.origins = 'Construction & Activation'; titles.youth = 'Activation History'; }
  if (ctx.mode === 'automaton' || ctx.mode === 'creature') titles.origins = 'Origin';
  const sections = STAGES
    .map((id) => ({ id, title: titles[id], items: (ctx.items[id] || []).filter((x) => x && x.text) }))
    .filter((s) => s.items.length);

  return {
    version: BIO_VERSION,
    seed,
    seeds,
    name: ctx.fullName,
    summary: buildSummary(ctx),
    sections,
    timeline,
    family: {
      parents: ctx.family.parents.map(({ present, ...p }) => ({ name: p.name, role: p.role, occupation: p.occupation, trait: p.trait, status: p.status || 'Unknown.', ...(p.note ? { note: p.note } : {}) })),
      siblings: ctx.family.siblings,
      structure: ctx.family.structure,
    },
    people: ctx.people.map(({ since, ...p }) => p),
    personality: ctx.personality,
    motivations: ctx.motivations,
    secrets: ctx.secretsOut,
    regrets: ctx.regretsOut,
    hopes: ctx.hopesOut,
    hooks: ctx.hooksOut,
    complications: ctx.compsOut,
    benefits: ctx.benefits,
  };
}

/** Every "a person enters their life" spec in the lifepath tables, by relationship. */
function personSpecs(R) {
  const out = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.relation && o.who && !o.name) out.push(o);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
  };
  walk(R?.raw?.lifepath || {});
  return out;
}

/**
 * Roll one person for a hand-written bio: fills in everything but what you typed. kind: 'parent',
 * 'sibling' or 'person'. Give a name to keep it (and a role or relation to keep that); leave them blank
 * to roll them too. Deterministic for a given seed. Returns a row for bio.family.parents, .siblings or
 * bio.people.
 */
export function rollPerson(R, ch, { kind = 'person', name = '', role = '', relation = '', age = null } = {}, { seed } = {}) {
  const s = String(seed ?? `${ch?.bio?.seed || ch?.seed || 'bio'}::roll::${name || kind}`);
  const ctx = makeContext(R, ch || {}, s, defaultSeeds(s));
  const rng = ctx.rng = makeRng(`${s}::person::${kind}::${name}::${role || relation}`);
  const T = ctx.T;
  const keep = String(name || '').trim();
  if (kind === 'parent') {
    const r = String(role || '').trim() || rng.pick(['Mother', 'Father', 'Mother', 'Father', 'Stepmother', 'Stepfather', 'Grandmother', 'Grandfather', 'Guardian', 'Adoptive mother', 'Adoptive father']);
    const g = /mother|grandmother|aunt|nanny/i.test(r) ? 'Female' : /father|grandfather|uncle/i.test(r) ? 'Male' : rng.pick(['Female', 'Male']);
    const np = keep ? { name: keep } : newPerson(ctx, { gender: g, surname: ctx.surname || undefined });
    const occupations = (T.parents.occupations || []).map(norm);
    const occ = rng.pick(occupations.filter((o) => (o.min ?? 0) <= 3 && 3 <= (o.max ?? 6))) || { text: 'office worker' };
    const statuses = (T.parents.status || []).map(norm).filter((x) => !x.minAge || ctx.age >= x.minAge);
    const st = rng.weighted(statuses, (x) => (x.weight ?? 1)) || { text: 'Alive and well.' };
    const stText = fill(st.text, ctx, { role: r.toLowerCase() });
    const status = st.dies && !/deceased|died|dead/i.test(stText) ? `Deceased; ${noStop(lowerFirst(stText))}.` : endStop(cap(stText));
    return { name: np.name, role: r, occupation: /Grand/.test(r) ? `retired ${fill(occ.text, ctx)}` : fill(occ.text, ctx), trait: cap(fill(rng.pick(T.parents.temperament || ['ordinary']), ctx)), status };
  }
  if (kind === 'sibling') {
    const rel = String(relation || '').trim();
    const g = /sister/i.test(rel) ? 'Female' : /brother/i.test(rel) ? 'Male' : rng.pick(['Female', 'Male']);
    const word = g === 'Female' ? 'sister' : 'brother';
    const offset = /twin/i.test(rel) ? 0 : /older|elder|big/i.test(rel) ? rng.int(1, 8) : /younger|little|baby/i.test(rel) ? -rng.int(1, 8) : rng.pick([1, -1]) * rng.int(1, 8);
    const sibAge = age != null ? Number(age) : Math.max(0, ctx.age + offset);
    const relationOut = rel || cap(`${offset === 0 ? 'twin' : offset > 0 ? 'older' : 'younger'} ${word}`);
    const first = keep ? keep : `${randomFirst(ctx, rng, g)} ${ctx.surname || ''}`.trim();
    const fates = (T.birth.siblingFates || []).map(norm).filter((f) => !(f.adult && sibAge < 18) && !(f.young && (sibAge < 6 || sibAge >= 18)) && !(f.toddler && sibAge >= 6) && !f.dead);
    const fate = rng.pick(fates) || { text: 'is doing fine' };
    const note = fill(fate.text, ctx, { sibling: first.split(' ')[0] });
    return { name: first, relation: relationOut, age: sibAge, note: endStop(cap(note)), status: fate.status || 'Alive' };
  }
  // anyone else in their life
  const specs = personSpecs(R);
  const want = String(relation || '').trim();
  const rel = want || rng.pick(BIO_RELATIONS);
  let pool = specs.filter((x) => x.relation.toLowerCase() === rel.toLowerCase());
  if (!pool.length) pool = specs.filter((x) => ({ Contact: 'Ally', Teammate: 'Ally', Partner: 'Love', Employer: 'Mentor', Student: 'Dependent', Guardian: 'Mentor', Family: 'Friend', Informant: 'Ally', Nemesis: 'Enemy' })[rel] === x.relation);
  if (!pool.length) pool = specs;
  const spec = rng.pick(pool) || { relation: rel, who: '{npc}, someone from the old days', status: 'Still around.' };
  // the typed name goes into the slot that is this person; any other name in the sentence is rolled
  const local = {};
  if (keep) {
    const lead = /^\{(npc|hero|villain)\}/.exec(spec.who)?.[1] || (spec.who.includes('{npc}') ? 'npc' : spec.who.includes('{hero}') ? 'hero' : spec.who.includes('{villain}') ? 'villain' : 'npc');
    local[lead] = keep; local.first = keep.split(' ')[0];
  }
  const who = fill(spec.who, ctx, local);
  const nm = keep || local.npc || local.hero || local.villain || newPerson(ctx).name;
  const status = endStop(cap(spec.status ? fill(spec.status, ctx, local) : fill(rng.pick(T.people?.[rel]?.status || ['Still around.']), ctx, local)));
  return { name: nm, relation: rel, who: endStop(cap(stripLead(who, nm))), status };
}

/**
 * Generate a life history for a character (or NPC). Deterministic for a given seed.
 * Reads ch.identity (realName, gender, age, occupation, homeland, base), ch.origin, ch.alignment,
 * ch.goal, ch.personality, ch.archetype, ch.construct / ch.kind and ch.minion when present.
 */
export function generateBio(R, ch, { seed } = {}) {
  const s = String(seed ?? ch?.seed ?? 'bio');
  return build(R, ch || {}, s, defaultSeeds(s));
}

/**
 * Re-roll one section of a bio, keeping the others' random streams. Later sections that depend
 * on the re-rolled one (for example people met during youth) follow along so the story stays
 * consistent. sectionId: origins, youth, career, life, people, personality, drives, game.
 */
export function rerollSection(R, ch, bio, sectionId, { seed } = {}) {
  const stage = SECTION_ALIASES[sectionId] || sectionId;
  if (!STAGES.includes(stage)) throw new Error(`Unknown bio section "${sectionId}". Use one of: ${STAGES.join(', ')}.`);
  const baseSeed = String(bio?.seed ?? ch?.seed ?? 'bio');
  const seeds = { ...defaultSeeds(baseSeed), ...(bio?.seeds || {}) };
  seeds[stage] = `${seed ?? randomSeed()}::bio::${stage}`;
  return build(R, ch || {}, baseSeed, seeds);
}

/** Plain-text rendering of a bio, for copying and export. */
export function bioText(bio) {
  if (!bio) return '';
  const out = [];
  if (bio.name) out.push(bio.name.toUpperCase(), '');
  if (bio.summary) out.push(bio.summary, '');
  for (const s of bio.sections || []) {
    out.push(`== ${s.title} ==`);
    for (const it of s.items || []) out.push(`- ${it.label}: ${it.text}`);
    out.push('');
  }
  if (bio.timeline?.length) {
    out.push('== Timeline ==');
    for (const t of bio.timeline) out.push(`Age ${t.age} (${t.stage}${t.session ? `, session ${t.session}` : ''}): ${t.text}`);
    out.push('');
  }
  if (bio.people?.length) {
    out.push('== People ==');
    for (const p of bio.people) out.push(`- ${p.name} (${p.relation})${p.who ? `: ${p.who}` : ''}${p.status ? ` [${p.status}]` : ''}`);
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}

/**
 * One event from the adult-life tables for "what happened between adventures": used by the
 * campaign journal's downtime roll. Returns { text, tags, people } where people are anyone the
 * event brought into the character's life (not yet added to the bio).
 */
export function rollDowntimeEvent(R, ch, { seed } = {}) {
  const s = String(seed ?? randomSeed());
  const ctx = makeContext(R, ch || {}, s, defaultSeeds(s));
  ctx.rng = makeRng(`${s}::downtime`);
  // Keep the family and people the bio already has, so events can refer to them.
  const bio = ch?.bio;
  if (bio?.family?.parents?.length) {
    ctx.family.parents = bio.family.parents.map((p) => ({ ...p, present: !/deceased/i.test(p.status || '') }));
    ctx.parentRoles = ctx.family.parents.filter((p) => p.present).map((p) => p.role.toLowerCase().replace(/^adoptive /, ''));
  }
  if (bio?.family?.siblings?.length) ctx.family.siblings = bio.family.siblings.map((x) => ({ ...x }));
  if (bio?.people?.length) ctx.people = bio.people.map((x) => ({ ...x }));
  const before = ctx.people.length;
  const used = new Set((bio?.timeline || []).map((t) => t.text));
  const pool = (ctx.mode === 'person' ? ctx.T.adult : ctx.T.other?.creature || ctx.T.adult).map(norm).filter((e) => !(e.tags || []).includes('birth'));
  const e = pickEntry(ctx, pool, { age: Math.max(20, ctx.age), unique: false, filter: (x) => !used.has(x.text) });
  if (!e) return { text: 'A quiet stretch: nothing worth writing down.', tags: ['quiet'], people: [] };
  const text = happen(ctx, e, { age: ctx.age, stage: 'Downtime', timeline: false });
  return { text, tags: [...(e.tags || [])], people: ctx.people.slice(before).map(({ since, ...p }) => p) };
}
