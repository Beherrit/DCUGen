// Flaws in the battle engine (Hero's Handbook p133-138, Martial Arts p94-98): src/engine/battle/flaws.js reads them
// onto an attack, flaw-gate.js / flaw-effects.js / flaw-turn.js / flaw-resist.js / flaw-odds.js make them count.
// This file: reading them, range, and the checks before an attack. Dice are scripted (helpers/flaw-kit.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flawsOf } from '../src/engine/battle/flaws.js';
import { expectedValue, rangePenalty } from '../src/engine/battle/odds.js';
import { duel, fire, logOf, zap, flaw, HIT } from './helpers/flaw-kit.mjs';

const ev = (f, t = f.t) => expectedValue(f.u, f.atk, t, { b: f.b });

// ---- reading the flaws ----

test('flawsOf reads the flaws that matter into one small object, and nothing for a power without them', () => {
  assert.equal(flawsOf(zap([])), null);
  assert.equal(flawsOf(zap([flaw('Noticeable'), flaw('Quirk')])), null, 'cost-only and roleplay flaws are not read');
  const f = flawsOf(zap([flaw('Activation', { option: 'Standard action' }), flaw('Inaccurate', { steps: 2 }), flaw('Limited', { detail: 'only against machines' }), flaw('Side Effect', { option: 'Always' }),
    flaw('Unreliable', { detail: 'five uses' }), flaw('Check Required', { steps: 3, detail: 'Acrobatics' }), flaw('Sense-Dependent', { detail: 'hearing' }), flaw('Resistible', { detail: 'Dodge' }), flaw('Fades'), flaw('Fades')]));
  assert.equal(f.activation, 2);
  assert.equal(f.inaccurate, 2);
  assert.deepEqual(f.limited, [{ text: 'only against machines' }]);
  assert.equal(f.sideEffect, 'always');
  assert.deepEqual(f.unreliable, { uses: 5 });
  assert.deepEqual(f.check, { ranks: 3, skill: 'Acrobatics' });
  assert.equal(f.sense.word, 'hearing');
  assert.equal(f.resistible, 'Dodge');
  assert.equal(f.fades, 2, 'Fades taken twice loses two ranks a use (MA 96)');
  assert.equal(flawsOf(zap([flaw('Activation', { option: 'Move action' })])).activation, 1);
  assert.deepEqual(flawsOf(zap([flaw('Unreliable', { detail: 'single use' })])).unreliable, { uses: 1 });
  assert.deepEqual(flawsOf(zap([flaw('Unreliable')])).unreliable, { uses: null });
});

// ---- Inaccurate, Diminished Range, Reduced Range ----

test('Inaccurate: -2 to the attack check per rank, named in the log', () => {
  const plain = duel([]);
  const bad = duel([flaw('Inaccurate', { steps: 2 })]);
  assert.equal(bad.atk.bonus, plain.atk.bonus - 4);
  fire(bad, HIT, 10);
  assert.match(logOf(bad), /Inaccurate: −4/);
});

test('Diminished Range: ranks 1 to 3 shrink the short, medium and long bands to 10/25/50, 5/10/25 and 2/5/10 feet per rank', () => {
  const at = (n) => duel(n ? [flaw('Diminished Range', { steps: n })] : []).atk;
  assert.equal(rangePenalty(at(0), 190), 0, 'rank 8: short range is 200 ft');
  assert.equal(rangePenalty(at(1), 190), 2, 'one rank: short 80, medium 200, long 400 ft');
  assert.equal(rangePenalty(at(2), 190), 5, 'two ranks: short 40, medium 80, long 200 ft');
  assert.equal(rangePenalty(at(3), 190), 99, 'three ranks: long range is only 80 ft');
  assert.equal(rangePenalty(at(3), 60), 5);
});

test('Reduced Range: ranged becomes close, perception becomes ranged', () => {
  assert.equal(duel([flaw('Reduced Range')]).atk.range, 'close');
  assert.equal(duel([flaw('Reduced Range')], { range: 'Perception' }).atk.range, 'ranged');
  assert.equal(duel([flaw('Reduced Range', { steps: 2 })], { range: 'Perception' }).atk.range, 'close');
  assert.equal(duel([]).atk.range, 'ranged');
});

// ---- the checks before an attack: Limited, Unreliable, Check Required, Gallant ----

test('Limited: a limit the engine knows blocks the use when it is not met, says why, and uses no dice', () => {
  const f = duel([flaw('Limited', { detail: 'only against machines' })]);
  assert.equal(ev(f), 0, 'the AI does not pick it');
  fire(f);
  assert.match(logOf(f), /Zap: Limited to only against machines: T is not machines, so U cannot use it on T/);
  const robot = duel([flaw('Limited', { detail: 'only against machines' })], {}, { abilities: { Stamina: null } });
  assert.ok(ev(robot) > 0);
  fire(robot, HIT, 1);
  assert.equal(robot.t.bruises, 1);
});

test('Limited: an unknown limit keeps the power working', () => {
  const f = duel([flaw('Limited', { detail: 'only in darkness' })]);
  assert.ok(ev(f) > 0);
  fire(f, HIT, 1);
  assert.equal(f.t.bruises, 1);
});

test('Limited: while flying, against flying targets and against fire users are read from the fight', () => {
  const air = duel([flaw('Limited', { detail: 'only against flying targets' })]);
  assert.equal(ev(air), 0);
  air.t.flying = true;
  assert.ok(ev(air) > 0);
  const fly = duel([flaw('Limited', { detail: 'only while flying' })]);
  assert.equal(ev(fly), 0);
  fly.u.flying = true;
  assert.ok(ev(fly) > 0);
  const torch = duel([flaw('Limited', { detail: 'only against fire' })], {}, { powers: [zap([], { name: 'Torch', descriptors: ['fire'] })] });
  assert.ok(ev(torch) > 0, 'the target uses fire');
  assert.equal(ev(torch, duel([]).t), 0, 'a target that does not');
});

test('Unreliable: a d20 of 10 or less and the effect fails with the action spent; 11 or more and it works', () => {
  const f = duel([flaw('Unreliable')]);
  f.u.heroPoints = 0;
  fire(f, 10);
  assert.match(logOf(f), /Unreliable roll d20 10 \(10 or less\): it fails, and U's action is spent/);
  assert.equal(f.t.bruises, 0);
  fire(f, 11, HIT, 1);
  assert.match(logOf(f), /Unreliable roll d20 11: it works/);
  assert.equal(f.t.bruises, 1);
});

test('Unreliable: a hero point on the reliability roll makes it work', () => {
  const f = duel([flaw('Unreliable')]);
  fire(f, 3, HIT, 1);
  assert.match(logOf(f), /spends a hero point and it works/);
  assert.equal(f.u.heroPoints, 0);
  assert.equal(f.t.bruises, 1);
});

test('Unreliable: the limited-uses version works every time until the uses are gone', () => {
  const f = duel([flaw('Unreliable', { detail: 'one shot' })]);
  fire(f, HIT, 1);
  assert.equal(f.t.bruises, 1);
  fire(f);
  assert.match(logOf(f), /Unreliable \(1 use\): all 1 are spent/);
  assert.equal(ev(f), 0);
});

test('Check Required: a check against DC 10 + ranks first; each point over the DC is a rank of the effect; a natural 1 fails', () => {
  const mk = () => duel([flaw('Check Required', { steps: 4, detail: 'Dexterity' })]);
  const f = mk();
  fire(f, 16, HIT, 1);                 // 16 + Dexterity 2 = 18 against DC 14: 4 ranks
  assert.match(logOf(f), /Check Required \(Dexterity\): d20 16 \+2 = 18 vs DC 14 — 4 of 8 ranks/);
  assert.match(logOf(f), /vs DC 19/, 'the damage DC is 15 + 4');
  const fail = mk();
  fire(fail, 1);
  assert.match(logOf(fail), /\(natural 1\) — fails, and the action is spent/);
  const low = mk();
  fire(low, 12);                       // 14 against DC 14: no rank over it, the same as failing
  assert.match(logOf(low), /fails, and the action is spent/);
});

test('Gallant: a hero point each use, and no use without one', () => {
  const f = duel([flaw('Gallant')]);
  fire(f, HIT, 1);
  assert.match(logOf(f), /Gallant costs a hero point \(0 left\)/);
  assert.equal(f.u.heroPoints, 0);
  assert.equal(ev(f), 0);
  fire(f);
  assert.match(logOf(f), /Gallant: U has no hero point to spend/);
});

test('Gallant costs nothing when the fight has no hero points', () => {
  const f = duel([flaw('Gallant')], {}, {}, {}, { heroPoints: false });
  fire(f, HIT, 1);
  assert.equal(f.u.heroPoints, 1);
  assert.equal(f.t.bruises, 1);
});
