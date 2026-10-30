// Luck Control on attack rolls: when a fighter wants to re-roll a miss (its own points, or an ally's grant or bestow), when an
// enemy controller wastes that re-roll, and when one forces a hit to be re-rolled at the worse of the two. The mechanics are
// in luck.js; what makes a use worth it is decided here, for attack rolls only.

import { alive } from './util.js';
import { canReroll } from './points.js';
import { spendOnMiss } from './tactics.js';
import { harmChance, hurt } from './fortune.js';
import { assistReady, negateReroll, forceWorse } from './luck.js';

const anyLuckControl = (b) => alive(b).some((x) => x.luckCtl);

/** Does c re-roll this miss? On its own points as it always has; with none, only when an ally can help and the miss matters. */
export function wantsReroll(b, c, t, roll, rng) {
  if (roll === 1 || c.style === 'minion') return false;
  if (canReroll(b, c)) return spendOnMiss(b, c) || t.staggered || c.staggered || rng.chance(0.5);
  return assistReady(b, c) && (t.staggered || t.bruises >= 1 || hurt(c));
}

/** The chance (0 to 1) that a die thrown now would land the attack, with 1 to 10 counting +10 when it is a re-roll. */
function landChance(mod, dcUsed, reroll) {
  let n = 0;
  for (let r = 1; r <= 20; r++) if (r === 20 || (r !== 1 && (reroll && r <= 10 ? r + 10 : r) + mod >= dcUsed)) n++;
  return n / 20;
}

/** An enemy controller wastes c's re-roll when it would often turn the miss into a hit on its side. True when one did. */
export function negatesReroll(b, c, t, { mod, dcUsed }) {
  if (!anyLuckControl(b) || landChance(mod, dcUsed, true) < 0.4) return false;
  return negateReroll(b, c, t, 'attack roll');
}

/**
 * An enemy controller forces c's hit to be re-rolled at the worse when the hit would often stagger or incapacitate t and a
 * second die alone would often miss. Returns { roll, natural } or null.
 */
export function forcesHit(b, c, atk, t, rng, { roll, mod, dcUsed }) {
  if (!anyLuckControl(b) || 1 - landChance(mod, dcUsed, false) < 0.3 || harmChance(t, atk, atk.rank) < 0.3) return null;
  return forceWorse(b, c, rng, { on: t, against: t, label: 'attack roll', roll });
}
