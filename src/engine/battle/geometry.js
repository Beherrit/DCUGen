// Distances on the battle grid, in squares and in feet, and what they mean for the rules: reach, range bands,
// how far a move goes, a clear line, and who an area effect catches. Positions are squares (c.x, c.y); the
// feet come from b.grid.squareFt. Range bands come from range.js, area sizes from range.js AREA_BASE, and the
// templates from mapgeo.js, so the Battle Room and the map tools agree.
import { bandFor, rangeBands } from '../range.js';
import { sightLine, insideTemplate } from '../mapgeo.js';
import { activeConditions } from './conditions.js';
import { alive } from './util.js';

/** Squares between two positions: sideways, up and down and diagonal steps all count one. */
export const squares = (p, q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
/** Feet between two positions. */
export const feet = (b, p, q) => squares(p, q) * b.grid.squareFt;
export const sameSquare = (p, q) => p.x === q.x && p.y === q.y;

/**
 * How many squares short a Cone or Line is of the target: these start at the attacker and stretch only as far as
 * their length (DCA 126), so being in range is not enough. 0 when it reaches, and always 0 for other attacks. The
 * slack matches mapgeo's insideTemplate, which catches a token whose centre is within 0.3 squares of the end.
 */
export function templateShort(b, c, atk, t) {
  if (atk.area !== 'Cone' && atk.area !== 'Line') return 0;
  const length = atk.areaFt / b.grid.squareFt + 0.3;
  return Math.max(0, Math.hypot(t.x - c.x, t.y - c.y) - length);
}
export const spot = (c) => ({ x: c.x, y: c.y });

/** Squares per move action: the fighter's move distance in feet over the square size, at least 1 (0 when it cannot move). */
export function squaresInMove(b, c) {
  const s = activeConditions(c);
  if (s.has('Immobile') || c.grabbedBy || c.noMove) return 0; // noMove: the move action went on standing up
  const ft = (c.moveFt ?? 30) / (s.has('Hindered') ? 2 : 1);
  return Math.max(1, Math.floor(ft / b.grid.squareFt));
}

/**
 * How many squares away a close attack can reach: the same or an adjacent square, plus the feet of the fighter's
 * Elongation and of the attack's Reach. A close area reaches as far as its template certainly covers.
 */
export function reachSquares(b, c, atk = null) {
  const sq = b.grid.squareFt;
  if (atk?.area && atk.range === 'close') return Math.max(1, Math.floor((atk.areaFt / sq + 0.3) / Math.SQRT2));
  return 1 + Math.floor(((c.elongFt || 0) + (atk?.reachFt || 0)) / sq);
}
export const inReach = (b, c, t, atk = null) => squares(c, t) <= reachSquares(b, c, atk);

/** Which range band the target is in for this attack: { band: 'short' | 'medium' | 'long' | 'out', penalty, ft }. */
export function bandFrom(b, c, atk, t) {
  return { ...bandFor(feet(b, c, t), Math.max(1, atk.rank), atk.ext || 0), dist: feet(b, c, t) };
}

/** The squares a straight line from one position to another passes through, not counting either end. */
export function lineSquares(p, q) {
  const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) * 8));
  const seen = new Set();
  const out = [];
  for (let i = 1; i < steps; i++) {
    const x = Math.floor(p.x + 0.5 + ((q.x - p.x) * i) / steps);
    const y = Math.floor(p.y + 0.5 + ((q.y - p.y) * i) / steps);
    const key = `${x},${y}`;
    if (seen.has(key) || (x === p.x && y === p.y) || (x === q.x && y === q.y)) continue;
    seen.add(key);
    out.push({ x, y });
  }
  return out;
}

const wallMaps = new WeakMap();
/** The walls as a map for mapgeo's sightLine, or null when no wall can stand between two playable squares. */
function wallMap(b) {
  const walls = b.grid.walls;
  const hit = wallMaps.get(walls);
  if (hit && hit.n === walls.length) return hit.map;
  const inner = walls.filter((w) => w.x >= b.grid.play.x0 && w.x <= b.grid.play.x1 && w.y >= b.grid.play.y0 && w.y <= b.grid.play.y1);
  const map = inner.length ? { terrain: Object.fromEntries(inner.map((w) => [`${w.x},${w.y}`, 'wall'])), props: [] } : null;
  wallMaps.set(walls, { n: walls.length, map });
  return map;
}

/** Is there a line of sight: no wall square between the two positions? (Cover pieces are handled in cover.js.) */
export function lineClear(b, p, q) {
  const map = wallMap(b);
  if (!map) return true;
  return !sightLine(map, { x: p.x, y: p.y, size: 1 }, { x: q.x, y: q.y, size: 1 }).blocked;
}

/** Can this attack reach the target from where the two now stand? Close needs reach, ranged a band, the rest a line. */
export function inRangeNow(b, c, atk, t) {
  if (atk.range === 'close') return inReach(b, c, t, atk);
  if (atk.range === 'ranged' && bandFrom(b, c, atk, t).band === 'out') return false;
  return lineClear(b, c, t);
}

/** The spot an area template is centered on or starts from, and where it points. */
function templateOf(c, atk, t) {
  const at = (p) => ({ x: p.x + 0.5, y: p.y + 0.5 });
  const shape = atk.area === 'Cone' || atk.area === 'Line' ? atk.area : 'Burst';
  if (shape === 'Burst') return { shape, ft: atk.areaFt, ...at(atk.range === 'close' ? c : t) };
  const o = at(c); const p = at(t);
  return { shape, ft: atk.areaFt, from: c.id, ox: o.x, oy: o.y, x: p.x, y: p.y };
}

/** Who an area attack by c aimed at t catches (friends included, c itself not). */
export function areaVictims(b, c, atk, t) {
  const tokens = {};
  const people = alive(b).filter((x) => x !== c);
  for (const x of people) tokens[x.id] = { x: x.x, y: x.y, size: 1 };
  tokens[c.id] = { x: c.x, y: c.y, size: 1 };
  const hit = new Set(insideTemplate(templateOf(c, atk, t), tokens, b.grid.squareFt));
  return people.filter((x) => hit.has(x.id));
}

/** The cover pieces an area attack by c aimed at t catches. */
export function areaPieces(b, c, atk, t, pieces) {
  const tokens = Object.fromEntries(pieces.map((p) => [p.id, { x: p.x, y: p.y, size: 1 }]));
  tokens[c.id] = { x: c.x, y: c.y, size: 1 };
  const hit = new Set(insideTemplate(templateOf(c, atk, t), tokens, b.grid.squareFt));
  return pieces.filter((p) => hit.has(p.id));
}

/** Within interaction range for Aid and Leadership: the same or an adjacent square, or within 30 ft, whichever is larger. */
export const interacts = (b, p, q) => squares(p, q) <= 1 || feet(b, p, q) <= 30;
/** Within earshot (60 ft) of a minion group's Demoralize. */
export const inEarshot = (b, p, q) => feet(b, p, q) <= 60;

/** The longest short range (no penalty) of any of the fighter's ranged attacks with an attack roll, in feet; 0 when it has none. */
export const shortRangeFt = (c) => Math.max(0, ...c.attacks.filter((a) => a.range === 'ranged' && a.roll).map((a) => rangeBands(Math.max(1, a.rank), a.ext || 0)[0].ft));
/** How close a shooter wants to get: the squares inside its short range, at least 1. */
export const shootSquares = (b, c) => Math.max(1, Math.floor(shortRangeFt(c) / b.grid.squareFt));
/** The most squares that still leave two positions within earshot (60 ft). */
export const earshotSquares = (b) => Math.floor(60 / b.grid.squareFt);
