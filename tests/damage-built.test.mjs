import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { makeCombatant, createBattle, addCombatant, runToEnd } from '../src/engine/battle.js';

// Blast, Strike, Energy Control, Magic and Energy Aura are built from Damage (DCA 89-110), so they must
// land on the damage track (bruises, dazed, staggered, incapacitated), not impose affliction conditions.
const fighter = (effect) => ({
  pl: 10, abilities: { Strength: 2, Stamina: 4, Agility: 2, Dexterity: 4, Fighting: 4, Intellect: 0, Awareness: 2, Presence: 0 },
  defenses: {}, skills: [], advantages: [], powers: [{ name: 'Zap', effect, rank: 10, role: 'attack', extras: [], flaws: [] }],
});

for (const effect of ['Blast', 'Strike', 'Energy Control', 'Magic', 'Energy Aura']) {
  test(`${effect} attacks resolve as Damage`, () => {
    const c = makeCombatant(R, fighter(effect));
    const zap = c.attacks.find((a) => a.name === 'Zap');
    assert.equal(zap.effect, 'Damage');
    assert.equal(zap.resistance, 'Toughness');
    assert.equal(zap.tiers, undefined, 'a Damage attack has no affliction tiers');
  });
}

test('a Blast hit leaves bruises on the target, like Damage', () => {
  const b = createBattle({ seed: 'blast-bruise' });
  addCombatant(b, makeCombatant(R, fighter('Blast'), { team: 'A', id: 'a' }));
  addCombatant(b, makeCombatant(R, fighter('Damage'), { team: 'B', id: 'b' }));
  runToEnd(b, R);
  const target = b.combatants.find((c) => c.id === 'b');
  const fromBlast = target.conditions.filter((x) => x.from === 'a');
  assert.equal(fromBlast.length, 0, 'Blast should not leave affliction conditions');
  assert.ok(b.log.some((e) => e.actor === 'a' && e.kind === 'hit'), 'the Blast never hit');
  assert.ok(target.bruises > 0 || target.out, 'a Blast hit should bruise or drop the target');
});
