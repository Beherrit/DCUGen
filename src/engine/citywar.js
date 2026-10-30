// The City War: a 12 by 12 city map where teams march on their neighbors and fight until one is left.
// The code lives in src/engine/citywar/; this file keeps the names the rest of the app imports.

import { TERRAINS, TERRAIN_LABELS, TERRAIN_MARKS, cellName, generateTerrain, terrainAt, setTerrain } from './citywar/terrain.js';
import { createCityWar, addTeam, removeTeam, moveTeam, teamAt, teamById, standingTeams, fighters, hurtCount, outCount, resetCity, withSeed, copyCity, serializeCity, reviveCity } from './citywar/war.js';
import { quickFill, GANG_NAMES, GANG_COLORS, TACTIC_IDS } from './citywar/quickfill.js';
import { stepCity } from './citywar/step.js';
import { runCity, cityOdds, playOdds, tallyOdds, newTally } from './citywar/run.js';
import { buildFightBattle, fightLabel } from './citywar/fight.js';
import { standings } from './citywar/standings.js';

export { TERRAINS, TERRAIN_LABELS, TERRAIN_MARKS, cellName, generateTerrain, terrainAt, setTerrain, createCityWar, addTeam, removeTeam, moveTeam, teamAt, teamById, standingTeams, fighters, hurtCount, outCount, resetCity, withSeed, copyCity, serializeCity, reviveCity, quickFill, GANG_NAMES, GANG_COLORS, TACTIC_IDS, stepCity, runCity, cityOdds, playOdds, tallyOdds, newTally, buildFightBattle, fightLabel, standings };
