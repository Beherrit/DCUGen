// When a fighter disarms, smashes or trips instead of attacking. Each decision is its own small function and costs no
// random numbers, so a fighter that does not qualify plays exactly as before. Minions and beasts only try a maneuver
// they have the matching Improved advantage for. A Lockdown team eases the odds it asks for against the marked enemy.

import { alliesOf } from './util.js';
import { STYLES } from './styles.js';
import { activeConditions } from './conditions.js';
import { squares, squaresInMove, reachSquares, inReach, lineClear } from './geometry.js';
import { expectedValue, rangePenalty } from './odds.js';
import { maneuverEase, isMeleeThreat } from './tactics.js';
import { isProne } from './prone.js';
import { tripOdds } from './trip.js';
import { disarmOdds } from './disarm.js';
import { breakOdds } from './smash.js';

const TRIP_ODDS = 0.35;     // the chance a trip must beat
const DISARM_ODDS = 0.3;    // the chance a disarm must beat
const DISARM_RATIO = 1.5;   // the item's attack must be worth this much more than the target's next best
const FLOOR = 0.1;          // even with the Improved advantage, below this the maneuver is a waste

/** Minions and beasts only try a maneuver they have the matching Improved advantage for. */
const mayTry = (c, advantage) => !!c.adv[advantage] || !(c.minion || c.style === 'beast');

/** What the target could do to c, best first: each attack with its expected value. */
const threatsOf = (t, c, dist) => t.attacks.map((a) => ({ a, ev: expectedValue(t, a, c, { dist: a.range === 'close' ? 0 : dist }) })).sort((x, y) => y.ev - x.ev);

/** Can c use this attack on the target this turn without a charge: a close attack within one move, a ranged one already in range? */
function usable(b, c, atk, t, mode) {
  if (!atk?.roll || atk.area || atk.effect !== 'Damage') return false;
  if (atk.range === 'close') return squares(c, t) - reachSquares(b, c, atk) <= (mode === 'full' ? squaresInMove(b, c) : 0);
  return rangePenalty(atk, squares(c, t) * b.grid.squareFt) <= 5 && lineClear(b, c, t);
}

const closeAttackOf = (c) => c.attacks.find((a) => a.unarmed) || c.attacks.find((a) => a.range === 'close' && a.roll);

/** The target's best attack when it comes from an item (held ones only when `held` is asked for), with its worth. */
function itemThreat(c, t, dist, held) {
  const [best, ...rest] = threatsOf(t, c, dist);
  const item = best?.a.item;
  if (!item || best.ev < 0.05 || (held && !item.held)) return null;
  const next = rest.find((x) => x.a.item?.key !== item.key)?.ev ?? 0;
  return { item, ev: best.ev, next };
}

/** Minions go down on any failed check, so a plain attack is always better than a maneuver against one. */
const worthTarget = (t) => !t.minion;

/** Disarm: the target's best attack is a held item worth well more than anything else it has, and the odds are fair. */
function disarmChoice(b, c, t, top, mode, ease) {
  const atk = top.pick.attack;
  if (!mayTry(c, 'Improved Disarm') || !usable(b, c, atk, t, mode)) return null;
  const threat = itemThreat(c, t, top.ft, true);
  if (!threat || threat.ev < DISARM_RATIO * threat.next) return null;
  const odds = disarmOdds(c, t, atk, atk.range === 'close' ? 0 : top.ft);
  if (odds <= (c.adv['Improved Disarm'] ? FLOOR : DISARM_ODDS * ease)) return null;
  return { target: t, attack: atk, plan: 'disarm', item: threat.item };
}

/** Smash: the target's best attack is an item (one that is not being disarmed) and breaking it beats a plain attack. */
function smashChoice(b, c, t, top, mode, ease) {
  const atk = top.pick.attack;
  if (!mayTry(c, 'Improved Smash') || !usable(b, c, atk, t, mode)) return null;
  const threat = itemThreat(c, t, top.ft, false);
  if (!threat) return null;
  const odds = breakOdds(c, t, atk, threat.item, atk.range === 'close' ? 0 : top.ft);
  if (odds <= FLOOR || odds <= top.pick.ev * ease) return null;
  return { target: t, attack: atk, plan: 'smash', item: threat.item };
}

/** Leans toward melee, or has Improved Trip. */
const meleeCapable = (c) => (STYLES[c.style].close >= STYLES[c.style].ranged || !!c.adv['Improved Trip']) && !!closeAttackOf(c);

/** Trip: a standing target who is worth putting on the ground, either because a friend who fights up close is in reach of it and hits a prone target at +5 or because it fights from range. */
function tripChoice(b, c, t, top, mode, ease) {
  if (!mayTry(c, 'Improved Trip') || !meleeCapable(c) || top.need > (mode === 'full' ? squaresInMove(b, c) : 0)) return null;
  const s = activeConditions(t);
  if (isProne(t) || t.grabbedBy || s.has('Defenseless') || s.has('Stunned')) return null;
  const friend = alliesOf(b, c).some((a) => inReach(b, a, t) && isMeleeThreat(a));
  const shooter = threatsOf(t, c, top.ft)[0]?.a.range !== 'close';
  if (!(friend || shooter || ease < 1)) return null;
  const odds = tripOdds(c, t);
  if (odds <= (c.adv['Improved Trip'] ? FLOOR : TRIP_ODDS * ease)) return null;
  return { target: t, attack: closeAttackOf(c), plan: 'trip' };
}

/** The maneuver this fighter would rather use on its top target than a plain attack, or null. */
export function maneuverPlan(b, c, top, mode) {
  const t = top.t;
  if (!worthTarget(t)) return null;
  const ease = maneuverEase(b, c, t);
  return disarmChoice(b, c, t, top, mode, ease) || smashChoice(b, c, t, top, mode, ease) || tripChoice(b, c, t, top, mode, ease);
}
