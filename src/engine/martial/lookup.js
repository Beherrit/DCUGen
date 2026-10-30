// Finding the Martial Arts (3e) rules data by name: styles, stances, maneuvers, advantages.
// The data files are data/styles.json, stances.json and maneuvers.json (see data/SCHEMA.md).

export const TIERS = ['initiate', 'student', 'master'];
export const TIER_LABEL = { initiate: 'Initiate', student: 'Student', master: 'Master' };
export const CATEGORIES = ['Traditional', 'Cinematic', 'Fantasy', 'Metahuman', 'Preternatural/Spiritual'];

/** Compare names without caring about case, spaces or punctuation. */
export const keyOf = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const cache = new WeakMap();

function indexed(list, build) {
  if (!list) return new Map();
  let m = cache.get(list);
  if (!m) { m = build(list); cache.set(list, m); }
  return m;
}

const byName = (list) => new Map(list.map((x) => [keyOf(x.name), x]));

function maneuverMap(list) {
  const m = new Map();
  for (const x of list) { m.set(keyOf(x.name), x); for (const a of x.aliases || []) if (!m.has(keyOf(a))) m.set(keyOf(a), x); }
  return m;
}

export function styleDef(R, name) { return indexed(R.raw.styles, byName).get(keyOf(name)) || null; }
export function stanceDef(R, name) { return indexed(R.raw.stances, byName).get(keyOf(name)) || null; }

/** A maneuver by name or alias; a style item may carry the variant in `detail` ("Flying Attack", "Basic Kick"). */
export function maneuverDef(R, name, detail) {
  const idx = indexed(R.raw.maneuvers, maneuverMap);
  const tries = [name, detail ? `${name}, ${detail}` : null, detail ? `${name}, ${String(detail).replace(/s$/, '')}` : null,
    String(name).replace(/^Ranged /, ''), String(name).replace(/^Grab-Based /, ''), String(name).replace(/ Attacks?$/, '')];
  for (const t of tries) if (t && idx.has(keyOf(t))) return idx.get(keyOf(t));
  return null;
}

/** An advantage from advantages.json by name, ignoring case and punctuation ("All-Out Attack" and "All-out Attack"). */
export function advantageDef(R, name) {
  return indexed(R.raw.advantages, byName).get(keyOf(name)) || null;
}

/** The stances a style teaches, as stance data (the book writes "Power Stance" or "Throw" in a few places). */
export function stancesOfStyle(R, style) {
  const alias = { power: 'Power', throw: 'Throwing', 'power stance': 'Power' };
  return (style?.stances || []).map((n) => stanceDef(R, alias[String(n).toLowerCase()] || n)).filter(Boolean);
}

const ABILITY_TAG = /\s*\((?:[A-Z]{3}(?:\s*\/\s*[A-Z]{3})*)\)\s*$/;

/** A skill as a style writes it ("Close Combat: Aikido", "Expertise: Tactics (INT)") as { name, spec }. */
export function parseStyleSkill(raw) {
  const t = String(raw).replace(ABILITY_TAG, '').trim();
  let m = /^(Close Combat|Ranged Combat)(?: or Ranged Combat)?[: ]*(.*)$/.exec(t);
  if (m) { const spec = m[2].replace(/:$/, '').trim(); return { name: m[1], ...(spec ? { spec } : {}) }; }
  if (t === 'Martial Arts') return { name: 'Expertise', spec: 'Martial Arts' };
  m = /^([^:]+):\s*(.+)$/.exec(t);
  return m ? { name: m[1].trim(), spec: m[2].trim() } : { name: t };
}

/** The character's fighting styles ([] for a character that knows none). */
export function stylesOf(ch) { return Array.isArray(ch?.styles) ? ch.styles : []; }

export function knownStyle(ch, name) { return stylesOf(ch).find((s) => s.name === name) || null; }

/** Does the character know any stance beyond Neutral? */
export function knowsStances(ch) { return stylesOf(ch).some((s) => s.stances); }
