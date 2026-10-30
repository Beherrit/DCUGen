// The city map: a square grid of cells, each 'street' (open ground), 'building' (enclosed) or 'park' (open ground
// where a resting team is hidden). Terrain comes from the seed: streets in rows and columns every 3 or 4 cells,
// buildings in the blocks between, parks as small clusters.

import { makeRng } from '../rng.js';

export const TERRAINS = ['street', 'building', 'park'];
export const TERRAIN_LABELS = { street: 'a street', building: 'a building', park: 'a park' };
/** The one-letter mark on the map, for people who cannot tell the shades apart. */
export const TERRAIN_MARKS = { street: 'S', building: 'B', park: 'P' };
const PARK_SHARE = 0.15;

/** Chess-style cell name: columns A to L, rows 1 to 12. */
export const cellName = (x, y) => `${String.fromCharCode(65 + x)}${y + 1}`;

/** Positions of the street lines along one axis: every 3 or 4 cells, starting a little in from the edge. */
function streetLines(rng, size) {
  const lines = new Set();
  for (let at = rng.int(1, 2); at < size; at += rng.int(3, 4)) lines.add(at);
  return lines;
}

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Grow one park out from a building cell: up to `want` cells, spreading over neighbors that are not parks yet. */
function growPark(rng, cells, size, from, want) {
  const frontier = [from];
  let made = 0;
  while (frontier.length && made < want) {
    const i = frontier.splice(rng.int(0, frontier.length - 1), 1)[0];
    if (cells[i].terrain === 'park') continue;
    cells[i].terrain = 'park';
    made++;
    const x = i % size; const y = Math.floor(i / size);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) frontier.push(ny * size + nx);
    }
  }
  return made;
}

/** The cells of a size by size city, from a seed. The same seed always gives the same map. */
export function generateTerrain(seed, size = 12) {
  const rng = makeRng(`${seed}::terrain`);
  const rows = streetLines(rng, size);
  const cols = streetLines(rng, size);
  const cells = Array.from({ length: size * size }, (_, i) => ({ terrain: rows.has(Math.floor(i / size)) || cols.has(i % size) ? 'street' : 'building' }));
  let parks = 0;
  const want = Math.round(size * size * PARK_SHARE);
  for (let guard = 0; parks < want && guard < 200; guard++) {
    const open = cells.map((c, i) => (c.terrain === 'building' ? i : -1)).filter((i) => i >= 0);
    if (!open.length) break;
    parks += growPark(rng, cells, size, rng.pick(open), Math.min(want - parks, rng.int(2, 5)));
  }
  return cells;
}

export const terrainAt = (war, x, y) => war.cells[y * war.size + x]?.terrain || 'street';

/** Change one cell. Returns false when the cell or the terrain is not valid. */
export function setTerrain(war, x, y, terrain) {
  if (!TERRAINS.includes(terrain) || x < 0 || y < 0 || x >= war.size || y >= war.size) return false;
  war.cells[y * war.size + x] = { terrain };
  return true;
}
