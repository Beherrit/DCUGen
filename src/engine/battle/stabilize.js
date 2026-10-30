// Steadying a dying ally (Hero's Handbook p19, p67, p103): in a lethal fight a fighter with Treatment or a Healing power
// takes a standard action to stabilize a dying teammate. The AI weighs it as a life saved, in the same units as an
// attack's expected degrees (utility.js picks the best option), so it beats a swing unless the swing is very good.

import { canAct } from './conditions.js';
import { lethalOn, medicOf, steadyChance, steady } from './dying.js';
import { canTouch, approach } from './utility-heal.js';
import { inReach } from './geometry.js';

/** What a dying ally is worth steadying, in expected degrees of harm (about a fighter and a half taken out of the fight for good). */
const LIFE_WORTH = 3;

/** With no enemy left to fight, a medic still tends a dying teammate. */
export function steadyIdle(b, R, c, mode, rng) {
  stabilizeOption(b, c, mode)?.run(b, R, c, rng);
}

/** The best fighter to steady: { kind: 'stabilize', u, run, patient } or null. */
export function stabilizeOption(b, c, mode) {
  if (!lethalOn(b) || canAct(c) === 'none') return null;
  const way = medicOf(c);
  if (!way) return null;
  let best = null;
  for (const p of b.combatants.filter((x) => x.team === c.team && x !== c && x.dying && !x.dead && !x.diehard)) {
    if (!canTouch(b, c, p, mode, false)) continue;
    const u = LIFE_WORTH * steadyChance(way);
    if (!best || u > best.u) best = { kind: 'stabilize', u, patient: p, run: (bb, R, cc, rng) => { approach(bb, cc, p); if (inReach(bb, cc, p)) steady(bb, cc, p, rng); } };
  }
  return best;
}
