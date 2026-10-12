import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant } from '../src/engine/battle.js';
import { generateCharacter } from '../src/engine/generator.js';
import { scaleCharacter, heroOdds, tuneBattle, verdict } from '../src/engine/balance.js';
import { deriveAll } from '../src/engine/derive.js';

function setup() {
  const b = createBattle({ seed: 'bal' });
  addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: 'h1', pl: 10, alignment: 'hero' }), { team: 'A' }));
  addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: 'h2', pl: 10, alignment: 'hero' }), { team: 'A' }));
  addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: 'boss', pl: 12, alignment: 'villain' }), { team: 'B' }));
  return b;
}

test('scaling makes a foe tougher or weaker, and leaves the original alone', () => {
  const ch = generateCharacter(R, { seed: 'boss', pl: 12, alignment: 'villain' });
  const before = deriveAll(ch, R).defenses.Dodge;
  const up = scaleCharacter(ch, 3, R);
  assert.equal(deriveAll(up, R).defenses.Dodge, before + 3);
  assert.equal(deriveAll(ch, R).defenses.Dodge, before);
  assert.match(up.identity.codename, /\(\+3\)$/);
});

test('odds are deterministic for a seed, and tuning moves them toward the target', () => {
  const b = setup();
  const a = heroOdds(b, R, 'A', 40, 's');
  assert.equal(heroOdds(b, R, 'A', 40, 's').rate, a.rate);
  const t = tuneBattle(b, R, { heroTeam: 'A', target: 0.5, n: 40 });
  assert.ok(Math.abs(t.best.rate - 0.5) <= Math.abs(t.before - 0.5) + 1e-9);
  assert.ok(t.tried.length >= 1);
  assert.equal(typeof verdict(t.best.rate), 'string');
});
