import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchScore, rankItems, starterItems, groupByKind } from '../src/engine/palette.js';

test('matches rank whole names over prefixes over word starts over insides over scattered letters', () => {
  const s = (l, q) => matchScore(l, q);
  assert.equal(s('Bestiary', 'bestiary'), 100);
  assert.ok(s('Bestiary', 'best') > s('The Beast', 'beast') - 20);
  assert.ok(s('Battle Room', 'bat') > s('Battle Room', 'room'));
  assert.ok(s('Battle Room', 'room') > s('Battle Room', 'ttle'));
  assert.ok(s('Doctor Null', 'doc nul') >= 70);
  assert.ok(s('Session in a Box', 'siab') >= 50);
  assert.ok(s('Shadowshot', 'shdsht') > 0, 'letters in order');
  assert.equal(s('Shadowshot', 'xyz'), 0);
  assert.equal(s('Café Noir', 'cafe'), 90 - 5 / 4, 'accents ignored');
});

test('rankItems sorts, uses extra words, and weights', () => {
  const items = [
    { id: 1, label: 'Spark', kind: 'Character', words: 'Sarah Park' },
    { id: 2, label: 'Spark Plug Gremlin', kind: 'Creature' },
    { id: 3, label: 'Sparring', kind: 'Rule' },
    { id: 4, label: 'Roster', kind: 'Go to', weight: 5 },
  ];
  assert.deepEqual(rankItems(items, 'spark').map((x) => x.id), [1, 2]);
  assert.deepEqual(rankItems(items, 'sarah').map((x) => x.id), [1], 'found by the real name');
  assert.equal(rankItems(items, 'ros')[0].id, 4);
  assert.equal(rankItems(items, 'zzz').length, 0);
  assert.equal(rankItems(items, 'spa', { limit: 1 }).length, 1);
});

test('with nothing typed, a few of each kind', () => {
  const items = [...Array(6)].map((_, i) => ({ id: `c${i}`, label: `C${i}`, kind: 'Character' })).concat([{ id: 'd', label: 'Roll', kind: 'Do' }]);
  const s = starterItems(items, { perKind: 3 });
  assert.deepEqual(s.map((x) => x.id), ['d', 'c0', 'c1', 'c2']);
});

test('results group by kind, best group first', () => {
  const r = [{ kind: 'Rule', label: 'a', score: 90 }, { kind: 'Creature', label: 'b', score: 80 }, { kind: 'Rule', label: 'c', score: 70 }, { kind: 'Creature', label: 'd', score: 60 }];
  assert.deepEqual(groupByKind(r).map((x) => x.label), ['a', 'c', 'b', 'd']);
});
