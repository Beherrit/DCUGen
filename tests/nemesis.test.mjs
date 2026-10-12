import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { createBattle, addCombatant, makeCombatant, runToEnd, startBattle } from '../src/engine/battle.js';
import { makeNemesis, lessonsFromBattle, adaptNemesis, advanceScheme, schemeLabel } from '../src/engine/nemesis.js';
import { checkLimits } from '../src/engine/limits.js';

function fight(seed) {
  const b = createBattle({ seed });
  for (const s of ['h1', 'h2', 'h3']) addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: s, pl: 10, alignment: 'hero' }), { team: 'A' }));
  const v = makeCombatant(R, makeNemesis(generateCharacter(R, { seed: 'nem', pl: 10, alignment: 'villain' }), { scheme: 'the Blackout Engine' }), { team: 'B' });
  addCombatant(b, v);
  startBattle(b, R); runToEnd(b, R);
  return { b, v };
}

test('a battle teaches the villain which defenses failed and who beat them', () => {
  const { b, v } = fight('nem-1');
  const l = lessonsFromBattle(b, v.id);
  assert.equal(typeof l.lost, 'boolean');
  assert.ok(Object.values(l.failures).every((n) => n > 0));
  assert.ok(l.worst.length >= 1);
});

test('a defeat earns points spent on counters, within PL limits', () => {
  const { b, v } = fight('nem-1');
  const l = { ...lessonsFromBattle(b, v.id), lost: true };
  const before = v.ch;
  const r = adaptNemesis(before, R, l, { battleName: 'the Docks' });
  assert.equal(r.ch.nemesis.grudge, 1);
  assert.equal(r.ch.nemesis.defeats.length, 1);
  assert.equal(r.ch.advancement.log.filter((e) => e.type === 'award').length, 1);
  assert.ok(!checkLimits(r.ch, R).some((i) => i.severity === 'error' && i.pl && !checkLimits(before, R).some((j) => j.message === i.message)), 'no new PL breaks');
  assert.match(r.text, /grudge 1/);
  const ranks = Object.values(r.bought).reduce((x, y) => x + y, 0);
  assert.ok(ranks <= 2, `2 points buy at most 2 ranks (bought ${JSON.stringify(r.bought)})`);
  assert.equal(before.nemesis.grudge, 0, 'the original is untouched');
});

test('the scheme clock ticks through rumor, evidence and the climax', () => {
  let ch = makeNemesis(generateCharacter(R, { seed: 'nem', pl: 10, alignment: 'villain' }), { scheme: 'the Blackout Engine', steps: 3 });
  const phases = [];
  for (let i = 0; i < 3; i++) { const r = advanceScheme(ch, { city: 'Metro', rng: () => 0.1 }); ch = r.ch; phases.push(r.phase); }
  assert.deepEqual(phases, ['rumor', 'evidence', 'climax']);
  assert.equal(ch.nemesis.scheme.hints.length, 3);
  assert.match(schemeLabel(ch), /3 of 3: it happens now/);
  assert.match(ch.nemesis.scheme.hints[2].text, /Blackout Engine/);
});
