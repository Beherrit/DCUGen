// Buffs as a utility: lending an ally a trait (Enhanced Trait, Protection) with Affects Others. The worth is the ally's gain
// over the next round: an attack check bonus is the rise in its best attack's expected value, a defense bonus is the drop
// in the harm the enemies would do to it (its share of their attacks). A gift already on an ally is moved only for the
// difference. The gift is a touch and a standard action.

import { log, alliesOf } from './util.js';
import { canAct } from './conditions.js';
import { bestEvNow, threatOn } from './odds.js';
import { feet, squares, squaresInMove, reachSquares, inReach } from './geometry.js';
import { stepToward } from './path.js';
import { moveTo } from './movement.js';
import { roleWeight } from './roles.js';
import { holderOf, lend, withGift } from './grants.js';

const ATTACK_KINDS = ['close', 'ranged'];

/** The best expected value any of the ally's attacks has on any enemy, as if the enemy were in reach. */
const bestStrike = (b, a, enemies) => Math.max(0, ...enemies.map((e) => bestEvNow(a, e, feet(b, a, e), 0, true)));

/** The harm the enemies would do to the ally, counting its share of their attention (one in the size of its team). */
function harmTo(b, a, enemies) {
  const share = 1 / (1 + alliesOf(b, a).length);
  return share * enemies.reduce((s, e) => s + threatOn(e, a, feet(b, e, a)), 0);
}

/** What the gift is worth on this ally for the next round. */
export function giftWorth(b, ally, gift, enemies) {
  const attacks = gift.kinds.some((k) => ATTACK_KINDS.includes(k));
  const defends = gift.kinds.some((k) => !ATTACK_KINDS.includes(k));
  const hit0 = attacks ? bestStrike(b, ally, enemies) : 0;
  const harm0 = defends ? harmTo(b, ally, enemies) : 0;
  return withGift(ally, gift, () => (attacks ? Math.max(0, bestStrike(b, ally, enemies) - hit0) : 0) + (defends ? Math.max(0, harm0 - harmTo(b, ally, enemies)) : 0));
}

function runGift(ally, gift) {
  return (b, R, c) => {
    if (!inReach(b, c, ally) && canAct(c) === 'full') moveTo(b, c, stepToward(b, c, ally, squaresInMove(b, c), reachSquares(b, c)), `to reach ${ally.name}`);
    if (!inReach(b, c, ally)) return;
    lend(b, c, ally, gift);
    log(b, { kind: 'note', actor: c.id, target: ally.id, text: `${c.name} lends ${ally.name} ${gift.name} (${gift.trait} +${gift.amount}) by touch, for as long as ${c.name} keeps it up.`, important: true });
  };
}

/** The best gift c could lend this turn: { kind: 'buff', u, run, patient }, or null. */
export function buffOption(b, c, enemies, mode) {
  if (canAct(c) === 'none' || !enemies.length) return null;
  let best = null;
  for (const gift of (c.gifts || []).filter((g) => !g.kinds.includes('regen'))) {
    const held = holderOf(b, c, gift.key);
    const heldWorth = held ? giftWorth(b, held, gift, enemies) : 0;
    for (const ally of alliesOf(b, c)) {
      if (ally === held) continue;
      const near = inReach(b, c, ally) || (mode === 'full' && squares(c, ally) - reachSquares(b, c) <= squaresInMove(b, c));
      if (!near) continue;
      const u = (giftWorth(b, ally, gift, enemies) - heldWorth) * roleWeight(c, 'buffer');
      if (u > 0 && (!best || u > best.u)) best = { kind: 'buff', u, run: runGift(ally, gift), patient: ally };
    }
  }
  return best;
}
