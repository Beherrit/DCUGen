// One match: a best-of-N series of games between two entrants.
// The better seed is team A in the odd games and team B in the even ones. A game nobody wins (a stalemate) counts for
// no one and is replayed with the next seed, at most 3 times in a match; if it still will not end, the better seed
// advances. A round robin match is one game, and a stalemate there is a draw.

import { playGame } from './game.js';

export const MAX_REPLAYS = 3;

export const entrantOf = (t, id) => t.entrants.find((e) => e.id === id) || null;
/** The seed number of an entrant: 1 is the top seed. */
export const seedOf = (t, id) => t.order.indexOf(id) + 1;

/** How many games win the series: 1 of 1, 2 of 3, 3 of 5. */
export const gamesToWin = (bestOf) => Math.floor(bestOf / 2) + 1;

/** The letter of the lower seed on a game, when "alternate ambush" gives it the surprise; otherwise null. */
function ambushFor(t, hiIsA) {
  return t.settings.ambush === 'alternate' ? (hiIsA ? 'B' : 'A') : null;
}

function finish(m, wins, hi, lo, how) {
  m.scoreA = wins[m.a.id]; m.scoreB = wins[m.b.id];
  m.done = true;
  if (how.draw) { m.draw = true; return; }
  m.bySeed = how.bySeed;
  m.winner = (how.bySeed || wins[hi] > wins[lo]) ? hi : lo;
  m.loser = m.winner === hi ? lo : hi;
}

/**
 * Play the match to its end and write the games and result onto it. opts: { onGame(record, battle), date }.
 * Needs both entrants to be known.
 */
export function playMatch(t, R, m, opts = {}) {
  const [hi, lo] = seedOf(t, m.a.id) < seedOf(t, m.b.id) ? [m.a.id, m.b.id] : [m.b.id, m.a.id];
  const need = gamesToWin(t.bestOf);
  const maxReplays = t.format === 'round-robin' ? 0 : MAX_REPLAYS;
  const wins = { [hi]: 0, [lo]: 0 };
  let game = 1; let replay = 0; let used = 0;
  m.games = [];
  while (wins[hi] < need && wins[lo] < need) {
    const hiIsA = game % 2 === 1;
    const A = entrantOf(t, hiIsA ? hi : lo); const B = entrantOf(t, hiIsA ? lo : hi);
    const g = playGame(t, R, m, A, B, { game, replay, ambush: ambushFor(t, hiIsA), onGame: opts.onGame, date: opts.date });
    g.a = A.id; g.b = B.id;
    g.winnerId = g.winner === 'A' ? A.id : g.winner === 'B' ? B.id : null;
    m.games.push(g);
    if (g.winnerId) { wins[g.winnerId]++; game++; replay = 0; continue; }
    if (used >= maxReplays) return finish(m, wins, hi, lo, maxReplays ? { bySeed: true } : { draw: true });
    used++; replay++;
  }
  return finish(m, wins, hi, lo, { bySeed: false });
}
