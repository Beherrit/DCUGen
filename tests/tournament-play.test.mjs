import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { TEAM_TACTICS } from '../src/engine/battle.js';
import * as T from '../src/engine/tournament.js';
import { bruiser, entrants, make } from './helpers/tournament.mjs';

// ---- best of N, stalemates ---------------------------------------------------------------------------------------

test('best of 3: first to two wins, and the better seed swaps sides each game', () => {
  const field = entrants(2); field[0].members = [bruiser('Top')];
  const t = T.createTournament({ seed: 'bo3', format: 'single', entrants: field, bestOf: 3 });
  const m = T.playNextMatch(t, R);
  assert.equal(m.games.length, 2, 'two wins end it');
  assert.deepEqual([m.scoreA, m.scoreB], [2, 0]);
  assert.deepEqual(m.games.map((g) => g.a), ['e1', 'e2'], 'seed 1 is team A in game 1 and team B in game 2');
  assert.deepEqual(m.games.map((g) => g.label), ['Final, game 1', 'Final, game 2']);
  const upset = entrants(2); upset[1].members = [bruiser('Low')];
  const u = T.createTournament({ seed: 'bo3', format: 'single', entrants: upset, bestOf: 5 });
  T.playAll(u, R);
  assert.equal(u.champion, 'e2');
  assert.equal(u.matches[0].games.length, 3, 'best of 5 needs three wins');
});

test('a stalemate is replayed with the next seed, at most 3 times, then the better seed advances', () => {
  const t = make(2);
  const m = T.playNextMatch(t, R);
  assert.equal(m.games.length, 4, 'the first try and three replays');
  assert.deepEqual(m.games.map((g) => g.replay), [0, 1, 2, 3]);
  assert.ok(m.games.every((g) => g.winnerId === null));
  assert.equal(new Set(m.games.map((g) => g.seed)).size, 4, 'each replay has its own seed');
  assert.deepEqual(m.games.map((g) => g.label), ['Final, game 1', 'Final, game 1, replay 1', 'Final, game 1, replay 2', 'Final, game 1, replay 3']);
  assert.ok(m.bySeed);
  assert.equal(m.winner, 'e1');
  assert.equal(t.champion, 'e1');
  const best3 = make(2, { bestOf: 3 });
  assert.equal(T.playNextMatch(best3, R).games.length, 4, 'the replay allowance is for the whole match');
});

test('a field of stalemates is settled by seed: the top seed wins every match', () => {
  for (const format of ['single', 'double']) {
    const t = make(8, { format });
    T.playAll(t, R);
    assert.equal(t.champion, 'e1', format);
    assert.ok(t.matches.filter((m) => m.games.length).every((m) => m.bySeed && m.winner === (T.seedOf(t, m.a.id) < T.seedOf(t, m.b.id) ? m.a.id : m.b.id)));
  }
});

// ---- records and settings ----------------------------------------------------------------------------------------

test('every game makes a fight record from the tournament with a label like "Quarterfinal 2, game 1"', () => {
  const t = make(8, {}, bruiser);
  const records = [];
  T.playAll(t, R, { onGame: (rec) => records.push(rec) });
  const games = t.matches.flatMap((m) => m.games);
  assert.equal(records.length, games.length);
  assert.ok(records.every((r) => r.source === 'tournament'));
  assert.ok(records.map((r) => r.label).includes('Quarterfinal 2, game 1'));
  assert.ok(records.map((r) => r.label).includes('Final, game 1'));
  assert.deepEqual(records.map((r) => r.id), games.map((g) => g.recordId), 'the game remembers its record id');
  assert.equal(new Set(records.map((r) => r.id)).size, records.length);
  assert.match(records[0].name, /^Team 1 vs Team 8$/);
});

test('match settings reach the fight: enclosed, scenery, knockback, ambush for the lower seed, and team tactics', () => {
  const tactic = Object.keys(TEAM_TACTICS).find((id) => id !== 'none');
  const field = entrants(2); field[0].members = [bruiser('Top')]; field[0].tactic = tactic;
  const play = (settings) => {
    const t = T.createTournament({ seed: 'set', format: 'single', entrants: field, bestOf: 3, settings });
    const records = [];
    T.playAll(t, R, { onGame: (rec) => records.push(rec) });
    return records;
  };
  const alt = play({ ambush: 'alternate' });
  assert.deepEqual(alt.map((r) => r.options.ambush), ['B', 'A'], 'the lower seed has the ambush: team B in game 1, team A in game 2');
  assert.equal(alt[0].options.tactics.A, tactic);
  assert.ok(play({ ambush: 'none' }).every((r) => r.options.ambush === null));
  const room = play({ enclosed: true });
  assert.ok(room.every((r) => r.options.enclosed && r.options.scale === 'street' && r.options.cover.length === 0));
  assert.ok(play({ scenery: 'street' }).every((r) => r.options.cover.length > 0));
  assert.ok(play({ scenery: 'none' }).every((r) => r.options.cover.length === 0));
  assert.ok(play({ knockback: false, shootThrough: false }).every((r) => !r.options.knockback && !r.options.shootThrough));
  assert.ok(play({}).every((r) => r.options.knockback && r.options.shootThrough));
});

// ---- determinism, saving, odds -----------------------------------------------------------------------------------

const outcome = (t) => JSON.stringify(t.matches.map((m) => [m.id, m.winner, m.games.map((g) => [g.seed, g.winnerId, g.rounds, g.kosA, g.kosB])]));

test('the same seed gives the same tournament, however the matches were played', () => {
  const fresh = (format) => T.createTournament({ seed: 'same', format, entrants: entrants(6, bruiser), bestOf: 3 });
  for (const format of ['single', 'double', 'round-robin']) {
    const a = fresh(format); T.playAll(a, R);
    const b = fresh(format);
    T.playNextMatch(b, R); T.playRound(b, R); T.playAll(b, R);
    assert.equal(outcome(a), outcome(b), format);
    const c = fresh(format); c.matches.reverse(); // play order must not change a match: its seed comes from its id
    assert.equal(a.matches.length, c.matches.length);
  }
});

test('a new seed changes the dice, and restart replays the same tournament', () => {
  const t = T.createTournament({ seed: 'one', format: 'single', entrants: entrants(8, bruiser) });
  T.playAll(t, R);
  const first = outcome(t);
  T.restart(t);
  assert.equal(t.status, 'ready'); assert.equal(t.played, 0); assert.equal(t.champion, null);
  assert.ok(t.matches.every((m) => !m.games.length));
  T.playAll(t, R);
  assert.equal(outcome(t), first, 'same seed, same tournament');
  T.withSeed(t, 'two');
  assert.equal(t.played, 0);
  T.playAll(t, R);
  assert.notEqual(outcome(t), first);
});

test('a tournament saved halfway and loaded again carries on exactly as it would have', () => {
  for (const format of ['single', 'double', 'round-robin']) {
    const straight = T.createTournament({ seed: 'save', format, entrants: entrants(5, bruiser), bestOf: 3 });
    T.playAll(straight, R);
    const half = T.createTournament({ seed: 'save', format, entrants: entrants(5, bruiser), bestOf: 3 });
    T.playNextMatch(half, R); T.playNextMatch(half, R); T.playNextMatch(half, R);
    const loaded = T.reviveTournament(JSON.parse(JSON.stringify(T.serializeTournament(half))));
    assert.equal(loaded.status, 'running');
    assert.equal(loaded.played, 3);
    T.playAll(loaded, R);
    assert.equal(outcome(loaded), outcome(straight), format);
    assert.equal(loaded.champion, straight.champion);
  }
  assert.throws(() => T.reviveTournament({ nope: 1 }), /not a saved tournament/);
});

test('title odds: the titles add up, the top seed of a stacked field wins them all, and the tournament is left alone', () => {
  const field = entrants(4); field[0].members = [bruiser('Top')];
  const t = T.createTournament({ seed: 'odds', format: 'double', entrants: field });
  const before = JSON.stringify(t);
  const odds = T.tournamentOdds(t, R, 12);
  assert.equal(odds.n, 12);
  assert.equal(Object.values(odds.titles).reduce((s, v) => s + v, 0) + odds.none, 12);
  assert.equal(odds.titles.e1, 12);
  assert.equal(JSON.stringify(t), before, 'the odds run does not touch the tournament');
  assert.deepEqual(T.tournamentOdds(t, R, 12), odds, 'the same every time');
  const even = T.tournamentOdds(T.createTournament({ seed: 'odds2', format: 'single', entrants: entrants(4, bruiser) }), R, 20);
  assert.equal(Object.values(even.titles).reduce((s, v) => s + v, 0) + even.none, 20);
  assert.ok(Object.values(even.titles).filter((v) => v > 0).length > 1, 'with even teams the titles are spread');
});

// ---- what the page reads -----------------------------------------------------------------------------------------

test('the bracket view lists rounds with entrants, waiting slots, byes, games and the champion', () => {
  const t = make(6, { bestOf: 3 }, bruiser);
  let v = T.bracketView(t);
  assert.equal(v.champion, null);
  assert.equal(v.sections.length, 1);
  assert.deepEqual(v.sections[0].rounds.map((r) => r.title), ['Quarterfinal', 'Semifinal', 'Final']);
  const [m1, m2, m3, m4] = v.sections[0].rounds[0].matches;
  assert.equal(m1.status, 'bye'); assert.equal(m1.b.text, 'Bye'); assert.equal(m1.a.name, 'Team 1');
  assert.equal(m2.status, 'ready'); assert.deepEqual([m2.a.name, m2.b.name], ['Team 4', 'Team 5']);
  assert.equal(m3.status, 'bye'); assert.equal(m4.id, 'W1-4');
  assert.equal(v.sections[0].rounds[1].matches[0].b.text, 'Winner of Quarterfinal 2');
  assert.equal(v.next, 'W1-2');
  T.playAll(t, R);
  v = T.bracketView(t);
  assert.equal(v.champion.id, t.champion);
  assert.equal(v.status, 'over');
  const played = v.sections[0].rounds[0].matches[1];
  assert.equal(played.status, 'done');
  assert.ok(played.games.length >= 2 && played.games[0].recordId && played.games.some((g) => /won in \d+ rounds?/.test(g.text)));
  assert.equal(played.a.winner || played.b.winner, true);
  const rr = T.bracketView(make(4, { format: 'round-robin' }));
  assert.equal(rr.grid.cells.length, 4);
  assert.equal(rr.grid.cells[0][0].text, '');
  const dbl = T.bracketView(make(4, { format: 'double' }));
  assert.deepEqual(dbl.sections.map((s) => s.title), ['Winners bracket', 'Losers bracket', 'Grand final']);
});

