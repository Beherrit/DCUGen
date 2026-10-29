// Carrying out a trip, disarm or smash the plan chose (plan-maneuvers.js), once the fighter is in position.

import { noteAttack } from './tactics.js';
import { trip } from './trip.js';
import { disarm } from './disarm.js';
import { smash } from './smash.js';

export function runManeuver(b, c, choice, rng) {
  const { plan, attack, target: t, item } = choice;
  noteAttack(b, c, t);
  c.lastAttackId = attack.id;
  const dist = attack.kind === 'close' ? 0 : Math.abs(c.pos - t.pos);
  if (plan === 'trip') trip(b, c, t, rng);
  else if (plan === 'disarm') disarm(b, c, attack, t, item, rng, dist);
  else smash(b, c, attack, t, item, rng, dist);
}
