# Battle engine modules

`src/engine/battle.js` is a thin facade that re-exports the public names (the header comment there says what is and
is not simulated). The code is split by job:

- `util.js`: the per-turn random stream, the log, dice, small helpers, who is alive.
- `checks.js`: the one way to resolve a check: degrees, the natural 20 critical success, opposed checks with the tie rule, `rollCheck` for resistance and other checks against a DC. Every check except attack rolls and initiative goes through it. A check can carry a fortune hook (`fx`) that re-rolls it or fixes it at 20.
- `constants.js`: the round limit.
- `grid.js`: the 12 by 12 grid (`b.grid`), its scales (street 5 ft, block 30 ft, district 250 ft), the wall ring of an enclosed room, square names, and turning old saved zones into squares. `geometry.js`: distances in squares and feet, reach, range bands, a clear line, moves per turn, area templates. `path.js`: walking (around walls and cover), reachable squares, the best square to back off to. `placement.js`: teams on their edges and where an ambush puts fighters. `trace.js`: the optional `b.trace` record the grid tests read.
- `styles.js`: fighting styles, targeting tactics, `detectStyle`.
- `conditions.js`: Afflictions parsed into conditions, `activeConditions`, defenses, `canAct`.
- `combatant.js`: building and rebuilding a combatant from a character.
- `odds.js`: hit and resistance odds, immunity, `expectedValue`, range and concealment.
- `plan.js`: the best attack against a target, the trade-off, and `choosePlan`.
- `turn.js`: `takeTurn` and the checks that can end a turn early. `turn-attack.js`: the attacking half of a turn.
- `movement.js`: `moveTo` (logs the squares and feet), `moveToward`.
- `attack-roll.js`: attack wording, the to-hit modifier and roll, the Defend roll, the hero point re-roll. `deflect.js`: Deflect, who can deflect for whom and the roll that raises the number to beat. `deflect-plan.js`: when a fighter takes the Defend action to deflect. `reflect.js`: the log line for a deflection and Reflect and Redirect.
- `build-report.js`: which of a fighter's powers, modifiers, advantages and skills the simulator uses and which it ignores, read from the shipped coverage list (`src/generated/battle-coverage.js`, made from `tools/battle-coverage/coverage.json` by `node tools/build.mjs data` or `node tools/battle-coverage/report.mjs`).
- `attacks.js`: `resolveAttack`, Interpose, Fast Grab, Takedown, area attacks.
- `attack-effects.js`: what a hit does (damage, Weaken, Affliction, Nullify).
- `maneuvers.js`: feint, grab, escape, release. `support.js`: healing, hero points, Recover, Regeneration.
- `points.js`: who can pay for a re-roll (hero points, Luck) and the payment. `fortune.js`: hero points and Luck on a fighter's own checks (Improve Roll, the hooks `checkFx`, `resistFx`, `dodgeFx`, `recoveryFx`, `plainFx`) and Ultimate Effort. `luck.js`: Luck Control (grant, bestow, negate, force a worse re-roll), who may use it and what it does; `luck-attack.js`: when it is worth using on attack rolls. `fortune-kinds.js`: which checks an Ultimate Effort covers and which skills a Daze uses. `feat.js`: Heroic Feat (Interpose to save an ally, Power or All-out Attack for a finishing blow). `fortune-turn.js`: recovering from fatigue, Leadership and Inspire. `tricks.js`: the feint skill (Agile Feint, Startle) and Set-up. `daze.js`: Daze and when the AI uses it.
- `end-of-turn.js`: recovery checks and the weakened traits coming back.
- `battle-flow.js`: create, start, ambush, join, step, round, run to the end.
- `tactics.js`: team tactics, the small hooks the turn code calls (all neutral when a team has none). `tactics-list.js`: the list and `tacticOf`. `tactics-marks.js`: focus and lockdown targets, the VIP. `tactics-position.js`: the line, the guard, kiting (squares, not zones).
- `materials.js`: building materials, `toughnessOf` (the doubling rule) and the `COVER_KINDS` presets.
- `cover.js`: cover pieces (`b.cover`), their levels, who stands behind one, the attack penalty and Dodge bonus. `cover-damage.js`: hurting a piece (hole or destroy), shooting through cover, area attacks on scenery. `cover-plan.js`: when the AI shoots the cover itself.
- `support-actions.js`: Demoralize and Aid, and how they wear off. `support-plan.js`: when a fighter demoralizes or aids instead of attacking (its own judgement, and the Intimidate and Break and Aid the Champion tactics). `tactics-support.js`: who demoralizes, who the champion is, the flee chance. `tactics-withdraw.js`: the Fighting Withdrawal tactic (escape, rearguard, the hold-out win).
- `prone.js`: the prone state, the attack-check change from it (and Prone Fighting), falling prone. `stand.js`: standing up (the Stand action, DC 20 Acrobatics, Instant Up) and dropping prone on purpose.
- `items.js`: the items behind a fighter's attacks (held or worn, Toughness) and losing one. `maneuver-checks.js`: the attack check and the opposed check (`contest`) the maneuvers share. `trip.js`, `disarm.js`, `smash.js`: the three maneuvers and their odds. `plan-maneuvers.js`: when the AI picks one. `maneuver-run.js`: carrying the chosen one out.
- `move-by.js`: stepping away from melee threats before a shot (kiting) and the Move-by Action split (after the attack).
- `knockback.js`: the optional knockback rule, mass rank, flight and collisions. `tactics-cover.js`: the Take Cover tactic.
- `summaries.js`: status lines, battle text, many-run tallies, save and load.

The app is bundled by tools/build.mjs, which does not allow import cycles, so keep imports flowing one way: util,
constants and checks at the bottom, then styles, conditions, fortune-kinds, points, deflect, luck, combatant, materials, cover, odds, fortune, tricks, feat, support-actions, prone, items, the tactics files, plan-maneuvers, plan, movement, maneuvers, support, fortune-turn, daze, support-plan, deflect-plan, attack-effects,
luck-attack, attack-roll, cover-damage, knockback, reflect, attacks, turn-attack, turn, end-of-turn, battle-flow and summaries on top. The grid files sit low: grid, then geometry (which needs conditions), path, trace and placement, all before cover and movement.
