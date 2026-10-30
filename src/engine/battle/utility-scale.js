// The exchange rates between the options of a turn, measured in the simulator rather than guessed. Utilities are in the units
// of an attack's expected degrees of harm (odds.js expectedValue); each gain below is a change in the chance that the team
// wins, found by stopping a live fight at a mid-fight moment, changing one thing and replaying the same 40 futures
// (250 moments each; the standard error of each gain is about 0.005). Dividing a gain by K_ATTACK turns it into those units.
//
// - An attack turn is worth 0.021 chance of winning on average, and its utility averages 1.95 over 480 turns (each taken away
//   in turn and replayed): K_ATTACK is 0.0107 chance per unit.
// - Taking one damage condition off an ally is worth 0.028, whether the condition is a bruise or staggered. The old guess
//   (staggered worth almost three bruises, with a further 1.5 for urgency) was not borne out.
// - Making the most dangerous enemy lose one turn is worth 0.024. That enemy's expected harm per round averaged 1.74 units.

export const K_ATTACK = 0.0107;
const HEAL_GAIN = 0.028;
const LOST_TURN_GAIN = 0.024;
const FOE_HARM = 1.74;
/** A half turn (dazed: a standard action only) counts as this share of a turn: dazing the most dangerous enemy gained 0.012 against 0.024 for a lost turn. */
const HALF_TURN = 0.5;

/** What taking one bruise or the staggered condition off an ally is worth. */
export const CONDITION_WORTH = HEAL_GAIN / K_ATTACK;
/** What taking the dazed condition off an ally is worth. */
export const DAZED_WORTH = HALF_TURN * LOST_TURN_GAIN / K_ATTACK;
/** A lost enemy turn is worth this many times the enemy's own expected harm per round. */
export const TURN_PER_HARM = LOST_TURN_GAIN / K_ATTACK / FOE_HARM;
