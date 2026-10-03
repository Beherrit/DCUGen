// Point costs, following DC Adventures Hero's Handbook chapter 6 ("Modifiers").
//
//   cost per rank = base cost + range change + per-rank extras - per-rank flaws
//   if cost per rank >= 1: total = cost per rank x rank
//   else: 1 point buys (2 - cost per rank) ranks   (0 -> 1 point per 2 ranks, -1 -> per 3 ranks, ...)
//   then add flat extras and subtract flat flaws.
//   Alternate Effects add a flat 1 point each (2 if Dynamic).
//   Removable devices: -1 point per 5 points of total cost (Easily Removable: -2 per 5).

import { ABILITIES, RANGE_STEPS, PP_PER_PL, EP_PER_EQUIPMENT_RANK, traitKind } from './rules.js';
const TRAIT_BASE = { ability: 2, defense: 1, skill: 0, advantage: 1 };

export function modifierValue(mod, def) {
  let value = def.value ?? 0;
  if (def.options && mod.option != null) {
    if (!(mod.option in def.options)) throw new Error(`"${mod.option}" is not an option of ${def.name}`);
    value = def.options[mod.option];
  }
  const steps = mod.steps ?? 1;
  return value * steps;
}

/** Base cost per rank of the effect itself, before modifiers. */
export function baseCostPerRank(power, R) {
  const eff = R.effect(power.effect);
  if (power.effect === 'Enhanced Trait') return TRAIT_BASE[traitKind(power.option, R)];
  if (eff.cost_options && power.option != null) {
    if (!(power.option in eff.cost_options)) throw new Error(`"${power.option}" is not an option of ${eff.name}`);
    return eff.cost_options[power.option];
  }
  return eff.cost;
}

/** Range change from the effect's default range: +1 per step longer, -1 per step shorter. */
export function rangeDelta(power, R) {
  const eff = R.effect(power.effect);
  if (!power.range || power.range === eff.range) return 0;
  if (!(eff.range in RANGE_STEPS) || !(power.range in RANGE_STEPS)) {
    throw new Error(`${power.name}: cannot change ${eff.name} range from ${eff.range} to ${power.range}`);
  }
  return RANGE_STEPS[power.range] - RANGE_STEPS[eff.range];
}

/** Breakdown of one effect's cost (without its alternates or linked effects). */
export function effectCost(power, R) {
  const eff = R.effect(power.effect);
  let perRank = baseCostPerRank(power, R) + rangeDelta(power, R);
  let flat = 0;
  for (const mod of power.extras || []) {
    const def = R.modifier('extra', mod.name, power.effect);
    const v = modifierValue(mod, def);
    if (def.cost_type === 'per_rank') perRank += v;
    else flat += v;
  }
  for (const mod of power.flaws || []) {
    const def = R.modifier('flaw', mod.name, power.effect);
    const v = modifierValue(mod, def);
    if (def.cost_type === 'per_rank') perRank -= v;
    else flat -= v;
  }
  const rank = power.rank ?? 0;
  let ranked;
  if (eff.fixed_cost) {
    const options = eff.fixed_cost;
    ranked = typeof options === 'number' ? options : options[power.option ?? Object.keys(options)[0]];
    ranked += (perRank - baseCostPerRank(power, R)); // per-rank modifiers on a package count once
  } else if (perRank >= 1) {
    ranked = perRank * rank;
  } else {
    ranked = Math.ceil(rank / (2 - perRank));
  }
  const total = Math.max(rank > 0 || eff.fixed_cost ? 1 : 0, ranked + flat);
  return { perRank, flat, ranked, total, ratio: perRank >= 1 ? `${perRank}:1` : `1:${2 - perRank}` };
}

/** Full cost of a power: the effect, its linked effects, and its Alternate Effects. */
export function powerCost(power, R) {
  let total = effectCost(power, R).total;
  for (const link of power.linked || []) total += effectCost(link, R).total;
  const aeCost = power.dynamic ? 2 : 1;
  total += (power.alternates || []).length * aeCost;
  return total;
}

/** Cost of an Alternate Effect on its own (used for the "AE cost <= primary" rule). */
export function alternateOwnCost(alt, R) {
  let total = effectCost(alt, R).total;
  for (const link of alt.linked || []) total += effectCost(link, R).total;
  return total;
}

export function primaryOwnCost(power, R) {
  return alternateOwnCost(power, R);
}

export function deviceCost(device, R) {
  const raw = (device.powers || []).reduce((s, p) => s + powerCost(p, R), 0);
  const per5 = device.kind === 'easily' ? 2 : device.kind === 'none' ? 0 : 1;
  return { raw, discount: Math.floor(raw / 5) * per5, total: raw - Math.floor(raw / 5) * per5 };
}

export function equipmentPoints(ch) {
  return (ch.equipment || []).reduce((s, item) => s + (item.cost || 0), 0);
}

export function equipmentRanksNeeded(ch) {
  return Math.ceil(equipmentPoints(ch) / EP_PER_EQUIPMENT_RANK);
}

export function skillRanksTotal(ch) {
  return (ch.skills || []).reduce((s, sk) => s + (sk.ranks || 0), 0);
}

/** The power-point breakdown printed at the bottom of a DC Adventures stat block. */
export function costBreakdown(ch, R) {
  const abilities = ABILITIES.reduce((s, a) => {
    const v = ch.abilities?.[a];
    if (v === null) return s - 10; // an absent ability is worth -10 points
    return s + 2 * (v || 0);
  }, 0);
  const powers = (ch.powers || []).reduce((s, p) => s + powerCost(p, R), 0)
    + (ch.devices || []).reduce((s, d) => s + deviceCost(d, R).total, 0);
  const advantages = (ch.advantages || []).reduce((s, a) => s + (a.rank || 1), 0);
  const ranks = skillRanksTotal(ch);
  const skills = Math.ceil(ranks / 2);
  const defenses = Object.values(ch.defenses || {}).reduce((s, v) => s + (v || 0), 0);
  const total = abilities + powers + advantages + skills + defenses;
  // With advancement on (GM-awarded points, DCA 190), the budget is the starting points plus every award.
  const adv = ch.advancement;
  const budget = adv
    ? (adv.startPoints ?? (adv.startPl ?? ch.pl) * PP_PER_PL) + (adv.log || []).filter((e) => e.type === 'award').reduce((s, e) => s + (e.points || 0), 0)
    : (ch.pl || 0) * PP_PER_PL;
  return { abilities, powers, advantages, skills, skillRanks: ranks, defenses, total, budget, unspent: budget - total };
}
