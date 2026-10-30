// What an attack is worth to the team, in the same units as the expected degrees of harm (odds.js expectedValue).
// A Damage attack is worth its expected value. A control attack is worth the turns it takes off the enemy (utility-control.js),
// Weaken the swing it gives the team's next attacks or takes off the enemy's (utility-weaken.js), and Nullify the gain from
// stripping a sustained defense. Everything else is worth its expected value.

import { roleWeight } from './roles.js';
import { controlValue, nullifyGain } from './utility-control.js';
import { weakenValue } from './utility-weaken.js';
import { expectedValue } from './odds.js';

const isControl = (atk) => !!atk.tiers && atk.effect !== 'Damage' && atk.effect !== 'Weaken';

/** The value of attack `atk` by c on t. `ev` is its expected value; `opts` are the expectedValue options (trade-offs, distance). */
export function attackValue(b, c, atk, t, ev, opts) {
  if (atk.effect === 'Weaken') {
    const w = weakenValue(b, c, atk, t, opts);
    // With nothing else that can touch the target (a lone ghost with only a draining touch), a Weaken that helps no
    // attack of the team is still better than holding: it is worth what its degrees are worth on their own.
    if (c.attacks.some((a) => a !== atk && a.effect !== 'Weaken' && expectedValue(c, a, t, opts) > 0)) return w;
    return Math.max(w, ev);
  }
  if (atk.effect === 'Nullify') return nullifyGain(b, c, atk, t, opts) * roleWeight(c, 'controller');
  if (!isControl(atk)) return ev;
  return controlValue(b, c, atk, t, opts) * roleWeight(c, 'controller');
}
