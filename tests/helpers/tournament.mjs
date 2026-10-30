// Shared bits for the tournament tests: small fighters, a way to settle a match by hand, and short readers.
import * as T from '../../src/engine/tournament.js';
import { resolve } from '../../src/engine/tournament/resolve.js';
import { refresh } from '../../src/engine/tournament/state.js';

// Hand-made fighters, so the tests do not depend on the generator. A bruiser always beats a weakling, and two weaklings
// can never hurt each other (a stalemate).
export const bruiser = (name) => ({
  identity: { codename: name }, pl: 10,
  abilities: { Strength: 8, Stamina: 8, Agility: 2, Dexterity: 0, Fighting: 8, Intellect: 0, Awareness: 0, Presence: 0 },
  defenses: { Dodge: 2, Parry: 6, Fortitude: 6, Will: 2 }, skills: [], advantages: [], powers: [],
});
export const weakling = (name) => ({
  identity: { codename: name }, pl: 1,
  abilities: { Strength: 0, Stamina: 0, Agility: 0, Dexterity: 0, Fighting: 0, Intellect: 0, Awareness: 0, Presence: 0 },
  defenses: { Dodge: 0, Parry: 0, Fortitude: 0, Will: 0 }, skills: [], advantages: [], powers: [],
});
export const entrants = (n, make = weakling, extra = {}) => Array.from({ length: n }, (_, i) => ({ name: `Team ${i + 1}`, members: [make(`F${i + 1}`)], ...extra }));
export const make = (n, opts = {}, make1 = weakling) => T.createTournament({ seed: 'tt', format: 'single', entrants: entrants(n, make1), ...opts });

/** Settle a match by hand (no fight): the winner, and the knockouts each side dealt. */
export function force(t, id, winnerId, kos = {}) {
  const m = T.matchById(t, id);
  const loser = winnerId === m.a.id ? m.b.id : m.a.id;
  const aWon = winnerId === m.a.id;
  m.games = [{ game: 1, replay: 0, seed: id, label: m.label, recordId: 'x', winner: aWon ? 'A' : 'B', winnerId, a: m.a.id, b: m.b.id, rounds: 3, kosA: kos[m.a.id] ?? (aWon ? 1 : 0), kosB: kos[m.b.id] ?? (aWon ? 0 : 1) }];
  Object.assign(m, { scoreA: aWon ? 1 : 0, scoreB: aWon ? 0 : 1, done: true, winner: winnerId, loser });
  refresh(resolve(Object.assign(t, { played: t.played + 1 })));
  return m;
}
export function forceDraw(t, x, y, kos = {}) {
  const m = t.matches.find((q) => [q.a.id, q.b.id].sort().join() === [x, y].sort().join());
  m.games = [{ game: 1, replay: 0, seed: m.id, label: m.label, recordId: 'x', winner: null, winnerId: null, a: m.a.id, b: m.b.id, rounds: 40, kosA: kos[m.a.id] ?? 0, kosB: kos[m.b.id] ?? 0 }];
  Object.assign(m, { done: true, draw: true });
  refresh(resolve(Object.assign(t, { played: t.played + 1 })));
}
/** Settle the match between two entrants (whichever way round it is listed). */
export function forcePair(t, winner, loser, kos = {}) {
  const m = t.matches.find((q) => [q.a.id, q.b.id].sort().join() === [winner, loser].sort().join());
  return force(t, m.id, winner, kos);
}
export const higher = (t, m) => (T.seedOf(t, m.a.id) < T.seedOf(t, m.b.id) ? m.a.id : m.b.id);
export function playForced(t, pick = higher) {
  for (let m, guard = 0; (m = T.nextMatch(t)) && guard++ < 300;) force(t, m.id, pick(t, m));
  return t;
}
export const losses = (t, id) => t.matches.filter((m) => m.loser === id && m.games.length).length;
export const mid = (t, id) => T.matchById(t, id);
