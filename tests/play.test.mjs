import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playState, applyDamage, effectiveDefenses, checkPenalty, endScene } from '../src/engine/play.js';

const d = { defenses: { Dodge: 8, Parry: 7, Toughness: 12, Fortitude: 9, Will: 6, immune: {} } };

test('damage by degree of failure: bruise, dazed, staggered, incapacitated', () => {
  const s = playState({});
  assert.equal(applyDamage(s, { total: 25, dc: 25 }).state.bruises, 0);
  let r = applyDamage(s, { total: 20, dc: 25 });
  assert.deepEqual([r.state.bruises, r.state.damage], [1, 'none']);
  r = applyDamage(s, { total: 15, dc: 25 });
  assert.deepEqual([r.state.bruises, r.state.damage], [1, 'dazed']);
  r = applyDamage(s, { total: 10, dc: 25 });
  assert.equal(r.state.damage, 'staggered');
  r = applyDamage(r.state, { total: 10, dc: 25 });
  assert.equal(r.state.damage, 'incapacitated', 'staggered twice');
  assert.equal(applyDamage(s, { total: 0, dc: 25 }).state.damage, 'incapacitated');
});

test('bruises lower Toughness; vulnerable halves and defenseless zeroes active defenses', () => {
  let s = { ...playState({}), bruises: 2 };
  assert.equal(effectiveDefenses(d, s).Toughness, 10);
  s = { ...s, conditions: ['Vulnerable'] };
  assert.deepEqual([effectiveDefenses(d, s).Dodge, effectiveDefenses(d, s).Parry], [4, 4]);
  s = { ...s, conditions: ['Defenseless'] };
  assert.equal(effectiveDefenses(d, s).Dodge, 0);
});

test('impaired and disabled penalize checks; the end of a scene clears damage but keeps hero points', () => {
  assert.equal(checkPenalty({ ...playState({}), conditions: ['Impaired'] }), -2);
  assert.equal(checkPenalty({ ...playState({}), conditions: ['Disabled'] }), -5);
  const s = endScene({ ...playState({}), bruises: 3, damage: 'staggered', conditions: ['Prone'], heroPoints: 3, fatigue: 'exhausted' });
  assert.deepEqual(s, { bruises: 0, damage: 'none', heroPoints: 3, conditions: [], fatigue: 'none' });
});

test('a natural 20 on the Toughness check is one degree better (Hero Handbook p10)', () => {
  const s = playState({});
  // One degree of failure (total 24 vs DC 25) becomes no damage at all.
  const saved = applyDamage(s, { total: 24, dc: 25, roll: 20 });
  assert.equal(saved.state.bruises, 0);
  assert.match(saved.text, /natural 20/);
  // Two degrees (total 19 vs DC 25) become one: a bruise, not dazed.
  const eased = applyDamage(s, { total: 19, dc: 25, roll: 20 });
  assert.equal(eased.state.bruises, 1);
  assert.ok(!/dazed/.test(eased.text));
  // Without the natural 20 the same total is two degrees: dazed.
  assert.match(applyDamage(s, { total: 19, dc: 25, roll: 9 }).text, /dazed/);
});
