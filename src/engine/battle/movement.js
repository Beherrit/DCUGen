// Moving across the grid.
import { log, byId } from './util.js';
import { fmtFt } from '../range.js';
import { spotName } from './grid.js';
import { squares, squaresInMove } from './geometry.js';
import { stepToward } from './path.js';
import { traceMove } from './trace.js';

/** Put c on a square, log the move with its distance, and count it against this turn's squares. */
export function moveTo(b, c, dest, why) {
  if (dest.x === c.x && dest.y === c.y) return;
  const from = { x: c.x, y: c.y };
  const n = squares(from, dest);
  c.x = dest.x; c.y = dest.y;
  c.squaresMoved = (c.squaresMoved || 0) + n;
  const held = c.holding ? byId(b, c.holding) : null;
  if (held && held.grabbedBy === c.id) { held.x = dest.x; held.y = dest.y; } // a held fighter is carried along
  const verb = c.flying ? 'flies' : c.speed >= 3 ? 'blurs' : 'moves';
  log(b, { kind: 'move', actor: c.id, from: [from.x, from.y], to: [dest.x, dest.y], text: `${c.name} ${verb} ${why ? `${why} ` : ''}from ${spotName(from)} to ${spotName(dest)}, ${fmtFt(n * b.grid.squareFt)}.` });
  traceMove(b, c, from, dest);
}

/** Move toward t, stopping once within `stopAt` squares of it (1: next to it; a shooter only needs to get within range). */
export function moveToward(b, c, t, rng, moves = 1, stopAt = 1) {
  void rng;
  const budget = squaresInMove(b, c) * moves;
  if (!budget) { log(b, { kind: 'skip', actor: c.id, text: `${c.name} can't move.` }); return; }
  if (squares(c, t) <= stopAt) return;
  const dest = stepToward(b, c, t, budget, stopAt);
  moveTo(b, c, dest, squares(dest, t) <= Math.max(1, stopAt) ? `${moves > 1 ? 'all the way ' : ''}to ${t.name}` : `toward ${t.name}`);
}
