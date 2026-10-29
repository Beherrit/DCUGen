import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle } from '../src/engine/battle.js';
import { activeConditions, defenseOf, defenseVs, conditionLabels } from '../src/engine/battle/conditions.js';
import { squaresInMove } from '../src/engine/battle/geometry.js';
import { grab, grabAppetite, releaseHolds } from '../src/engine/battle/maneuvers.js';

// Hero's Handbook p176: "You are hindered and vulnerable while grabbing and holding an opponent." Improved Grab (p77) and
// Grabbing Finesse (p75) mean the grabber is not vulnerable. The state follows c.holding, so letting go removes it.

const body = () => ({
  pl: 10, abilities: { Strength: 4, Stamina: 4, Agility: 4, Dexterity: 2, Fighting: 8, Intellect: 0, Awareness: 2, Presence: 2 },
  defenses: { Parry: 6, Dodge: 6 }, skills: [], advantages: [], powers: [],
});
function arena(foes = 1) {
  const b = createBattle({ seed: 'grab-vulnerable' });
  addCombatant(b, makeCombatant(R, body(), { id: 'g', team: 'A' }));
  for (let i = 0; i < foes; i++) addCombatant(b, makeCombatant(R, body(), { id: `f${i}`, team: 'B' }));
  startBattle(b, R);
  b.log.length = 0;
  return { b, g: b.combatants.find((c) => c.id === 'g'), f: b.combatants.find((c) => c.id === 'f0') };
}
/** A d20 stream that always rolls the given number. */
const always = (n) => ({ int: () => n });

test('a fighter that holds someone is hindered and vulnerable; letting go removes both', () => {
  const { b, g, f } = arena();
  g.moveFt = 120; // four squares per move at 30 ft
  const free = { parry: defenseOf(g, 'Parry'), squares: squaresInMove(b, g) };
  g.holding = f.id; f.grabbedBy = g.id;
  const held = activeConditions(g);
  assert.ok(held.has('Hindered') && held.has('Vulnerable'));
  assert.equal(defenseOf(g, 'Parry'), Math.ceil(free.parry / 2));
  assert.equal(squaresInMove(b, g), free.squares / 2, 'hindered: half the squares');
  assert.deepEqual(conditionLabels(g).sort(), ['Hindered', 'Vulnerable']);
  releaseHolds(b, g);
  assert.ok(!activeConditions(g).has('Hindered') && !activeConditions(g).has('Vulnerable'));
  assert.equal(defenseOf(g, 'Parry'), free.parry);
  assert.equal(squaresInMove(b, g), free.squares);
});

test('a successful grab leaves the grabber vulnerable to the next attack', () => {
  const { b, g, f } = arena();
  const before = defenseVs(g, 'Parry', f);
  grab(b, R, g, f, always(1), { free: true }); // the target's resistance roll is a 1
  assert.equal(g.holding, f.id);
  assert.equal(defenseVs(g, 'Parry', f), Math.ceil(before / 2));
});

test('a failed grab costs the grabber nothing', () => {
  const { b, g, f } = arena();
  f.d.abilities.Strength = 20; // breaks free on any roll
  grab(b, R, g, f, always(20), { free: true });
  assert.equal(g.holding, null);
  assert.ok(!activeConditions(g).has('Vulnerable'));
});

for (const name of ['Improved Grab', 'Grabbing Finesse']) {
  test(`${name}: hindered while holding, but not vulnerable`, () => {
    const { g, f } = arena();
    g.adv[name] = 1;
    g.holding = f.id; f.grabbedBy = g.id;
    const held = activeConditions(g);
    assert.ok(held.has('Hindered'));
    assert.ok(!held.has('Vulnerable'));
  });
}

test('the AI grabs less when the hold would leave it exposed to other foes', () => {
  const alone = arena(1); const two = arena(2); const three = arena(3);
  assert.equal(grabAppetite(alone.b, alone.g, alone.f), 0.8);
  assert.equal(grabAppetite(two.b, two.g, two.f), 0.5);
  assert.equal(grabAppetite(three.b, three.g, three.f), 0.3);
  three.g.adv['Improved Grab'] = 1;
  assert.equal(grabAppetite(three.b, three.g, three.f), 1, 'Improved Grab is not exposed by the hold');
});
