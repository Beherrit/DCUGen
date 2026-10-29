// The Take Cover team tactic: shooters get behind the best cover in reach and dig in when no attack is worth much.
// Melee fighters on the team still close in. With no cover on the field it only prefers the Defend action when
// the team is outnumbered.

import { alliesOf } from './util.js';
import { moveZones } from './conditions.js';
import { moveTo } from './movement.js';
import { tacticOf } from './tactics-list.js';
import { STYLES } from './styles.js';
import { piecesOf, coverLevel, shelterOf, takeCoverBehind } from './cover.js';

/** An attack worth less than this, in expected degrees, is not worth taking from cover. */
const WORTH_ATTACKING = 0.15;

const isShooter = (c) => c.attacks.some((a) => a.kind !== 'close');
/** A style that would rather shoot than close in (blaster, gunner, mage, mentalist and the like). */
const prefersRange = (c) => (STYLES[c.style]?.ranged ?? 1) > (STYLES[c.style]?.close ?? 1);
const intact = (b) => piecesOf(b).filter((p) => p.state === 'intact');

/** The best intact piece within one move of c (its own zone included): total before partial, tougher first, then nearer. */
export function bestCover(b, c, mode = 'full') {
  const reach = mode === 'full' ? moveZones(c) : 0;
  const rank = (p) => (coverLevel(p) === 'total' ? 1 : 0);
  const near = (p) => Math.abs(p.zone - c.pos);
  return intact(b).filter((p) => near(p) <= reach)
    .sort((x, y) => rank(y) - rank(x) || y.toughness - x.toughness || near(x) - near(y) || x.id.localeCompare(y.id))[0] || null;
}

/** Move behind the best cover in reach, if the team plays Take Cover. Returns true when the fighter ends up behind a piece. */
export function seekCover(b, c, mode) {
  const tactic = tacticOf(b, c) === 'cover';
  if (!isShooter(c) || !(tactic || prefersRange(c))) return false;
  // Take Cover goes out of its way to reach cover; anyone else uses what is in their own zone.
  const piece = bestCover(b, c, tactic ? mode : 'stay');
  if (!piece) return !!shelterOf(b, c);
  if (shelterOf(b, c)?.id === piece.id) return true;
  if (piece.zone !== c.pos) moveTo(b, c, piece.zone, `to the ${piece.name}`);
  takeCoverBehind(b, c, piece);
  return true;
}

/** Before attacking: a shooter whose attack is at range heads for cover first. */
export function coverStep(b, c, attack, mode) {
  if (attack.kind !== 'close') seekCover(b, c, mode);
}

/** Take Cover: does this fighter use the Defend action instead of a poor attack? */
export function coverDefends(b, c, choice, enemies, mode) {
  if (tacticOf(b, c) !== 'cover' || !isShooter(c) || choice.attack?.kind === 'close') return false;
  if (!['attack', 'move'].includes(choice.plan)) return false;
  if ((choice.plan === 'attack' ? choice.ev ?? 1 : 0) >= WORTH_ATTACKING) return false;
  if (intact(b).length) return seekCover(b, c, mode);
  return enemies.length > alliesOf(b, c).length + 1;
}
