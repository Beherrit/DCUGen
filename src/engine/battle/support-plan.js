// When a fighter demoralizes or aids instead of attacking: the fighter's own judgement, and the Intimidate and Break
// and Aid the Champion tactics. A turn that does neither falls through to the usual plan, so a fighter without the
// skills (or a good attack) plays exactly as before. The actions themselves are in support-actions.js.

import { alliesOf } from './util.js';
import { aidBonus, isImpaired } from './conditions.js';
import { squares, feet, squaresInMove, reachSquares, inReach, inEarshot, interacts, earshotSquares } from './geometry.js';
import { bestEvNow, rangePenalty, threatOn, hitOdds } from './odds.js';
import { tacticOf } from './tactics-list.js';
import { stepToSquare } from './tactics-position.js';
import { demoralSkill, resistanceTo, canDemoralize, minionsInSight, demoralize, aid, aidAttackOf } from './support-actions.js';
import { demoralizerOf, demoralizeTarget, potentialEv, championOf, championFoe } from './tactics-support.js';

/** What the fighter's best attack is worth this turn: 0 when it only closes in, Infinity when the plan is something else. */
const ownValue = (choice) => (choice.plan === 'attack' ? choice.ev ?? 0 : choice.plan === 'move' ? 0 : Infinity);

/** Intimidate and Break: the team's intimidator goes for the most dangerous enemy, walking within earshot first. */
function intimidateTurn(b, c, mode, rng) {
  if (demoralizerOf(b, c.team) !== c) return false;
  const t = demoralizeTarget(b, c.team);
  if (!t) return false;
  if (!inEarshot(b, c, t)) {
    if (mode !== 'full' || !squaresInMove(b, c)) return false;
    stepToSquare(b, c, { x: t.x, y: t.y, stopAt: earshotSquares(b) }, `to get within earshot of ${t.name}`);
    if (!inEarshot(b, c, t)) return true;
  }
  demoralize(b, c, t, rng);
  return true;
}

/** The fighter's own judgement: demoralize a crowd of minions, or a foe it can cow while its own attack is poor. */
function demoralizeByChoice(b, c, choice, enemies, rng) {
  const skill = demoralSkill(c);
  const beat = (e) => skill.value - resistanceTo(e, skill) >= 5;
  const crowd = minionsInSight(b, c);
  if (crowd.length >= 3 && crowd.every(beat)) { demoralize(b, c, crowd[0], rng); return true; }
  if (ownValue(choice) >= 0.4) return false;
  const near = enemies.filter((e) => inEarshot(b, e, c) && canDemoralize(e) && !isImpaired(e) && beat(e));
  near.sort((x, y) => threatOn(y, c, feet(b, y, c)) - threatOn(x, c, feet(b, x, c)) || x.id.localeCompare(y.id));
  if (!near.length) return false;
  demoralize(b, c, near[0], rng);
  return true;
}

/** Walk into reach of the foe if that is what it takes, and say which attack the Aid check uses. Null when it cannot get there. */
function getInPosition(b, c, foe, mode) {
  const budget = mode === 'full' ? squaresInMove(b, c) : 0;
  const n = squares(c, foe);
  const options = c.attacks.filter((a) => a.roll && !a.area).sort((x, y) => y.bonus - x.bonus);
  for (const a of options) {
    let stop = reachSquares(b, c, a); // squares from the foe to stand at
    if (a.range !== 'close') {
      stop = n;
      while (stop > 1 && rangePenalty(a, stop * b.grid.squareFt) > 5) stop--;
      if (rangePenalty(a, stop * b.grid.squareFt) > 5) continue;
    }
    const need = Math.max(0, n - stop);
    if (need > budget) continue;
    if (need) stepToSquare(b, c, { x: foe.x, y: foe.y, stopAt: stop }, `to get in position to aid against ${foe.name}`);
    return a;
  }
  return null;
}

/** Aid the ally's attack against the foe, if it does not already have one. */
function aidAllyAttack(b, c, ally, foe, mode, rng) {
  if (aidBonus(ally, foe)) return false;
  const attack = getInPosition(b, c, foe, mode);
  if (!attack) return false;
  aid(b, c, ally, foe, rng, { mode: 'attack', attack });
  return true;
}

/** The fighter's own judgement: its attack is poor, so help an ally who is engaged with the foe (attack), or a staggered one (defense). */
function aidByChoice(b, c, choice, mode, rng) {
  const foe = choice.target;
  const tool = aidAttackOf(c);
  if (!foe || !tool || ownValue(choice) >= 0.5) return false;
  const near = alliesOf(b, c).filter((a) => interacts(b, a, foe));
  // Aid only pays when the ally's gain from +2 (times the chance the Aid check succeeds) beats this fighter's own attack.
  const pAid = hitOdds(tool.bonus + (c.adv.Teamwork ? 5 : 0), 0).hit;
  const evNow = (a, shift) => bestEvNow(a, foe, feet(b, a, foe), shift, inReach(b, a, foe));
  const gainOf = (a) => pAid * (evNow(a, 2) - evNow(a, 0));
  const better = near.filter((a) => !aidBonus(a, foe)).map((a) => ({ a, ev: gainOf(a) })).filter((x) => x.ev > Math.max(0.05, ownValue(choice)))
    .sort((x, y) => y.ev - x.ev || x.a.id.localeCompare(y.a.id))[0];
  if (better) return aidAllyAttack(b, c, better.a, foe, mode, rng);
  const hurt = near.find((a) => a.staggered && !aidBonus(a, foe, 'defense') && threatOn(foe, a, feet(b, foe, a)) > 0.05);
  if (!hurt) return false;
  const attack = getInPosition(b, c, foe, mode);
  if (!attack) return false;
  aid(b, c, hurt, foe, rng, { mode: 'defense', attack });
  return true;
}

/** Aid the Champion: a fighter whose own attacks are worth less than half the champion's helps the champion's attack. */
function aidChampionTurn(b, c, enemies, mode, rng) {
  const champ = championOf(b, c.team);
  if (!champ || champ.unit === c || !aidAttackOf(c)) return false;
  if (potentialEv(c, enemies) * 2 >= champ.ev) return false;
  const foe = championFoe(b, champ.unit);
  return !!foe && aidAllyAttack(b, c, champ.unit, foe, mode, rng);
}

/**
 * Demoralize or aid instead of the usual plan. True when the fighter used its turn that way.
 * The team's tactic comes first, then the fighter's own judgement.
 */
export function supportTurn(b, c, choice, enemies, mode, rng) {
  const id = tacticOf(b, c);
  if (id === 'intimidate' && intimidateTurn(b, c, mode, rng)) return true;
  if (id === 'aid' && aidChampionTurn(b, c, enemies, mode, rng)) return true;
  return demoralizeByChoice(b, c, choice, enemies, rng) || aidByChoice(b, c, choice, mode, rng);
}
