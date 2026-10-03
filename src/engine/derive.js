// Derived traits: ability totals, defenses, skill bonuses, attacks and initiative.

import { ABILITIES, BUYABLE_DEFENSES, traitKind } from './rules.js';
/** Every power the character has, including those inside devices, alternates and links. */
export function allPowers(ch, { includeAlternates = true } = {}) {
  const out = [];
  const visit = (p, ctx) => {
    out.push({ power: p, ...ctx });
    for (const l of p.linked || []) out.push({ power: l, ...ctx, linkedTo: p });
    if (includeAlternates) for (const a of p.alternates || []) visit(a, { ...ctx, alternateOf: p });
  };
  for (const p of ch.powers || []) visit(p, {});
  for (const d of ch.devices || []) for (const p of d.powers || []) visit(p, { device: d });
  return out;
}

/** Powers that are "on" at the same time (the primary of each array). */
function activePowers(ch) {
  return allPowers(ch, { includeAlternates: false }).map((x) => x.power);
}

function sumEnhanced(ch, R, trait) {
  return activePowers(ch)
    .filter((p) => p.effect === 'Enhanced Trait' && p.option === trait)
    .reduce((s, p) => s + p.rank, 0);
}

function rankOf(ch, effect) {
  return activePowers(ch).filter((p) => p.effect === effect).reduce((s, p) => s + p.rank, 0);
}

export function advantageRank(ch, name, param) {
  return (ch.advantages || [])
    .filter((a) => a.name === name && (param == null || a.param === param))
    .reduce((s, a) => s + (a.rank || 1), 0);
}

export function skillRanks(ch, name, spec) {
  return (ch.skills || [])
    .filter((s) => s.name === name && (spec == null || s.spec === spec))
    .reduce((t, s) => t + (s.ranks || 0), 0);
}

export function abilityTotals(ch, R) {
  const growth = rankOf(ch, 'Growth');
  const shrink = rankOf(ch, 'Shrinking');
  const out = {};
  for (const a of ABILITIES) {
    const base = ch.abilities?.[a];
    if (base === null) { out[a] = null; continue; }
    let v = (base || 0) + sumEnhanced(ch, R, a);
    if (a === 'Strength' || a === 'Stamina') v += growth;
    if (a === 'Strength') v -= Math.floor(shrink / 4);
    out[a] = v;
  }
  return out;
}

export function defenseTotals(ch, R, abil = abilityTotals(ch, R)) {
  const growth = rankOf(ch, 'Growth');
  const shrink = rankOf(ch, 'Shrinking');
  const ab = (a) => abil[a] ?? 0;
  const bought = (d) => ch.defenses?.[d] || 0;
  const active = Math.floor(shrink / 2) - Math.floor(growth / 2);
  const out = {
    Dodge: ab('Agility') + bought('Dodge') + sumEnhanced(ch, R, 'Dodge') + active,
    Parry: ab('Fighting') + bought('Parry') + sumEnhanced(ch, R, 'Parry') + active,
    Fortitude: ab('Stamina') + bought('Fortitude') + sumEnhanced(ch, R, 'Fortitude'),
    Will: ab('Awareness') + bought('Will') + sumEnhanced(ch, R, 'Will'),
  };
  const protection = rankOf(ch, 'Protection') + rankOf(ch, 'Force Field');
  const armor = (ch.equipment || []).reduce((s, it) => s + (it.protection || 0), 0);
  const roll = advantageRank(ch, 'Defensive Roll');
  out.immune = { Fortitude: abil.Stamina === null, Will: abil.Intellect === null && abil.Presence === null };
  // Growth adds to Stamina; constructs (no Stamina) add it to Toughness instead (DCA 100).
  const constructGrowth = abil.Stamina === null ? growth : 0;
  out.ToughnessNoRoll = ab('Stamina') + protection + armor + constructGrowth;
  out.Toughness = out.ToughnessNoRoll + roll;
  out.parts = { stamina: ab('Stamina'), protection: protection + armor, defensiveRoll: roll };
  return out;
}

export function skillBonuses(ch, R, abil = abilityTotals(ch, R)) {
  return (ch.skills || [])
    .filter((s) => s.ranks > 0)
    .map((s) => {
      const ability = R.skillAbility(s.name);
      const enhanced = sumEnhanced(ch, R, s.spec ? `${s.name} (${s.spec})` : s.name);
      const growth = rankOf(ch, 'Growth');
      let bonus = (abil[ability] ?? 0) + s.ranks + enhanced;
      if (s.name === 'Intimidation') bonus += Math.floor(growth / 2);
      if (s.name === 'Stealth') bonus -= growth;
      return { ...s, ability, bonus };
    });
}

function hasExtra(p, name) {
  return (p.extras || []).some((m) => m.name === name);
}

function stepsOf(p, name) {
  return (p.extras || []).filter((m) => m.name === name).reduce((s, m) => s + (m.steps ?? 1), 0);
}

/** Classify how an attack effect is delivered. */
export function attackKind(p, R) {
  const eff = R.effect(p.effect);
  if (hasExtra(p, 'Area')) return 'area';
  const range = p.range || eff.range;
  if (range === 'Perception') return 'perception';
  if (range === 'Ranged') return 'ranged';
  return 'close';
}

export function isAttackPower(p, R) {
  if (p.role === 'utility' || p.role === 'movement' || p.role === 'defense') return false;
  const eff = R.effect(p.effect);
  return eff.attack === true || eff.type === 'Attack';
}

/** Offense lines for the stat block, with the numbers the PL limits are checked against. */
export function attacks(ch, R, abil = abilityTotals(ch, R)) {
  const ab = (a) => abil[a] ?? 0;
  const closeBase = ab('Fighting') + advantageRank(ch, 'Close Attack');
  const rangedBase = ab('Dexterity') + advantageRank(ch, 'Ranged Attack');
  const out = [];

  const strengthDamage = activePowers(ch)
    .filter((p) => p.effect === 'Damage' && p.strengthBased && p.role === 'strength')
    .reduce((s, p) => s + p.rank, 0);
  out.push({
    name: 'Unarmed', kind: 'close', effect: 'Damage', resistance: 'Toughness',
    bonus: closeBase + skillRanks(ch, 'Close Combat', 'Unarmed'),
    rank: ab('Strength') + strengthDamage, roll: true,
  });

  for (const { power: p, alternateOf } of allPowers(ch)) {
    if (!isAttackPower(p, R)) continue;
    const eff = R.effect(p.effect);
    const kind = attackKind(p, R);
    const spec = p.attackSkill || p.name;
    const accurate = 2 * stepsOf(p, 'Accurate');
    let bonus = null;
    if (kind === 'close') bonus = closeBase + skillRanks(ch, 'Close Combat', spec) + accurate;
    if (kind === 'ranged') bonus = rangedBase + skillRanks(ch, 'Ranged Combat', spec) + accurate;
    const rank = p.rank + (p.strengthBased ? ab('Strength') : 0);
    out.push({
      name: p.name, kind, effect: p.effect, resistance: p.resistance || eff.resistance,
      bonus, rank, roll: bonus !== null, alternate: !!alternateOf, power: p,
    });
  }

  for (const item of ch.equipment || []) {
    if (!item.attack) continue;
    const a = item.attack;
    const spec = item.name;
    const bonus = a.kind === 'ranged'
      ? rangedBase + skillRanks(ch, 'Ranged Combat', spec)
      : closeBase + skillRanks(ch, 'Close Combat', spec);
    const rank = a.rank + (a.strengthBased ? ab('Strength') : 0);
    out.push({ name: item.name, kind: a.kind, effect: 'Damage', resistance: 'Toughness', bonus, rank, roll: true, crit: a.crit, equipment: true });
  }
  return out;
}

export function initiative(ch, R, abil = abilityTotals(ch, R)) {
  return (abil.Agility ?? 0) + 4 * advantageRank(ch, 'Improved Initiative');
}

export function deriveAll(ch, R) {
  const abil = abilityTotals(ch, R);
  return {
    abilities: abil,
    defenses: defenseTotals(ch, R, abil),
    skills: skillBonuses(ch, R, abil),
    attacks: attacks(ch, R, abil),
    initiative: initiative(ch, R, abil),
  };
}

export { traitKind, BUYABLE_DEFENSES };
