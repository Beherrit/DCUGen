// Saved fight records: the record of a seeded fight, the summary sentence, the text export, and the leaderboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { createBattle, addCombatant, makeCombatant, runToEnd, battleText } from '../src/engine/battle.js';
import { fightRecord, characterKey, recordId, SOURCES } from '../src/engine/records/record.js';
import { summaryLine, recordText, namesOf } from '../src/engine/records/summary.js';
import { leaderboard, expectedScore, sortRecords, K_FACTOR, START_RATING } from '../src/engine/records/leaderboard.js';

const hero = (arch, i, pl = 10) => generateCharacter(R, { seed: `rec-${arch}-${i}`, archetype: arch, pl });

/** A seeded finished fight: sides is { A: [ch...], B: [ch...] }. */
function fight(seed, sides, options = {}) {
  const b = createBattle({ seed, name: 'Test fight' });
  Object.assign(b.options, options);
  for (const [team, list] of Object.entries(sides)) list.forEach((ch, k) => addCombatant(b, makeCombatant(R, ch, { id: `${team}${k}`, team })));
  runToEnd(b, R);
  return b;
}

const duel = () => fight('rec-duel', { A: [hero('paragon', 1)], B: [hero('blaster', 2)] });

// ---- hand-made records for the summary and the leaderboard ----------------------------------------------------

const fighter = (name, key, end = 'standing', kos = 0, status = 'Unhurt') => ({ i: 0, id: name, name, key, pl: 10, style: 'brawler', tactic: 'none', stats: { attacks: 3, hits: 2, crits: 0, kos, dealt: 4, taken: 1, healed: 0 }, end, status });
let n = 0;
function made(teams, winner, extra = {}) {
  n++;
  return { v: 1, id: `made-${String(n).padStart(3, '0')}`, date: `2026-01-${String(n).padStart(2, '0')}T10:00:00.000Z`, source: 'battle-room', label: '', name: 'Made', seed: `m${n}`, options: { enclosed: false, ambush: null, tactics: {}, cover: [] }, teams, result: { winner, gotAway: false, rounds: 4 }, log: [], ...extra };
}
const row = (rows, key) => rows.find((r) => r.key === key);

test('a record of a seeded fight has the documented shape', () => {
  const b = duel();
  const rec = fightRecord(b, { source: 'battle-room', label: 'Practice', date: '2026-03-01T12:00:00.000Z', counter: 2 });
  assert.equal(rec.id, recordId('rec-duel', 2));
  assert.match(rec.id, /^rec-duel-[a-z0-9]+-2$/);
  assert.equal(rec.date, '2026-03-01T12:00:00.000Z');
  assert.equal(rec.source, 'battle-room');
  assert.equal(rec.label, 'Practice');
  assert.equal(rec.seed, 'rec-duel');
  assert.deepEqual(Object.keys(rec.teams).sort(), ['A', 'B']);
  assert.deepEqual(Object.keys(rec.options).sort(), ['ambush', 'cover', 'enclosed', 'environment', 'knockback', 'lethal', 'scale', 'shootThrough', 'squareFt', 'tactics']);
  assert.equal(rec.options.scale, rec.options.enclosed ? 'street' : 'block');
  assert.equal(rec.result.winner, b.winner);
  assert.equal(rec.result.gotAway, false);
  assert.ok(rec.result.rounds >= 1);
  for (const f of rec.teams.A.concat(rec.teams.B)) {
    assert.deepEqual(Object.keys(f.stats).sort(), ['attacks', 'crits', 'dealt', 'healed', 'hits', 'kos', 'taken']);
    assert.ok(['standing', 'out', 'fled', 'got-away'].includes(f.end));
    assert.match(f.key, /^n:/);
  }
  assert.ok(SOURCES.includes(rec.source));
});

test('the record keeps the whole log, trimmed to its public fields, and survives JSON', () => {
  const b = duel();
  const rec = fightRecord(b, { date: 'x' });
  assert.equal(rec.log.length, b.log.length);
  const allowed = new Set(['round', 'kind', 'actor', 'target', 'text', 'dice', 'important']);
  for (const e of rec.log) for (const k of Object.keys(e)) assert.ok(allowed.has(k), `internal field leaked: ${k}`);
  assert.ok(!('i' in rec.log[0]) && !('tick' in rec.log[0]));
  assert.ok(rec.log.some((e) => e.dice?.length), 'rolls are kept');
  assert.deepEqual(JSON.parse(JSON.stringify(rec)), rec);
});

test('record stats match the fighters and the winner stands or the fight is a draw', () => {
  const b = duel();
  const rec = fightRecord(b, { date: 'x' });
  for (const c of b.combatants) {
    const f = rec.teams[c.team].find((x) => x.id === c.id);
    assert.equal(f.stats.hits, c.stats.hits);
    assert.equal(f.stats.dealt, c.stats.degrees);
    assert.equal(f.end, c.out ? 'out' : 'standing');
  }
  if (rec.result.winner) assert.ok(rec.teams[rec.result.winner].some((f) => f.end === 'standing'));
});

test('a record is the same for the same seed', () => {
  const a = fightRecord(duel(), { date: 'x' });
  const b = fightRecord(duel(), { date: 'x' });
  assert.deepEqual(a, b);
});

test('the character key is the roster id, else a stable hash of name and PL', () => {
  const withId = { ch: { rosterId: 'abc' }, name: 'Nova', pl: 10 };
  assert.equal(characterKey(withId), 'r:abc');
  const k1 = characterKey({ ch: {}, name: 'Nova', pl: 10 });
  assert.equal(k1, characterKey({ ch: {}, name: ' nova ', pl: 10 }));
  assert.notEqual(k1, characterKey({ ch: {}, name: 'Nova', pl: 11 }));
  assert.notEqual(k1, characterKey({ ch: {}, name: 'Nova Two', pl: 10 }));
});

test('the text export of a record is the same as the battle text', () => {
  const b = duel();
  assert.equal(recordText(fightRecord(b, { date: 'x' })), battleText(b));
  const big = fight('rec-text-3', { A: [hero('paragon', 3), hero('mystic', 4)], B: [hero('blaster', 5)], C: [hero('speedster', 6)] });
  assert.equal(recordText(fightRecord(big, { date: 'x' })), battleText(big));
});

test('the summary line says who beat whom, in how many rounds, and the set-up', () => {
  const rec = made({ A: [fighter('Ballista', 'a')], B: [fighter('Hill Giant', 'b', 'out')] }, 'A', { options: { enclosed: true, ambush: 'B', tactics: {}, cover: [] }, result: { winner: 'A', gotAway: false, rounds: 6 } });
  assert.equal(summaryLine(rec), 'Ballista beat Hill Giant in 6 rounds (Enclosed space, Team B ambushed).');
  const one = made({ A: [fighter('Ballista', 'a')], B: [fighter('Hill Giant', 'b', 'out')] }, 'A', { result: { winner: 'A', gotAway: false, rounds: 1 } });
  assert.equal(summaryLine(one), 'Ballista beat Hill Giant in 1 round.');
  const away = made({ A: [fighter('Ghost', 'a', 'got-away')], B: [fighter('Cop', 'b')] }, 'A', { result: { winner: 'A', gotAway: true, rounds: 3 } });
  assert.equal(summaryLine(away), 'Ghost got away from Cop in 3 rounds.');
});

test('the summary line covers teams, copies, three sides and draws', () => {
  const team = made({ A: [fighter('Ann', 'a'), fighter('Bob', 'b')], B: [fighter('Thug', 't1', 'out'), fighter('Thug', 't1', 'out'), fighter('Thug', 't1', 'out')] }, 'A');
  assert.equal(summaryLine(team), 'Ann and Bob beat Thug x3 in 4 rounds.');
  const three = made({ A: [fighter('Ann', 'a')], B: [fighter('Bob', 'b', 'out')], C: [fighter('Cy', 'c', 'out')] }, 'A');
  assert.equal(summaryLine(three), 'Ann beat Bob and Cy in 4 rounds.');
  const stale = made({ A: [fighter('Ann', 'a')], B: [fighter('Bob', 'b')] }, null);
  assert.equal(summaryLine(stale), 'Ann and Bob fought to a stalemate in 4 rounds.');
  const down = made({ A: [fighter('Ann', 'a', 'out')], B: [fighter('Bob', 'b', 'out')] }, null);
  assert.equal(summaryLine(down), 'Ann and Bob all went down in 4 rounds.');
  assert.equal(namesOf([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }]), 'A, B, C and 2 others');
});

test('Elo: two new characters, the winner takes 12 and the loser gives 12', () => {
  assert.equal(expectedScore(1000, 1000), 0.5);
  const rows = leaderboard([made({ A: [fighter('Ann', 'a')], B: [fighter('Bob', 'b', 'out', 0)] }, 'A')]);
  assert.equal(K_FACTOR, 24);
  assert.equal(START_RATING, 1000);
  assert.equal(row(rows, 'a').rating, 1012);
  assert.equal(row(rows, 'b').rating, 988);
  assert.deepEqual(rows.map((r) => r.key), ['a', 'b']);
});

test('Elo: a favourite gains less than an underdog, and a second fight uses the new ratings', () => {
  const recs = [made({ A: [fighter('Ann', 'a')], B: [fighter('Bob', 'b')] }, 'A'), made({ A: [fighter('Ann', 'a')], B: [fighter('Bob', 'b')] }, 'A')];
  const rows = leaderboard(recs);
  const second = 24 * (1 - expectedScore(1012, 988));
  assert.ok(Math.abs(row(rows, 'a').rating - (1012 + second)) < 0.06);
  assert.ok(second < 12);
  assert.equal(row(rows, 'a').wins, 2);
  assert.equal(row(rows, 'b').losses, 2);
});

test('Elo: a team result moves every member, using the side averages', () => {
  const rows = leaderboard([made({ A: [fighter('Ann', 'a'), fighter('Al', 'c')], B: [fighter('Bob', 'b', 'out')] }, 'A')]);
  assert.equal(row(rows, 'a').rating, 1012);
  assert.equal(row(rows, 'c').rating, 1012);
  assert.equal(row(rows, 'b').rating, 988);
  // A second fight: the pair (average 1012) against a fresh opponent (1000).
  const rows2 = leaderboard([
    made({ A: [fighter('Ann', 'a'), fighter('Al', 'c')], B: [fighter('Bob', 'b', 'out')] }, 'A'),
    made({ A: [fighter('Ann', 'a'), fighter('Al', 'c')], B: [fighter('Dee', 'd', 'out')] }, 'A'),
  ]);
  const gain = 24 * (1 - expectedScore(1012, 1000));
  assert.ok(Math.abs(row(rows2, 'a').rating - (1012 + gain)) < 0.06);
  assert.ok(Math.abs(row(rows2, 'd').rating - (1000 - gain)) < 0.06);
});

test('Elo: with three sides the winner is scored against each loser, and the losers are left alone', () => {
  const rows = leaderboard([made({ A: [fighter('Ann', 'a')], B: [fighter('Bob', 'b', 'out')], C: [fighter('Cy', 'c', 'out')] }, 'A')]);
  assert.equal(row(rows, 'a').rating, 1024);
  assert.equal(row(rows, 'b').rating, 988);
  assert.equal(row(rows, 'c').rating, 988);
});

test('a stalemate is a draw for everyone and a draw between equals changes nothing', () => {
  const rows = leaderboard([made({ A: [fighter('Ann', 'a')], B: [fighter('Bob', 'b')] }, null)]);
  assert.equal(row(rows, 'a').draws, 1);
  assert.equal(row(rows, 'b').draws, 1);
  assert.equal(row(rows, 'a').rating, 1000);
  assert.equal(row(rows, 'a').wins + row(rows, 'a').losses, 0);
});

test('the table counts fights, KOs dealt and times knocked out', () => {
  const recs = [
    made({ A: [fighter('Ann', 'a', 'standing', 2)], B: [fighter('Bob', 'b', 'out', 0), fighter('Cy', 'c', 'out', 0)] }, 'A'),
    made({ A: [fighter('Ann', 'a', 'out', 1)], B: [fighter('Bob', 'b', 'standing', 3)] }, 'B'),
    made({ A: [fighter('Ann', 'a')], B: [fighter('Bob', 'b')] }, null),
  ];
  const rows = leaderboard(recs);
  const a = row(rows, 'a'); const b = row(rows, 'b');
  assert.deepEqual([a.fights, a.wins, a.losses, a.draws, a.kos, a.knockedOut], [3, 1, 1, 1, 3, 1]);
  assert.deepEqual([b.fights, b.wins, b.losses, b.draws, b.kos, b.knockedOut], [3, 1, 1, 1, 3, 1]);
  assert.equal(row(rows, 'c').fights, 1);
  assert.equal(a.name, 'Ann');
});

test('copies of one character on a side count once per fight but add their KOs', () => {
  const rows = leaderboard([made({ A: [fighter('Ann', 'a')], B: [fighter('Thug', 't', 'out', 1), fighter('Thug', 't', 'out', 2)] }, 'A')]);
  const t = row(rows, 't');
  assert.equal(t.fights, 1);
  assert.equal(t.kos, 3);
  assert.equal(t.knockedOut, 2);
  assert.equal(t.rating, 988);
});

test('the leaderboard is deterministic: the order records arrive in does not matter, ties break on name', () => {
  const recs = [
    made({ A: [fighter('Ann', 'a')], B: [fighter('Bob', 'b', 'out')] }, 'A'),
    made({ A: [fighter('Bob', 'b')], B: [fighter('Cy', 'c', 'out')] }, 'A'),
    made({ A: [fighter('Cy', 'c')], B: [fighter('Ann', 'a', 'out')] }, 'A'),
  ];
  const forward = leaderboard(recs);
  assert.deepEqual(leaderboard([...recs].reverse()), forward);
  assert.deepEqual(leaderboard([recs[1], recs[2], recs[0]]), forward);
  // The same date: the id breaks the tie.
  const same = recs.map((r) => ({ ...r, date: '2026-02-02T00:00:00.000Z' }));
  assert.deepEqual(sortRecords([same[2], same[0], same[1]]).map((r) => r.id), same.map((r) => r.id));
  assert.deepEqual(leaderboard([same[2], same[0], same[1]]), leaderboard(same));
  // Equal ratings and wins sort by name.
  const tie = leaderboard([made({ A: [fighter('Zed', 'z')], B: [fighter('Amy', 'y')] }, null)]);
  assert.deepEqual(tie.map((r) => r.name), ['Amy', 'Zed']);
});

test('Elo: in a three-sided fight the losers are not scored against each other, even when their ratings differ', () => {
  const recs = [
    made({ A: [fighter('Bob', 'b')], B: [fighter('Cy', 'c', 'out')] }, 'A'), // Bob 1012, Cy 988
    made({ A: [fighter('Ann', 'a')], B: [fighter('Bob', 'b', 'out')], C: [fighter('Cy', 'c', 'out')] }, 'A'),
  ];
  const rows = leaderboard(recs);
  const vsBob = 24 * (1 - expectedScore(1000, 1012));
  const vsCy = 24 * (1 - expectedScore(1000, 988));
  assert.ok(Math.abs(row(rows, 'a').rating - (1000 + vsBob + vsCy)) < 0.06);
  assert.ok(Math.abs(row(rows, 'b').rating - (1012 - vsBob)) < 0.06);
  assert.ok(Math.abs(row(rows, 'c').rating - (988 - vsCy)) < 0.06);
});

test('the text export keeps the fighter order of the battle when sides are mixed', () => {
  const b = createBattle({ seed: 'rec-mixed', name: 'Mixed' });
  [['A', hero('paragon', 7)], ['B', hero('blaster', 8)], ['A', hero('mystic', 9)]].forEach(([team, ch], k) => addCombatant(b, makeCombatant(R, ch, { id: `m${k}`, team })));
  runToEnd(b, R);
  assert.equal(recordText(fightRecord(b, { date: 'x' })), battleText(b));
});

test('a leaderboard from real fights counts every fight once per fighter', () => {
  const recs = [1, 2, 3].map((i) => fightRecord(fight(`rec-lb-${i}`, { A: [hero('paragon', 1)], B: [hero('blaster', 2)] }), { date: `2026-04-0${i}T00:00:00.000Z`, counter: 1 }));
  const rows = leaderboard(recs);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.equal(r.fights, 3);
  assert.equal(rows.reduce((s, r) => s + r.wins, 0), rows.reduce((s, r) => s + r.losses, 0));
});
