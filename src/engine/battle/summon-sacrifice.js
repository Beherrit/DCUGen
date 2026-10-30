// The Sacrifice extra of Summon (Hero's Handbook p118): when a hit that needs a resistance check lands on the summoner, it can
// spend a hero point to shift the effect to one of its minions instead. The minion must be within range of the effect and a
// viable target. The AI does it when the hit would do real harm and a minion is there to take it.

import { log } from './util.js';
import { inRangeNow } from './geometry.js';
import { expectedValue, isImmune } from './odds.js';
import { liveSummons } from './summon.js';

/** Harm (in expected degrees) a hit must be worth before the summoner gives up a hero point and a minion for it. */
const WORTH_A_MINION = 1.2;

/** The minion that takes the hit meant for t, or null. Spends t's hero point when there is one. */
export function sacrificeFor(b, c, atk, t) {
  if (!b.options.heroPoints || t.heroPoints < 1 || !t.summoned?.length) return null;
  const m = liveSummons(b, t).find((x) => x.summon.sacrifice && inRangeNow(b, c, atk, x) && !isImmune(x, atk));
  if (!m || expectedValue(c, atk, t, { autoHit: true }) < WORTH_A_MINION) return null;
  t.heroPoints -= 1;
  log(b, { kind: 'condition', actor: t.id, target: m.id, text: `${t.name} spends a hero point and shifts the effect onto ${m.name} (Sacrifice, ${t.heroPoints} left).`, important: true });
  return m;
}
