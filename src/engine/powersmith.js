// Custom power math and rule-following random powers (the power builder).

import { makeRng } from './rng.js';
import { RANGE_STEPS } from './rules.js';
import { baseCostPerRank, rangeDelta, modifierValue, effectCost, powerCost } from './costs.js';
/** Step-by-step cost math for one power, for showing the user how the number is reached. */
export function costMath(p, R) {
  const eff = R.effect(p.effect);
  const rows = [];
  const base = baseCostPerRank(p, R);
  rows.push({ label: `${eff.name} base cost${p.option ? ` (${p.option})` : ''}`, perRank: base });
  const rd = rangeDelta(p, R);
  if (rd) rows.push({ label: rd > 0 ? `Increased Range to ${p.range}` : `Reduced Range to ${p.range}`, perRank: rd });
  const flats = [];
  for (const [kind, list] of [['extra', p.extras], ['flaw', p.flaws]]) {
    for (const m of list || []) {
      const def = R.modifier(kind, m.name, p.effect);
      const v = modifierValue(m, def) * (kind === 'flaw' ? -1 : 1);
      const label = `${m.name}${m.option ? ` (${m.option})` : ''}${(m.steps ?? 1) > 1 ? ` x${m.steps}` : ''}${m.detail ? ` — ${m.detail}` : ''}`;
      if (def.cost_type === 'per_rank') rows.push({ label, perRank: v });
      else flats.push({ label, flat: v });
    }
  }
  const c = effectCost(p, R);
  const lines = [...rows];
  lines.push({ label: 'Cost per rank', perRank: c.perRank, subtotal: true });
  lines.push({ label: c.perRank >= 1 ? `x ${p.rank} ranks` : `1 point per ${2 - c.perRank} ranks (${p.rank} ranks)`, total: c.ranked, subtotal: true });
  lines.push(...flats);
  for (const l of p.linked || []) lines.push({ label: `Linked: ${l.name || l.effect}`, flat: powerCost(l, R) });
  const aes = (p.alternates || []).length;
  if (aes) lines.push({ label: `${aes} ${p.dynamic ? 'Dynamic ' : ''}Alternate Effect${aes > 1 ? 's' : ''}`, flat: aes * (p.dynamic ? 2 : 1) });
  lines.push({ label: 'Total', total: powerCost(p, R), final: true });
  return { lines, ratio: c.ratio, perRank: c.perRank, total: powerCost(p, R) };
}

/** Tags used by modifier "requires", for a power in its current state. */
export function powerTags(p, R) {
  const eff = R.effect(p.effect);
  const range = p.range || eff.range;
  const area = (p.extras || []).some((m) => m.name === 'Area');
  const tags = new Set();
  if ((eff.attack || eff.type === 'Attack') && !area && (range === 'Close' || range === 'Ranged')) tags.add('attack');
  if (eff.resistance) tags.add('resisted');
  if (range === 'Ranged') tags.add('ranged');
  if (range === 'Close') tags.add('close');
  if (range === 'Personal') tags.add('personal');
  if (eff.duration) tags.add(String(eff.duration).toLowerCase());
  if (!eff.fixed_cost) tags.add('ranked');
  return tags;
}

/** Every modifier that could legally go on this power right now. */
export function availableModifiers(p, R, kind) {
  const tags = powerTags(p, R);
  const general = kind === 'extra' ? R.raw.modifiers.extras : R.raw.modifiers.flaws;
  const specific = R.raw.specificModifiers?.[p.effect]?.[kind === 'extra' ? 'extras' : 'flaws'] || [];
  const byName = new Map();
  for (const m of general) byName.set(m.name, { ...m, specific: false });
  for (const m of specific) byName.set(m.name, { ...m, specific: true });
  const taken = new Set((kind === 'extra' ? p.extras : p.flaws || []).map((m) => m.name));
  return [...byName.values()].filter((m) => {
    if (m.cost_type === 'special') return false; // Removable is handled by devices
    if (['Alternate Effect', 'Linked'].includes(m.name)) return false; // handled structurally
    if (taken.has(m.name) && (m.max_steps ?? Infinity) <= 1) return false;
    return (m.requires || []).every((r) => tags.has(r));
  });
}

const EFFECT_WEIGHTS = {
  Damage: 10, Affliction: 8, Weaken: 3, Nullify: 2, Protection: 6, Flight: 6, Immunity: 4, Senses: 5, Speed: 3,
  Leaping: 2, Teleport: 3, Swimming: 1, Burrowing: 1, Movement: 3, 'Move Object': 4, Create: 3, Concealment: 3,
  Insubstantial: 2, Elongation: 2, Growth: 1, Shrinking: 1, Healing: 2, Regeneration: 3, 'Enhanced Trait': 4,
  Environment: 2, Illusion: 2, 'Mind Reading': 2, Communication: 2, Comprehend: 2, Deflect: 2, 'Extra Limbs': 1,
  Feature: 2, Quickness: 2, Summon: 1, Transform: 1, Morph: 1, 'Remote Sensing': 1, Immortality: 1, 'Luck Control': 1,
};

const DESCRIPTORS = ['fire', 'ice', 'lightning', 'shadow', 'light', 'sonic', 'kinetic', 'cosmic', 'magic', 'psychic', 'gravity',
  'magnetic', 'radiation', 'plant', 'toxic', 'water', 'wind', 'blood', 'crystal', 'chrono', 'nano-tech', 'spectral'];
const NOUNS = { Damage: ['Blast', 'Strike', 'Lance', 'Bolt', 'Barrage'], Affliction: ['Hex', 'Snare', 'Grip', 'Daze', 'Curse'],
  Weaken: ['Drain', 'Siphon', 'Wither'], Nullify: ['Dampener', 'Unmaking'], Protection: ['Shield', 'Armor', 'Skin'],
  Flight: ['Flight', 'Wings', 'Glide'], Teleport: ['Step', 'Jaunt', 'Blink'], 'Move Object': ['Grip', 'Telekinesis'],
  Create: ['Constructs', 'Walls'], Senses: ['Sight', 'Sense'], Immunity: ['Immunity', 'Ward'] };

/** A random custom power that still follows the rules and the weights. */
export function randomPower(R, { pl = 10, effect, seed = Math.random(), chaos = 0.4, descriptor } = {}) {
  const rng = makeRng(`power-${seed}`);
  const names = R.raw.effects.filter((e) => e.cost != null || e.cost_options).map((e) => e.name);
  const effName = effect || rng.weighted(names.map((n) => ({ n, weight: EFFECT_WEIGHTS[n] ?? 0.3 }))).n;
  const eff = R.effect(effName);
  const desc = descriptor || rng.pick(DESCRIPTORS);
  const p = { name: '', effect: effName, rank: 1, extras: [], flaws: [], descriptors: [desc], alternates: [] };
  if (eff.cost_options) p.option = rng.pick(Object.keys(eff.cost_options));
  if (effName === 'Enhanced Trait') p.option = rng.pick(['Strength', 'Agility', 'Fighting', 'Dodge', 'Parry', 'Will', 'Fortitude', 'Perception']);
  if (effName === 'Affliction' || effName === 'Weaken') p.detail = rng.pick([
    'Resisted by Fortitude; Dazed, Stunned, Incapacitated', 'Resisted by Will; Entranced, Compelled, Controlled',
    'Resisted by Dodge; Hindered and Vulnerable, Defenseless and Immobile', 'Resisted by Fortitude; Impaired, Disabled, Unaware',
  ]);
  if (eff.range in RANGE_STEPS && (eff.attack || eff.type === 'Attack')) {
    const r = rng.weighted([{ v: 'Close', weight: 3 }, { v: 'Ranged', weight: 5 }, { v: 'Perception', weight: 1 }]).v;
    if (r !== eff.range) p.range = r;
  }
  if (eff.resistance && rng.chance(0.2 + 0.2 * chaos)) {
    p.extras.push({ name: 'Area', option: rng.pick(['Burst', 'Cone', 'Line', 'Cloud', 'Cylinder']) });
  }
  const nExtras = rng.int(0, Math.round(1 + 2 * chaos));
  const nFlaws = rng.int(0, Math.round(1 + 1.5 * chaos));
  for (let i = 0; i < nExtras; i++) {
    const opts = availableModifiers(p, R, 'extra').filter((m) => !['Area', 'Affects Corporeal', 'Dimensional'].includes(m.name));
    const m = rng.weighted(opts, (x) => (x.specific ? 3 : 1));
    if (!m) break;
    p.extras.push(pickMod(m, rng));
  }
  for (let i = 0; i < nFlaws; i++) {
    const opts = availableModifiers(p, R, 'flaw');
    const m = rng.weighted(opts, (x) => (x.specific ? 3 : 1));
    if (!m) break;
    const mod = pickMod(m, rng);
    p.flaws.push(mod);
    if (effectCost({ ...p, rank: 10 }, R).perRank < 0) p.flaws.pop(); // keep it at 1:2 or better
  }
  const area = p.extras.some((m) => m.name === 'Area');
  const range = p.range || eff.range;
  const rolls = (eff.attack || eff.type === 'Attack') && !area && (range === 'Close' || range === 'Ranged');
  const isAttack = eff.attack || eff.type === 'Attack';
  p.rank = isAttack ? (rolls ? clampRank(rng.int(pl - 3, pl + 2)) : clampRank(rng.int(Math.max(1, pl - 3), pl))) : clampRank(rng.int(1, Math.max(2, pl)));
  if (eff.max_rank != null) p.rank = Math.min(p.rank, eff.max_rank);
  const noun = rng.pick(NOUNS[effName] || [effName]);
  p.name = `${desc.charAt(0).toUpperCase()}${desc.slice(1)} ${noun}`;
  return p;
}

function clampRank(r) { return Math.max(1, r); }

function pickMod(def, rng) {
  const m = { name: def.name };
  if (def.options) m.option = rng.pick(Object.keys(def.options));
  if ((def.max_steps ?? 1) > 1 || def.max_steps === null) {
    const max = def.max_steps == null ? 3 : def.max_steps;
    const steps = rng.int(1, Math.max(1, Math.min(max, 3)));
    if (steps > 1) m.steps = steps;
  }
  if (def.name === 'Limited') m.detail = rng.pick(['while in sunlight', 'to one type of target', 'only at night', 'while angry', 'to metal objects']);
  if (def.name === 'Quirk') m.detail = rng.pick(['glows brightly when used', 'loud and obvious', 'leaves a telltale residue']);
  if (def.name === 'Side Effect') m.detail = rng.pick(['exhausting', 'painful backlash', 'attracts attention']);
  return m;
}
