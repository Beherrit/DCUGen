// Team tactics: small hooks the turn code calls. Each returns a neutral value for a team with no tactic, so
// today's behavior (and its random stream) is untouched. The tactic list is in tactics-list.js, the marks
// (focus target, lockdown target, VIP) in tactics-marks.js, and positions and kiting in tactics-position.js.

import { alive, log } from './util.js';
import { activeConditions, defenseOf, isDemoralized, aidBonus } from './conditions.js';
import { hitOdds, rangePenalty } from './odds.js';
import { TEAM_TACTICS, tacticOf } from './tactics-list.js';
import { focusTarget, lockTarget, isControlled, hasControl, isControlAttack, vipOf } from './tactics-marks.js';
import { isFrontliner, positionGoal, stepToZone, wantsKite, kiteThreat, kiteZones, aimsAlways, isMeleeThreat } from './tactics-position.js';
import { coverStep, coverDefends } from './tactics-cover.js';
import { withdrawStance, withdrawGuards, withdrawTurn, withdrawHolds, withdrawOver } from './tactics-withdraw.js';
import { fleeChance } from './tactics-support.js';
import { isProne } from './prone.js';

export { TEAM_TACTICS, tacticOf, positionGoal, stepToZone, wantsKite, kiteThreat, kiteZones, aimsAlways, isMeleeThreat, coverStep, coverDefends, withdrawTurn, withdrawHolds, withdrawOver, fleeChance };

const alpha = (b, c) => tacticOf(b, c) === 'alpha' && b.round <= 2;

/** At the start of a battle: forget old marks and say which teams play a tactic. */
export function announceTactics(b) {
  b.tac = {};
  for (const team of [...new Set(b.combatants.map((c) => c.team))].sort()) {
    const id = tacticOf(b, { team });
    if (id !== 'none') log(b, { kind: 'note', text: `Team ${team} plays ${TEAM_TACTICS[id].label}.` });
  }
}

/** Remember when this fighter's turns came, so a bodyguard knows who hit the VIP since its last turn. */
export function markTurn(b, c) {
  if (tacticOf(b, c) !== 'bodyguard') return;
  c.prevTurnTick = c.turnTick ?? 0;
  c.turnTick = b.tick;
}

/** Called for every attack: a Bodyguard team notes who went after its VIP. */
export function noteAttack(b, c, t) {
  if (tacticOf(b, t) === 'bodyguard' && vipOf(b, t.team)?.id === t.id) (c.vipHit ||= {})[t.team] = b.tick;
}

/** A multiplier on how much c wants to attack t. */
export function targetBias(b, c, t, { enemies }) {
  switch (tacticOf(b, c)) {
    case 'focus': return focusTarget(b, c.team)?.id === t.id ? 3 : 1;
    case 'bodyguard': return (t.vipHit?.[c.team] ?? -1) > (c.prevTurnTick ?? 0) ? 3 : 1;
    case 'lockdown': return lockdownBias(b, c, t);
    case 'pickoff': return pickoffBias(t, enemies) * (t.minion && activeConditions(t).has('Defenseless') ? 1.5 : 1); // a finishing attack
    case 'flank': return t.feinted?.by === c.id || activeConditions(t).has('Vulnerable') || (t.pos === c.pos && isProne(t)) ? 2.5 : 1;
    case 'intimidate': return isDemoralized(t) ? 3 : 1;
    case 'aid': return aidBonus(c, t) ? 2.5 : 1;
    default: return 1;
  }
}

function lockdownBias(b, c, t) {
  if (hasControl(c) || !alive(b).some((a) => a.team === c.team && a !== c && hasControl(a))) return 1;
  return isControlled(t) ? 2 : 0.7;
}

function pickoffBias(t, enemies) {
  const soft = Math.min(...enemies.map((e) => e.d.defenses.Toughness));
  return (t.minion ? 2.5 : 1) * (1 + t.bruises * 0.5) * (t.d.defenses.Toughness === soft ? 1.5 : 1);
}

/** A multiplier on how much c likes this attack against t. */
export function attackBias(b, c, atk, t) {
  switch (tacticOf(b, c)) {
    case 'kite': return atk.kind === 'close' && c.attacks.some((a) => a.kind !== 'close') ? 0.25 : 1;
    case 'lockdown': return isControlAttack(atk) && lockTarget(b, c.team)?.id === t.id ? 2 : 1;
    default: return 1;
  }
}

/** Lockdown: against the marked enemy a fighter asks less of its trip, disarm and smash odds (they pin the enemy down). */
export const maneuverEase = (b, c, t) => (tacticOf(b, c) === 'lockdown' && lockTarget(b, c.team)?.id === t.id ? 0.6 : 1);

/** The chance of choosing a grab: Lockdown fighters grab the enemy they are pinning down. */
export function grabChance(b, c, t, chance) {
  return tacticOf(b, c) === 'lockdown' && lockTarget(b, c.team)?.id === t.id ? 0.85 : chance;
}

/** Alpha Strike: the largest Power Attack that still leaves the attack a fair chance to land. */
function alphaPower(c, attack, target, allOut) {
  if (attack.unarmed && !c.adv['Power Attack'] && c.style !== 'brawler') return 0;
  const def = defenseOf(target, attack.kind === 'close' ? 'Parry' : 'Dodge');
  const dist = attack.kind === 'close' ? 0 : Math.abs(c.pos - target.pos);
  let power = c.adv['Power Attack'] ? 5 : 2;
  while (power > 0 && hitOdds(attack.bonus + allOut - power - rangePenalty(attack, dist), def).hit < 0.3) power--;
  return power;
}

/** Trade-off overrides ({ allOut, defensive, power }), or null to leave the fighter's own choice. */
export function tradeoffBias(b, c, target, attack) {
  const id = tacticOf(b, c);
  if (id === 'none' || !attack.roll || attack.area) return null;
  const allOutMax = c.adv['All-out Attack'] ? 5 : 2;
  if (id === 'alpha' && alpha(b, c)) return { allOut: allOutMax, defensive: 0, power: alphaPower(c, attack, target, allOutMax) };
  if (id === 'noretreat' && attack.kind === 'close') return { allOut: allOutMax, defensive: 0 };
  if (id === 'line' && isFrontliner(c)) return { allOut: 0, defensive: 2 };
  if (id === 'withdraw') return withdrawStance(b, c);
  if (id === 'sustain' && !c.healing && alive(b).some((x) => x.team === c.team && x.staggered)) return { allOut: 0, defensive: 2 };
  return null;
}

/** Alpha Strike: extra effort every time the rules allow it. */
export const forceEffort = (b, c) => alpha(b, c);
/** Alpha Strike: a hero point on every miss. */
export const spendOnMiss = (b, c) => alpha(b, c);
/** No Retreat: nobody breaks and runs. */
export const mayFlee = (b, c) => tacticOf(b, c) !== 'noretreat';
/** No Retreat: nobody digs in on the Defend action. */
export const mayDefend = (b, c) => tacticOf(b, c) !== 'noretreat';
/** Sustain: Recover as soon as a fighter is staggered. */
export const recoverEarly = (b, c) => tacticOf(b, c) === 'sustain';
/** Sustain: any healer heals, not only support fighters. */
export const healsFreely = (b, c) => tacticOf(b, c) === 'sustain';
/** Bruises an ally needs before a healer steps in (and, below 2, a dazed ally counts too). */
export const healThreshold = (b, c) => (tacticOf(b, c) === 'sustain' ? 1 : 2);
/** Focus Fire: a pair of minions is enough for a team attack on the marked target. */
export const teamAttackMin = (b, c, target) => (tacticOf(b, c) === 'focus' && focusTarget(b, c.team)?.id === target.id ? 1 : 2);

/** Feint and Flank: how far below the target's opposing skill a feinter may be, and how much the follow-up must improve. */
export const feintBias = (b, c) => (tacticOf(b, c) === 'flank' ? { slack: 4, ratio: 2 } : null);

/** Whether the guard takes the hit meant for the victim: true or false when a tactic decides, null to use the usual rule. */
export function interposeFor(b, guard, victim) {
  const id = tacticOf(b, guard);
  if (id === 'line') return true;
  if (id === 'bodyguard') return vipOf(b, guard.team)?.id === victim.id;
  if (id === 'withdraw') return withdrawGuards(b, guard);
  return null;
}
