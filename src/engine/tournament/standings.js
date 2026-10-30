// The standings: a table row for every entrant. In a round robin the table is ordered by points (3 a win, 1 a draw)
// with tiebreaks; in a bracket by how far each entrant got.

import { orderTable } from './tiebreak.js';
import { seedOf, entrantOf } from './match.js';
import { eliminationChampion } from './resolve.js';

const real = (m) => m.done && !m.bye && !m.skipped && !m.dead && m.games.length > 0;

function blankRow(t, e) {
  return { id: e.id, name: e.name, seed: seedOf(t, e.id), played: 0, won: 0, drawn: 0, lost: 0, points: 0, gamesWon: 0, gamesLost: 0, kos: 0, lastLoss: null, rank: 0, decidedBy: null, status: 'alive' };
}

function addMatch(rows, m) {
  const [ra, rb] = [rows[m.a.id], rows[m.b.id]];
  ra.played++; rb.played++;
  ra.gamesWon += m.scoreA; ra.gamesLost += m.scoreB; rb.gamesWon += m.scoreB; rb.gamesLost += m.scoreA;
  for (const g of m.games) { rows[g.a].kos += g.kosA; rows[g.b].kos += g.kosB; }
  if (m.draw) { ra.drawn++; rb.drawn++; ra.points += 1; rb.points += 1; return; }
  const [w, l] = [rows[m.winner], rows[m.loser]];
  w.won++; w.points += 3; l.lost++; l.lastLoss = m;
}

/** The raw numbers of every entrant from the matches played so far. */
function tally(t) {
  const rows = Object.fromEntries(t.entrants.map((e) => [e.id, blankRow(t, e)]));
  for (const m of t.matches) if (real(m)) addMatch(rows, m);
  return rows;
}

function bracketStandings(t, rows) {
  const champion = eliminationChampion(t);
  const losses = (r) => t.matches.filter((m) => real(m) && m.loser === r.id).length;
  const out = (r) => (t.format === 'double' ? losses(r) >= 2 : losses(r) >= 1);
  for (const r of Object.values(rows)) r.status = r.id === champion ? 'champion' : out(r) ? 'out' : 'alive';
  const tier = (r) => (r.status === 'champion' ? 1000 : r.status === 'alive' ? 999 : r.lastLoss?.tier ?? 0);
  const list = Object.values(rows).sort((x, y) => tier(y) - tier(x) || y.won - x.won || x.seed - y.seed);
  list.forEach((r, i) => { r.rank = i + 1; delete r.lastLoss; });
  return list;
}

/** Rows ordered best first: id, name, seed, played, won, drawn, lost, points, gamesWon, gamesLost, kos, rank, decidedBy, status. */
export function standings(t) {
  const rows = tally(t);
  if (t.format !== 'round-robin') return bracketStandings(t, rows);
  const done = t.matches.every((m) => m.done);
  const list = orderTable(t, Object.values(rows));
  list.forEach((r, i) => { r.rank = i + 1; r.status = done && i === 0 ? 'champion' : 'alive'; delete r.lastLoss; });
  return list;
}

/** The champion's entrant, or null while the tournament runs. */
export function championOf(t) {
  if (t.format === 'round-robin') return t.matches.every((m) => m.done) ? entrantOf(t, standings(t)[0].id) : null;
  const id = eliminationChampion(t);
  return id ? entrantOf(t, id) : null;
}
