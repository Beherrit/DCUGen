// The arena of a city war fight, chosen by the defender's block. A building is an Enclosed space (set in the options);
// a street is the 'block' scale with cars, walls and storefronts; a park is the same scale with fences and trees.
// Everything is seeded by the fight's seed, so the same fight always has the same scenery.

import { makeRng } from '../rng.js';
import { addCover, toughnessOf } from '../battle.js';

const STREET_PIECES = ['parked-car', 'parked-car', 'brick-wall', 'concrete-pillar', 'glass-storefront', 'wooden-fence'];
const PARK_PIECES = ['wooden-fence', 'wooden-fence', 'tree', 'tree', 'tree'];
const TREE = { name: 'tree', material: 'wood', inches: 12, level: 'partial' };

/** A tree: the wooden-fence preset made thicker (cover pieces have no tree preset, so it is a wooden piece with a name). */
function addTree(b, x, y) {
  const piece = addCover(b, 'wooden-fence', x, y);
  Object.assign(piece, { kind: 'tree', name: TREE.name, inches: TREE.inches, level: TREE.level, toughness: toughnessOf(TREE.material, TREE.inches) });
  return piece;
}

/**
 * Put random scenery on an open arena: 3 to 6 pieces for a street, 2 to 4 for a park, each on its own square and
 * clear of the two columns where the teams start. Does nothing for a building (the walls are the scenery).
 */
export function addScenery(b, terrain) {
  if (terrain === 'building') return [];
  const rng = makeRng(`${b.seed}::scenery`);
  const list = terrain === 'park' ? PARK_PIECES : STREET_PIECES;
  const count = terrain === 'park' ? rng.int(2, 4) : rng.int(3, 6);
  const { x0, y0, x1, y1 } = b.grid.play;
  const taken = new Set();
  const placed = [];
  for (let i = 0; i < count; i++) {
    const x = rng.int(x0 + 2, x1 - 2); const y = rng.int(y0, y1);
    if (taken.has(`${x},${y}`)) continue;
    taken.add(`${x},${y}`);
    const kind = rng.pick(list);
    placed.push(kind === 'tree' ? addTree(b, x, y) : addCover(b, kind, x, y));
  }
  return placed;
}
