// The battle grid: 12 by 12 squares, each 5, 30 or 250 feet across, plus the walls of an enclosed room.
// b.grid = { w, h, squareFt, walls: [{ x, y }], play: { x0, y0, x1, y1 } } is rebuilt from the options by syncGrid.
// Fighters stand on squares (c.x, c.y); several may share a square (same square counts as in reach).

export const GRID_SIZE = 12;
/** The scales the Battle Room can be played at: feet per square. */
export const SCALES = {
  street: { ft: 5, label: 'Street', blurb: 'Squares of 5 ft, the scale of a brawl on one street.' },
  block: { ft: 30, label: 'Block', blurb: 'Squares of 30 ft, a city block; the default.' },
  district: { ft: 250, label: 'District', blurb: 'Squares of 250 ft, a neighborhood; only big ranges matter.' },
};
export const DEFAULT_SCALE = 'block';
/** An enclosed space is a room 60 ft across made of 5 ft squares, whatever the scale option says. */
export const ENCLOSED_SCALE = 'street';

export const scaleOf = (options) => (options?.enclosed ? ENCLOSED_SCALE : SCALES[options?.scale] ? options.scale : DEFAULT_SCALE);
export const squareFtOf = (options) => SCALES[scaleOf(options)].ft;

const onRing = (x, y) => x === 0 || y === 0 || x === GRID_SIZE - 1 || y === GRID_SIZE - 1;

/** The outer ring of an enclosed room, as wall squares. */
function ringWalls() {
  const out = [];
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) if (onRing(x, y)) out.push({ x, y });
  return out;
}

/** Bring b.grid in line with the options (scale and enclosed). Walls other than the ring are kept. */
export function syncGrid(b) {
  const enclosed = !!b.options?.enclosed;
  const custom = (b.grid?.walls || []).filter((w) => !onRing(w.x, w.y));
  const lo = enclosed ? 1 : 0;
  const hi = GRID_SIZE - 1 - lo;
  b.grid = { w: GRID_SIZE, h: GRID_SIZE, squareFt: squareFtOf(b.options), walls: [...(enclosed ? ringWalls() : []), ...custom], play: { x0: lo, y0: lo, x1: hi, y1: hi } };
  return b.grid;
}

const wallSets = new WeakMap();
/** Is there a wall on this square? */
export function isWall(b, x, y) {
  const walls = b.grid.walls;
  let cached = wallSets.get(walls);
  if (!cached || cached.n !== walls.length) { cached = { n: walls.length, set: new Set(walls.map((w) => `${w.x},${w.y}`)) }; wallSets.set(walls, cached); }
  return cached.set.has(`${x},${y}`);
}

/** Inside the grid at all (walls count as inside). */
export const inGrid = (b, x, y) => x >= 0 && y >= 0 && x < b.grid.w && y < b.grid.h;
/** A square a fighter can stand on: inside the playing area and not a wall. */
export const isPlayable = (b, x, y) => x >= b.grid.play.x0 && x <= b.grid.play.x1 && y >= b.grid.play.y0 && y <= b.grid.play.y1 && !isWall(b, x, y);
export const clampToPlay = (b, x, y) => ({ x: Math.max(b.grid.play.x0, Math.min(b.grid.play.x1, x)), y: Math.max(b.grid.play.y0, Math.min(b.grid.play.y1, y)) });

/** The name of a square as the log shows it: columns A to L, rows 1 to 12. */
export const squareName = (x, y) => `${String.fromCharCode(65 + x)}${y + 1}`;
export const spotName = (p) => squareName(p.x, p.y);

/**
 * Old saves kept a zone on a line (0 to 7, or 0 to 1 in an enclosed space): zone z becomes column round(z * 11 / 7)
 * and the middle row; in an enclosed space the two zones become the two walls.
 */
export function zoneToSquare(b, zone) {
  const z = Number(zone) || 0;
  const x = b.options?.enclosed ? (z <= 0 ? b.grid.play.x0 : b.grid.play.x1) : Math.round(z * (GRID_SIZE - 1) / 7);
  return clampToPlay(b, x, Math.floor(GRID_SIZE / 2) - 1);
}
