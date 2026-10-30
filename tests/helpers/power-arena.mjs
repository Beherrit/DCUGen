// Fighters with powers for the Deflect, Luck Control and Throwing Mastery tests: a plain character (helpers/fighters.mjs)
// with chosen powers, placed on the grid. Squares are 5 ft unless the test asks for another scale.
import { R, body, dice } from './fighters.mjs';
import { createBattle, addCombatant, makeCombatant, startBattle } from '../../src/engine/battle.js';
import { syncGrid } from '../../src/engine/battle/grid.js';

export { R, dice };

export const deflect = (rank, extras = []) => ({ name: 'Guard', effect: 'Deflect', rank, extras: extras.map((name) => ({ name })), flaws: [], role: 'utility' });
export const luckControl = (rank, detail = '') => ({ name: 'Fate', effect: 'Luck Control', rank, extras: [], flaws: [], role: 'utility', ...(detail ? { detail } : {}) });

/**
 * A started battle. Each fighter is [id, team, spec, { x, y }]: `spec` is body() options plus `powers`, `equipment`, and
 * `hp` / `luck` (hero points and Luck re-rolls to start with), `style`, or `ch` for a whole character. Hero points are on unless options say otherwise.
 */
export function powerArena(list, options = {}) {
  const b = createBattle({ seed: 'power-gaps' });
  Object.assign(b.options, { scale: 'street' }, options);
  syncGrid(b);
  for (const [id, team, spec = {}] of list) {
    const { powers = [], equipment, hp, luck, style, ch: whole, ...rest } = spec;
    const ch = whole || { ...body(rest), powers, ...(equipment ? { equipment } : {}) };
    const opts = { id, team, name: id, ...(style ? { style } : {}), ...(hp !== undefined ? { heroPoints: hp } : {}), ...(luck !== undefined ? { luck } : {}) };
    addCombatant(b, makeCombatant(R, ch, opts));
  }
  startBattle(b, R);
  list.forEach(([id, , , at], k) => { Object.assign(b.combatants.find((c) => c.id === id), at || { x: k, y: 0 }); });
  b.log.length = 0;
  return b;
}
export const who = (b, id) => b.combatants.find((c) => c.id === id);
export const unarmed = (c) => c.attacks.find((a) => a.unarmed);
export const text = (b) => b.log.map((e) => e.text).join('\n');
