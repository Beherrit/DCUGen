// Space games: travel times, sensor ranges, random planets and random spacecraft.
//
// Travel uses the book's measurement math (DCA 10-11): time rank = distance rank - speed rank,
// with the Measurements Table extended by doubling above rank 30 and halving below rank -5.
// Movement (Space Travel) has no speed in the book (DCA 109: it moves "at the speed of plot");
// DCUGen gives each Space Travel rank an effective speed rank (see SPACE_TRAVEL_SPEED) so the
// same math yields a between-scenes travel time. Routes and generator tables live in
// data/space_rules.json (R.raw.spaceRules).

import { makeRng, randomSeed } from './rng.js';
import { vehicleCost, vehicleData } from './vehicles.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const lc = (s) => String(s ?? '').toLowerCase();

const FEET_PER_MILE = 5280;
const MILES_PER_AU = 92955807;
const MILES_PER_LY = 5878625373184;

/** Effective speed rank of each Space Travel rank (DCUGen). Light speed is about speed rank 28. */
export const SPACE_TRAVEL_SPEED = { 1: 30, 2: 40, 3: 50 };
/** The speed rank of light: 1 million miles (distance rank 28) in 6 seconds (time rank 0). */
export const LIGHT_SPEED_RANK = 28;
/** How far each Space Travel rank reaches (DCA 110). */
export const SPACE_TRAVEL_REACH = {
  1: ['planetary', 'system'],
  2: ['planetary', 'system', 'interstellar'],
  3: ['planetary', 'system', 'interstellar', 'galactic', 'intergalactic'],
};

// Fallback rows (DCA 11) used when the reference data is not loaded.
const FALLBACK_TABLE = [
  [-5, '1/8 second', '6 inches'], [-4, '1/4 second', '1 foot'], [-3, '1/2 second', '3 feet'], [-2, '1 second', '6 feet'],
  [-1, '3 seconds', '15 feet'], [0, '6 seconds', '30 feet'], [1, '12 seconds', '60 feet'], [2, '30 seconds', '120 feet'],
  [3, '1 minute', '250 feet'], [4, '2 minutes', '500 feet'], [5, '4 minutes', '900 feet'], [6, '8 minutes', '1,800 feet'],
  [7, '15 minutes', '1/2 mile'], [8, '30 minutes', '1 mile'], [9, '1 hour', '2 miles'], [10, '2 hours', '4 miles'],
  [11, '4 hours', '8 miles'], [12, '8 hours', '16 miles'], [13, '16 hours', '30 miles'], [14, '1 day', '60 miles'],
  [15, '2 days', '120 miles'], [16, '4 days', '250 miles'], [17, '1 week', '500 miles'], [18, '2 weeks', '1,000 miles'],
  [19, '1 month', '2,000 miles'], [20, '2 months', '4,000 miles'], [21, '4 months', '8,000 miles'], [22, '8 months', '16,000 miles'],
  [23, '1.5 years', '32,000 miles'], [24, '3 years', '64,000 miles'], [25, '6 years', '125,000 miles'], [26, '12 years', '250,000 miles'],
  [27, '25 years', '500,000 miles'], [28, '50 years', '1 million miles'], [29, '100 years', '2 million miles'], [30, '200 years', '4 million miles'],
].map(([rank, time, distance]) => ({ rank, time, distance }));

/** The Measurements Table rows: [{ rank, mass, time, distance, volume }]. */
export function measurements(R) {
  const rows = R?.raw?.reference?.measurements;
  return Array.isArray(rows) && rows.length ? rows : FALLBACK_TABLE;
}

// ---- parsing the table ------------------------------------------------------------------------

const num = (s) => {
  const t = String(s).trim();
  if (t.includes('/')) { const [a, b] = t.split('/'); return Number(a) / Number(b); }
  return Number(t.replace(/,/g, ''));
};

function parseFeet(text) {
  const m = String(text).match(/^([\d.,/]+)\s*(million\s+)?(inch|inches|foot|feet|mile|miles)/i);
  if (!m) return NaN;
  let v = num(m[1]) * (m[2] ? 1e6 : 1);
  const unit = m[3].toLowerCase();
  if (unit.startsWith('inch')) v /= 12;
  else if (unit.startsWith('mile')) v *= FEET_PER_MILE;
  return v;
}

const SECONDS = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 };
function parseSeconds(text) {
  const m = String(text).match(/^([\d.,/]+)\s*(second|minute|hour|day|week|month|year)s?/i);
  if (!m) return NaN;
  return num(m[1]) * SECONDS[m[2].toLowerCase()];
}

function tableRow(R, rank) {
  return measurements(R).find((r) => r.rank === rank);
}

function tableSpan(R) {
  const ranks = measurements(R).map((r) => r.rank);
  return { lo: Math.min(...ranks), hi: Math.max(...ranks) };
}

/** Distance in feet for a distance rank (doubling above the table, halving below it). */
export function rankToFeet(R, rank) {
  const { lo, hi } = tableSpan(R);
  if (rank > hi) return parseFeet(tableRow(R, hi).distance) * 2 ** (rank - hi);
  if (rank < lo) return parseFeet(tableRow(R, lo).distance) / 2 ** (lo - rank);
  return parseFeet(tableRow(R, rank).distance);
}

export const rankToMiles = (R, rank) => rankToFeet(R, rank) / FEET_PER_MILE;

/** Time in seconds for a time rank. */
export function rankToSeconds(R, rank) {
  const { lo, hi } = tableSpan(R);
  if (rank > hi) return parseSeconds(tableRow(R, hi).time) * 2 ** (rank - hi);
  if (rank < lo) return parseSeconds(tableRow(R, lo).time) / 2 ** (lo - rank);
  return parseSeconds(tableRow(R, rank).time);
}

/** The distance rank for a distance in miles: the smallest rank that covers it (DCA 10: round up). */
export function distanceRankFromMiles(R, miles) {
  const feet = miles * FEET_PER_MILE;
  let r = 0;
  while (rankToFeet(R, r) < feet - 1e-9) r++;
  while (r > -40 && rankToFeet(R, r - 1) >= feet - 1e-9) r--;
  return r;
}

// ---- readable measures --------------------------------------------------------------------------

function bigNumber(n) {
  const units = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
  for (const [v, w] of units) {
    if (n >= v) {
      const x = n / v;
      return `${x >= 100 ? Math.round(x).toLocaleString('en-US') : Number(x.toPrecision(2)).toLocaleString('en-US')} ${w}`;
    }
  }
  return Math.round(n).toLocaleString('en-US');
}

/** "1 day", "8 minutes", "400 years", "an instant (under 1/8 second)". */
export function timeText(R, rank) {
  const { lo, hi } = tableSpan(R);
  if (rank < lo) return 'an instant (under 1/8 second)';
  if (rank <= hi) return tableRow(R, rank).time;
  const years = rankToSeconds(R, rank) / SECONDS.year;
  return `${bigNumber(years)} years`;
}

/** "250,000 miles", "128 million miles (1.4 AU)", "33 trillion miles (5.7 light-years)". */
export function distanceText(R, rank) {
  const { lo, hi } = tableSpan(R);
  if (rank >= lo && rank <= 30 && rank <= hi) return tableRow(R, rank).distance;
  if (rank < lo) return `${(rankToFeet(R, rank) * 12).toPrecision(2)} inches`;
  return milesText(rankToMiles(R, rank));
}

/** "250,000 miles", "140 million miles (1.5 AU)", "4.2 light-years". */
export function milesText(miles) {
  if (miles >= MILES_PER_LY / 10) {
    const ly = Number((miles / MILES_PER_LY).toPrecision(2));
    return `${ly.toLocaleString('en-US')} light-year${ly === 1 ? '' : 's'}`;
  }
  const s = miles < 10 ? `${Number(miles.toPrecision(2))} miles` : `${bigNumber(miles)} miles`;
  return miles >= MILES_PER_AU / 10 ? `${s} (${Number((miles / MILES_PER_AU).toPrecision(2))} AU)` : s;
}

function feetText(feet) {
  if (feet < FEET_PER_MILE / 2) return `${Math.round(feet).toLocaleString('en-US')} feet`;
  return milesText(feet / FEET_PER_MILE);
}

// ---- travel -----------------------------------------------------------------------------------

/** Time rank to cross a distance rank at a speed rank (DCA 10-11). */
export const travelTimeRank = ({ distanceRank, speedRank }) => distanceRank - speedRank;

/** Readable travel time, e.g. "1 day (time rank 14: distance rank 26 at speed rank 12)". */
export function travelTime(R, { distanceRank, speedRank }) {
  if (!Number.isFinite(distanceRank) || !Number.isFinite(speedRank)) throw new Error('travelTime needs distanceRank and speedRank');
  const t = travelTimeRank({ distanceRank, speedRank });
  return `${timeText(R, t)} (time rank ${t}: distance rank ${distanceRank} at speed rank ${speedRank})`;
}

const spaceRules = (R) => R?.raw?.spaceRules || { rules: [], routes: [] };

/** Named routes from space_rules.json: [{ id, name, miles, distance_rank, scope, note }]. */
export function spaceRoutes(R) {
  return spaceRules(R).routes || [];
}

function findRoute(R, route) {
  if (route && typeof route === 'object') return route;
  const r = spaceRoutes(R).find((x) => lc(x.id) === lc(route) || lc(x.name) === lc(route));
  if (!r) throw new Error(`Unknown space route "${route}"`);
  return r;
}

/**
 * Travel time along a named route by Space Travel (FTL) and/or Flight (sublight).
 * Returns { route, distanceRank, options: [{ mode, speedRank, timeRank, time, possible, note }], best, text }.
 */
export function spaceTravelTime(R, { route, spaceTravelRank, flightRank } = {}) {
  const r = findRoute(R, route);
  const distanceRank = r.distance_rank ?? distanceRankFromMiles(R, r.miles);
  const options = [];
  if (spaceTravelRank) {
    const st = Math.max(1, Math.min(3, spaceTravelRank));
    const speedRank = SPACE_TRAVEL_SPEED[st];
    const possible = SPACE_TRAVEL_REACH[st].includes(r.scope || 'system');
    const timeRank = distanceRank - speedRank;
    options.push({
      mode: `Space Travel ${st}`, speedRank, timeRank, time: timeText(R, timeRank), possible,
      note: possible ? '' : `Space Travel ${st} cannot reach a ${r.scope} destination (DCA 110)`,
    });
  }
  if (flightRank) {
    const timeRank = distanceRank - flightRank;
    options.push({ mode: `Flight ${flightRank}`, speedRank: flightRank, timeRank, time: timeText(R, timeRank), possible: true, note: '' });
  }
  if (!options.length) throw new Error('spaceTravelTime needs spaceTravelRank or flightRank');
  const usable = options.filter((o) => o.possible);
  const best = usable.length ? usable.reduce((a, b) => (b.timeRank < a.timeRank ? b : a)) : null;
  const text = best
    ? `${r.name}: ${best.time} by ${best.mode} (distance rank ${distanceRank} - speed rank ${best.speedRank} = time rank ${best.timeRank})`
    : `${r.name}: out of reach (${options.map((o) => o.note).filter(Boolean).join('; ')})`;
  return { route: r.id, name: r.name, distanceRank, distance: distanceText(R, distanceRank), options, best, text };
}

// ---- sensors ----------------------------------------------------------------------------------

function parseSenses(senses) {
  if (typeof senses === 'number') return { extended: senses };
  if (typeof senses === 'string') senses = { detail: senses };
  const s = { ...(senses || {}) };
  const d = lc(s.detail);
  if (d) {
    if (s.extended == null) {
      const m = d.match(/extended[^,;]*?(\d+)/);
      s.extended = m ? Number(m[1]) : /extended/.test(d) ? 1 : 0;
    }
    for (const key of ['accurate', 'acute', 'analytical', 'radius', 'tracking', 'radio', 'infravision', 'darkvision', 'ultravision', 'rapid', 'direction sense', 'distance sense']) {
      if (s[key] == null && d.includes(key)) s[key] = true;
    }
    if (s.penetrates == null && /penetrat/.test(d)) s.penetrates = true;
    if (s.counters == null && /counters/.test(d)) s.counters = true;
    if (s.detect == null) { const m = d.match(/detect\s+([^,;(]+)/); if (m) s.detect = m[1].trim(); }
    if (s.ranged == null && /ranged/.test(d)) s.ranged = true;
  }
  s.extended = Math.max(0, Number(s.extended) || 0);
  return s;
}

/**
 * Detection range for a set of Senses (DCA 113-116): Perception takes -1 per 10 feet, and each
 * Extended rank multiplies that by 10. senses: a number (Extended ranks), a detail string such as
 * "Radio, Accurate radio, Extended radio 6", a Senses power, or { extended, accurate, analytical, ... }.
 */
export function sensorRange(R, senses) {
  const s = parseSenses(senses);
  const touchOnly = s.detect && !s.ranged && !s.extended;
  const step = 10 * 10 ** s.extended;
  const traits = [];
  if (s.radio) traits.push('radio (radar, comms traffic)');
  if (s.detect) traits.push(`detects ${s.detect}`);
  if (s.accurate) traits.push('accurate: can target what it senses');
  if (s.acute) traits.push('acute: tells subjects apart');
  if (s.analytical) traits.push('analytical: composition, mass and energy readings');
  if (s.radius) traits.push('radius: no blind spots');
  if (s.penetrates) traits.push('penetrates concealment: sees through hulls, dust and planets in the way');
  if (s.counters) traits.push('counters concealment of the named kind (cloaks)');
  if (s.tracking) traits.push('tracking: follows drive trails');
  if (s.infravision) traits.push('infravision: heat signatures');
  const out = {
    extended: s.extended,
    feetPerPenalty: touchOnly ? 0 : step,
    perPenalty: touchOnly ? 'touch only' : `-1 per ${feetText(step)}`,
    routine: touchOnly ? 'touch' : feetText(step * 10),
    limit: touchOnly ? 'touch' : feetText(step * 20),
    traits,
  };
  out.text = touchOnly
    ? 'Detect without range: works only by touch (DCA 114).'
    : `Perception ${out.perPenalty}. An obvious target (DC 0) is noticed by a +10 observer out to about ${out.routine}; `
      + `at ${out.limit} the penalty reaches -20.${traits.length ? ` Traits: ${traits.join('; ')}.` : ''}`;
  return out;
}

// ---- random planets -----------------------------------------------------------------------------

const ruleById = (R, id) => (spaceRules(R).rules || []).find((r) => r.id === id);

function parseRange(cell) {
  const m = String(cell).match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? m[1])];
}

/** Roll on a d20 generator table stored as a rule table (first column "1-3", "4", ...). */
export function rollTable(R, id, rng) {
  const rule = ruleById(R, id);
  if (!rule?.table) throw new Error(`No space table "${id}"`);
  const roll = rng.int(1, 20);
  const row = rule.table.rows.find((r) => { const g = parseRange(r[0]); return g && roll >= g[0] && roll <= g[1]; });
  const cols = rule.table.columns;
  const entry = { roll };
  cols.forEach((c, i) => { if (i > 0) entry[lc(c).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')] = row?.[i] ?? ''; });
  entry.result = row?.[1] ?? '';
  return entry;
}

const NAME_START = ['Ar', 'Bel', 'Cor', 'Dra', 'Esh', 'Fal', 'Gar', 'Hel', 'Ix', 'Jor', 'Kel', 'Lor', 'Myr', 'Nex', 'Or', 'Pyr', 'Quel', 'Rho', 'Syl', 'Tal', 'Ul', 'Vex', 'Xan', 'Yr', 'Zor'];
const NAME_MID = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'on', 'ar', 'el', 'is', 'or'];
const NAME_END = ['dis', 'thos', 'ra', 'nix', 'via', 'gon', 'mar', 'lune', 'tar', 'xis', 'phon', 'dor', 'ka', 'sus', 'ren'];
const CATALOG = ['Prime', 'II', 'III', 'IV', 'V', 'VI', 'b', 'c', 'd', 'Major', 'Minor'];

/** A random alien world from the space_rules.json generator tables. */
export function randomPlanet(R, { seed = randomSeed() } = {}) {
  const rng = makeRng(`planet-${seed}`);
  const name = `${rng.pick(NAME_START)}${rng.pick(NAME_MID)}${rng.pick(NAME_END)}${rng.chance(0.5) ? ` ${rng.pick(CATALOG)}` : ''}`;
  const t = (id, label) => rollTable(R, id, rng.fork(label));
  const planet = {
    seed, name,
    type: t('planet-type', 'type'),
    gravity: t('planet-gravity', 'gravity'),
    atmosphere: t('planet-atmosphere', 'atmosphere'),
    temperature: t('planet-temperature', 'temperature'),
    hazard: t('planet-hazard', 'hazard'),
    inhabitants: t('planet-inhabitants', 'inhabitants'),
    interest: t('planet-interest', 'interest'),
  };
  planet.summary = `${name}. Type: ${planet.type.result}. Gravity: ${planet.gravity.result}. `
    + `Atmosphere: ${planet.atmosphere.result}. Temperature: ${planet.temperature.result}. Hazard: ${planet.hazard.result}. `
    + `Inhabitants: ${planet.inhabitants.result}. Of interest: ${planet.interest.result}.`;
  return planet;
}

// ---- random spacecraft ------------------------------------------------------------------------

/** Ordinary vehicle features that make sense on a spacecraft (besides those marked space_only). */
const SPACE_SAFE = new Set(['alarm', 'autopilot', 'cargo hold', 'communications suite', 'crew quarters', 'ejection system',
  'hidden compartments', 'laboratory module', 'luxury quarters', 'medical bay', 'navigation system', 'remote control', 'towing cables']);

export const spacecraft = (R) => (vehicleData(R).premade || []).filter((v) => v.category === 'Space');

/** Ship classes present in the premades, in first-seen order. */
export function shipClasses(R) {
  return [...new Set(spacecraft(R).map((v) => v.class).filter(Boolean))];
}

/** A premade spacecraft (optionally by class and setting) with 0-2 extra features and its cost recomputed. */
export function randomSpaceship(R, { seed = randomSeed(), shipClass, setting } = {}) {
  const rng = makeRng(`spaceship-${seed}`);
  const all = spacecraft(R);
  const byClass = (v) => !shipClass || lc(v.class) === lc(shipClass);
  const bySetting = (v) => !setting || lc(v.setting) === lc(setting);
  let pool = all.filter((v) => byClass(v) && bySetting(v));
  if (!pool.length) pool = all.filter(byClass);
  if (!pool.length) pool = all;
  if (!pool.length) return null;
  const v = clone(rng.pick(pool));
  const have = new Set((v.features || []).map((f) => lc(f.name)));
  const choices = (vehicleData(R).features || []).filter((f) => (f.cost ?? 1) === 1 && !f.needs_detail
    && (f.space_only || SPACE_SAFE.has(lc(f.name))) && !have.has(lc(f.name)));
  const n = rng.int(0, 2);
  const extra = [];
  for (let i = 0; i < n && choices.length; i++) extra.push({ name: choices.splice(rng.int(0, choices.length - 1), 1)[0].name });
  if (extra.length) {
    v.features = [...(v.features || []), ...extra];
    v.id = `${v.id}-${String(seed).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    v.variant_of = v.name;
  }
  delete v.book_cost; delete v.book_cost_note;
  const c = vehicleCost(v, R);
  v.cost = c.total;
  v.breakdown = c.breakdown;
  v.seed = seed;
  return v;
}
