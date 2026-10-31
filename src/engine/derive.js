// Derived traits: ability totals, defenses, skill bonuses, attacks and initiative.

import { ABILITIES, BUYABLE_DEFENSES, traitKind } from './rules.js';
import { placedOn } from './pools.js';
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

/** Powers that are "on" at the same time (the primary of each array). Pools only count where points are placed. */
function activePowers(ch) {
  return allPowers(ch, { includeAlternates: false }).map((x) => x.power).filter((p) => !p.pool);
}

function sumEnhanced(ch, R, trait) {
  return activePowers(ch)
    .filter((p) => p.effect === 'Enhanced Trait' && p.option === trait)
    .reduce((s, p) => s + p.rank, 0);
}

function rankOf(ch, effect) {
  return activePowers(ch).filter((p) => p.effect === effect).reduce((s, p) => s + p.rank, 0);
}

/** Does an Enhanced Trait power's option name this advantage ("Improved Initiative", or "Improved Critical (Blast)")? */
function enhancesAdvantage(p, name, param) {
  if (p.effect !== 'Enhanced Trait' || !p.option) return false;
  const opt = String(p.option);
  if (opt !== name && !opt.startsWith(`${name} (`)) return false;
  if (param == null) return true;
  return p.param === param || p.detail === param || opt === `${name} (${param})`;
}

/** Ranks of an advantage the character has: bought, plus Enhanced Trait powers that grant it (DCA 96, "Enhanced Advantage"). */
export function advantageRank(ch, name, param) {
  const bought = (ch.advantages || [])
    .filter((a) => a.name === name && (param == null || a.param === param))
    .reduce((s, a) => s + (a.rank || 1), 0);
  return bought + enhancedAdvantageRank(ch, name, param);
}

/** Ranks of an advantage that come from active Enhanced Trait powers only. */
export function enhancedAdvantageRank(ch, name, param) {
  return activePowers(ch).filter((p) => enhancesAdvantage(p, name, param)).reduce((s, p) => s + (p.rank || 0), 0);
}

export function skillRanks(ch, name, spec) {
  return (ch.skills || [])
    .filter((s) => s.name === name && (spec == null || s.spec === spec))
    .reduce((t, s) => t + (s.ranks || 0), 0);
}

/** Shrinking ranks that cost Strength and Intimidation: all of them, except those bought with Normal Strength (DCA 117). */
function shrinkWeak(ch) {
  return activePowers(ch).filter((p) => p.effect === 'Shrinking' && !(p.extras || []).some((m) => m.name === 'Normal Strength')).reduce((s, p) => s + p.rank, 0);
}

export function abilityTotals(ch, R) {
  const growth = rankOf(ch, 'Growth');
  const out = {};
  for (const a of ABILITIES) {
    const base = ch.abilities?.[a];
    if (base === null) { out[a] = null; continue; }
    let v = (base || 0) + sumEnhanced(ch, R, a) + placedOn(ch, a);
    if (a === 'Strength' || a === 'Stamina') v += growth;
    if (a === 'Strength') v -= Math.floor(shrinkWeak(ch) / 4);
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
    Dodge: ab('Agility') + bought('Dodge') + sumEnhanced(ch, R, 'Dodge') + placedOn(ch, 'Dodge') + active,
    Parry: ab('Fighting') + bought('Parry') + sumEnhanced(ch, R, 'Parry') + placedOn(ch, 'Parry') + active,
    Fortitude: ab('Stamina') + bought('Fortitude') + sumEnhanced(ch, R, 'Fortitude') + placedOn(ch, 'Fortitude'),
    Will: ab('Awareness') + bought('Will') + sumEnhanced(ch, R, 'Will') + placedOn(ch, 'Will'),
  };
  const protection = rankOf(ch, 'Protection') + rankOf(ch, 'Force Field');
  const armor = (ch.equipment || []).reduce((s, it) => s + (it.protection || 0), 0);
  const roll = advantageRank(ch, 'Defensive Roll');
  out.immune = { Fortitude: abil.Stamina === null, Will: abil.Intellect === null && abil.Presence === null };
  // Growth adds to Stamina; constructs (no Stamina) add it to Toughness instead (DCA 100).
  const constructGrowth = abil.Stamina === null ? growth : 0;
  const pooled = placedOn(ch, 'Toughness');
  out.ToughnessNoRoll = ab('Stamina') + protection + armor + constructGrowth + pooled;
  out.Toughness = out.ToughnessNoRoll + roll;
  out.parts = { stamina: ab('Stamina'), protection: protection + armor + pooled, defensiveRoll: roll };
  return out;
}

export function skillBonuses(ch, R, abil = abilityTotals(ch, R)) {
  return (ch.skills || [])
    .filter((s) => s.ranks > 0)
    .map((s) => {
      const ability = R.skillAbility(s.name);
      const label = s.spec ? `${s.name} (${s.spec})` : s.name;
      const enhanced = sumEnhanced(ch, R, label) + placedOn(ch, `skill:${label}`);
      const growth = rankOf(ch, 'Growth');
      let bonus = (abil[ability] ?? 0) + s.ranks + enhanced;
      // Size (DCA 100, 117): Growth +1 Intimidation per 2 ranks and -1 Stealth a rank; Shrinking +1 Stealth a rank and
      // -1 Intimidation per 2 ranks (none with Normal Strength).
      const shrink = rankOf(ch, 'Shrinking');
      if (s.name === 'Intimidation') bonus += Math.floor(growth / 2) - Math.floor(shrinkWeak(ch) / 2);
      if (s.name === 'Stealth') bonus += shrink - growth;
      return { ...s, ability, bonus };
    });
}

function hasExtra(p, name) {
  return (p.extras || []).some((m) => m.name === name);
}

function stepsOf(p, name) {
  return (p.extras || []).filter((m) => m.name === name).reduce((s, m) => s + (m.steps ?? 1), 0);
}

/**
 * A power's range after its Increased Range extra and Reduced Range flaw (DCA 130, 136): one step up or down per rank,
 * close to ranged to perception. Both are priced per rank like any modifier, so the range they buy must count too.
 */
export function reducedRange(p, range) {
  const count = (list, name) => (list || []).filter((m) => m.name === name).reduce((s, m) => s + (m.steps ?? 1), 0);
  const steps = count(p?.extras, 'Increased Range') - count(p?.flaws, 'Reduced Range');
  const ladder = ['Close', 'Ranged', 'Perception'];
  const at = ladder.indexOf(range);
  return at < 0 || !steps ? range : ladder[Math.min(ladder.length - 1, Math.max(0, at + steps))];
}

const DURATION_LADDER = ['Instant', 'Concentration', 'Sustained', 'Continuous'];

/**
 * A power's duration after its duration extras (DCA 129, 132): Increased Duration moves it up one step a rank
 * (instant, concentration, sustained, continuous) and Sustained makes a permanent effect sustained. These are what the
 * duration flaws act on, so modifier prerequisites read this. `withFlaws` also applies the Concentration flaw
 * (sustained to concentration) and Permanent (sustained or continuous to permanent): the duration in play.
 */
export function durationOf(p, R, { withFlaws = false } = {}) {
  let d = R.effect(p.effect).duration;
  const has = (list, name) => (list || []).filter((m) => m.name === name).reduce((s, m) => s + (m.steps ?? 1), 0);
  if (d === 'Permanent' && has(p.extras, 'Sustained')) d = 'Sustained';
  const up = has(p.extras, 'Increased Duration');
  const at = DURATION_LADDER.indexOf(d);
  if (up && at >= 0) d = DURATION_LADDER[Math.min(DURATION_LADDER.length - 1, at + up)];
  if (withFlaws) {
    if (d === 'Sustained' && has(p.flaws, 'Concentration')) d = 'Concentration';
    if ((d === 'Sustained' || d === 'Continuous') && has(p.flaws, 'Permanent')) d = 'Permanent';
  }
  return d;
}

/** Classify how an attack effect is delivered. */
export function attackKind(p, R) {
  const eff = R.effect(p.effect);
  if (hasExtra(p, 'Area')) return 'area';
  const range = reducedRange(p, p.range || eff.range);
  if (range === 'Perception') return 'perception';
  if (range === 'Ranged') return 'ranged';
  return 'close';
}

export function isAttackPower(p, R) {
  if (p.role === 'utility' || p.role === 'movement' || p.role === 'defense') return false;
  const eff = R.effect(p.effect);
  return eff.attack === true || eff.type === 'Attack';
}

/** A power with the Attack extra (DCA 128) is an attack on others whatever its effect, unless it is a defense. */
export const isAttackForm = (p) => hasExtra(p, 'Attack') && p.role !== 'defense';

const THROWN_WORDS = /\bthrown\b|\bthrowing\b/i;

/**
 * Throwing Mastery (p79): +1 damage per rank with thrown weapons. That is equipment with "thrown" or "throwing" in its
 * name, category or descriptors; a Strength-based ranged attack (a thrown object); and a Damage power whose attack
 * skill is a Ranged Combat specialty named Throwing. The bonus joins the attack's rank, so the PL limit counts it as rank;
 * "your maximum damage bonus is still limited by power level", so it stops where bonus plus rank would pass 2 x PL.
 * `used` is the attack bonus plus rank before the mastery (rank alone for an attack with no check).
 */
export function throwingBonus(ch, R, { kind, effect, strengthBased, spec, label, used = 0, roll = true }) {
  const rank = Math.min(advantageRank(ch, 'Throwing Mastery'), Math.max(0, (roll ? 2 : 1) * (ch.pl || 0) - used));
  if (!rank || kind !== 'ranged') return 0;
  let damage = effect === 'Damage';
  if (!damage) { try { damage = /^Damage\b/.test(R.effect(effect).built_from || ''); } catch { damage = false; } }
  if (!damage) return 0;
  return strengthBased || THROWN_WORDS.test(label || '') || /^throwing\b/i.test(spec || '') ? rank : 0;
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
    if (!isAttackPower(p, R) && !isAttackForm(p)) continue;
    const eff = R.effect(p.effect);
    const kind = attackKind(p, R);
    const spec = p.attackSkill || p.name;
    const accurate = 2 * stepsOf(p, 'Accurate');
    let bonus = null;
    if (kind === 'close') bonus = closeBase + skillRanks(ch, 'Close Combat', spec) + accurate;
    if (kind === 'ranged') bonus = rangedBase + skillRanks(ch, 'Ranged Combat', spec) + accurate;
    const base = p.rank + placedOn(ch, `power:${p.name}`) + (p.strengthBased ? ab('Strength') : 0);
    const thrown = throwingBonus(ch, R, { kind, effect: p.effect, strengthBased: p.strengthBased, spec, used: base + (bonus ?? 0), roll: bonus !== null });
    const rank = base + thrown;
    out.push({
      name: p.name, kind, effect: p.effect, resistance: p.resistance || eff.resistance,
      bonus, rank, roll: bonus !== null, alternate: !!alternateOf, power: p, ...(thrown ? { thrown } : {}),
    });
  }

  for (const item of ch.equipment || []) {
    if (!item.attack) continue;
    const a = item.attack;
    const spec = item.name;
    const bonus = a.kind === 'ranged'
      ? rangedBase + skillRanks(ch, 'Ranged Combat', spec)
      : closeBase + skillRanks(ch, 'Close Combat', spec);
    const label = [item.name, item.category, ...(item.descriptors || [])].join(' ');
    const base = a.rank + (a.strengthBased ? ab('Strength') : 0);
    const thrown = throwingBonus(ch, R, { kind: a.kind, effect: 'Damage', strengthBased: a.strengthBased, spec, label, used: base + bonus });
    const rank = base + thrown;
    out.push({ name: item.name, kind: a.kind, effect: 'Damage', resistance: 'Toughness', bonus, rank, roll: true, crit: a.crit, equipment: true, ...(thrown ? { thrown } : {}) });
  }
  return out;
}

export function initiative(ch, R, abil = abilityTotals(ch, R)) {
  // The Super-Speed shorthand includes Enhanced Improved Initiative at its rank (DCA 119): +4 a rank.
  const superSpeed = activePowers(ch).filter((p) => p.effect === 'Super-Speed').reduce((m, p) => Math.max(m, p.rank || 0), 0);
  return (abil.Agility ?? 0) + 4 * (advantageRank(ch, 'Improved Initiative') + superSpeed);
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
