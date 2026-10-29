// The Take Cover team tactic: shooters get behind the best cover in reach and dig in when no attack is worth much.
// Melee fighters on the team still close in. With no cover on the field it only prefers the Defend action when
// the team is outnumbered. Being behind a piece means standing next to it with the piece on the line from the enemy.
import { alliesOf, lexAbove } from './util.js';
import { squaresInMove, feet, lineClear, lineSquares } from './geometry.js';
import { reachableFrom } from './path.js';
import { rangePenalty } from './odds.js';
import { moveTo } from './movement.js';
import { tacticOf } from './tactics-list.js';
import { STYLES } from './styles.js';
import { piecesOf, coverLevel, shelterOf, takeCoverBehind } from './cover.js';

/** An attack worth less than this, in expected degrees, is not worth taking from cover. */
const WORTH_ATTACKING = 0.15;

const isShooter = (c) => c.attacks.some((a) => a.range !== 'close');

/** A style that would rather shoot than close in (blaster, gunner, mage, mentalist and the like). */
const prefersRange = (c) => (STYLES[c.style]?.ranged ?? 1) > (STYLES[c.style]?.close ?? 1);
const intact = (b) => piecesOf(b).filter((p) => p.state === 'intact');
const levelRank = (p) => (coverLevel(p) === 'total' ? 1 : 0);

/** How many of these enemies have the piece on the line to the square s (so a fighter at s is behind it from them)? */
const shieldedFrom = (piece, s, enemies) => enemies.filter((e) => lineSquares(e, s).some((q) => q.x === piece.x && q.y === piece.y)).length;

/**
 * The best intact piece within one move of c, and the square beside it to stand on: total before partial, tougher
 * first, then the square that shields from the most enemies, then the shortest walk. A shooter's attack must still
 * reach its target from there. mode 'stay' looks at the square c is on only.
 */
export function bestCover(b, c, mode = 'full', enemies = [], attack = null, target = null) {
  const squares = reachableFrom(b, c, mode === 'full' ? squaresInMove(b, c) : 0);
  let best = null;
  for (const piece of intact(b)) {
    for (const s of squares.values()) {
      if (Math.max(Math.abs(s.x - piece.x), Math.abs(s.y - piece.y)) !== 1) continue;
      const shield = shieldedFrom(piece, s, enemies);
      if (enemies.length && !shield) continue;
      if (attack && target && (rangePenalty(attack, feet(b, s, target)) > 5 || !lineClear(b, s, target))) continue;
      const key = [levelRank(piece), piece.toughness, shield, -s.steps, -s.y, -s.x];
      if (!best || lexAbove(key, best.key)) best = { piece, spot: { x: s.x, y: s.y }, key };
    }
  }
  return best;
}

/** Move behind the best cover in reach, if the team plays Take Cover. Returns true when the fighter ends up behind a piece. */
export function seekCover(b, c, mode, enemies = [], attack = null, target = null) {
  const tactic = tacticOf(b, c) === 'cover';
  if (!isShooter(c) || !(tactic || prefersRange(c))) return false;
  // Take Cover goes out of its way to reach cover; anyone else uses what is by their own square.
  const found = bestCover(b, c, tactic ? mode : 'stay', enemies, attack, target);
  if (!found) return !!shelterOf(b, c);
  if (shelterOf(b, c)?.id === found.piece.id && found.spot.x === c.x && found.spot.y === c.y) return true;
  moveTo(b, c, found.spot, `to the ${found.piece.name}`);
  takeCoverBehind(b, c, found.piece);
  return true;
}

/** Before attacking: a shooter whose attack is at range heads for cover first. */
export function coverStep(b, c, attack, mode, target = null, enemies = []) {
  if (attack.range !== 'close') seekCover(b, c, mode, enemies, attack, target);
}

/** Take Cover: does this fighter use the Defend action instead of a poor attack? */
export function coverDefends(b, c, choice, enemies, mode) {
  if (tacticOf(b, c) !== 'cover' || !isShooter(c) || choice.attack?.range === 'close') return false;
  if (!['attack', 'move'].includes(choice.plan)) return false;
  if ((choice.plan === 'attack' ? choice.ev ?? 1 : 0) >= WORTH_ATTACKING) return false;
  if (intact(b).length) return seekCover(b, c, mode, enemies, choice.attack, choice.target);
  return enemies.length > alliesOf(b, c).length + 1;
}
