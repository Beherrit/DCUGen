// Where fighters start: each team on its own edge of the grid, spread along it, and where an ambush puts them.
import { STYLES } from './styles.js';
import { syncGrid } from './grid.js';
import { squares, shortRangeFt } from './geometry.js';
import { nearestOpen, isOpenSquare } from './path.js';

/** The teams on the battlefield, in letter order. A team's place in this list decides its edge. */
export const teamsOf = (b) => [...new Set(b.combatants.map((c) => c.team))].sort();

/**
 * The line a team starts on: 0 west, 1 east, 2 north, 3 south (teams past the fourth start in the middle). On open ground
 * it is the second square in from the edge, so a team that wants to leave by its edge has a square to walk; in an enclosed
 * room the line is the edge itself.
 */
function edgeLine(b, index) {
  const { x0, y0, x1, y1 } = b.grid.play;
  const inset = b.options?.enclosed ? 0 : 1;
  const mid = (lo, hi) => Math.floor((lo + hi) / 2);
  if (index === 0) return { fixed: { x: x0 + inset }, along: 'y', lo: y0, hi: y1 };
  if (index === 1) return { fixed: { x: x1 - inset }, along: 'y', lo: y0, hi: y1 };
  if (index === 2) return { fixed: { y: y0 + inset }, along: 'x', lo: x0, hi: x1 };
  if (index === 3) return { fixed: { y: y1 - inset }, along: 'x', lo: x0, hi: x1 };
  return { fixed: { x: mid(x0, x1) }, along: 'y', lo: y0, hi: y1 };
}

/** n spots along a team's edge: two squares apart when there is room, else one apart, centered on the edge. */
export function edgeSpots(b, index, n) {
  const line = edgeLine(b, index);
  const len = line.hi - line.lo + 1;
  const gap = (n - 1) * 2 + 1 <= len ? 2 : n <= len ? 1 : 0;
  const start = line.lo + Math.floor((len - ((n - 1) * gap + 1)) / 2);
  return Array.from({ length: n }, (_, k) => nearestOpen(b, { ...line.fixed, [line.along]: gap ? start + k * gap : line.lo + (k % len) }));
}

/** Teams start on their own edges of the grid. */
export function placeAll(b) {
  syncGrid(b);
  teamsOf(b).forEach((team, i) => {
    const members = b.combatants.filter((c) => c.team === team);
    edgeSpots(b, i, members.length).forEach((s, k) => { members[k].x = s.x; members[k].y = s.y; });
  });
}

/** The middle of a team's edge, for a fighter who joins late. */
export const joinSpot = (b, team) => edgeSpots(b, Math.max(0, teamsOf(b).indexOf(team)), 1)[0];

/** Does this fighter prefer to shoot rather than strike? */
export function prefersShooting(c) {
  const S = STYLES[c.style] || {};
  return c.attacks.some((a) => a.range !== 'close') && (S.ranged ?? 1) >= (S.close ?? 1);
}

const nextToCover = (b, p) => (b.cover || []).some((k) => k.state === 'intact' && squares(k, p) <= 1);

/**
 * Where an ambusher starts: a melee fighter next to its target, a shooter at short range of it (not next to it when
 * there is room), ideally beside cover. Among equals the square nearest where it stood wins.
 */
export function ambushSpot(b, c, foe) {
  const sq = b.grid.squareFt;
  const maxSq = Math.floor(shortRangeFt(c) / sq);
  const shooter = prefersShooting(c) && maxSq >= 1;
  const lo = shooter && maxSq >= 2 ? 2 : 1;
  const hi = shooter ? Math.max(lo, maxSq) : 1;
  let best = null;
  for (let y = b.grid.play.y0; y <= b.grid.play.y1; y++) {
    for (let x = b.grid.play.x0; x <= b.grid.play.x1; x++) {
      const d = squares({ x, y }, foe);
      if (d < lo || d > hi || !isOpenSquare(b, x, y)) continue;
      const score = [shooter && nextToCover(b, { x, y }) ? 1 : 0, -squares({ x, y }, c)];
      if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) best = { x, y, score };
    }
  }
  return best ? { x: best.x, y: best.y } : { x: foe.x, y: foe.y };
}
