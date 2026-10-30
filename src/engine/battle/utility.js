// One utility for every way to spend a turn, in the units of an attack's expected degrees of harm. The attack choice
// (plan.js) already folds control, Weaken and Nullify into its value (utility-attack.js). Here the other options are
// scored beside it: a heal (utility-heal.js) and a buff (utility-buff.js); protecting is in deflect-plan.js and
// support-plan.js. The best option wins, and a tie goes to the attack. Roles and team tactics only weigh a kind a little more.
//
// Recover, escape, feint, grab, cover, trip, disarm and smash keep their own rules: they pre-empt this choice as they did
// before, because there is no sensible estimate to put them in the same units.

import { traceChoice } from './trace.js';
import { healOption } from './utility-heal.js';
import { buffOption } from './utility-buff.js';
import { stabilizeOption } from './stabilize.js';
import { powerOptions } from './power-options.js';

/** What the planned turn is worth, or Infinity when it is a special plan with its own rule. */
export function ownUtility(choice) {
  if (!choice || choice.plan === 'move') return 0;
  if (choice.plan !== 'attack') return Infinity;
  return choice.utility ?? choice.ev ?? 0;
}

/** Heal or buff instead of attacking when that is worth more. True when the turn was used. */
export function utilityTurn(b, R, c, choice, enemies, mode, rng) {
  const own = ownUtility(choice);
  if (own === Infinity) return false;
  let best = null;
  for (const o of [healOption(b, c, enemies, mode), buffOption(b, c, enemies, mode), stabilizeOption(b, c, mode), ...powerOptions(b, R, c, enemies, mode)]) if (o && (!best || o.u > best.u)) best = o;
  if (!best || best.u <= own) return false;
  traceChoice(b, c, best.kind, best.u, own);
  best.run(b, R, c, rng);
  return true;
}
