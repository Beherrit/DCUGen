import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, squareFtOf, customFt, syncGrid } from '../src/engine/battle.js';

const body = () => ({ pl: 8, abilities: { Strength: 2, Stamina: 2, Agility: 2, Dexterity: 2, Fighting: 2, Intellect: 0, Awareness: 0, Presence: 0 }, defenses: {}, skills: [], advantages: [], powers: [] });

test('eight teams: A to D start on the four edges, E to H in the four corners, nobody on the same square as another team', () => {
  const b = createBattle({ seed: 'eight' });
  for (const t of 'ABCDEFGH') addCombatant(b, makeCombatant(R, body(), { id: `${t}1`, team: t }));
  const at = (t) => b.combatants.find((c) => c.team === t);
  const { x0, y0, x1, y1 } = b.grid.play;
  assert.equal(at('A').x, x0 + 1); assert.equal(at('B').x, x1 - 1);
  assert.equal(at('C').y, y0 + 1); assert.equal(at('D').y, y1 - 1);
  assert.deepEqual([at('E').x, at('E').y], [x0 + 1, y0 + 1]);
  assert.deepEqual([at('F').x, at('F').y], [x1 - 1, y0 + 1]);
  assert.deepEqual([at('G').x, at('G').y], [x0 + 1, y1 - 1]);
  assert.deepEqual([at('H').x, at('H').y], [x1 - 1, y1 - 1]);
  const spots = new Set(b.combatants.map((c) => `${c.x},${c.y}`));
  assert.equal(spots.size, 8, 'every team on its own square');
});

test('corner teams spread along a diagonal from their corner', () => {
  const b = createBattle({ seed: 'corner' });
  addCombatant(b, makeCombatant(R, body(), { id: 'A1', team: 'A' }));
  for (let k = 0; k < 3; k++) for (const t of 'BCDE') addCombatant(b, makeCombatant(R, body(), { id: `${t}${k}`, team: t }));
  const e = b.combatants.filter((c) => c.team === 'E').map((c) => [c.x, c.y]);
  const { x0, y0 } = b.grid.play;
  assert.deepEqual(e, [[x0 + 1, y0 + 1], [x0 + 2, y0 + 2], [x0 + 3, y0 + 3]]);
});

test('a custom scale sets the feet per square, clamped to 1 to 10000, and the presets still work', () => {
  assert.equal(squareFtOf({ scale: 'custom', squareFt: 120 }), 120);
  assert.equal(squareFtOf({ scale: 'custom', squareFt: -5 }), 1);
  assert.equal(squareFtOf({ scale: 'custom', squareFt: 0 }), 30, 'unset falls back to the 30 ft default');
  assert.equal(squareFtOf({ scale: 'custom', squareFt: 99999 }), 10000);
  assert.equal(squareFtOf({ scale: 'district' }), 250);
  assert.equal(squareFtOf({ scale: 'custom', squareFt: 500, enclosed: true }), 5, 'an enclosed room is always 5 ft squares');
  assert.equal(customFt('abc'), 30);
  const b = createBattle({ seed: 'scale' });
  b.options.scale = 'custom'; b.options.squareFt = 400; syncGrid(b);
  assert.equal(b.grid.squareFt, 400);
});
