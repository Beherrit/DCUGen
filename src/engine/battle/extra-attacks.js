// Extra Attacks (Martial Arts p83-84): a standard action, personal, instant. "You can make multiple attacks in a single round,
// allowing for a total number of attacks equal to your Extra Attacks power rank +1 (your regular attack)." All of them use the same
// weapon, attack method or power, need not go at the same target, and "are made using your normal attack modifier."
// Flaws read: Activation (Move Action: using it takes the whole round, so the fighter must not have moved), Chain (if any attack,
// even the first, misses, the attacks end), Declining (each extra attack after the first has a cumulative -5), Limited (only with the
// attacks the detail names). Dispersed (each later attack comes at an initiative 4 lower) is not played out: the attacks are all made
// at once. Extras (Mobility, Quick Combo, Quickened Charge) are not modelled. The Takedown advantage chains on top of this, as the
// book allows when the GM does.

import { log, enemiesOf } from './util.js';
import { inRangeNow, squares } from './geometry.js';
import { resolveAttack } from './attacks.js';
import { allowed } from './extra-attacks-read.js';

/** The foe for the next extra attack: the same one while it stands and is in range, else the nearest one in range. */
function nextTarget(b, c, atk, last) {
  if (last && !last.out && !last.fled && inRangeNow(b, c, atk, last)) return last;
  return enemiesOf(b, c).filter((e) => inRangeNow(b, c, atk, e)).sort((p, q) => squares(c, p) - squares(c, q))[0] || null;
}

/** After the regular attack: the extra attacks, one after another. `landed` is whether the first one landed (Chain). */
export function runExtraAttacks(b, R, c, atk, target, rng, landed) {
  const ea = c.extraAttacks;
  if (!ea || c.out || !atk.roll || atk.area || !allowed(ea, atk)) return;
  if (ea.move && c.squaresMoved > 0) return; // Activation (Move Action): the whole round goes on it
  if (ea.chain && !landed) { log(b, { kind: 'note', actor: c.id, text: `${c.name}'s Extra Attacks end: the first attack missed (Chain).` }); return; }
  log(b, { kind: 'note', actor: c.id, text: `${c.name} follows up with Extra Attacks: ${ea.rank} more with ${atk.name}${ea.declining ? ', each 5 worse than the last (Declining)' : ''}.`, important: true });
  let last = target;
  for (let k = 1; k <= ea.rank && !c.out; k++) {
    const t = nextTarget(b, c, atk, last);
    if (!t) { log(b, { kind: 'note', actor: c.id, text: `${c.name} has nobody left in range for attack ${k + 1} of ${ea.rank + 1}.` }); return; }
    const hit = resolveAttack(b, R, c, atk, t, rng, { declining: ea.declining ? 5 * k : 0 });
    last = t;
    if (ea.chain && !hit) { log(b, { kind: 'note', actor: c.id, text: `${c.name}'s Extra Attacks end: attack ${k + 1} missed (Chain).` }); return; }
  }
}
