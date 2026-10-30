// Protecting as a utility: the harm kept off an ally, in the same units as an attack's expected degrees. A Deflect is worth
// the attacks it is expected to turn aside (deflect-plan.js); an Aid to defense is worth the drop in what the foe is expected
// to do to the ally with +2 on its defense. A protector weighs it a little more, and so does a Bodyguard team.

import { feet } from './geometry.js';
import { threatOn } from './odds.js';
import { roleWeight } from './roles.js';
import { protectBias } from './tactics.js';

/** How much more a protecting choice counts for this fighter: its role, and the Bodyguard tactic. */
export const protectWeight = (b, c) => roleWeight(c, 'protector') * protectBias(b, c);

/** The harm an Aid to defense takes off the ally from this foe, times the chance the Aid works; staggered allies count half again as much. */
export function aidDefenseGain(b, ally, foe, pAid) {
  const dist = feet(b, foe, ally);
  const before = threatOn(foe, ally, dist);
  ally.aid.push({ by: '?', vs: foe.id, mode: 'defense', amount: 2 });
  const after = threatOn(foe, ally, dist);
  ally.aid.pop();
  return pAid * Math.max(0, before - after) * (ally.staggered ? 1.5 : 1);
}
