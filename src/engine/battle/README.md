# Battle engine modules

`src/engine/battle.js` is a thin facade that re-exports the public names (the header comment there says what is and
is not simulated). The code is split by job:

- `util.js`: the per-turn random stream, the log, dice, small helpers, who is alive.
- `constants.js`: arena size and the round limit.
- `styles.js`: fighting styles, targeting tactics, `detectStyle`.
- `conditions.js`: Afflictions parsed into conditions, `activeConditions`, defenses, `canAct`, `moveZones`.
- `combatant.js`: building and rebuilding a combatant from a character.
- `odds.js`: hit and resistance odds, immunity, `expectedValue`, range and concealment.
- `plan.js`: the best attack against a target, the trade-off, and `choosePlan`.
- `turn.js`: `takeTurn` and the checks that can end a turn early. `turn-attack.js`: the attacking half of a turn.
- `movement.js`: `moveTo`, `moveToward`.
- `attack-roll.js`: attack wording, the to-hit modifier and roll, the hero point re-roll.
- `attacks.js`: `resolveAttack`, Interpose, Fast Grab, Takedown, area attacks.
- `attack-effects.js`: what a hit does (damage, Weaken, Affliction, Nullify).
- `maneuvers.js`: feint, grab, escape, release. `support.js`: healing, hero points, Recover, Regeneration.
- `end-of-turn.js`: recovery checks and the weakened traits coming back.
- `battle-flow.js`: create, start, ambush, join, step, round, run to the end.
- `tactics.js`: team tactics, the small hooks the turn code calls (all neutral when a team has none). `tactics-list.js`: the list and `tacticOf`. `tactics-marks.js`: focus and lockdown targets, the VIP. `tactics-position.js`: the line, the guard, kiting.
- `summaries.js`: status lines, battle text, many-run tallies, save and load.

The app is bundled by tools/build.mjs, which does not allow import cycles, so keep imports flowing one way: util and
constants at the bottom, then styles, conditions, combatant, odds, the tactics files, plan, movement, maneuvers, support, attack-effects,
attack-roll, attacks, turn-attack, turn, end-of-turn, battle-flow and summaries on top.
