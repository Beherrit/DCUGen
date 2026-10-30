// What the AI makes of the extras that give an attack more than one go: the multiplier on its expected value.
// - Secondary Effect hits the target again next round with no new attack check, worth most of a second use.
// - Increased Duration keeps the effect on the target: a free or no-action hold is worth more than concentration, which costs the standard action.
// - Homing gives a miss another try, worth the share of a use that a miss would have lost.
// - Partial Resistance means a one-degree success does not fully resist it.
// (Split is chosen in extra-split.js, Ricochet and Indirect work through cover.js.)

import { durationOf } from './extras.js';

const SECONDARY = 1.6;
const HELD = { concentration: 1.3, sustained: 1.7, continuous: 1.7 };
const HOMING_MISS = 0.7; // a retry is as good as the first try, a round later
const PARTIAL = 1.1;

/** The multiplier for the extras on this attack (1 when it has none), given the chance that its attack check hits. */
export function extraFactor(atk, hit) {
  const ex = atk.ex;
  if (!ex) return 1;
  let m = 1;
  if (ex.secondary) m *= SECONDARY;
  const held = durationOf(ex);
  if (held) m *= HELD[held];
  if (ex.homing && atk.kind === 'ranged' && atk.roll) m *= 1 + (1 - hit) * HOMING_MISS * Math.min(2, ex.homing);
  if (ex.partialRes) m *= PARTIAL;
  return m;
}
