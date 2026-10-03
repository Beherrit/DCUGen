import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { catalogEntries } from '../src/engine/workshop.js';
import { catalogToCharacter } from '../src/engine/catalog.js';
import { createBattle, addCombatant, makeCombatant, runToEnd, battleText, simulateMany, detectStyle, STYLES, serializeBattle, reviveBattle, step, parseAffliction, hitOdds, resistOdds, joinBattle, startBattle } from '../src/engine/battle.js';

const es = catalogEntries(R);
const creature = (re) => catalogToCharacter(es.find((e) => re.test(e.name)) || es[0]);

function setup(seed = 'bt-test') {
  const b = createBattle({ seed, name: 'Test' });
  addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: 'x-martialartist', archetype: 'martialartist', pl: 10 }), { team: 'A' }));
  addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: 'x-mystic', archetype: 'mystic', pl: 10 }), { team: 'A' }));
  addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: 'x-powerhouse', archetype: 'powerhouse', pl: 10 }), { team: 'B' }));
  addCombatant(b, makeCombatant(R, creature(/wolf/i), { team: 'B' }));
  const thug = creature(/thug/i);
  addCombatant(b, makeCombatant(R, thug, { team: 'B' }));
  return b;
}

test('every archetype gets a fighting style and at least one usable attack', () => {
  for (const a of R.raw.archetypes.filter((x) => !x.hidden)) {
    const ch = generateCharacter(R, { seed: `style-${a.id}`, archetype: a.id, pl: 10 });
    const c = makeCombatant(R, ch);
    assert.ok(STYLES[c.style], `${a.id}: ${c.style}`);
    assert.ok(c.attacks.length >= 1, `${a.id} has attacks`);
    assert.ok(c.speed >= 1 && c.speed <= 5);
  }
  for (const e of es.slice(0, 80)) {
    const c = makeCombatant(R, catalogToCharacter(e));
    assert.ok(STYLES[c.style]);
    if (e.minion) assert.equal(c.style, 'minion');
  }
});

test('afflictions parse their resistance and degrees from the detail text', () => {
  const a = parseAffliction({ effect: 'Affliction', detail: 'Resisted by Dodge, overcome by Damage; Hindered and Vulnerable, Defenseless and Immobile', extras: [{ name: 'Extra Condition' }], flaws: [{ name: 'Limited Degree' }] }, R);
  assert.equal(a.resist, 'Dodge');
  assert.deepEqual(a.tiers[0].sort(), ['Hindered', 'Vulnerable']);
  assert.deepEqual(a.tiers[1].sort(), ['Defenseless', 'Immobile']);
  assert.equal(a.maxDegree, 2);
  const b = parseAffliction({ effect: 'Affliction', detail: 'Resisted by Will; Entranced, Compelled, Controlled' }, R);
  assert.equal(b.resist, 'Will');
  assert.deepEqual(b.tiers, [['Entranced'], ['Compelled'], ['Controlled']]);
  const c = parseAffliction({ effect: 'Affliction', detail: 'Resisted by Fortitude; Dazed and Vision Impaired, Stunned and Vision Disabled, Incapacitated' }, R);
  assert.deepEqual(c.tiers[0].sort(), ['Dazed', 'Impaired']);
});

test('the odds helpers match the book: natural 20 always hits, each 5 under is a degree', () => {
  assert.equal(hitOdds(0, 30).hit, 0.05);
  assert.equal(hitOdds(10, 0).hit, 0.95);
  const r = resistOdds(5, 25);
  assert.ok(Math.abs(r.reduce((s, x) => s + x, 0) - 1) < 1e-9);
  assert.equal(r[0], 1 / 20);   // only a natural 20 (which also drops a degree)
  assert.equal(r[4], 4 / 20);   // rolls of 1-4 are four or more degrees under
});

test('a battle runs to a decision, is deterministic for its seed, and survives save/load', () => {
  const b = setup();
  runToEnd(b, R);
  assert.equal(b.status, 'over');
  assert.ok(b.round <= b.options.maxRounds + 1);
  assert.ok(b.log.some((e) => e.kind === 'ko' || e.kind === 'end'));
  assert.ok(b.log.every((e) => typeof e.text === 'string' && !/undefined|NaN|\[object/.test(e.text)), 'clean log text');
  const text = battleText(b);
  assert.ok(text.includes('Round 1'));
  const again = setup();
  runToEnd(again, R);
  assert.deepEqual(again.log.map((e) => e.text), b.log.map((e) => e.text));
  // Save after a few steps and resume: the continuation is identical
  const partial = setup();
  for (let i = 0; i < 7; i++) step(partial, R);
  const revived = reviveBattle(R, JSON.parse(JSON.stringify(serializeBattle(partial))));
  runToEnd(revived, R);
  assert.deepEqual(revived.log.map((e) => e.text), b.log.map((e) => e.text));
});

test('minions drop on any failed Toughness check and a knocked-out side loses', () => {
  const b = createBattle({ seed: 'mooks' });
  addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: 'x-powerhouse', archetype: 'powerhouse', pl: 12 }), { team: 'A' }));
  for (let i = 0; i < 4; i++) addCombatant(b, makeCombatant(R, creature(/thug/i), { team: 'B', name: `Thug ${i + 1}` }));
  runToEnd(b, R);
  assert.equal(b.winner, 'A');
  assert.ok(b.log.some((e) => /minions drop/.test(e.text)));
});

test('fighters can join a running fight, and the odds run tallies every fighter', () => {
  const b = setup('join');
  startBattle(b, R);
  step(b, R);
  joinBattle(b, R, makeCombatant(R, creature(/dragon/i), { team: 'B', name: 'Late Dragon' }));
  assert.ok(b.order.length === 6 && b.log.some((e) => /Late Dragon joins/.test(e.text)));
  const mc = simulateMany(b, R, 8);
  assert.equal(mc.n, 8);
  assert.equal(Object.values(mc.wins).reduce((s, x) => s + x, 0), 8);
  for (const c of b.combatants) assert.ok(c.id in mc.survived);
});

test('styles are detected from the build', () => {
  assert.equal(detectStyle(generateCharacter(R, { seed: 'd1', archetype: 'blaster', pl: 10 }), R), 'blaster');
  assert.equal(detectStyle(generateCharacter(R, { seed: 'd2', archetype: 'martialartist', pl: 10 }), R), 'duelist');
  assert.equal(detectStyle(generateCharacter(R, { seed: 'd3', archetype: 'm-thug', pl: 4 }), R), 'minion');
  assert.equal(detectStyle(creature(/wolf/i), R), 'beast');
});
