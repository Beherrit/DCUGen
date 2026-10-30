// Playing a tournament: the next match, a whole round, or everything that is left. A match has its own seed (from the
// tournament seed and its id), so the results do not depend on the order the matches were played in.
// opts: { onGame(record, battle), date } is passed on to every game (the app keeps each game's fight record).

import { resolve, nextMatch } from './resolve.js';
import { playMatch } from './match.js';
import { refresh } from './state.js';

/** Play the next match. Returns the match, or null when there is nothing left to play. */
export function playNextMatch(t, R, opts = {}) {
  resolve(t);
  const m = nextMatch(t);
  if (!m) return null;
  playMatch(t, R, m, opts);
  t.played++;
  refresh(resolve(t));
  return m;
}

/** Play every match that is ready and in the same round (wave) as the next one. Returns the matches played. */
export function playRound(t, R, opts = {}) {
  resolve(t);
  const first = nextMatch(t);
  if (!first) return [];
  const played = [];
  for (const m of t.matches.filter((x) => x.wave === first.wave && !x.done && x.a.id && x.b.id)) {
    playMatch(t, R, m, opts);
    t.played++;
    played.push(m);
  }
  refresh(resolve(t));
  return played;
}

/** Play until the tournament is over. Returns the number of matches played. */
export function playAll(t, R, opts = {}) {
  let n = 0;
  while (t.status !== 'over' && playNextMatch(t, R, opts)) n++;
  return n;
}
