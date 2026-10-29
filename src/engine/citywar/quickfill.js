// Quick fill: a whole city of teams in one go. Twelve gangs of generated characters spread over the map, each with a
// different team tactic and a plain, invented city-gang name.

import { makeRng } from '../rng.js';
import { generateCharacter } from '../generator.js';
import { TEAM_TACTICS } from '../battle.js';
import { addTeam, teamAt } from './war.js';

/** Invented names. Plain city gangs: nothing from the books and no real organizations. */
export const GANG_NAMES = [
  'Harbor Kings', 'Ninth Street', 'Neon Saints', 'Rust Belt Crew', 'Canal Street Wolves', 'Copper Row', 'Dockside Ravens',
  'Iron Alley', 'Lantern Hill Boys', 'Old Mill Gang', 'Quarry Dogs', 'Red Brick Union', 'Salt Flat Riders', 'Tin Roof Gang',
  'Tannery Row', 'Vine Street Foxes', 'Westgate Crows', 'Gaslight Mob', 'Brickyard Bulls', 'Midnight Row', 'Bridge Street Hounds',
  'Pier Nine', 'Cinder Lane', 'Foundry Hill Crew',
];

/** Team colors that stay apart on the map. */
export const GANG_COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a8b', '#a04000', '#5d6d7e', '#c2185b', '#6b8e23', '#283593', '#8d6e63'];

const FIGHTERS = ['paragon', 'powerhouse', 'speedster', 'blaster', 'crimefighter', 'martialartist', 'weaponmaster', 'gadgeteer', 'battlesuit', 'mystic', 'psychic', 'shapeshifter', 'sizechanger', 'totem', 'elemental', 'infiltrator', 'mastermind', 'healer', 'android', 'robot'];
export const TACTIC_IDS = Object.keys(TEAM_TACTICS).filter((id) => id !== 'none');

/** One start cell per team, spread over the map: the map is cut into regions and each team takes a random cell in its own. */
function spreadCells(war, rng, count) {
  const cols = Math.ceil(Math.sqrt(count)); const rows = Math.ceil(count / cols);
  const cw = war.size / cols; const ch = war.size / rows;
  const free = (x, y) => !teamAt(war, x, y);
  return rng.shuffle(Array.from({ length: count }, (_, k) => k)).map((k) => {
    const x0 = Math.floor((k % cols) * cw); const y0 = Math.floor(Math.floor(k / cols) * ch);
    const x1 = Math.max(x0, Math.min(war.size - 1, Math.floor(((k % cols) + 1) * cw) - 1)); const y1 = Math.max(y0, Math.min(war.size - 1, Math.floor((Math.floor(k / cols) + 1) * ch) - 1));
    for (let tries = 0; tries < 30; tries++) { const x = rng.int(x0, x1); const y = rng.int(y0, y1); if (free(x, y)) return { x, y }; }
    for (let y = 0; y < war.size; y++) for (let x = 0; x < war.size; x++) if (free(x, y)) return { x, y };
    return null;
  });
}

/**
 * Add `teams` teams of `size` generated characters at power level `pl`. Existing teams stay. Each team gets the next
 * tactic in the list, starting from a seeded place. Returns the new teams.
 */
export function quickFill(war, R, { teams = 12, size = 3, pl = 10 } = {}) {
  const rng = makeRng(`${war.seed}::quickfill::${war.teams.length}`);
  const base = war.teams.length;
  const taken = new Set(war.teams.map((t) => t.name));
  const names = rng.shuffle(GANG_NAMES.filter((n) => !taken.has(n)));
  const first = rng.int(0, TACTIC_IDS.length - 1);
  const cells = spreadCells(war, rng, teams);
  const made = [];
  for (let k = 0; k < teams; k++) {
    if (!cells[k]) break;
    const members = Array.from({ length: size }, (_, j) => generateCharacter(R, { seed: `${war.seed}::t${base + k}::m${j}`, pl, archetype: rng.pick(FIGHTERS) }));
    made.push(addTeam(war, { name: names[k] || `Gang ${base + k + 1}`, color: GANG_COLORS[(base + k) % GANG_COLORS.length], tactic: TACTIC_IDS[(first + k) % TACTIC_IDS.length], members, ...cells[k] }));
  }
  return made;
}
