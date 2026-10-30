// Immortality (Hero's Handbook p102): "If your condition becomes dead, you return to life after a time. Subtract your Immortality
// rank from a time rank of 19 (one month) to determine how long it takes... At rank 20, you recover from death at the start of each
// action round! When you recover, all your damage conditions are removed, but you also lose all accumulated hero points."
// Only a lethal fight has death (dying.js), so only there does it matter. The time rank gives the rounds (time rank 0 is a round, each
// rank after that doubles it as the Measurements table does: 12 seconds 2 rounds, 30 seconds 5, a minute 10, 2 minutes 20, 4 minutes 40),
// counted from the round the fighter died; a longer time is past the end of any fight. The Limited flaw (a named way of dying that
// keeps it from coming back) is not read.

import { allPowers } from '../derive.js';
import { log } from './util.js';
import { MAX_ROUNDS } from './constants.js';

/** The rounds a time rank takes (rank 0 and under: the next round). */
const ROUNDS = { 1: 2, 2: 5, 3: 10, 4: 20, 5: 40 };

/** The best Immortality rank the character has, or 0. */
export function immortalityOf(ch) {
  return Math.max(0, ...allPowers(ch, { includeAlternates: false }).filter(({ power: p }) => p.effect === 'Immortality' && p.role !== 'defense').map(({ power: p }) => p.rank || 0));
}

/** Rounds until an Immortality of this rank brings the dead back, or Infinity when it is longer than a fight. */
export function roundsToReturn(rank) {
  const time = 19 - rank;
  if (time <= 0) return 1;
  return ROUNDS[time] ?? Infinity;
}

/** The fighter has just died: set the round it will come back, if it ever does. */
export function noteDeath(b, c) {
  const rank = immortalityOf(c.ch);
  const rounds = rank ? roundsToReturn(rank) : Infinity;
  if (rounds > MAX_ROUNDS) return;
  c.returnRound = b.round + rounds;
  log(b, { kind: 'note', actor: c.id, text: `${c.name} has Immortality ${rank}: it will return to life in ${rounds} round${rounds === 1 ? '' : 's'}.` });
}

/** The start of a round: the dead whose time has come get up with every damage condition gone and no hero points. */
export function returnFromDeath(b) {
  for (const c of b.combatants) {
    if (!c.dead || c.returnRound == null || b.round < c.returnRound) continue;
    Object.assign(c, { dead: false, dying: false, stable: false, diehard: false, dyingFails: 0, out: false, outReason: null, returnRound: null, bruises: 0, staggered: false, dazed: false, incurable: null, heroPoints: 0 });
    c.conditions = c.conditions.filter((x) => x.source === 'surprise');
    log(b, { kind: 'recover', actor: c.id, text: `${c.name} returns from the dead (Immortality): every damage condition is gone, and so are its hero points.`, important: true });
  }
}
