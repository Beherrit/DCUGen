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
- `materials.js`: building materials, `toughnessOf` (the doubling rule) and the `COVER_KINDS` presets.
- `cover.js`: cover pieces (`b.cover`), their levels, who stands behind one, the attack penalty and Dodge bonus. `cover-damage.js`: hurting a piece (hole or destroy), shooting through cover, area attacks on scenery. `cover-plan.js`: when the AI shoots the cover itself.
- `support-actions.js`: Demoralize and Aid, and how they wear off. `support-plan.js`: when a fighter demoralizes or aids instead of attacking (its own judgement, and the Intimidate and Break and Aid the Champion tactics). `tactics-support.js`: who demoralizes, who the champion is, the flee chance. `tactics-withdraw.js`: the Fighting Withdrawal tactic (escape, rearguard, the hold-out win).
- `knockback.js`: the optional knockback rule, mass rank, flight and collisions. `tactics-cover.js`: the Take Cover tactic.
- `summaries.js`: status lines, battle text, many-run tallies, save and load.

The app is bundled by tools/build.mjs, which does not allow import cycles, so keep imports flowing one way: util and
constants at the bottom, then styles, conditions, combatant, materials, cover, odds, support-actions, the tactics files, plan, movement, maneuvers, support, support-plan, attack-effects,
attack-roll, cover-damage, knockback, attacks, turn-attack, turn, end-of-turn, battle-flow and summaries on top.
