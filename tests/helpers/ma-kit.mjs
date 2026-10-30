// Martial artists for the battle tests: a plain character who practices a fighting style, and an arena for them.
import { RULES as R } from '../../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle } from '../../src/engine/battle.js';
import { syncGrid } from '../../src/engine/battle/grid.js';
import { addStyle, setTier } from '../../src/engine/martial/styles.js';
import { addManeuver } from '../../src/engine/martial/maneuvers.js';
import { body } from './fighters.mjs';

export { R, body };

/**
 * A plain character who practices `style` at `tier` with the Stances advantage, `ranks` in the style's Close Combat skill, and the
 * maneuvers named (each a name or { name, rank, detail }). `adv` adds advantages: [{ name, rank, param }].
 */
export function artist({ style = 'Aikido', tier = 'student', ranks = 6, maneuvers = [], adv = [], abilities = {}, defenses = {}, pl = 10 } = {}) {
  const ch = body({ abilities, defenses, advantages: adv });
  ch.pl = pl;
  addStyle(ch, R, style, { tier: 'initiate' });
  if (tier !== 'initiate') setTier(ch, style, tier);
  const row = ch.skills.find((s) => s.spec === style || (s.name === 'Close Combat' && s.spec));
  if (row) row.ranks = ranks;
  for (const m of maneuvers) addManeuver(ch, R, style, typeof m === 'string' ? { name: m } : m);
  return ch;
}

/**
 * A started battle of the given fighters, [id, team, character, { x, y }] each, in 5 ft squares along the top row unless placed.
 * The log is cleared. Fighters keep the names they are given.
 */
export function ring(list, options = {}) {
  const b = createBattle({ seed: 'martial' });
  Object.assign(b.options, { scale: 'street' }, options);
  syncGrid(b);
  for (const [id, team, ch] of list) addCombatant(b, makeCombatant(R, ch, { id, team, name: id }));
  startBattle(b, R);
  list.forEach(([id, , , at], k) => { const c = b.combatants.find((x) => x.id === id); Object.assign(c, at || { x: k, y: 0 }); });
  b.log.length = 0;
  return b;
}

export const who = (b, id) => b.combatants.find((c) => c.id === id);
export const choice = (c, name) => c.ma.choices.find((x) => x.name === name);
export const texts = (b) => b.log.map((e) => e.text);
