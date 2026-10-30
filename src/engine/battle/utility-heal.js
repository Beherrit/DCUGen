// Healing as a utility: the damage conditions it is expected to take off a patient, in the same units as an attack's expected
// degrees (utility-scale.js says what a condition is worth, measured in the simulator). The book's Healing (p103) is a DC 10
// check as a standard action by touch: each degree heals one damage condition, worst first, and a failed check cannot be
// tried again on that subject in the fight (the book says wait a minute). A Regeneration lent with Affects Others
// (grants.js) is worth the conditions it would clear over the next three rounds.

import { log, alliesOf } from './util.js';
import { checkPenalty, canAct } from './conditions.js';
import { checkResult } from './checks.js';
import { squares, squaresInMove, reachSquares, inReach } from './geometry.js';
import { stepToward } from './path.js';
import { moveTo } from './movement.js';
import { CONDITION_WORTH, DAZED_WORTH } from './utility-scale.js';
import { healBias } from './tactics.js';
import { roleWeight } from './roles.js';
import { holderOf, lend } from './grants.js';
import { heal } from './support.js';
import { healableDamage } from './damage-result.js';

/** What taking away one damage condition is worth: a bruise and staggered alike (measured), a daze much less because it wears off by itself. */
const WORTH = { staggered: CONDITION_WORTH, dazed: DAZED_WORTH, bruise: CONDITION_WORTH };
const WALK_DISCOUNT = 0.75; // a heal a turn later counts for three quarters (a Sustain healer walking to a patient out of reach; the patient may be gone by then)
const HORIZON = 3; // rounds a lent Regeneration is counted over

/** The damage conditions of a fighter, worst first, each as what removing it is worth. */
export function damageOf(a) {
  const out = [];
  const left = healableDamage(a); // Incurable damage cannot be healed (damage-result.js)
  if (left.staggered) out.push(WORTH.staggered);
  if (left.dazed) out.push(WORTH.dazed);
  for (let i = 0; i < left.bruises; i++) out.push(WORTH.bruise);
  return out;
}

/** The chance a Healing check of this bonus reaches k degrees, for k = 1 up (index k - 1): DC 10, a natural 20 adds a degree. */
export function healChances(bonus, most) {
  const out = Array(most).fill(0);
  for (let roll = 1; roll <= 20; roll++) {
    const r = checkResult(roll, bonus, 10);
    const deg = r.success ? r.degrees : 0;
    for (let k = 0; k < Math.min(deg, most); k++) out[k] += 1 / 20;
  }
  return out;
}

/** Under Sustain a healer tries again after a failed check with extra effort, which the book allows, at the cost of a level of fatigue. */
const mayRetry = (b, c) => healBias(b, c) > 1 && b.options.extraEffort && c.fatigue < 2;

/** Can this fighter be healed at all: it has damage conditions, has a Stamina to recover with, and a check on it has not failed (or the healer may retry). */
const healable = (a, retry) => !a.out && (!a.healFailed || retry) && !a.d.defenses.immune?.Fortitude && damageOf(a).length > 0;

/** Expected worth of the conditions removed, where chance(k) is how likely the k-th worst one is to go. */
const sumWorth = (conds, chance) => conds.reduce((s, w, k) => s + w * chance(k), 0);

/** Can c reach the patient to touch it this turn (a ranged Healing needs no reach)? */
export function canTouch(b, c, patient, mode, ranged) {
  if (ranged || patient === c || inReach(b, c, patient)) return true;
  return mode === 'full' && squares(c, patient) - reachSquares(b, c) <= squaresInMove(b, c);
}

/** Walk up to the patient when the touch needs it. */
export function approach(b, c, patient) {
  if (patient === c || inReach(b, c, patient) || canAct(c) !== 'full') return;
  moveTo(b, c, stepToward(b, c, patient, squaresInMove(b, c), reachSquares(b, c)), `to reach ${patient.name}`);
}

/** Heal the patient with the Healing power. */
function runHeal(patient) {
  return (b, R, c, rng) => {
    approach(b, c, patient);
    if (!(c.healing.ranged || patient === c || inReach(b, c, patient))) return;
    if (patient.healFailed) {
      c.fatigue += 1; patient.healFailed = false;
      log(b, { kind: 'note', actor: c.id, target: patient.id, text: `${c.name} tries again with extra effort, now ${c.fatigue >= 2 ? 'exhausted' : 'fatigued'}.` });
    }
    heal(b, c, patient, rng);
  };
}

/** Lend the patient a Regeneration. */
function runGift(patient, gift) {
  return (b, R, c) => {
    approach(b, c, patient);
    if (!inReach(b, c, patient)) return;
    lend(b, c, patient, gift);
    log(b, { kind: 'heal', actor: c.id, target: patient.id, text: `${c.name} lends ${patient.name} ${gift.name} (Regeneration ${gift.amount}) by touch.`, important: true });
  };
}

/** The best heal c could do this turn: { kind: 'heal', u, run, patient }, or null. */
export function healOption(b, c, enemies, mode) {
  if (canAct(c) === 'none') return null;
  const weight = roleWeight(c, 'healer') * healBias(b, c);
  const retry = mayRetry(b, c);
  let best = null;
  const offer = (u, run, patient) => { if (u > 0 && (!best || u > best.u)) best = { kind: 'heal', u, run, patient }; };
  if (c.healing) {
    const chances = healChances(c.healing.rank - checkPenalty(c), 12);
    for (const p of alliesOf(b, c).concat([c]).filter((a) => healable(a, retry))) {
      const worth = sumWorth(damageOf(p), (k) => chances[k]) * weight;
      if (canTouch(b, c, p, mode, c.healing.ranged)) offer(worth, runHeal(p), p);
      else if (healBias(b, c) > 1 && mode === 'full') offer(worth * WALK_DISCOUNT, (bb, R, cc) => approach(bb, cc, p), p); // Sustain: walk to the hurt ally, heal next turn
    }
  }
  const gift = (c.gifts || []).find((g) => g.kinds.includes('regen'));
  if (gift && !holderOf(b, c, gift.key)) {
    for (const p of alliesOf(b, c).filter((a) => healable(a, false))) {
      if (!canTouch(b, c, p, mode, false)) continue;
      const reach = gift.amount * HORIZON / 10; // conditions cleared, at 10 points each
      offer(sumWorth(damageOf(p), (k) => Math.max(0, Math.min(1, reach - k))) * weight, runGift(p, gift), p);
    }
  }
  return best;
}
