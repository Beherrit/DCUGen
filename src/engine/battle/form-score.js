// How good a build is against the foes now: the harm its best attack does in a round, less the harm the foes would do to it (its
// share of their attention, one in the size of its team). The change-of-form options (Alternate Form, Shapeshift, Mimic) are worth
// the gain in this number over the next rounds. It reads the fighter's attacks and defenses as they stand, so a build is scored by
// putting it on (a probe, or changes applied with mods.js withMods) and calling this.

import { alliesOf } from './util.js';
import { feet } from './geometry.js';
import { bestEvNow, threatOn } from './odds.js';

/** The score of fighter f, standing where it is, against the foes. */
export function formScore(b, f, foes) {
  if (!foes.length) return 0;
  const offense = Math.max(0, ...foes.map((e) => bestEvNow(f, e, feet(b, f, e), 0, true)));
  const share = 1 / (1 + alliesOf(b, f).length);
  const harm = share * foes.reduce((s, e) => s + threatOn(e, f, feet(b, e, f)), 0);
  return offense - harm;
}

/** Rounds a better build is counted over, and how much of that is expected to last. */
export const FORM_HORIZON = 3;
export const FORM_DURABLE = 0.7;
/** The gain (in expected degrees over the horizon) a change must promise to be worth the trouble. */
export const MIN_FORM_GAIN = 0.8;
/** A new build must beat the current one by this much of it as well, so the fighter does not flip back and forth. */
export const FORM_MARGIN = 0.15;

/** What changing from a score `now` to a score `then` is worth over the horizon (0 when it does not clear the margin). */
export function formGain(now, then) {
  if (then < now + Math.max(0.3, FORM_MARGIN * Math.abs(now))) return 0;
  return (then - now) * FORM_HORIZON * FORM_DURABLE;
}
