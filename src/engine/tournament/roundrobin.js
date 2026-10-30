// Round robin: everyone fights everyone once. The schedule is the circle method: one entrant stays put and the rest
// turn around it, so every round has each entrant in at most one match (an odd field gives one entrant a rest each round).

import { newMatch, slotOf } from './bracket.js';
import { matchLabel } from './names.js';

/** All matches, round by round. `order` is the entrant ids by seed. */
export function buildRoundRobin(order) {
  const ring = order.length % 2 ? [...order, null] : order.slice();
  const n = ring.length;
  const out = [];
  for (let r = 1; r < n; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const x = ring[i]; const y = ring[n - 1 - i];
      if (x && y) pairs.push([x, y]);
    }
    pairs.forEach(([x, y], i) => out.push(newMatch({
      id: `R${r}-${i + 1}`, bracket: 'R', round: r, index: i + 1, wave: r, tier: 0,
      label: matchLabel(`Round ${r}`, pairs.length, i + 1), a: slotOf(x), b: slotOf(y),
    })));
    ring.splice(1, 0, ring.pop()); // turn the ring: the last entrant moves to the second place
  }
  return out;
}
