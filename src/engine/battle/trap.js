// Triggered (Hero's Handbook p132): an instant effect "set" to go off under circumstances chosen when it is set; one use per
// rank. Setting it takes the action the effect normally takes. Here the circumstance is the one a fight on a grid has: a
// foe of the setter moves through the square. The foe then gets the effect's normal resistance check.
//
// house rule: the book lets a trap be found (Perception, DC 10 + the effect's rank) or disarmed; here nobody notices one, and
// the trap stays where it is until a foe crosses it or its uses run out. The AI sets one on the way a foe will come, a square
// or two in front of itself, when it has nothing to hit this turn.

import { log, rngFor, byId } from './util.js';
import { squares, lineSquares, reachSquares } from './geometry.js';
import { spotName } from './grid.js';
import { onMoved } from './movement.js';
import { applyEffect } from './attack-effects.js';
import { expectedValue } from './odds.js';
import { isOpenSquare } from './path.js';

/** The attack a fighter could set as a trap: Triggered, needing a resistance check, not an area. */
const trapAttack = (c) => c.attacks.filter((a) => a.ex?.triggered && !a.area && a.effect !== 'Nullify').sort((x, y) => y.rank - x.rank)[0] || null;

const standing = (b, c, atk) => (b.traps || []).filter((t) => t.owner === c.id && t.atk === atk.id);

/** Set a trap on a square. */
export function setTrap(b, c, atk, at) {
  (b.traps ||= []).push({ id: `trap${(b.traps.length + 1)}-${b.round}`, owner: c.id, atk: atk.id, x: at.x, y: at.y, left: atk.ex.triggered });
  log(b, { kind: 'note', actor: c.id, text: `${c.name} sets ${atk.name} as a trap on ${spotName(at)} (Triggered: ${atk.ex.triggered} use${atk.ex.triggered > 1 ? 's' : ''}, it goes off when a foe crosses the square).` });
}

/** A fighter moved from a square to another: every trap of an opposing fighter on the squares it crossed (not the one it left) goes off. */
function onMove(b, mover, from) {
  if (!b.traps?.length || !from) return;
  const path = [...lineSquares(from, mover), { x: mover.x, y: mover.y }].filter((s) => !(s.x === from.x && s.y === from.y)); // the squares between, and the one it ends on
  for (const trap of [...b.traps]) {
    const owner = byId(b, trap.owner);
    if (!owner || owner.team === mover.team || mover.out || !path.some((s) => s.x === trap.x && s.y === trap.y)) continue;
    const atk = owner.attacks.find((a) => a.id === trap.atk);
    trap.left -= 1;
    if (trap.left <= 0) b.traps = b.traps.filter((t) => t !== trap);
    if (!atk) continue;
    log(b, { kind: 'attack', actor: owner.id, target: mover.id, text: `${mover.name} crosses ${spotName(trap)} and sets off ${owner.name}'s ${atk.name} (Triggered${trap.left > 0 ? `, ${trap.left} use${trap.left > 1 ? 's' : ''} left` : ''}).`, important: true });
    applyEffect(b, null, owner, atk, mover, rngFor(b), { auto: true, crit: false, later: true });
  }
}
onMoved(onMove);

/** The square a trap goes on: one or two squares from the fighter toward the nearest foe, open ground. */
function trapSquare(b, c, foe) {
  const line = lineSquares(c, foe).filter((s) => !(s.x === c.x && s.y === c.y));
  const pick = line.slice(0, 2).reverse().find((s) => isOpenSquare(b, s.x, s.y) && squares(s, foe) >= 1);
  return pick || null;
}

/** The AI: with nothing to hit this turn, a fighter with a Triggered attack sets it on the way a foe is coming. True when the standard action went on it. */
export function trapTurn(b, c, choice, enemies, mode) {
  const atk = trapAttack(c);
  if (!atk || mode === 'none' || (choice && choice.plan === 'attack')) return false;
  if (standing(b, c, atk).length >= 1) return false;
  const foe = enemies.slice().sort((x, y) => squares(c, x) - squares(c, y))[0];
  if (!foe || squares(c, foe) <= reachSquares(b, c) || expectedValue(c, atk, foe, { autoHit: true, b }) < 0.3) return false;
  const at = trapSquare(b, c, foe);
  if (!at) return false;
  setTrap(b, c, atk, at);
  return true;
}

