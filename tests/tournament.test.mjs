import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import * as T from '../src/engine/tournament.js';
import { weakling, bruiser, entrants, make, force, forceDraw, forcePair, higher, playForced, losses, mid } from './helpers/tournament.mjs';

// ---- seeding and byes --------------------------------------------------------------------------------------------

test('bracket order pairs the top seed with the last place and keeps seeds 1 and 2 apart', () => {
  assert.deepEqual(T.bracketOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  const sixteen = T.bracketOrder(16);
  for (let i = 0; i < 16; i += 2) assert.equal(sixteen[i] + sixteen[i + 1], 17);
  assert.ok(sixteen.indexOf(1) < 8 && sixteen.indexOf(2) >= 8, 'seeds 1 and 2 are in opposite halves');
  assert.deepEqual([2, 3, 4, 5, 8, 9].map(T.nextPow2), [2, 4, 4, 8, 8, 16]);
});

test('byes go to the top seeds when the field is not a power of two', () => {
  const six = make(6);
  assert.deepEqual(six.matches.filter((m) => m.bye).map((m) => m.winner), ['e1', 'e2'], 'seeds 1 and 2 skip round 1');
  assert.deepEqual(six.matches.filter((m) => !m.done && m.a.id && m.b.id).map((m) => [m.a.id, m.b.id]), [['e4', 'e5'], ['e3', 'e6']], 'only seeds 4 v 5 and 3 v 6 play in round 1');
  assert.equal(mid(six, 'W2-1').a.id, 'e1', 'the bye winner is already in the semifinal');
  const five = make(5);
  assert.deepEqual(five.matches.filter((m) => m.bye).map((m) => m.winner).sort(), ['e1', 'e2', 'e3'], 'three byes for three top seeds');
  assert.equal(make(8).matches.filter((m) => m.bye).length, 0);
  assert.equal(make(5).matches.filter((m) => m.round === 1 && !m.bye).length, 1, 'only seeds 4 and 5 play in round 1');
});

test('seeding is by the given order or a shuffle drawn from the seed', () => {
  const given = make(8);
  assert.deepEqual(given.order, ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8']);
  const a = make(8, { seeding: 'random', seed: 'one' }); const b = make(8, { seeding: 'random', seed: 'one' }); const c = make(8, { seeding: 'random', seed: 'two' });
  assert.deepEqual(a.order, b.order);
  assert.notDeepEqual(a.order, c.order);
  assert.deepEqual([...a.order].sort(), given.order);
  assert.notDeepEqual(a.order, given.order);
});

test('a tournament needs two entrants, each with someone on the team, and a known format', () => {
  assert.throws(() => make(1), /at least two/);
  assert.throws(() => T.createTournament({ format: 'single', entrants: [{ name: 'A', members: [weakling('a')] }, { name: 'B', members: [] }] }), /no one on the team/);
  assert.throws(() => make(4, { format: 'swiss' }), /Unknown format/);
  assert.throws(() => make(65), /at most/);
});

test('best of is rounded to an odd number, and a round robin always plays one game', () => {
  assert.equal(make(4, { bestOf: 2 }).bestOf, 1);
  assert.equal(make(4, { bestOf: 4 }).bestOf, 3);
  assert.equal(make(4, { bestOf: 5 }).bestOf, 5);
  assert.equal(make(4, { bestOf: 3, format: 'round-robin' }).bestOf, 1);
});

// ---- single elimination ------------------------------------------------------------------------------------------

test('single elimination: winners move on, losers are out, and one champion is left', () => {
  const t = make(8);
  assert.equal(t.matches.length, 7);
  force(t, 'W1-1', 'e1'); force(t, 'W1-2', 'e5'); // an upset: seed 5 beats seed 4
  const semi = mid(t, 'W2-1');
  assert.deepEqual([semi.a.id, semi.b.id], ['e1', 'e5'], 'the winners of the two quarterfinals meet');
  assert.equal(t.status, 'running');
  playForced(t);
  assert.equal(t.status, 'over');
  assert.equal(t.champion, 'e1');
  for (const e of t.entrants) assert.equal(losses(t, e.id), e.id === 'e1' ? 0 : 1, `${e.id} loses once`);
  assert.equal(T.championOf(t).name, 'Team 1');
  assert.equal(T.nextMatch(t), null);
});

test('play next match goes in bracket order and play round plays only the round', () => {
  const t = make(8, {}, bruiser);
  const first = T.playNextMatch(t, R);
  assert.equal(first.id, 'W1-1');
  assert.equal(t.played, 1);
  const round = T.playRound(t, R);
  assert.deepEqual(round.map((m) => m.id), ['W1-2', 'W1-3', 'W1-4'], 'the rest of round 1');
  assert.ok(T.nextMatch(t).id.startsWith('W2'));
  assert.equal(T.playAll(t, R), 3);
  assert.equal(t.status, 'over');
  assert.equal(T.playNextMatch(t, R), null);
});

test('real fights decide: a bruiser beats weaklings all the way and the whole bracket is filled in', () => {
  const field = entrants(4);
  field[2].members = [bruiser('Champ')]; // seed 3 is the strong one
  const t = T.createTournament({ seed: 'real', format: 'single', entrants: field });
  T.playAll(t, R);
  assert.equal(t.champion, 'e3');
  assert.deepEqual(T.matchById(t, 'W1-2').games.map((g) => g.winnerId), ['e3']);
});

// ---- double elimination ------------------------------------------------------------------------------------------

test('double elimination: winners bracket, losers bracket and grand final make 15 matches for 8 entrants', () => {
  const t = make(8, { format: 'double' });
  const count = (b) => t.matches.filter((m) => m.bracket === b).length;
  assert.deepEqual([count('W'), count('L'), count('F')], [7, 6, 2]);
  const rounds = [1, 2, 3, 4].map((r) => t.matches.filter((m) => m.bracket === 'L' && m.round === r).length);
  assert.deepEqual(rounds, [2, 2, 1, 1]);
  const sixteen = make(16, { format: 'double' });
  assert.equal(sixteen.matches.length, 31);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((r) => sixteen.matches.filter((m) => m.bracket === 'L' && m.round === r).length), [4, 4, 2, 2, 1, 1]);
});

test('the losers bracket takes the losers of the winners bracket and its winner meets the winners champion', () => {
  const t = make(8, { format: 'double' });
  const from = (id, side) => mid(t, id)[side].from;
  assert.deepEqual(from('L1-1', 'a'), { match: 'W1-1', take: 'loser' });
  assert.deepEqual(from('L1-1', 'b'), { match: 'W1-2', take: 'loser' });
  assert.deepEqual(from('L2-1', 'a'), { match: 'L1-1', take: 'winner' });
  assert.deepEqual(from('L2-1', 'b'), { match: 'W2-2', take: 'loser' }, 'drop order is reversed so rematches come late');
  assert.deepEqual(from('L4-1', 'b'), { match: 'W3-1', take: 'loser' });
  assert.deepEqual(from('F1', 'a'), { match: 'W3-1', take: 'winner' });
  assert.deepEqual(from('F1', 'b'), { match: 'L4-1', take: 'winner' });
  // play it: a loser really shows up in the losers bracket
  force(t, 'W1-1', 'e1'); force(t, 'W1-2', 'e4');
  const l1 = mid(t, 'L1-1');
  assert.deepEqual([l1.a.id, l1.b.id], ['e8', 'e5']);
});

test('it takes two losses to go out of a double elimination', () => {
  const t = make(4, { format: 'double' });
  force(t, 'W1-1', 'e1'); force(t, 'W1-2', 'e2');
  const row = (id) => T.standings(t).find((r) => r.id === id);
  assert.equal(row('e4').status, 'alive', 'one loss and still in');
  force(t, 'L1-1', 'e3');
  assert.equal(row('e4').status, 'out', 'a second loss and out');
  assert.equal(row('e3').status, 'alive');
});

test('grand final: when the winners champion wins it, the reset is not needed', () => {
  const t = playForced(make(8, { format: 'double' }));
  const f2 = mid(t, 'F2');
  assert.ok(f2.skipped && f2.done && !f2.games.length);
  assert.equal(t.status, 'over');
  assert.equal(t.champion, 'e1');
  for (const e of t.entrants) assert.equal(losses(t, e.id), e.id === 'e1' ? 0 : 2, `${e.id} lost twice`);
});

test('bracket reset: when the losers side wins the grand final, one more match decides it', () => {
  const t = make(4, { format: 'double' });
  playForced(t, (tt, m) => (m.id === 'F1' ? m.b.id : higher(tt, m)));
  const f1 = mid(t, 'F1'); const f2 = mid(t, 'F2');
  assert.notEqual(f1.winner, f1.a.id, 'the losers side won');
  assert.ok(!f2.skipped && f2.games.length === 1, 'the reset was played');
  assert.equal(f2.label, 'Grand final reset');
  assert.deepEqual([f2.a.id, f2.b.id].sort(), [f1.a.id, f1.b.id].sort());
  assert.equal(t.champion, f2.winner);
  assert.equal(t.champion, 'e1', 'the winners champion took the reset');
  assert.equal(losses(t, 'e1'), 1, 'one loss and still champion');
  // between the two matches the tournament is not over
  const u = make(4, { format: 'double' });
  for (let m; (m = T.nextMatch(u)) && m.id !== 'F2';) force(u, m.id, m.id === 'F1' ? m.b.id : higher(u, m));
  assert.equal(u.status, 'running');
  assert.equal(u.champion, null);
  assert.equal(T.nextMatch(u).id, 'F2');
});

test('byes in a double elimination: the losers bracket has walkovers and the tournament still finishes', () => {
  for (const n of [2, 3, 5, 6, 7, 9]) {
    const t = playForced(make(n, { format: 'double' }));
    assert.equal(t.status, 'over', `${n} entrants finish`);
    assert.ok(t.matches.every((m) => m.done), `${n}: nothing left pending`);
    for (const m of t.matches.filter((x) => x.games.length)) assert.ok(m.a.id && m.b.id, 'a played match has both entrants');
    for (const e of t.entrants) assert.ok(losses(t, e.id) <= (e.id === 'e1' ? 0 : 2), `${n}: ${e.id}`);
    assert.equal(t.champion, 'e1');
  }
  const six = make(6, { format: 'double' });
  force(six, 'W1-2', 'e4'); force(six, 'W1-4', 'e3');
  assert.equal(six.matches.filter((m) => m.bye && m.bracket === 'L').length, 2, 'two first-round losers bracket matches are walkovers');
  assert.deepEqual([mid(six, 'L1-1').winner, mid(six, 'L1-2').winner], ['e5', 'e6'], 'the lone loser walks over');
});

// ---- round robin -------------------------------------------------------------------------------------------------

test('round robin: everyone meets everyone once and nobody plays twice in a round', () => {
  for (const n of [3, 4, 5, 6]) {
    const t = make(n, { format: 'round-robin' });
    assert.equal(t.matches.length, n * (n - 1) / 2);
    const pairs = new Set(t.matches.map((m) => [m.a.id, m.b.id].sort().join('-')));
    assert.equal(pairs.size, t.matches.length, `${n}: each pair once`);
    for (let r = 1; r <= n; r++) {
      const ids = t.matches.filter((m) => m.round === r).flatMap((m) => [m.a.id, m.b.id]);
      assert.equal(new Set(ids).size, ids.length, `${n}: round ${r} has no one twice`);
    }
  }
});

test('round robin points: 3 for a win, 1 for a draw, 0 for a loss', () => {
  const t = make(3, { format: 'round-robin' });
  forcePair(t, 'e1', 'e2'); forceDraw(t, 'e1', 'e3'); forcePair(t, 'e3', 'e2');
  const row = (id) => T.standings(t).find((r) => r.id === id);
  assert.deepEqual([row('e1').points, row('e2').points, row('e3').points], [4, 0, 4]);
  assert.deepEqual([row('e1').won, row('e1').drawn, row('e1').lost], [1, 1, 0]);
  assert.equal(t.status, 'over');
});

test('round robin tiebreaks: head-to-head first, even when the other side dealt more knockouts', () => {
  const t = make(4, { format: 'round-robin' });
  forcePair(t, 'e1', 'e2', { e2: 5 }); forcePair(t, 'e3', 'e1'); forcePair(t, 'e4', 'e1');
  forcePair(t, 'e2', 'e3'); forcePair(t, 'e4', 'e2', { e2: 5 }); forcePair(t, 'e3', 'e4', { e4: 5 });
  const table = T.standings(t);
  assert.deepEqual(table.map((r) => r.points), [6, 6, 3, 3]);
  assert.deepEqual(table.map((r) => r.id), ['e3', 'e4', 'e1', 'e2'], 'e3 beat e4 and e1 beat e2');
  assert.ok(table.every((r) => r.decidedBy === 'head-to-head'));
});

test('round robin tiebreaks: a three-way cycle goes to knockouts dealt', () => {
  const t = make(3, { format: 'round-robin' });
  forcePair(t, 'e1', 'e2', { e1: 2 }); forcePair(t, 'e2', 'e3', { e2: 3 }); forcePair(t, 'e3', 'e1', { e3: 1 });
  const table = T.standings(t);
  assert.deepEqual(table.map((r) => r.points), [3, 3, 3]);
  assert.deepEqual(table.map((r) => r.id), ['e2', 'e1', 'e3']);
  assert.ok(table.every((r) => r.decidedBy === 'KOs dealt'));
});

test('round robin tiebreaks: a dead heat is a seeded coin flip, the same every time', () => {
  const cycle = (seed) => {
    const t = make(3, { format: 'round-robin', seed });
    forcePair(t, 'e1', 'e2'); forcePair(t, 'e2', 'e3'); forcePair(t, 'e3', 'e1');
    return T.standings(t);
  };
  const orders = new Set();
  for (let i = 0; i < 12; i++) orders.add(cycle(`coin-${i}`).map((r) => r.id).join());
  assert.ok(orders.size > 1, 'the coin gives different orders for different seeds');
  assert.deepEqual(cycle('coin-0'), cycle('coin-0'));
  assert.ok(cycle('coin-0').every((r) => r.decidedBy === 'coin flip'));
});

test('round robin with real fights: two weaklings draw, and the table follows the results', () => {
  const t = make(3, { format: 'round-robin' });
  T.playAll(t, R);
  assert.ok(t.matches.every((m) => m.draw && m.games.length === 1), 'a stalemate is a draw and is not replayed');
  assert.ok(T.standings(t).every((r) => r.points === 2 && r.drawn === 2));
  const mixed = make(3, { format: 'round-robin' }, bruiser);
  mixed.entrants[1].members = [weakling('W')];
  T.playAll(mixed, R);
  const w = T.standings(mixed).find((r) => r.id === 'e2');
  assert.equal(w.won, 0);
});


test('standings of a bracket rank the champion first and the earliest exits last', () => {
  const t = playForced(make(8));
  const table = T.standings(t);
  assert.equal(table[0].id, 'e1');
  assert.equal(table[0].status, 'champion');
  assert.equal(table[1].id, 'e2', 'the finalist is second');
  assert.deepEqual(table.slice(2, 4).map((r) => r.id), ['e3', 'e4'], 'semifinal losers next');
  assert.deepEqual(table.slice(4).map((r) => r.id), ['e5', 'e6', 'e7', 'e8']);
  assert.deepEqual(table.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8]);
});
