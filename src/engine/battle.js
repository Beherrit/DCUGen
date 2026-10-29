// The Battle Room: a seeded fight simulator built on the DC Adventures combat rules (DCA ch. 8).
//
// Combatants come from any character, creature or minion in the app. Each one fights in a style
// that fits its build (a brawler closes in, a blaster keeps its distance, a spellcaster rotates
// its effects, a beast lunges and grabs, minions mob and break) and the log tells the fight as it
// happens: every attack roll, resistance check, condition, hero point and extra effort.
//
// Deterministic: a battle has a seed and a tick, and each turn uses makeRng(`${seed}::${tick}`),
// so a saved battle resumes exactly and a re-run with the same seed replays the same fight.
//
// What is simulated: attack rolls against defense + 10, Toughness checks with cumulative bruises,
// dazed / staggered / incapacitated, minions going down on any failed check, Afflictions with their
// three degrees and end-of-turn recovery (Cumulative, Progressive, Limited Degree, Extra Condition),
// Weaken, Nullify on sustained defenses, Area effects with Dodge for half, Multiattack, Penetrating
// vs Impervious, Immunity by descriptor and defense, Concealment misses, Healing and Regeneration,
// Power / Accurate / All-out / Defensive Attack trade-offs, feints, grabs (restrained and bound),
// Takedown, Interpose, Evasion, Luck, Seize Initiative, Fearless, hero points (improve a roll,
// recover) and extra effort with fatigue, range bands and movement, prone, vulnerable, defenseless.
// Not simulated: Summon, Create, Illusion, Deflect, Insubstantial, Environment, cover. Team attacks are simulated for minion squads.
//
// The code lives in src/engine/battle/ (see README.md there); this file keeps the names the rest of the app imports.

import { ARENA, ENCLOSED_ARENA, arenaOf, MAX_ROUNDS } from './battle/constants.js';
import { STYLES, TACTICS, detectStyle } from './battle/styles.js';
import { parseAffliction, activeConditions, conditionLabels } from './battle/conditions.js';
import { makeCombatant, rebuildCombatant } from './battle/combatant.js';
import { hitOdds, resistOdds } from './battle/odds.js';
import { createBattle, addCombatant, removeCombatant, placeAll, startBattle, joinBattle, step, runRound, runToEnd } from './battle/battle-flow.js';
import { byId } from './battle/util.js';
import { statusLine, battleText, simulateMany, serializeBattle, reviveBattle } from './battle/summaries.js';

export { ARENA, ENCLOSED_ARENA, arenaOf, MAX_ROUNDS, STYLES, TACTICS, detectStyle, parseAffliction, makeCombatant, rebuildCombatant, activeConditions, conditionLabels, hitOdds, resistOdds, createBattle, addCombatant, removeCombatant, placeAll, startBattle, byId, joinBattle, step, runRound, runToEnd, statusLine, battleText, simulateMany, serializeBattle, reviveBattle };
