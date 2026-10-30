// A fighter fooled by an Illusion (illusion.js) spends its turn attacking the teammate whose look was switched, then checks
// whether it sees through the trick. It acts like a controlled fighter for the turn (turn.js controlledTurn), with the one
// victim the illusion chose.

import { log, byId } from './util.js';
import { reachSquares, inRangeNow, shootSquares } from './geometry.js';
import { bestAttackVs } from './plan.js';
import { moveToward } from './movement.js';
import { resolveAttack } from './attacks.js';
import { disbelieve } from './illusion.js';

/** True when the fooled fighter used its turn on its own side. */
export function deceivedTurn(b, R, c, rng) {
  const d = c.deceived;
  if (!d) return false;
  const victim = byId(b, d.victim);
  if (!victim || victim.out || victim.fled) { c.deceived = null; return false; }
  const atk = bestAttackVs(b, c, victim, rng, { full: true }).attack;
  if (!atk) return false; // nothing it can do to the teammate: the turn goes on as usual
  log(b, { kind: 'condition', actor: c.id, target: victim.id, text: `${c.name} takes ${victim.name} for a foe (${d.name}) and turns on it!`, important: true });
  moveToward(b, c, victim, rng, 1, atk.range === 'close' ? reachSquares(b, c, atk) : shootSquares(b, c));
  if (inRangeNow(b, c, atk, victim)) resolveAttack(b, R, c, atk, victim, rng, {});
  disbelieve(b, c, rng); // it struck the illusion's subject: it may see through it now
  return true;
}
