// Grab-Based (DCA 135): the effect needs a successful grab first, and works on its own once the hold is made ("if your
// grab attempt succeeds, the effect occurs automatically as a reaction"). While the hold lasts, the standard action each turn
// is the effect itself, with no attack roll (Grab, DCA 176: "a standard action to inflict your Strength damage to a grabbed
// target on subsequent turns").

import { log } from './util.js';
import { applyEffect } from './attack-effects.js';
import { grab } from './maneuvers.js';
import { expectedValue } from './odds.js';

/** Is c holding t right now? */
const holds = (c, t) => c.holding === t.id && t.grabbedBy === c.id;

/** Use a Grab-Based attack on t: the grab first (the attack check against Parry, then the hold), then the effect. Returns the effect result or null. */
export function grabBasedUse(b, R, c, atk, t, rng, rankShift) {
  if (!holds(c, t)) {
    log(b, { kind: 'attack', actor: c.id, target: t.id, text: `${c.name} reaches for ${t.name} to use ${atk.name} (Grab-Based: it needs a hold first).` });
    grab(b, R, c, t, rng);
    if (!holds(c, t)) return null;
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: the hold is made, so the effect follows at once.` });
  } else {
    log(b, { kind: 'attack', actor: c.id, target: t.id, text: `${c.name} uses ${atk.name} on ${t.name} in the hold: no attack roll needed.` });
  }
  c.stats.hits++;
  return applyEffect(b, R, c, atk, t, rng, { auto: true, crit: false, rankShift });
}

/** The Grab-Based attack c would use on a victim it already holds, if one is worth more than `rival` (the plain crushing attack, or null); else null. */
export function heldAttack(c, t, rival = null) {
  let best = null; let bestEv = rival ? expectedValue(c, rival, t, { autoHit: true }) : 0;
  for (const a of c.attacks) {
    if (!a.flaws?.grab || a.area) continue;
    const ev = expectedValue(c, a, t, { autoHit: true });
    if (ev > bestEv) { best = a; bestEv = ev; }
  }
  return best;
}
