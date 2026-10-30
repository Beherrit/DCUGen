// Building the matches of a bracket. A match has two slots; a slot holds an entrant id, or says which match feeds it
// ({ match, take: 'winner' | 'loser' }), or is dead (nobody will ever fill it: a bye). Matches are listed in play order.

import { firstRoundPairs, nextPow2 } from './seeding.js';
import { roundName, matchLabel, winnersName, losersName } from './names.js';

export const slotOf = (id, from = null) => ({ id: id || null, from, dead: !id && !from });
export const feed = (match, take = 'winner') => slotOf(null, { match: match.id, take });

/** A blank match. fields: id, bracket ('W', 'L', 'F', 'R'), round, index, wave, label, tier, a, b. */
export function newMatch(fields) {
  return {
    games: [], scoreA: 0, scoreB: 0, winner: null, loser: null, done: false, bye: false, dead: false, skipped: false, bySeed: false, draw: false,
    ...fields,
  };
}

const log2 = (p) => Math.round(Math.log2(p));

/**
 * The winners side of a bracket (the whole bracket in a single elimination). `order` is the entrant ids by seed. Returns
 * an array of rounds, each an array of matches. namer(r, rounds) gives the round name; wave(r) the play wave.
 */
export function winnersRounds(order, { namer = roundName, wave = (r) => r, tier = (r) => r } = {}) {
  const size = nextPow2(order.length);
  const total = log2(size);
  const rounds = [];
  const first = firstRoundPairs(order.length).map(([x, y], i, all) => newMatch({
    id: `W1-${i + 1}`, bracket: 'W', round: 1, index: i + 1, wave: wave(1), tier: tier(1),
    label: matchLabel(namer(1, total), all.length, i + 1), a: slotOf(x && order[x - 1]), b: slotOf(y && order[y - 1]),
  }));
  rounds.push(first);
  for (let r = 2; r <= total; r++) {
    const prev = rounds[r - 2];
    const count = prev.length / 2;
    rounds.push(Array.from({ length: count }, (_, i) => newMatch({
      id: `W${r}-${i + 1}`, bracket: 'W', round: r, index: i + 1, wave: wave(r), tier: tier(r),
      label: matchLabel(namer(r, total), count, i + 1), a: feed(prev[2 * i]), b: feed(prev[2 * i + 1]),
    })));
  }
  return rounds;
}

/** Single elimination: the winners rounds, in play order. */
export function buildSingle(order) {
  return winnersRounds(order).flat();
}

/** The losers side: LB round 1 pairs the first-round losers; then each winners round drops its losers into a round of its own. */
function losersRounds(winners, total) {
  const rounds = [];
  const size = nextPow2(winners[0].length * 2);
  const lbTotal = 2 * (total - 1);
  const make = (r, count, pick) => Array.from({ length: count }, (_, i) => {
    const [a, b] = pick(i);
    return newMatch({ id: `L${r}-${i + 1}`, bracket: 'L', round: r, index: i + 1, wave: 0, tier: r, label: matchLabel(losersName(r, lbTotal), count, i + 1), a, b });
  });
  rounds.push(make(1, size / 4, (i) => [feed(winners[0][2 * i], 'loser'), feed(winners[0][2 * i + 1], 'loser')]));
  for (let j = 1; j < total; j++) {
    const drops = winners[j];
    const prev = rounds[2 * j - 2];
    const flip = j % 2 === 1; // reverse the drop order every other time, so rematches come late
    rounds.push(make(2 * j, drops.length, (i) => [feed(prev[i]), feed(drops[flip ? drops.length - 1 - i : i], 'loser')]));
    if (j < total - 1) {
      const cur = rounds[2 * j - 1];
      rounds.push(make(2 * j + 1, cur.length / 2, (i) => [feed(cur[2 * i]), feed(cur[2 * i + 1])]));
    }
  }
  return rounds;
}

/** Wave numbers for a double elimination in play order: W1, L1, W2, L2, L3, W3, L4, L5, W4, ... */
function sequence(winners, losers) {
  const out = [...winners[0], ...(losers[0] || [])];
  for (let r = 2; r <= winners.length; r++) {
    out.push(...winners[r - 1]);
    for (const k of [2 * r - 2, 2 * r - 1]) if (losers[k - 1]) out.push(...losers[k - 1]);
  }
  let wave = 0; let last = '';
  for (const m of out) { const key = `${m.bracket}${m.round}`; if (key !== last) { wave++; last = key; } m.wave = wave; }
  return out;
}

/**
 * Double elimination: winners bracket, losers bracket, the grand final, and the reset match that is played only when
 * the losers' side wins the grand final. Returns the matches in play order.
 */
export function buildDouble(order) {
  const winners = winnersRounds(order, { namer: winnersName, tier: () => 0 });
  const total = winners.length;
  const losers = total > 1 ? losersRounds(winners, total) : [];
  const wbFinal = winners[total - 1][0];
  const lbFinal = losers.length ? losers[losers.length - 1][0] : null;
  const list = sequence(winners, losers);
  const wave = list[list.length - 1].wave;
  const f1 = newMatch({ id: 'F1', bracket: 'F', round: 1, index: 1, wave: wave + 1, tier: 500, label: 'Grand final', a: feed(wbFinal), b: lbFinal ? feed(lbFinal) : feed(wbFinal, 'loser') });
  const f2 = newMatch({ id: 'F2', bracket: 'F', round: 2, index: 1, wave: wave + 2, tier: 500, label: 'Grand final reset', reset: true, a: feed(f1, 'loser'), b: feed(f1) });
  return [...list, f1, f2];
}
