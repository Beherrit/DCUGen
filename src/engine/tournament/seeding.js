// Seeding: who is seed 1, 2, 3 and so on, and where each seed stands in a bracket.
// Seed 1 is the top seed. A bracket always has a power-of-two number of places; the places nobody fills are byes,
// and because the standard layout pairs seed 1 with the last place, byes go to the top seeds.

import { makeRng } from '../rng.js';

/** The smallest power of two that is at least n (2 for anything below 2). */
export function nextPow2(n) {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

/**
 * The seed at each place of a bracket of `size` places, top to bottom: 1,8,4,5,2,7,3,6 for eight. Neighbours (0-1, 2-3, ...)
 * meet in round 1, and seeds 1 and 2 can only meet in the final.
 */
export function bracketOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const total = order.length * 2 + 1;
    order = order.flatMap((s) => [s, total - s]);
  }
  return order;
}

/** Entrant ids in seed order: as given, or shuffled by the tournament seed ('random'). */
export function seedOrder(ids, seed, mode) {
  if (mode !== 'random') return ids.slice();
  return makeRng(`${seed}::seeding`).shuffle(ids);
}

/** Round-1 layout: for each pair of places, the two seeds (a seed above `count` is a bye, null). */
export function firstRoundPairs(count) {
  const places = bracketOrder(nextPow2(count)).map((s) => (s <= count ? s : null));
  const pairs = [];
  for (let i = 0; i < places.length; i += 2) pairs.push([places[i], places[i + 1]]);
  return pairs;
}
