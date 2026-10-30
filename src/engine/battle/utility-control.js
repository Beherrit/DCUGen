// Control as a utility. A tier that takes the target's turns (stunned, entranced, controlled and the like) is worth the turns it
// costs (measured, control-stop.js) times what a lost turn is worth (the enemy's expected harm per round, scaled in
// utility-scale.js), instead of the severity guess it had. Tiers that cost no turns keep their old weights. A target that is
// already held gains nothing from being held again, so the next-biggest threat comes first.

import { alliesOf, alive } from './util.js';
import { activeConditions, resistOf } from './conditions.js';
import { expectedValue, attackHit, bestEvNow, threatOn } from './odds.js';
import { opposedOdds } from './checks.js';
import { stopOfNames, turnsOfNames } from './control-stop.js';
import { TURN_PER_HARM } from './utility-scale.js';
import { effectWeights } from './combatant.js';
import { feet } from './geometry.js';

/** How much the target is already stopped by the conditions on it (stunned, bound, controlled, asleep and so on): 0 to 1. */
export const alreadyStopped = (t) => stopOfNames([...activeConditions(t)]);

/** The harm enemy e would do in one round: its best attack on the best victim among the team (an enemy acts once, so the members are not added up). */
export function foeHarm(b, team, e) {
  return Math.max(0, ...alive(b).filter((m) => m.team === team).map((m) => threatOn(e, m, feet(b, e, m))));
}

/** The degree weights of a control attack against t: turn-losing tiers by the turns they cost, the rest as before. */
function controlWeights(b, c, atk, t) {
  const harm = foeHarm(b, c.team, t);
  const added = Math.max(0, 1 - alreadyStopped(t));
  const old = atk.weights || effectWeights(atk);
  const tiers = atk.tiers;
  return old.map((v, i) => {
    if (i === 0) return 0;
    const turns = turnsOfNames(tiers[Math.min(i, tiers.length) - 1]);
    return turns ? turns * TURN_PER_HARM * harm * added : v;
  });
}

/** The value of a control attack: its expected value with the turn-losing tiers worth the turns they cost. */
export function controlValue(b, c, atk, t, opts) {
  if (!atk.tiers.some((tier) => turnsOfNames(tier))) return expectedValue(c, atk, t, opts);
  return expectedValue(c, { ...atk, weights: controlWeights(b, c, atk, t) }, t, opts);
}

/** Allies who will still act before the target's turn ends this round (all of them when the order is not known). */
function actingSoon(b, c) {
  const later = (b.order || []).slice(b.turn || 0);
  const allies = alliesOf(b, c);
  const soon = allies.filter((a) => later.includes(a.id));
  return b.order ? soon : allies;
}

/** What Nullify is worth: the odds it hits and wins the opposed check, times the gain for the allies who strike while the defense is down. */
export function nullifyGain(b, c, atk, t, opts) {
  const prot = t.sustainedProtection;
  if (!prot || t.nullified || !alive(b).includes(t)) return 0;
  const { hit } = attackHit(c, atk, t, opts);
  const win = opposedOdds(atk.rank, Math.max(prot, resistOf(t, 'Will') ?? 0));
  const strikers = actingSoon(b, c);
  const total = () => strikers.reduce((s, a) => s + bestEvNow(a, t, feet(b, a, t), 0, true), 0);
  const before = total();
  t.nullified = prot;
  const after = total();
  t.nullified = 0;
  return hit * win * Math.max(0, after - before);
}
