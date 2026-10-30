import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle } from '../src/engine/battle.js';
import { endOfTurn } from '../src/engine/battle/end-of-turn.js';
import { parseAffliction } from '../src/engine/battle/conditions.js';

// The Snare effect: "The resistance check to break out of a Snare is based on Damage (including Strength Damage)
// or Sleight of Hand" (Hero's Handbook). An Affliction written "overcome by Damage" works the same way.
const body = (abilities, powers = [], skills = []) => ({
  pl: 10, abilities: { Strength: 0, Stamina: 4, Agility: 0, Dexterity: 4, Fighting: 4, Intellect: 0, Awareness: 0, Presence: 0, ...abilities },
  defenses: {}, skills, advantages: [], powers,
});
const foam = { name: 'Foam Launcher', effect: 'Affliction', rank: 6, range: 'Ranged', role: 'attack', detail: 'Resisted by Dodge, overcome by Damage; Hindered and Vulnerable, Defenseless and Immobile', extras: [{ name: 'Cumulative' }, { name: 'Extra Condition' }], flaws: [{ name: 'Limited Degree' }] };
const fixed = (n) => ({ int: () => n, chance: () => false, next: () => 0.5, pick: (a) => a[0], weighted: (a) => a[0] });

function snared(target) {
  const b = createBattle({ seed: 'snare' });
  addCombatant(b, makeCombatant(R, body({}, [foam]), { id: 'S', team: 'A' }));
  addCombatant(b, makeCombatant(R, target, { id: 'T', team: 'B' }));
  startBattle(b, R);
  const s = b.combatants.find((c) => c.id === 'S'); const t = b.combatants.find((c) => c.id === 'T');
  const atk = s.attacks.find((a) => a.name === 'Foam Launcher');
  // Bound at the second degree: defenseless (Dodge 0) and immobile.
  for (const name of ['Defenseless', 'Immobile']) t.conditions.push({ name, names: ['Defenseless', 'Immobile'], degree: 2, from: 'S', source: atk.id, label: atk.name, dc: 16, resist: 'Dodge', cumulative: true, tiers: atk.tiers, maxDegree: 2 });
  return { b, t };
}

test('"overcome by Damage" is read from the power, and a Snare is overcome by Damage by default', () => {
  assert.equal(parseAffliction(foam, R).overcome, 'Damage');
  assert.equal(parseAffliction({ name: 'Net', effect: 'Snare', rank: 5 }, R).overcome, 'Damage');
  assert.equal(parseAffliction({ name: 'Stun', effect: 'Affliction', rank: 8, detail: 'Resisted by Fortitude; Dazed, Stunned, Incapacitated' }, R).overcome, null);
});

test('a strong fighter breaks out of a snare with Strength, even with no Dodge left', () => {
  const { b, t } = snared(body({ Strength: 12 }));
  endOfTurn(b, t, fixed(5)); // 5 + Strength 12 = 17 vs DC 16; with Dodge 0 it would be 5
  assert.equal(t.conditions.length, 0, 'should have broken free');
  assert.ok(b.log.some((e) => e.kind === 'recover' && /shakes off Foam Launcher/.test(e.text)));
});

test('Sleight of Hand slips a snare when it is better than Damage', () => {
  const { b, t } = snared(body({ Strength: 1, Dexterity: 8 }, [], [{ name: 'Sleight of Hand', ranks: 6 }]));
  endOfTurn(b, t, fixed(3)); // 3 + 14 = 17 vs DC 16
  assert.equal(t.conditions.length, 0);
});

test('a weak fighter stays stuck', () => {
  const { b, t } = snared(body({ Strength: 1 }));
  t.heroPoints = 0; t.luck = 0; // no re-roll to rescue it
  endOfTurn(b, t, fixed(5)); // 5 + the better of Strength 1 and untrained Sleight of Hand (Dexterity 4) = 9 vs DC 16
  assert.ok(t.conditions.length > 0);
});
