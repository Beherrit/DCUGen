// Running a whole campaign, and running many of them from one setup to see which team tends to win.

import { stepCity } from './step.js';
import { copyCity, resetCity, withSeed, teamById } from './war.js';

/** Play turns until one team is left or maxTurns turns have passed. Returns the war. */
export function runCity(war, R, { maxTurns = 200, onFight } = {}) {
  let guard = 0;
  while (war.status !== 'over' && war.turn < maxTurns && guard++ < maxTurns + 5) stepCity(war, R, { onFight });
  if (war.status !== 'over') {
    war.status = 'over';
    war.winner = null;
    war.log.push({ turn: war.turn, kind: 'end', text: `Turn ${war.turn}: ${maxTurns} turns and no team is left standing alone. The war ends in a stalemate.` });
  }
  return war;
}

/** Campaign number i of an odds run: the setup copied with its own seed. Returns the war once it is over. */
export function playOdds(setupWar, R, i, maxTurns = 200) {
  const war = withSeed(copyCity(setupWar), `${setupWar.seed}::odds::${i}`);
  resetCity(war);
  return runCity(war, R, { maxTurns });
}

/** Add one finished campaign to an odds tally ({ n, wins, none, turnsTotal }). */
export function tallyOdds(tally, war) {
  tally.n++;
  tally.turnsTotal += war.turn;
  if (war.winner && teamById(war, war.winner)) tally.wins[war.winner] = (tally.wins[war.winner] || 0) + 1; else tally.none++;
  return tally;
}

export const newTally = (setupWar) => ({ n: 0, wins: Object.fromEntries(setupWar.teams.map((t) => [t.id, 0])), none: 0, turnsTotal: 0 });

/**
 * Run n campaigns from one setup: the same teams, positions and terrain, a different seed for the dice each time.
 * Returns { n, wins: { teamId: count }, none, turnsTotal } where none counts campaigns with no single winner.
 */
export function cityOdds(setupWar, R, n = 50, { maxTurns = 200 } = {}) {
  const tally = newTally(setupWar);
  for (let i = 0; i < n; i++) tallyOdds(tally, playOdds(setupWar, R, i, maxTurns));
  return tally;
}
