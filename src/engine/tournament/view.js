// What the page draws: the bracket as rounds of matches (entrants, game scores, winner, the games of each match), and for
// a round robin the grid of results. All of it is read from the tournament; nothing here changes it.

import { matchById } from './resolve.js';
import { entrantOf, seedOf } from './match.js';
import { roundName, losersName } from './names.js';
import { championOf } from './standings.js';

const TAKE = { winner: 'Winner', loser: 'Loser' };

/** One side of a match for the page: the entrant, or what it is waiting for ("Winner of Quarterfinal 2"), or "Bye". */
function sideView(t, slot, score, m) {
  if (slot.id) {
    const e = entrantOf(t, slot.id);
    return { id: slot.id, name: e.name, seed: seedOf(t, slot.id), score, winner: m.done && m.winner === slot.id, text: e.name, pending: false };
  }
  const feeder = slot.from && matchById(t, slot.from.match);
  const text = slot.dead ? 'Bye' : feeder ? `${TAKE[slot.from.take]} of ${feeder.label}` : 'To be decided';
  return { id: null, name: null, seed: null, score: null, winner: false, text, pending: !slot.dead };
}

function gameView(t, g) {
  const winner = g.winnerId ? entrantOf(t, g.winnerId).name : null;
  const text = winner ? `${winner} won in ${g.rounds} round${g.rounds === 1 ? '' : 's'}` : `Stalemate after ${g.rounds} rounds`;
  return { label: g.label, recordId: g.recordId, winnerId: g.winnerId, text, stalemate: !g.winnerId, replay: g.replay };
}

const statusOf = (m) => (m.skipped ? 'skipped' : m.bye ? 'bye' : m.done ? 'done' : m.a.id && m.b.id ? 'ready' : 'waiting');

/** A match for the page. */
export function matchView(t, m) {
  return {
    id: m.id, label: m.label, bracket: m.bracket, round: m.round, status: statusOf(m), bySeed: m.bySeed, draw: m.draw,
    a: sideView(t, m.a, m.scoreA, m), b: sideView(t, m.b, m.scoreB, m), winnerId: m.winner, games: m.games.map((g) => gameView(t, g)),
  };
}

const TITLES = { W: 'Winners bracket', L: 'Losers bracket', F: 'Grand final', R: 'Rounds' };

function roundTitle(t, bracket, round, rounds) {
  if (bracket === 'L') return losersName(round, rounds);
  if (bracket === 'R') return `Round ${round}`;
  if (bracket === 'F') return round === 1 ? 'Grand final' : 'Reset';
  return roundName(round, rounds);
}

/** The matches grouped into sections (bracket) and rounds, dead matches left out. */
function sections(t) {
  const out = [];
  for (const letter of ['W', 'L', 'F', 'R']) {
    const list = t.matches.filter((m) => m.bracket === letter && !m.dead);
    if (!list.length) continue;
    const rounds = [...new Set(list.map((m) => m.round))].sort((x, y) => x - y);
    const last = Math.max(...t.matches.filter((m) => m.bracket === letter).map((m) => m.round));
    out.push({
      id: letter, title: letter === 'W' && t.format === 'single' ? 'Bracket' : TITLES[letter],
      rounds: rounds.map((r) => ({ round: r, title: roundTitle(t, letter, r, last), matches: list.filter((m) => m.round === r).map((m) => matchView(t, m)) })),
    });
  }
  return out;
}

/** The round robin grid: row entrant against column entrant, from the row's side ("W 1-0", "L 0-1", "D"). */
function gridOf(t) {
  const ids = t.order.slice();
  const cell = (rowId, colId) => {
    const m = t.matches.find((x) => (x.a.id === rowId && x.b.id === colId) || (x.a.id === colId && x.b.id === rowId));
    if (!m || rowId === colId) return { text: '', matchId: null, result: null };
    if (!m.done) return { text: '-', matchId: m.id, result: null };
    const mine = m.a.id === rowId ? m.scoreA : m.scoreB; const theirs = m.a.id === rowId ? m.scoreB : m.scoreA;
    if (m.draw) return { text: 'D', matchId: m.id, result: 'D' };
    return { text: `${m.winner === rowId ? 'W' : 'L'} ${mine}-${theirs}`, matchId: m.id, result: m.winner === rowId ? 'W' : 'L' };
  };
  return { ids, names: ids.map((id) => entrantOf(t, id).name), cells: ids.map((r) => ids.map((c) => cell(r, c))) };
}

/**
 * The whole bracket for the page: { format, status, champion, sections: [{ id, title, rounds: [{ round, title, matches }] }],
 * grid (round robin only), next (the id of the next match to play) }.
 */
export function bracketView(t) {
  const champ = championOf(t);
  const next = t.matches.find((m) => !m.done && m.a.id && m.b.id);
  return {
    format: t.format, status: t.status, bestOf: t.bestOf, champion: champ ? { id: champ.id, name: champ.name } : null,
    sections: sections(t), grid: t.format === 'round-robin' ? gridOf(t) : null, next: next ? next.id : null,
  };
}
