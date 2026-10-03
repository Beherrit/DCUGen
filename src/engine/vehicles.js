// Vehicles and headquarters, priced in equipment points (DC Adventures Hero's Handbook ch. 7).
//
// Vehicle cost (DCA 155-156, Vehicle Trait Cost table):
//   size category cost (Medium 0, Large 1, Huge 2, Gargantuan 3, Colossal 4, Awesome 5)
//   + 1 per Strength above the size's base Strength
//   + Speed: the movement effect's normal cost (Speed/Swimming/Burrowing 1 per rank, Flight 2 per rank);
//     extra movement modes are Alternate Effects of the most expensive one (+1 each)
//   + 1 per point of Defense penalty bought off (Defense shown as 10 + size penalty + bought)
//   + 1 per Toughness above the size's base Toughness
//   + 1 per feature (some features are powers with their own price)
//   + powers at their normal power cost (costs.js); a partial modifier { ranks: n } adds n x its value.
//   Traits below the size baseline give no refund (as the book's Bomber shows).
//
// Headquarters cost (DCA 159):
//   size cost (Small 0; each category up +1, each down -1) + 1 per +2 Toughness over 6
//   + 1 per feature (taken again for more effect). Dual Size pays for the interior size.
//   A headquarters never costs less than 0.

import { makeRng, randomSeed } from './rng.js';
import { powerCost } from './costs.js';
import { RANGE_STEPS } from './rules.js';
const clone = (x) => JSON.parse(JSON.stringify(x));
const lc = (s) => String(s ?? '').toLowerCase();

// Book tables, used when the data files are not loaded.
const VEHICLE_SIZES = [
  { name: 'Medium', rank: -2, strength: 0, toughness: 5, defense: 0, cost: 0 },
  { name: 'Large', rank: -1, strength: 4, toughness: 7, defense: -2, cost: 1 },
  { name: 'Huge', rank: 0, strength: 8, toughness: 9, defense: -4, cost: 2 },
  { name: 'Gargantuan', rank: 1, strength: 12, toughness: 11, defense: -6, cost: 3 },
  { name: 'Colossal', rank: 2, strength: 16, toughness: 13, defense: -8, cost: 4 },
  { name: 'Awesome', rank: 3, strength: 20, toughness: 15, defense: -10, cost: 5 },
];
const HQ_SIZES = [
  ['Miniscule', -4], ['Fine', -3], ['Diminutive', -2], ['Tiny', -1], ['Small', 0], ['Medium', 1],
  ['Large', 2], ['Huge', 3], ['Gargantuan', 4], ['Colossal', 5], ['Awesome', 6],
].map(([name, cost]) => ({ name, cost }));
export const HQ_BASE_TOUGHNESS = 6;
const DEFAULT_MOVEMENT = { ground: 'Speed', water: 'Swimming', air: 'Flight', space: 'Flight', exotic: 'Speed' };

export const vehicleData = (R) => R.raw?.vehicles || { rules: [], sizes: VEHICLE_SIZES, features: [], premade: [] };
export const hqData = (R) => R.raw?.headquarters || { rules: [], sizes: HQ_SIZES, features: [], premade: [] };

export function vehicleSize(name, R) {
  const sizes = vehicleData(R).sizes?.length ? vehicleData(R).sizes : VEHICLE_SIZES;
  const s = sizes.find((x) => lc(x.name) === lc(name) || lc(x.name[0]) === lc(name));
  if (!s) throw new Error(`Unknown vehicle size "${name}"`);
  return s;
}

export function hqSize(name, R) {
  const sizes = hqData(R).sizes?.length ? hqData(R).sizes : HQ_SIZES;
  const s = sizes.find((x) => lc(x.name) === lc(name));
  if (!s) throw new Error(`Unknown headquarters size "${name}"`);
  return s;
}

const findFeature = (list, name) => (list || []).find((f) => lc(f.name) === lc(name));
export const vehicleFeature = (name, R) => findFeature(vehicleData(R).features, name);
export const hqFeature = (name, R) => findFeature(hqData(R).features, name);

/** Base Defense shown on the book's table: 10 plus the size penalty. */
export const baseVehicleDefense = (size, R) => 10 + vehicleSize(size, R).defense;

/**
 * The vehicle's movement modes, primary first: [{ effect, rank, extras?, flaws? }].
 * movement: null means the vehicle has no Speed of its own (it travels by a power, like a time machine).
 * movement_extras / movement_flaws modify the primary mode (e.g. sails: Limited, needs wind).
 */
export function vehicleMovement(v) {
  const cat = lc(v.category).split(/\W/)[0];
  const primary = v.movement === null ? [] : [{
    effect: v.movement || DEFAULT_MOVEMENT[cat] || 'Speed', rank: v.speed ?? 0,
    ...(v.movement_extras ? { extras: v.movement_extras } : {}), ...(v.movement_flaws ? { flaws: v.movement_flaws } : {}),
  }];
  return [...primary.filter((m) => m.rank > 0), ...(v.alt_movement || [])];
}

// ---- powers with partial modifiers ----------------------------------------------------------

/** Split out modifiers applied to only some ranks ({ ranks: n }); they cost their value x n. */
function splitPartial(power, R) {
  const p = { ...power };
  let partial = 0;
  for (const kind of ['extras', 'flaws']) {
    const keep = [];
    for (const m of power[kind] || []) {
      if (m.ranks == null) { keep.push(m); continue; }
      const def = R.modifier(kind === 'extras' ? 'extra' : 'flaw', m.name, power.effect);
      let value = def.value ?? 0;
      if (def.options && m.option != null) value = def.options[m.option];
      partial += (kind === 'extras' ? 1 : -1) * value * Math.min(m.ranks, power.rank ?? m.ranks);
    }
    p[kind] = keep;
  }
  return { p, partial };
}

/** A vehicle or headquarters power costs its normal power cost (DCA 156). */
export function vehiclePowerCost(power, R) {
  const { p, partial } = splitPartial(power, R);
  const linked = (p.linked || []).map((l) => splitPartial(l, R));
  const base = powerCost({ ...p, linked: linked.map((l) => l.p) }, R);
  return Math.max(1, base + partial + linked.reduce((s, l) => s + l.partial, 0));
}

function featureCost(f, def) {
  // Each feature costs 1 point (some power-based features list their own price); taking a feature
  // again for more effect (Alarm DC +5, Concealed +5 DC, ...) multiplies it.
  return (def?.cost ?? 1) * (f.ranks ?? 1);
}

// ---- vehicle cost -----------------------------------------------------------------------------

export function vehicleCost(v, R) {
  const breakdown = [];
  const add = (label, cost) => { if (cost !== 0) breakdown.push({ label, cost }); };
  const size = vehicleSize(v.size, R);
  add(`Size ${size.name}`, size.cost);
  add(`Strength ${v.strength} (base ${size.strength})`, Math.max(0, (v.strength ?? size.strength) - size.strength));

  const modes = vehicleMovement(v).map((m) => ({ ...m, cost: vehiclePowerCost(m, R) }));
  if (modes.length) {
    const top = modes.reduce((a, b) => (b.cost > a.cost ? b : a));
    add(`Speed: ${top.effect} ${top.rank}${top.flaws?.length ? ` (${top.flaws.map(modText).join(', ')})` : ''}`, top.cost);
    for (const m of modes) if (m !== top) add(`Alternate movement: ${m.effect} ${m.rank}`, 1);
  }
  const baseDef = 10 + size.defense;
  add(`Defense ${v.defense} (base ${baseDef})`, Math.max(0, (v.defense ?? baseDef) - baseDef));
  add(`Toughness ${v.toughness} (base ${size.toughness})`, Math.max(0, (v.toughness ?? size.toughness) - size.toughness));
  for (const f of v.features || []) {
    const def = vehicleFeature(f.name, R);
    add(`Feature: ${featureLabel(f)}`, featureCost(f, def));
  }
  for (const p of v.powers || []) add(`Power: ${p.name || p.effect}`, vehiclePowerCost(p, R));
  return { total: breakdown.reduce((s, b) => s + b.cost, 0), breakdown };
}

// ---- headquarters cost ------------------------------------------------------------------------

export function hqCost(hq, R) {
  const breakdown = [];
  const add = (label, cost) => { if (cost !== 0) breakdown.push({ label, cost }); };
  const inside = hq.interior_size || hq.size;
  const size = hqSize(inside, R);
  add(`Size ${size.name}${hq.interior_size ? ` (interior; exterior ${hq.size})` : ''}`, size.cost);
  const t = hq.toughness ?? HQ_BASE_TOUGHNESS;
  add(`Toughness ${t}`, Math.max(0, Math.ceil((t - HQ_BASE_TOUGHNESS) / 2)));
  for (const f of hq.features || []) {
    const def = hqFeature(f.name, R);
    add(`Feature: ${featureLabel(f)}`, featureCost(f, def));
  }
  let total = breakdown.reduce((s, b) => s + b.cost, 0);
  if (total < 0) { breakdown.push({ label: 'Minimum cost 0', cost: -total }); total = 0; }
  return { total, breakdown };
}

// ---- text -------------------------------------------------------------------------------------

export function featureLabel(f) {
  let s = f.name;
  if ((f.ranks ?? 1) > 1) s += ` ${f.ranks}`;
  if (f.detail) s += ` (${f.detail})`;
  return s;
}

const fmtMph = (rank) => {
  const mph = 2 ** (rank + 1);
  return mph >= 1000000 ? `${(mph / 1000000).toFixed(mph >= 10000000 ? 0 : 1)} million mph` : `${mph.toLocaleString('en-US')} mph`;
};

function modText(m) {
  return `${modName(m)}${m.detail ? ` (${m.detail})` : ''}`;
}

function modName(m) {
  if (m.name === 'Area') return `${m.option || ''} Area`.trim();
  return m.option ? `${m.name} (${m.option})` : m.name;
}

/** Book-style text for a power, e.g. "Ranged Multiattack Damage 6" or "Ranged Damage 10, Burst Area 8". */
export function vehiclePowerText(p, R) {
  const eff = R.hasEffect(p.effect) ? R.effect(p.effect) : { range: p.range };
  const pre = [];
  if (p.range && p.range !== eff.range && p.range in RANGE_STEPS) pre.push(p.range);
  const post = [];
  for (const m of p.extras || []) {
    let def = null;
    try { def = R.modifier('extra', m.name, p.effect); } catch { /* unknown */ }
    if (m.ranks != null) post.push(`${modName(m)} ${m.ranks}`);
    else if (def?.cost_type === 'per_rank' && !m.detail) pre.push(modName(m));
    else post.push(`${modName(m)}${(m.steps ?? 1) > 1 ? ` ${m.steps}` : ''}${m.detail ? ` (${m.detail})` : ''}`);
  }
  for (const m of p.flaws || []) post.push(`${modName(m)}${m.ranks != null ? ` ${m.ranks}` : ''}${(m.steps ?? 1) > 1 ? ` ${m.steps}` : ''}${m.detail ? ` (${m.detail})` : ''}`);
  // Movement options read like the book: "Movement (Space Travel 2)".
  let s = p.effect === 'Movement' && p.detail ? `${[...pre, p.effect].join(' ')} (${p.detail})` : `${[...pre, p.effect].join(' ')} ${p.rank}${p.detail ? ` (${p.detail})` : ''}`;
  if (post.length) s += `, ${post.join(', ')}`;
  for (const l of p.linked || []) s += `; linked ${vehiclePowerText(l, R)}`;
  const alts = (p.alternates || []).map((a) => `${a.name ? `${a.name}: ` : ''}${vehiclePowerText(a, R)}`);
  if (alts.length) s += `; AE: ${alts.join('; AE: ')}`;
  return s;
}

export function vehicleStatLine(v, R) {
  const cost = vehicleCost(v, R).total;
  const modes = vehicleMovement(v);
  const flawText = (m) => [...(m.extras || []), ...(m.flaws || [])].map((x) => `, ${modText(x)}`).join('');
  const mph = (m) => fmtMph(m.effect === 'Burrowing' ? m.rank - 5 : m.rank);
  const sp = modes.length
    ? modes.map((m, i) => (i === 0
      ? `${m.rank} (${m.effect === 'Speed' ? '' : `${m.effect}, `}${mph(m)}${flawText(m)})`
      : `${m.effect} ${m.rank} (${mph(m)}${flawText(m)})`)).join(', ')
    : '—';
  let s = `Size ${v.size}, Strength ${v.strength}, Speed ${sp}, Defense ${v.defense}, Toughness ${v.toughness}.`;
  if (v.features?.length) s += ` Features: ${v.features.map(featureLabel).join(', ')}.`;
  if (v.powers?.length) s += ` Powers: ${v.powers.map((p) => `${p.name ? `${p.name} (` : ''}${vehiclePowerText(p, R)}${p.name ? ')' : ''}`).join('; ')}.`;
  return `${s} Cost: ${cost} ep`;
}

export function hqStatLine(hq, R) {
  const cost = hqCost(hq, R).total;
  let s = `Size ${hq.size}${hq.interior_size ? ` (interior ${hq.interior_size})` : ''}, Toughness ${hq.toughness ?? HQ_BASE_TOUGHNESS}.`;
  if (hq.features?.length) s += ` Features: ${hq.features.map(featureLabel).join(', ')}.`;
  return `${s} Cost: ${cost} ep`;
}

// ---- checks -----------------------------------------------------------------------------------

export function vehicleIssues(v, R) {
  const out = [];
  try { vehicleSize(v.size, R); } catch (e) { out.push(e.message); return out; }
  for (const f of v.features || []) if (!vehicleFeature(f.name, R)) out.push(`Unknown vehicle feature "${f.name}"`);
  for (const m of vehicleMovement(v)) if (!R.hasEffect(m.effect)) out.push(`Unknown movement effect "${m.effect}"`);
  try { const c = vehicleCost(v, R); if (v.cost != null && c.total !== v.cost) out.push(`Stored cost ${v.cost} but computed ${c.total}`); } catch (e) { out.push(e.message); }
  return out;
}

export function hqIssues(hq, R) {
  const out = [];
  try { hqSize(hq.size, R); if (hq.interior_size) hqSize(hq.interior_size, R); } catch (e) { out.push(e.message); return out; }
  if (hq.interior_size) {
    if (hqSize(hq.interior_size, R).cost <= hqSize(hq.size, R).cost) out.push('Interior size must be larger than the exterior size');
    if (!(hq.features || []).some((f) => lc(f.name) === 'dual size')) out.push('An interior size needs the Dual Size feature');
  }
  for (const f of hq.features || []) if (!hqFeature(f.name, R)) out.push(`Unknown headquarters feature "${f.name}"`);
  try { const c = hqCost(hq, R); if (hq.cost != null && c.total !== hq.cost) out.push(`Stored cost ${hq.cost} but computed ${c.total}`); } catch (e) { out.push(e.message); }
  return out;
}

// ---- random picks -----------------------------------------------------------------------------

const matches = (value, want) => !want || lc(value).includes(lc(want));

function extraFeatures(rng, entity, list, avoid) {
  const have = new Set((entity.features || []).map((f) => lc(f.name)));
  const pool = list.filter((f) => (f.cost ?? 1) === 1 && !f.needs_detail && !avoid.test(f.name) && !have.has(lc(f.name)) && (!f.space_only || entity.category === 'Space'));
  const n = rng.int(0, 2);
  const added = [];
  for (let i = 0; i < n && pool.length; i++) {
    const f = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    added.push({ name: f.name });
  }
  return added;
}

/** A premade vehicle (optionally filtered), with 0-2 extra features and its cost recomputed. */
export function randomVehicle(R, { seed = randomSeed(), category, setting } = {}) {
  const rng = makeRng(`vehicle-${seed}`);
  const all = vehicleData(R).premade || [];
  let pool = all.filter((v) => matches(v.category, category) && matches(v.setting, setting));
  if (!pool.length) pool = all;
  if (!pool.length) return null;
  const v = clone(rng.pick(pool));
  const extra = extraFeatures(rng, v, vehicleData(R).features || [], /Caltrops|Oil Slick/);
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

/** A premade headquarters (optionally filtered by setting), with 0-2 extra features. */
export function randomHeadquarters(R, { seed = randomSeed(), setting } = {}) {
  const rng = makeRng(`hq-${seed}`);
  const all = hqData(R).premade || [];
  let pool = all.filter((h) => matches(h.setting, setting));
  if (!pool.length) pool = all;
  if (!pool.length) return null;
  const hq = clone(rng.pick(pool));
  const extra = extraFeatures(rng, hq, hqData(R).features || [], /Dual Size|Effect|Teleport|Dimensional Portal|Temporal Limbo|Deathtraps/);
  if (extra.length) {
    hq.features = [...(hq.features || []), ...extra];
    hq.id = `${hq.id}-${String(seed).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    hq.variant_of = hq.name;
  }
  delete hq.book_cost; delete hq.book_cost_note;
  const c = hqCost(hq, R);
  hq.cost = c.total;
  hq.breakdown = c.breakdown;
  hq.seed = seed;
  return hq;
}
