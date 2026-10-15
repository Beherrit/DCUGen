import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES as R } from '../src/engine/index.js';
import { resolveHit, statusOf } from '../src/engine/gmboard.js';
import { endScene } from '../src/engine/play.js';
import { endOfTurn, turnReminder, initView, advanceTurn, delayTurn, partyEntry, allConditions } from '../src/engine/turns.js';

const load = () => JSON.parse(fs.readFileSync(new URL('./fixtures/shadowshot.json', import.meta.url)));
const dice = (...rolls) => { const q = [...rolls]; return () => q.shift(); };
const will = (ch) => statusOf(ch, R).defenses.Will;

test('an affliction is remembered, and a good roll at the end of the turn shakes it off', () => {
  const ch = load();
  // Will check: d20 1 fails by plenty against DC 10 + 6.
  const hit = resolveHit(ch, { effect: 'Affliction', rank: 6, resist: 'Will', tiers: [['Dazed'], ['Stunned'], ['Incapacitated']] }, R, dice(1));
  assert.equal(hit.play.afflictions.length, 1);
  const a = hit.play.afflictions[0];
  assert.equal(a.dc, 16);
  ch.play = hit.play;
  const fail = endOfTurn(ch, R, dice(1));
  assert.match(fail.text, /fails to shake off/);
  assert.equal(fail.play.afflictions.length, 1);
  const ok = endOfTurn(ch, R, dice(20));
  assert.match(ok.text, /shakes off Affliction 6/);
  assert.equal(ok.play.afflictions, undefined);
  for (const c of a.conditions) assert.ok(!ok.play.conditions.includes(c), c);
  assert.equal(ok.dice[0].mod, will(ch));
});

test('a condition two afflictions gave stays until both are gone', () => {
  const ch = load();
  ch.play = { conditions: ['Dazed'], afflictions: [
    { id: 'a', label: 'Dazzle', resist: 'Fortitude', dc: 5, conditions: ['Dazed'] },
    { id: 'b', label: 'Mind Fog', resist: 'Will', dc: 40, conditions: ['Dazed'] },
  ] };
  const r = endOfTurn(ch, R, dice(10, 10));
  assert.deepEqual(r.play.afflictions.map((x) => x.id), ['b']);
  assert.ok(r.play.conditions.includes('Dazed'));
});

test('dazed by damage wears off at the end of the next turn', () => {
  const ch = load();
  // d20 1 + Toughness against DC 15 + rank, missed by 7: two degrees, dazed.
  const rank = statusOf(ch, R).defenses.Toughness - 7;
  const hit = resolveHit(ch, { effect: 'Damage', rank, resist: 'Toughness' }, R, dice(1));
  assert.equal(hit.play.damage, 'dazed');
  ch.play = hit.play;
  let r = endOfTurn(ch, R);
  assert.equal(r.play.damage, 'dazed', 'still dazed after the turn it was hit in');
  ch.play = r.play;
  r = endOfTurn(ch, R);
  assert.equal(r.play.damage, 'none');
  assert.match(r.text, /no longer dazed/);
});

test('weakened traits come back a point a round; surprise ends with the turn', () => {
  const ch = load();
  ch.play = { conditions: ['Weakened', 'Surprised'], weakened: { Strength: 2 } };
  let r = endOfTurn(ch, R);
  assert.deepEqual(r.play.weakened, { Strength: 1 });
  assert.ok(!r.play.conditions.includes('Surprised'));
  ch.play = r.play;
  r = endOfTurn(ch, R);
  assert.equal(r.play.weakened, undefined);
  assert.ok(!r.play.conditions.includes('Weakened'));
});

test('a quiet turn changes nothing and says nothing', () => {
  const r = endOfTurn(load(), R);
  assert.equal(r.changed, false);
  assert.equal(r.text, '');
});

test('the turn reminder says what the conditions allow and suggests a hero point', () => {
  const r = turnReminder({ damage: 'dazed', conditions: ['Vulnerable'], heroPoints: 2 });
  assert.equal(r.canAct, true);
  assert.ok(r.lines.some((l) => /^Dazed: one standard action/.test(l)));
  assert.ok(r.lines.some((l) => /^Vulnerable/.test(l)));
  assert.match(r.tip, /hero point/);
  assert.equal(turnReminder({ conditions: ['Stunned'], heroPoints: 0 }).canAct, false);
  assert.equal(turnReminder({ conditions: ['Stunned'], heroPoints: 0 }).tip, null);
  assert.deepEqual(allConditions({ damage: 'staggered', fatigue: 'fatigued', conditions: ['Prone'] }), ['Staggered', 'Prone', 'Fatigued']);
});

test('initiative: advance, wrap to a new round, delay', () => {
  const init = { order: [{ key: 'a', name: 'A', total: 20 }, { key: 'b', name: 'B', total: 15 }, { key: 'c', name: 'C', total: 9 }], turn: 0, round: 1 };
  let v = initView(init);
  assert.deepEqual([v.now.key, v.next.key, v.round], ['a', 'b', 1]);
  let n = advanceTurn(init);
  assert.deepEqual([n.turn, n.round, n.ended.key], [1, 1, 'a']);
  n = advanceTurn(advanceTurn(n));
  assert.deepEqual([n.turn, n.round, n.ended.key], [0, 2, 'c']);
  const d = delayTurn(init);
  assert.deepEqual(d.order.map((o) => o.key), ['b', 'a', 'c']);
  assert.equal(initView(d).now.key, 'b');
  assert.equal(initView(null), null);
});

test('the party view carries conditions and hero points, not defenses', () => {
  const s = statusOf({ ...load(), rosterId: 'r1', play: { damage: 'staggered', heroPoints: 3, conditions: ['Prone'] } }, R);
  const p = partyEntry(s, 'Alex');
  assert.deepEqual([p.key, p.player, p.heroPoints, p.out], ['r1', 'Alex', 3, false]);
  assert.deepEqual(p.conditions, ['Staggered', 'Prone']);
  assert.equal(p.defenses, undefined);
});

test('the end of a scene clears afflictions and dazes too', () => {
  const s = endScene({ bruises: 2, damage: 'dazed', dazedTurns: 1, conditions: ['Stunned'], afflictions: [{ id: 'a' }], weakened: { Strength: 2 }, heroPoints: 2, fatigue: 'none' });
  assert.deepEqual(s, { bruises: 0, damage: 'none', conditions: [], fatigue: 'none', heroPoints: 2 });
});
