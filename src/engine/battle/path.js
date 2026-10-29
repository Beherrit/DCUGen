// Walking on the grid: the squares a fighter can reach in a move, the way toward a spot, and the best square to
// back off to. Walls and cover pieces (until destroyed) block movement; fighters do not block each other.
// The grid is tiny, so a breadth-first search over the squares does the pathing when something is in the way.
import { isPlayable } from './grid.js';
import { squares } from './geometry.js';
import { lexAbove } from './util.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
const key = (x, y) => `${x},${y}`;

/** The squares cover pieces stand on (a destroyed piece is rubble, not an obstacle). */
function pieceSquares(b) {
  return new Set((b.cover || []).filter((p) => p.state !== 'destroyed').map((p) => key(p.x, p.y)));
}

/** Can a fighter step onto this square? Squares in `free` (where it stands, where it is heading) always count. */
function opener(b, free = []) {
  const pieces = pieceSquares(b);
  const ok = new Set(free.map((p) => key(p.x, p.y)));
  return (x, y) => isPlayable(b, x, y) && (ok.has(key(x, y)) || !pieces.has(key(x, y)));
}

/** Steps to every square within `budget` steps of `from`: Map of key -> { x, y, steps }. */
export function reachableFrom(b, from, budget, free = []) {
  const open = opener(b, [from, ...free]);
  const seen = new Map([[key(from.x, from.y), { x: from.x, y: from.y, steps: 0 }]]);
  let edge = [seen.get(key(from.x, from.y))];
  for (let s = 1; s <= budget && edge.length; s++) {
    const next = [];
    for (const p of edge) {
      for (const [dx, dy] of DIRS) {
        const x = p.x + dx; const y = p.y + dy;
        if (seen.has(key(x, y)) || !open(x, y)) continue;
        const q = { x, y, steps: s };
        seen.set(key(x, y), q);
        next.push(q);
      }
    }
    edge = next;
  }
  return seen;
}

/**
 * Where a fighter ends up walking toward `goal` for up to `maxSq` steps, stopping as soon as it is within `stopAt`
 * squares of it. Returns the square (the fighter's own when it cannot or need not move). Nothing moves here.
 */
export function stepToward(b, c, goal, maxSq, stopAt = 0) {
  let at = { x: c.x, y: c.y };
  if (!maxSq || squares(at, goal) <= stopAt) return at;
  const dist = distancesTo(b, goal, [at]);
  for (let s = 0; s < maxSq && squares(at, goal) > stopAt; s++) {
    const here = dist.get(key(at.x, at.y));
    let best = null;
    for (const [dx, dy] of DIRS) {
      const x = at.x + dx; const y = at.y + dy;
      const d = dist.get(key(x, y));
      if (d === undefined || (here !== undefined && d >= here)) continue;
      const rank = [d, squares({ x, y }, goal)];
      if (!best || rank[0] < best.rank[0] || (rank[0] === best.rank[0] && rank[1] < best.rank[1])) best = { x, y, rank };
    }
    if (!best) break;
    at = { x: best.x, y: best.y };
  }
  return at;
}

/** Steps from every square to the goal, walking around walls and pieces. */
function distancesTo(b, goal, free) {
  const open = opener(b, [goal, ...free]);
  const dist = new Map([[key(goal.x, goal.y), 0]]);
  let edge = [{ x: goal.x, y: goal.y }];
  for (let s = 1; edge.length; s++) {
    const next = [];
    for (const p of edge) {
      for (const [dx, dy] of DIRS) {
        const x = p.x + dx; const y = p.y + dy;
        if (dist.has(key(x, y)) || !open(x, y)) continue;
        dist.set(key(x, y), s);
        next.push({ x, y });
      }
    }
    edge = next;
  }
  return dist;
}

/**
 * The best square within `budget` steps to back off to: as far from the nearest of `foes` as possible, among the
 * squares `ok` allows. Ties go to the shorter walk, then the straighter one, then the lower square. Null when no square beats staying.
 */
export function retreatSquare(b, c, foes, budget, ok = () => true) {
  const near = (p) => Math.min(...foes.map((f) => squares(p, f)));
  const here = near(c);
  let best = null;
  for (const p of reachableFrom(b, c, budget).values()) {
    if (p.steps === 0 || !ok(p)) continue;
    const score = [near(p), -p.steps, -(Math.abs(p.x - c.x) + Math.abs(p.y - c.y)), -p.y, -p.x];
    if (near(p) <= here) continue;
    if (!best || lexAbove(score, best.score)) best = { x: p.x, y: p.y, score };
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** The nearest square a fighter can stand on to this one (itself when open), searching outward ring by ring. */
export function nearestOpen(b, p) {
  const open = opener(b);
  for (let r = 0; r <= 12; r++) {
    for (let y = p.y - r; y <= p.y + r; y++) {
      for (let x = p.x - r; x <= p.x + r; x++) if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) === r && open(x, y)) return { x, y };
    }
  }
  return { x: p.x, y: p.y };
}

/** Can a fighter stand on this square: playable, no wall and no standing cover piece? */
export const isOpenSquare = (b, x, y) => opener(b)(x, y);
