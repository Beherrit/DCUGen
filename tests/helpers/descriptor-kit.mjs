// Shared fixtures for the descriptor, Immunity and Insubstantial tests: small powers, a paragon with its powers replaced,
// an arena of two sides and scripted dice.
import assert from 'node:assert/strict';
import { RULES as R } from '../../src/engine/index.js';
import { generateCharacter } from '../../src/engine/generator.js';
import { createBattle, addCombatant, makeCombatant, startBattle } from '../../src/engine/battle.js';

export { R };

let n = 0;
export const power = (over) => ({ id: `p${n++}`, extras: [], flaws: [], alternates: [], descriptors: [], role: 'attack', ...over });
export const blast = (name, over = {}) => power({ name, effect: 'Damage', rank: 8, range: 'Ranged', ...over });
export const immunity = (detail, rank, flaws = []) => power({ name: 'Immune', effect: 'Immunity', rank, detail, role: 'defense', flaws });

/** A paragon with its powers replaced by the given ones (and no gear, devices or theme unless given). */
export function char(seed, powers, over = {}) {
  const ch = generateCharacter(R, { seed, archetype: 'paragon', pl: 10 });
  ch.theme = { id: 'plain', name: 'Plain' }; ch.powers = powers; ch.devices = []; ch.equipment = []; ch.advantages = ch.advantages.filter((a) => !/Improved Critical|Fearless/.test(a.name));
  return Object.assign(ch, over);
}

/** A started battle: team A are Alpha0, Alpha1..., team B Beta0, Beta1... (ids A0, B0...). The log is cleared. */
export function arena(A, B) {
  const b = createBattle({ seed: 'descr' });
  A.forEach((ch, k) => addCombatant(b, makeCombatant(R, ch, { id: `A${k}`, team: 'A', name: `Alpha${k}` })));
  B.forEach((ch, k) => addCombatant(b, makeCombatant(R, ch, { id: `B${k}`, team: 'B', name: `Beta${k}` })));
  startBattle(b, R);
  b.log.length = 0;
  return b;
}

export const fighter = (b, id) => b.combatants.find((c) => c.id === id);
export const attack = (c, name) => c.attacks.find((a) => a.name === name);
/** Scripted d20 rolls, in order; asking for more than were given fails the test. */
export const dice = (...rolls) => ({ int: () => { assert.ok(rolls.length, 'the engine asked for more dice than the test gave'); return rolls.shift(); }, next: () => 0.5, chance: () => false, pick: (a) => a[0], weighted: (a) => a[0], left: () => rolls.length });
export const target = (powers, over) => makeCombatant(R, char('descr-target', powers, over), { id: 'T', team: 'B', name: 'Target' });
export const user = (powers, over) => makeCombatant(R, char('descr-user', powers, over), { id: 'U', team: 'A', name: 'User' });

export const fireDamage = () => attack(user([blast('Fire Blast')]), 'Fire Blast');
