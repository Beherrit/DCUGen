// Moving around the attack: ranged fighters back away from melee threats, and Move-by Action (Hero's Handbook p78)
// splits the move around the standard action, the total no more than the fighter's speed in zones.
//   - A ranged fighter with the advantage shoots from where it stands (keeping the short range) and then steps back
//     out of reach. Without it, the step back comes before the shot.
//   - A melee fighter with the advantage steps in, strikes and steps back out when it would otherwise end beside a
//     dangerous foe (speedsters always do).

import { clamp } from './util.js';
import { arenaOf } from './constants.js';
import { STYLES } from './styles.js';
import { moveZones } from './conditions.js';
import { rangePenalty, threatOn } from './odds.js';
import { moveTo } from './movement.js';
import { wantsKite, kiteThreat, kiteZones, isMeleeThreat } from './tactics.js';
import { shelterOf } from './cover.js';

/** A target's own melee attack that is worth at least this much against the fighter makes the fighter step out after striking. */
const DANGEROUS = 0.7;

/** The melee enemy that could reach the fighter this turn (in its zone, or within its move), if any. */
const standing = (e) => !e.out && !e.fled;
const reachingFoe = (c, enemies) => enemies.find((e) => standing(e) && isMeleeThreat(e) && Math.abs(e.pos - c.pos) <= moveZones(e)) || null;

/** The way to run: away from the enemies' middle, else toward the nearer wall. */
function awayFrom(b, c, enemies) {
  const foes = enemies.filter(standing);
  const mean = foes.reduce((sum, e) => sum + e.pos, 0) / Math.max(1, foes.length);
  return Math.sign(c.pos - mean) || (c.pos >= arenaOf(b) / 2 ? 1 : -1);
}

/** Step up to `steps` zones in a direction, shorter if an enemy stands there. Returns true when the fighter moved. */
function stepAway(b, c, enemies, dir, steps, why) {
  for (let s = steps; s > 0; s--) {
    const dest = clamp(c.pos + dir * s, 0, arenaOf(b) - 1);
    if (dest === c.pos || enemies.some((e) => standing(e) && e.pos === dest)) continue;
    moveTo(b, c, dest, why);
    return true;
  }
  return false;
}

/** Kiting: ranged fighters step away from melee threats before shooting. Fighters with Move-by Action do it after (moveBy). */
export function kite(b, c, attack, target, enemies, mode) {
  const S = STYLES[c.style];
  if (c.adv['Move-by Action'] || !(mode === 'full' && attack.kind !== 'close' && (S.ranged >= 1.2 || wantsKite(b, c)) && !c.grabbedBy && !shelterOf(b, c))) return;
  const threat = enemies.find((e) => e.pos === c.pos && isMeleeThreat(e)) || kiteThreat(b, c, enemies);
  if (threat && rangePenalty(attack, 1) === 0) {
    const dir = c.pos <= threat.pos ? -1 : 1;
    const step = kiteZones(b, c, attack, target, dir) ?? Math.min(moveZones(c), 1);
    const dest = clamp(c.pos + dir * step, 0, arenaOf(b) - 1);
    if (dest !== c.pos) moveTo(b, c, dest, `away from ${threat.name}`);
  }
}

/** A shooter with Move-by Action, after its shot: out of reach of the melee threat, with what is left of its move. */
function shooterStepsBack(b, c, attack, target, enemies, budget) {
  const threat = reachingFoe(c, enemies);
  if (!threat || shelterOf(b, c)) return;
  const dir = c.pos === threat.pos ? awayFrom(b, c, enemies) : c.pos < threat.pos ? -1 : 1;
  const steps = Math.min(budget, kiteZones(b, c, attack, target, dir) ?? budget);
  stepAway(b, c, enemies, dir, steps, `back out of reach of ${threat.name} after the shot (Move-by Action)`);
}

/** A melee fighter with Move-by Action, after its blow: step out when the foe's own blows are dangerous (speedsters always). */
function strikerStepsOut(b, c, target, enemies, budget) {
  const S = STYLES[c.style];
  if (!S.hitAndRun && !(!target.out && !target.fled && isMeleeThreat(target) && threatOn(target, c, 0) >= DANGEROUS)) return;
  stepAway(b, c, enemies, awayFrom(b, c, enemies), Math.min(budget, Math.max(1, Math.floor(moveZones(c) / 2))), 'and is gone before anyone can answer');
}

/** Move-by Action: the rest of the move, after the standard action. */
export function moveBy(b, c, attack, target, enemies, mode) {
  if (!c.adv['Move-by Action'] || mode !== 'full' || c.holding || c.grabbedBy) return;
  const budget = moveZones(c) - (c.zonesMoved || 0);
  if (budget <= 0) return;
  if (attack.kind === 'close') strikerStepsOut(b, c, target, enemies, budget);
  else shooterStepsBack(b, c, attack, target, enemies, budget);
}
