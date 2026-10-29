import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle } from '../src/engine/battle.js';
import { feint } from '../src/engine/battle/maneuvers.js';
import { defenseOf, defenseVs } from '../src/engine/battle/conditions.js';
import { rollToHit } from '../src/engine/battle/attack-roll.js';
import { endOfTurn } from '../src/engine/battle/end-of-turn.js';

// DCA 64: a successful feint leaves the target vulnerable against the feinter's next attack,
// until the end of the feinter's next round. Nobody else gets the benefit (that needs Set-up).
const body = (extra = {}) => ({
  pl: 10, abilities: { Strength: 4, Stamina: 4, Agility: 4, Dexterity: 2, Fighting: 8, Intellect: 0, Awareness: 2, Presence: 2 },
  defenses: { Parry: 6, Dodge: 6 }, skills: [{ name: 'Deception', ranks: 10 }], advantages: [], powers: [], ...extra,
});
const fixed = (n) => ({ int: () => n, chance: () => false, next: () => 0.5, pick: (a) => a[0], weighted: (a) => a[0] });

function setup() {
  const b = createBattle({ seed: 'feint' });
  addCombatant(b, makeCombatant(R, body(), { id: 'duelist', team: 'A' }));
  addCombatant(b, makeCombatant(R, body(), { id: 'ally', team: 'A' }));
  addCombatant(b, makeCombatant(R, body(), { id: 'foe', team: 'B' }));
  startBattle(b, R);
  const [d, a, f] = ['duelist', 'ally', 'foe'].map((id) => b.combatants.find((c) => c.id === id));
  return { b, d, a, f };
}

test('a successful feint halves the target defense against the feinter only', () => {
  const { b, d, a, f } = setup();
  const full = defenseOf(f, 'Parry');
  feint(b, d, f, fixed(20)); // a natural 20 always succeeds
  assert.equal(defenseVs(f, 'Parry', d), Math.ceil(full / 2));
  assert.equal(defenseVs(f, 'Parry', a), full, 'an ally gets no benefit from someone else\'s feint');
});

test('the feinter\'s next attack uses the halved defense and spends the feint', () => {
  const { b, d, f } = setup();
  const full = defenseOf(f, 'Parry');
  feint(b, d, f, fixed(20));
  const atk = d.attacks.find((x) => x.kind === 'close');
  const out = rollToHit(b, d, atk, f, fixed(5), {}, 0, []);
  assert.equal(out.dcUsed, 10 + Math.ceil(full / 2));
  assert.match(out.text, /feinted/);
  assert.equal(defenseVs(f, 'Parry', d), full, 'the feint is used up by that attack');
});

test('an unused feint lasts through the feinter\'s next round, then wears off', () => {
  const { b, d, f } = setup();
  const full = defenseOf(f, 'Parry');
  feint(b, d, f, fixed(20));
  endOfTurn(b, d, fixed(20)); // the end of the turn the feint was made
  assert.equal(defenseVs(f, 'Parry', d), Math.ceil(full / 2), 'still good on the next round');
  b.round += 1;
  endOfTurn(b, d, fixed(20)); // the end of the feinter's next round
  assert.equal(defenseVs(f, 'Parry', d), full);
});

test('a failed feint changes nothing', () => {
  const { b, d, f } = setup();
  const full = defenseOf(f, 'Parry');
  feint(b, d, f, fixed(1));
  assert.equal(defenseVs(f, 'Parry', d), full);
});
