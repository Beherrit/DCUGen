// Small fighters and scripted dice for the rule tests: a plain character with chosen advantages, an arena that places them
// on the grid, and a die that gives exactly the rolls the test names.
import assert from 'node:assert/strict';
import { RULES as R } from '../../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle } from '../../src/engine/battle.js';
import { syncGrid } from '../../src/engine/battle/grid.js';

export { R };

/** A plain level-10 character. `abilities`, `skills`, `advantages` and `defenses` are merged over the plain ones. */
export function body({ abilities = {}, defenses = {}, skills = [], advantages = [] } = {}) {
  return {
    pl: 10, abilities: { Strength: 4, Stamina: 4, Agility: 4, Dexterity: 2, Fighting: 8, Intellect: 0, Awareness: 2, Presence: 2, ...abilities },
    defenses: { Parry: 6, Dodge: 6, ...defenses }, skills, advantages, powers: [],
  };
}

/** Scripted d20 rolls, in order; asking for more than were given fails the test. `left()` says how many were not used. */
export function dice(...rolls) {
  return {
    int: () => { assert.ok(rolls.length, 'the engine asked for more dice than the test gave'); return rolls.shift(); },
    chance: () => true, next: () => 0.5, pick: (a) => a[0], weighted: (a) => a[0],
    left: () => rolls.length,
  };
}

/**
 * A started battle with the given fighters, [id, team, character options, { x, y }] each. Fighters stand side by side along
 * the top row unless a place is given (squares are 5 ft). The log is cleared.
 */
export function arena(list, options = {}) {
  const b = createBattle({ seed: 'fortune' });
  Object.assign(b.options, { scale: 'street' }, options); // 5 ft squares: interaction range is 6 squares
  syncGrid(b);
  for (const [id, team, ch] of list) addCombatant(b, makeCombatant(R, body(ch), { id, team, name: id }));
  startBattle(b, R);
  list.forEach(([id, , , at], k) => { const c = b.combatants.find((x) => x.id === id); Object.assign(c, at || { x: k, y: 0 }); });
  b.log.length = 0;
  return b;
}
export const fighter = (b, id) => b.combatants.find((c) => c.id === id);
export const lastLog = (b) => b.log.at(-1)?.text ?? '';
