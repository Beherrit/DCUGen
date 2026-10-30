// Probability helpers: hit and resistance odds, immunity, and the expected value of an attack on a target.

import { activeConditions, checkPenalty, defenseVs, resistOf, aidBonus, weakenedAttack } from './conditions.js';
import { effectWeights } from './combatant.js';
import { coverPenalty, coverDodgeBonus, preciseIgnores } from './cover.js';
import { proneMod } from './prone.js';
import { bandFor } from '../range.js';

export function hitOdds(bonus, defense) {
  let hit = 0;
  for (let r = 2; r <= 19; r++) if (r + bonus >= 10 + defense) hit++;
  return { hit: (hit + 1) / 20, crit: 1 / 20 };
}

export function resistOdds(resist, dc) {
  const out = [0, 0, 0, 0, 0];
  for (let r = 1; r <= 20; r++) {
    const total = r + resist;
    let fails = total < dc ? 1 + Math.floor((dc - total - 1) / 5) : 0;
    if (r === 20) fails = Math.max(0, fails - 1);
    out[Math.min(4, fails)] += 1 / 20;
  }
  return out;
}

export function dcOf(atk, rank = atk.rank) {
  return (atk.effect === 'Damage' || atk.effect === 'Mental Blast' ? 15 : 10) + rank;
}

/**
 * Is the target immune to this attack (DCA 103-104)? Returns the reason, or null. An Immunity to "<descriptor>
 * damage" stops only Damage with that descriptor; "<descriptor> effects" (or just the descriptor) stops any
 * effect with it. Limited to Half Effect immunities don't stop it: see halfImmune().
 */
export function isImmune(target, atk) {
  const why = immunityMatch(target, atk, false);
  return why;
}

/** An Immunity limited to half effect that applies: the effect lands at half rank. Returns the reason or null. */
export function halfImmune(target, atk) { return immunityMatch(target, atk, true); }

const NEVER_MATCH = ['variable', 'super-science', 'technology', 'power armor'];
function immunityMatch(target, atk, wantHalf) {
  const res = String(atk.resistance || '').toLowerCase();
  const damaging = atk.effect === 'Damage' || atk.effect === 'Mental Blast';
  for (const raw of target.immune) {
    const half = raw.endsWith(' #half');
    if (half !== wantHalf) continue;
    const w = raw.replace(/ #half$/, '');
    if (w.includes('fortitude effects') && res === 'fortitude') return 'immune to Fortitude effects';
    if (w.includes('will effects') && res === 'will') return 'immune to Will effects';
    if (/life support/.test(w) && (atk.effect === 'Suffocation' || (atk.descriptors || []).some((d) => /disease|poison|toxin|vacuum|suffocat|drown|radiation/.test(d)))) return 'immune (Life Support)';
    if (/\ball (damage|attacks)\b|\bdamage \(all\)/.test(w) && damaging) return 'immune to damage';
    for (const dsc of atk.descriptors || []) {
      const d = String(dsc).toLowerCase().replace(/\s*\(.*$/, '');
      if (d.length <= 2 || NEVER_MATCH.includes(d)) continue;
      // each comma or "and" separated part of the immunity is checked on its own
      for (const part of w.split(/,|\band\b|;/).map((x) => x.trim()).filter(Boolean)) {
        if (!new RegExp(`\\b${d.replace(/[^a-z\-]/g, '')}s?\\b`).test(part)) continue;
        if (/damage|attacks/.test(part) && !damaging) continue; // "fire damage" doesn't stop a fire Affliction
        return `immune to ${dsc}${/damage/.test(part) ? ' damage' : ''}`;
      }
    }
    if (atk.effect === 'Mind Control' && /mind control|mental/.test(w)) return 'immune to mental effects';
    if (atk.effect === 'Sleep' && /sleep/.test(w)) return 'immune to sleep';
  }
  if (!wantHalf && atk.fear && target.adv.Fearless) return 'Fearless';
  return null;
}

/** The chance an attack roll lands, and the chance it is a critical (both 1 when there is no roll to make). */
export function attackHit(c, atk, target, { bonusShift = 0, autoHit = false, dist = 0, b = null } = {}) {
  let hit = 1; let crit = 0;
  if (atk.roll && !autoHit) {
    const def = defenseVs(target, atk.kind === 'close' ? 'Parry' : 'Dodge', c);
    let bonus = atk.bonus + bonusShift - checkPenalty(c) - rangePenalty(atk, dist);
    bonus += proneMod(c, target, atk);
    bonus -= concealmentPenalty(c, target, atk) + coverPenalty(b, c, target, atk);
    if (c.aiming?.target === target.id) bonus += c.aiming.bonus;
    bonus += aidBonus(c, target);
    bonus -= weakenedAttack(c, atk).bonus;
    ({ hit, crit } = hitOdds(bonus, def));
    if (target.defending) hit *= target.adv['Improved Defense'] ? 0.5 : 0.55;
    if (activeConditions(target).has('Defenseless')) crit = hit;
  }
  return { hit, crit };
}

/** Expected "harm" of an attack on a target: how much it would change the fight, in rough degrees. */
export function expectedValue(c, atk, target, { bonusShift = 0, rankShift = 0, autoHit = false, dist = 0, b = null } = {}) {
  if (isImmune(target, atk)) return 0;
  let rank = atk.rank + rankShift - weakenedAttack(c, atk).rank;
  if (halfImmune(target, atk)) rank = Math.floor(rank / 2);
  const { hit, crit } = attackHit(c, atk, target, { bonusShift, autoHit, dist, b });
  if (atk.effect === 'Damage' && !atk.penetrating && rank <= Math.floor(target.impervious / 2)) return 0.05 * hit;
  const resist = resistOf(target, atk.resistance);
  if (resist === null) return 0;
  const dc = dcOf(atk, rank);
  const dist1 = resistOdds(resist, dc);
  const dist2 = resistOdds(resist, dc + 5);
  const w = atk.weights || effectWeights(atk);
  let ev = 0;
  for (let i = 1; i < 5; i++) {
    let wi = w[i];
    if (atk.effect === 'Damage') {
      // bruises stack: what matters is the condition that lands
      if (i >= 3 && target.staggered) wi = w[4];
      if (target.minion) wi = w[4];
    }
    if (atk.tiers && i > (atk.maxDegree || 3)) wi = w[atk.maxDegree || 3];
    ev += ((hit - crit) * dist1[i] + crit * dist2[i]) * wi;
  }
  if (atk.area) ev *= 0.85 - 0.04 * coverDodgeBonus(b, c, target); // Dodge for half, with cover helping
  // An affliction that is already on the target (and doesn't stack) is worth much less than something new
  if (atk.tiers && !atk.cumulative && target.conditions.some((x) => x.source === atk.id && x.from === c.id)) ev *= 0.4;
  if (!atk.roll && !atk.area) { const r = c.stats; void r; }
  return ev;
}

/**
 * The attack-check penalty for the distance in feet (a positive number), or 99 when the target is beyond long range.
 * The bands are the book's: short rank x 25 ft, medium x 50 ft (-2), long x 100 ft (-5), doubled per Extended Range.
 * An area placed at range has no attack roll, so it has no penalty but is still limited to long range.
 */
export function rangePenalty(atk, ft) {
  if ((atk.range ?? atk.kind) !== 'ranged') return 0;
  const band = bandFor(ft, Math.max(1, atk.rank), atk.ext || 0);
  if (band.band === 'out') return 99;
  return atk.area ? 0 : -band.penalty || 0;
}
/** Concealment: −2 to the attack check for partial, −5 for total (DCA 174); blind attackers face total. */
export function concealmentPenalty(c, target, atk) {
  if (activeConditions(c).has('Blind') || activeConditions(c).has('Blinded')) return 5;
  if (!target.concealment || seesThrough(c, target)) return 0;
  if (preciseIgnores(c, atk, 'concealment')) return 0;
  return target.concealment === 'total' ? 5 : 2;
}

function seesThrough(c, target) {
  if (!target.concealment) return true;
  return /radar|accurate|tremor|awareness|danger sense|mental|infravision|ultravision|detect/i.test(c.senses);
}

/** The best expected value of any attack c could make on t at this distance in feet (close attacks count only when closeOk, meaning the foe is in reach). */
export function bestEvNow(c, t, dist, bonusShift = 0, closeOk = true) {
  let best = 0;
  for (const a of c.attacks) {
    if (a.range === 'close' ? !closeOk : rangePenalty(a, dist) > 5) continue;
    best = Math.max(best, expectedValue(c, a, t, { dist: a.range === 'close' ? 0 : dist, bonusShift }));
  }
  return best;
}

/** How much harm t could do to c right now: its best attack's expected value at that distance. */
export function threatOn(t, c, dist) {
  return Math.max(0, ...t.attacks.map((a) => expectedValue(t, a, c, { dist: a.range === 'close' ? 0 : dist })));
}
