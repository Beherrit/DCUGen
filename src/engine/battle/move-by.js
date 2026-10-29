// Moving around the attack: ranged fighters back away from melee threats, and Move-by Action (Hero's Handbook p78)
// splits the move around the standard action, the total no more than the fighter's squares per move.
//   - A ranged fighter with the advantage shoots from where it stands (keeping the short range) and then steps back
//     out of reach. Without it, the step back comes before the shot.
//   - A melee fighter with the advantage steps in, strikes and steps back out when it would otherwise end beside a
//     dangerous foe (speedsters always).
import { STYLES } from './styles.js';
import { squaresInMove, reachSquares, inReach, squares } from './geometry.js';
import { threatOn } from './odds.js';
import { moveTo } from './movement.js';
import { retreatSquare } from './path.js';
import { wantsKite, kiteThreat, kiteSquare, isMeleeThreat } from './tactics.js';
import { shelterOf } from './cover.js';

/** A target's own melee attack that is worth at least this much against the fighter makes the fighter step out after striking. */
const DANGEROUS = 0.7;

/** The melee enemy that could reach the fighter this turn (in reach, or within its move), if any. */
const standing = (e) => !e.out && !e.fled;
const reachingFoe = (b, c, enemies) => enemies.find((e) => standing(e) && isMeleeThreat(e) && squares(e, c) - reachSquares(b, e) <= squaresInMove(b, e)) || null;

/** Kiting: ranged fighters step away from melee threats before shooting. Fighters with Move-by Action do it after (moveBy). */
export function kite(b, c, attack, target, enemies, mode) {
  const S = STYLES[c.style];
  if (c.adv['Move-by Action'] || !(mode === 'full' && attack.range !== 'close' && (S.ranged >= 1.2 || wantsKite(b, c)) && !c.grabbedBy && !shelterOf(b, c))) return;
  const threat = enemies.find((e) => standing(e) && inReach(b, e, c) && isMeleeThreat(e)) || kiteThreat(b, c, enemies);
  if (!threat) return;
  const dest = kiteSquare(b, c, attack, target, [threat], squaresInMove(b, c));
  if (dest) moveTo(b, c, dest, `away from ${threat.name}`);
}

/** A shooter with Move-by Action, after its shot: out of reach of the melee threat, with what is left of its move. */
function shooterStepsBack(b, c, attack, target, enemies, budget) {
  const threat = reachingFoe(b, c, enemies);
  if (!threat || shelterOf(b, c)) return;
  const dest = kiteSquare(b, c, attack, target, [threat], budget);
  if (dest) moveTo(b, c, dest, `back out of reach of ${threat.name} after the shot (Move-by Action)`);
}

/** A melee fighter with Move-by Action, after its blow: step out when the foe's own blows are dangerous (speedsters always). */
function strikerStepsOut(b, c, target, enemies, budget) {
  const S = STYLES[c.style];
  if (!S.hitAndRun && !(!target.out && !target.fled && isMeleeThreat(target) && threatOn(target, c, 0) >= DANGEROUS)) return;
  const foes = enemies.filter(standing);
  const dest = foes.length ? retreatSquare(b, c, foes, Math.min(budget, Math.max(1, Math.floor(squaresInMove(b, c) / 2)))) : null;
  if (dest) moveTo(b, c, dest, 'and is gone before anyone can answer');
}

/** Move-by Action: the rest of the move, after the standard action. */
export function moveBy(b, c, attack, target, enemies, mode) {
  if (!c.adv['Move-by Action'] || mode !== 'full' || c.holding || c.grabbedBy) return;
  const budget = squaresInMove(b, c) - (c.squaresMoved || 0);
  if (budget <= 0) return;
  if (attack.range === 'close') strikerStepsOut(b, c, target, enemies, budget);
  else shooterStepsBack(b, c, attack, target, enemies, budget);
}
