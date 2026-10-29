// How the AI weighs cover: whether a shot through total cover is worth taking, and whether shooting the cover
// itself is worth more than the fighter's other options.

import { checkPenalty } from './conditions.js';
import { hitOdds, resistOdds, rangePenalty, expectedValue } from './odds.js';
import { shieldFor, coverLevel } from './cover.js';

/** The chance a shot at a piece opens it up: the check against DC 10, then 2 or more degrees on its Toughness check. */
export function openChance(c, atk, piece, dist) {
  const hit = hitOdds(atk.bonus - checkPenalty(c) - rangePenalty(atk, dist), 0).hit;
  const odds = resistOdds(piece.toughness, 15 + atk.rank + 5);
  return hit * (odds[2] + odds[3] + odds[4]);
}

/** With the shoot-through rule on, a shot at a target behind total cover first has to breach it: scale the score by that chance. */
export function throughFactor(b, c, atk, t, dist) {
  if (!b?.options?.shootThrough || !atk.roll || atk.area) return 1;
  const piece = shieldFor(b, c, atk, t);
  return piece && coverLevel(piece) === 'total' ? Math.max(0.05, openChance(c, atk, piece, dist)) : 1;
}

/** Can this attack shoot a piece of scenery? A ranged Damage attack with an attack roll. */
const canShootCover = (atk) => atk.kind === 'ranged' && atk.roll && !atk.area && atk.effect === 'Damage';

/**
 * A plan to shoot the cover when it hides a target the fighter cannot hit directly and opening it is worth more than
 * anything else on offer. scored is choosePlan's list of { t, dist, pick }. Returns a plan or null.
 */
export function coverPlan(b, c, scored) {
  if (!(b.cover || []).length) return null;
  const others = Math.max(0, ...scored.filter((s) => s.pick.attack).map((s) => s.pick.ev));
  let best = null;
  for (const s of scored) {
    if (s.pick.attack && s.pick.ev > 0.02) continue;
    for (const atk of c.attacks.filter(canShootCover)) {
      const piece = shieldFor(b, c, atk, s.t);
      if (!piece || coverLevel(piece) !== 'total' || rangePenalty(atk, s.dist) > 50) continue;
      const value = openChance(c, atk, piece, s.dist) * expectedValue(c, atk, s.t, { dist: s.dist });
      if (value > others && value > 0.05 && (!best || value > best.ev)) best = { target: s.t, attack: atk, plan: 'cover', piece, ev: value };
    }
  }
  return best;
}
