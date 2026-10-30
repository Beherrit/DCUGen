// An optional record of what the engine did on the grid, for tests: set b.trace = [] before the fight and every
// move and every attack adds an entry with the squares and feet involved. Nothing happens when b.trace is unset.
import { feet, squares, reachSquares, squaresInMove } from './geometry.js';

/** A fighter moved from one square to another. */
export function traceMove(b, c, from, to) {
  if (!b.trace) return;
  b.trace.push({ kind: 'move', round: b.round, tick: b.tick, actor: c.id, from, to, squares: squares(from, to), budget: squaresInMove(b, c) });
}

/** An attack is about to be made by c on t (a close attack, a ranged one, a perception one or an area). */
export function traceAttack(b, c, atk, t) {
  if (!b.trace) return;
  b.trace.push({ kind: 'attack', round: b.round, tick: b.tick, actor: c.id, target: t.id, range: atk.range, rank: atk.rank, ext: atk.ext || 0, area: atk.area || null, name: atk.name,
    ft: feet(b, c, t), squares: squares(c, t), reach: reachSquares(b, c, atk), from: { x: c.x, y: c.y }, to: { x: t.x, y: t.y } });
}

/** A fighter took a non-attack option because it scored higher than its best attack (heal, buff, protect), in b.trace.choices. */
export function traceChoice(b, c, kind, utility, own) {
  if (!b.trace) return;
  (b.trace.choices ||= []).push({ choice: kind, round: b.round, tick: b.tick, actor: c.id, utility, own }); // kept apart: the grid tests read b.trace entry by entry as moves and attacks
}
