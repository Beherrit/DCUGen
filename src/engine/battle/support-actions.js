// Support actions: Demoralize (Intimidation, or Deception with Taunt; DCA 61, 78) and Aid (DCA 176), and how they wear off.
// The decisions about when to use them are in support-plan.js.

import { sign, d20, log, enemiesOf } from './util.js';
import { opposedCheck, opposedNote, checkResult, critNote } from './checks.js';
import { checkPenalty, resistOf, isImpaired } from './conditions.js';
import { inEarshot } from './geometry.js';
import { tacticOf } from './tactics-list.js';
import { plainFx, hurt } from './fortune.js';

/** The demoralizer's skill: Intimidation, or Deception when the fighter has Taunt and it is better. */
export function demoralSkill(c) {
  if (c.adv.Taunt && c.skills.Deception > c.skills.Intimidation) return { name: 'Deception (Taunt)', value: c.skills.Deception, taunt: true };
  return { name: 'Intimidation', value: c.skills.Intimidation, taunt: false };
}

/** Fearless fighters, and those immune to Will effects, cannot be demoralized. */
export const canDemoralize = (t) => !t.adv.Fearless && resistOf(t, 'Will') !== null;

/** What the target rolls against a demoralize: the higher of Insight and Will (and Deception against Taunt). Null if immune. */
export function resistanceTo(t, skill) {
  const will = resistOf(t, 'Will');
  if (will === null) return null;
  return Math.max(will, t.skills.Insight - checkPenalty(t), skill.taunt ? t.skills.Deception - checkPenalty(t) : -99);
}

/** Enemy minions within earshot (60 ft) of c that could be demoralized: one check covers them all. */
export function minionsInSight(b, c) {
  return enemiesOf(b, c).filter((e) => e.minion && inEarshot(b, e, c) && canDemoralize(e) && !isImpaired(e));
}

const nameList = (list) => list.map((x) => x.name).join(', ');

/** Put (or strengthen) the demoralized condition on a target. */
function impair(b, c, t, name, degrees) {
  const had = t.conditions.find((x) => x.source === 'demoralize');
  if (had?.name === 'Disabled' && name === 'Impaired') return;
  t.conditions = t.conditions.filter((x) => x.source !== 'demoralize');
  t.conditions.push({ name, degree: degrees, source: 'demoralize', from: c.id, round: b.round, label: 'demoralized' });
}

/**
 * Demoralize (a standard action): c's Intimidation check against the target's resistance check. Success leaves the target
 * impaired (-2) until the end of c's next round; four or more degrees leave it disabled (-5). Enemy minions in sight
 * are demoralized together by the one check, against the highest resistance among them. Returns the degrees of success.
 */
export function demoralize(b, c, t, rng, { skill = demoralSkill(c) } = {}) {
  if (!canDemoralize(t)) return 0;
  const group = t.minion ? [t, ...minionsInSight(b, c).filter((x) => x !== t)] : [t];
  const theirs = Math.max(...group.map((x) => resistanceTo(x, skill)));
  const mine = skill.value - checkPenalty(c);
  const boss = tacticOf(b, c) === 'intimidate';
  const duel = opposedCheck(rng, { bonus: mine, fx: plainFx(b, c, 'demoralize check', () => boss) }, { bonus: theirs, fx: plainFx(b, t, 'demoralize resistance', () => hurt(t)) });
  const [r1, r2] = duel.rolls;
  const degrees = duel.winner === 'a' ? duel.degrees : 0;
  const dice = [{ label: 'Demoralize', roll: r1, mod: mine, total: duel.totals.a, dc: duel.totals.b }];
  const roll = `${skill.name} d20 ${r1} ${sign(mine)} = ${duel.totals.a} vs resistance d20 ${r2} ${sign(theirs)} = ${duel.totals.b}${opposedNote(duel)}`;
  if (!degrees) {
    log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${c.name} tries to demoralize ${nameList(group)}: ${roll} — they shrug it off.`, dice });
    return 0;
  }
  const name = degrees >= 4 ? 'Disabled' : 'Impaired';
  for (const x of group) impair(b, c, x, name, degrees);
  log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${c.name} demoralizes ${nameList(group)}: ${roll} — ${degrees} degree${degrees > 1 ? 's' : ''}, ${name.toUpperCase()} (${name === 'Disabled' ? '-5' : '-2'} on checks) until the end of ${c.name}'s next round.`, dice, important: true });
  return degrees;
}

/** The attack c uses for an Aid check: its best attack bonus, or Fighting when it has no attack roll. */
export function aidAttackOf(c) {
  return c.attacks.filter((a) => a.roll && !a.area).sort((x, y) => y.bonus - x.bonus)[0] || null;
}

/**
 * Aid (a standard action): an attack check against DC 10 (Teamwork adds 5 to it: DCA 78). Success gives the ally +2 on
 * an attack check against the foe, or +2 to defense against it (mode), until the end of the ally's next turn; four or
 * more degrees give +5. Returns the bonus given (0 on a failure).
 */
export function aid(b, c, ally, foe, rng, { mode = 'attack', attack = aidAttackOf(c) } = {}) {
  const bonus = (attack?.bonus ?? c.d.abilities.Fighting ?? 0) - checkPenalty(c) + (c.adv.Teamwork ? 5 : 0);
  const roll = d20(rng);
  const r = checkResult(roll, bonus, 10);
  const total = r.total;
  const ok = roll === 20 || (roll !== 1 && r.success);
  const amount = ok ? (r.success && r.degrees >= 4 ? 5 : 2) : 0;
  const dice = [{ label: 'Aid', roll, mod: bonus, total, dc: 10 }];
  const what = mode === 'defense' ? `defense against ${foe.name}` : `an attack on ${foe.name}`;
  const check = `d20 ${roll} ${sign(bonus)} = ${total} vs DC 10${c.adv.Teamwork ? ' (Teamwork +5)' : ''}${critNote(r, { degrees: true })}`;
  if (!amount) {
    log(b, { kind: 'miss', actor: c.id, target: ally.id, text: `${c.name} tries to aid ${ally.name} against ${foe.name}: ${check} — no help.`, dice });
    return 0;
  }
  // The aid lasts to the end of the ally's next turn: this round if the ally has yet to act, else the next.
  const until = b.order.indexOf(ally.id) >= b.turn ? b.round : b.round + 1;
  ally.aid = (ally.aid || []).filter((x) => !(x.by === c.id && x.vs === foe.id && x.mode === mode));
  ally.aid.push({ by: c.id, vs: foe.id, mode, amount, until });
  log(b, { kind: 'condition', actor: c.id, target: ally.id, text: `${c.name} aids ${ally.name}: ${check} — +${amount} to ${what} until the end of ${ally.name}'s next turn.`, dice, important: true });
  return amount;
}

/** At the end of c's turn: its demoralizes lapse (they last to the end of c's next round), and its own aids are used up. */
export function expireSupport(b, c) {
  for (const t of b.combatants) {
    if (!t.conditions.some((x) => x.source === 'demoralize')) continue;
    // A demoralizer who fell never gets its end of round, so old ones lapse after two rounds anyway.
    t.conditions = t.conditions.filter((x) => x.source !== 'demoralize' || !((x.from === c.id && x.round < b.round) || x.round < b.round - 1));
  }
  if (c.aid?.length) c.aid = c.aid.filter((x) => x.until > b.round);
}
