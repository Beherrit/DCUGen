// A city war: the map, the teams on it, the log and the fights so far. Setup helpers live here; the campaign turn is
// in step.js and the fights in fight.js.

import { generateTerrain, terrainAt } from './terrain.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

export function createCityWar({ seed = 'city', size = 12 } = {}) {
  return { seed: String(seed), size, cells: generateTerrain(seed, size), teams: [], log: [], turn: 0, status: 'setup', winner: null, battles: [], nextTeam: 1 };
}

/** Teams still in the war. */
export const standingTeams = (war) => war.teams.filter((t) => t.status === 'alive');
export const teamById = (war, id) => war.teams.find((t) => t.id === id) || null;
/** The team on a cell, if any (only teams still in the war hold a cell). */
export const teamAt = (war, x, y) => standingTeams(war).find((t) => t.x === x && t.y === y) || null;

/** Members who can still fight. */
export const fighters = (team) => team.members.map((m, i) => ({ m, i, s: team.state[i] })).filter((f) => !f.s.out);
export const hurtCount = (team) => team.state.filter((s) => s.out || s.bruises > 0 || s.fatigue > 0).length;
export const outCount = (team) => team.state.filter((s) => s.out).length;
const freshState = () => ({ out: false, bruises: 0, fatigue: 0 });

/** A character kept by value, without the bulky extras (life story, portrait) a fight never needs. */
export function slimCharacter(ch) {
  const copy = clone(ch);
  delete copy.bio;
  if (typeof copy.portrait === 'string' && copy.portrait.length > 2000) delete copy.portrait;
  return copy;
}

/**
 * Put a team on the map. members are character objects (kept by value). One team per cell: a team placed on a
 * taken or off-map cell is refused with an error. Returns the team.
 */
export function addTeam(war, { name, color = '#4a6fa5', tactic = 'none', members = [], x, y }) {
  if (x < 0 || y < 0 || x >= war.size || y >= war.size || !Number.isInteger(x) || !Number.isInteger(y)) throw new Error('That cell is off the map.');
  if (teamAt(war, x, y)) throw new Error('Another team already holds that cell.');
  const id = `T${war.nextTeam++}`;
  const team = {
    id, name: name || `Team ${war.nextTeam - 1}`, color, tactic, x, y, start: { x, y }, status: 'alive', resting: false,
    members: members.map(slimCharacter), state: members.map(freshState), lastFight: -9, fights: 0, won: 0, kos: 0, outTurn: null,
  };
  war.teams.push(team);
  return team;
}

export function removeTeam(war, id) {
  war.teams = war.teams.filter((t) => t.id !== id);
}

/** Move a team to another free cell during setup. Returns false when the cell is taken or off the map. */
export function moveTeam(war, id, x, y) {
  const team = teamById(war, id);
  if (!team || x < 0 || y < 0 || x >= war.size || y >= war.size) return false;
  const other = teamAt(war, x, y);
  if (other && other.id !== id) return false;
  team.x = x; team.y = y; team.start = { x, y };
  return true;
}

/** Start the campaign over on the same map and teams (and the same seed, so it plays out the same way). */
export function resetCity(war) {
  war.log = []; war.battles = []; war.turn = 0; war.status = 'setup'; war.winner = null;
  for (const t of war.teams) {
    Object.assign(t, { x: t.start.x, y: t.start.y, status: 'alive', resting: false, state: t.members.map(freshState), lastFight: -9, fights: 0, won: 0, kos: 0, outTurn: null });
  }
  return war;
}

/** Make a new campaign out of this one: the same map and teams, a different seed for the dice. */
export function withSeed(war, seed) {
  war.seed = String(seed);
  return resetCity(war);
}

/** Is the cell where this team stands a building, street or park? */
export const terrainOf = (war, team) => terrainAt(war, team.x, team.y);

/** A full copy of a war (the odds runs play copies and leave the setup alone). */
export const copyCity = (war) => clone(war);

/** Save and load: a plain JSON object, characters by value. */
export const serializeCity = (war) => clone(war);
export function reviveCity(data) {
  const war = { ...createCityWar({ seed: data?.seed || 'city', size: data?.size || 12 }), ...clone(data || {}) };
  if (!Array.isArray(war.cells) || war.cells.length !== war.size * war.size) war.cells = generateTerrain(war.seed, war.size);
  war.teams ||= []; war.log ||= []; war.battles ||= [];
  war.nextTeam = Math.max(war.nextTeam || 1, 1 + Math.max(0, ...war.teams.map((t) => Number(String(t.id).replace(/\D/g, '')) || 0)));
  return war;
}
