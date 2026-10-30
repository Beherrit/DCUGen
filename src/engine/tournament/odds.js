// Title odds: play the whole tournament again and again from the same entrants, seeding and settings, each time with
// different dice, and count how often each entrant wins. Nothing is saved for these games.

import { copyTournament, rebuild } from './state.js';
import { playAll } from './play.js';

/** Run number i of an odds run: a copy with its own seed, played to the end. The seed order stays as it is. */
export function playOdds(setup, R, i) {
  const t = copyTournament(setup);
  t.seed = `${setup.seed}::odds::${i}`;
  rebuild(t);
  playAll(t, R);
  return t;
}

/** An empty tally for a setup: { n, titles: { entrantId: count }, none, matches }. */
export const newTally = (setup) => ({ n: 0, titles: Object.fromEntries(setup.entrants.map((e) => [e.id, 0])), none: 0, matches: 0 });

/** Add one finished tournament to a tally. */
export function tallyOdds(tally, t) {
  tally.n++;
  tally.matches += t.matches.filter((m) => m.games.length).length;
  if (t.champion && t.champion in tally.titles) tally.titles[t.champion]++; else tally.none++;
  return tally;
}

/** Play n tournaments and count the titles. */
export function tournamentOdds(t, R, n = 50) {
  const tally = newTally(t);
  for (let i = 0; i < n; i++) tallyOdds(tally, playOdds(t, R, i));
  return tally;
}
