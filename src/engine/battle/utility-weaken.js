// Weaken as a utility. The trait it lowers decides the value: a defense or Toughness makes the team's next attacks on that
// enemy worth more (the allies' expected values before and after), an attack power or Fighting makes the enemy's harm to
// the team smaller. Each is measured by trying the loss on the target and asking the engine, so a trait it does not
// model is worth nothing. The ranks lost are weighed by the chance of each number of failed degrees.

import { alliesOf } from './util.js';
import { expectedValue, bestEvNow } from './odds.js';
import { foeHarm } from './utility-control.js';
import { feet } from './geometry.js';
import { weakenTraits } from './weaken-traits.js';
import { roleWeight } from './roles.js';

/** Try a loss of `lost` ranks of the trait on t, run `fn`, and put t's weakened traits back exactly. */
function tryLoss(t, trait, lost, fn) {
  const saved = t.weakened;
  t.weakened = { ...saved };
  try { weakenTraits(t, trait, lost); return fn(); } finally { t.weakened = saved; }
}

/** The team's side of the board against t: what its attacks are worth and what t's attacks are worth against it. */
function board(b, c, t) {
  const team = [c, ...alliesOf(b, c)];
  return { strike: team.reduce((s, m) => s + bestEvNow(m, t, feet(b, m, t), 0, true), 0), threat: foeHarm(b, c.team, t) };
}

/** The value of this Weaken attack on t: expected swing over the ranks it may take. */
export function weakenValue(b, c, atk, t, opts) {
  const trait = atk.weakens || 'Toughness';
  const rank = atk.rank + (opts.rankShift || 0);
  const now = board(b, c, t);
  let total = 0;
  for (let degrees = 1; degrees <= 4; degrees++) {
    const chance = expectedValue(c, { ...atk, weights: [0, 1, 2, 3, 4].map((i) => (i === degrees ? 1 : 0)) }, t, opts);
    if (chance <= 0) continue;
    const after = tryLoss(t, trait, Math.min(degrees, rank), () => board(b, c, t));
    total += chance * (Math.max(0, after.strike - now.strike) + Math.max(0, now.threat - after.threat));
  }
  return total * roleWeight(c, 'debuffer');
}
