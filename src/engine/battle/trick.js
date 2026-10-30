// Tricking an opponent (Hero's Handbook p58 Deception) and Redirect (p77).
// - Trick: Deception against the opponent's Deception or Insight. If it succeeds the opponent is heedless of the danger
//   around it; more than one degree of failure leaves the trickster vulnerable until the start of its next round.
// - Redirect: a fighter who has tricked an opponent can turn that opponent's missed attack against it onto another target,
//   as a reaction: the new target must be next to the fighter and within range of the attack, and the attacker makes a new
//   attack check with the same modifiers against it.
// The AI tricks only to set up a Redirect: when the fighter has the advantage and a foe that is attacking it has an ally
// standing next to the fighter, who would take the shot.

import { log, sign, d20, enemiesOf } from './util.js';
import { opposedCheck, opposedNote } from './checks.js';
import { checkPenalty, defenseVs } from './conditions.js';
import { foeBonus } from './favored.js';
import { squares, inRangeNow, inReach } from './geometry.js';
import { plainFx } from './fortune.js';

/** The foes that could be hit by a redirected attack of `from`: next to the fighter, in range of the attack, and not the attacker. */
function redirectTargets(b, c, from, atk) {
  return enemiesOf(b, c).filter((e) => e !== from && squares(e, c) <= 1 && (atk.range === 'close' ? inReach(b, from, e, atk) : inRangeNow(b, from, atk, e)));
}

/** Trick the attacker `t`: Deception against its Deception or Insight. Success marks it as tricked by c until c's next turn. */
export function trick(b, c, t, rng) {
  const mine = c.skills.Deception + foeBonus(c, t, 'Deception') - checkPenalty(c);
  const theirs = Math.max(t.skills.Deception, t.skills.Insight) - checkPenalty(t);
  const duel = opposedCheck(rng, { bonus: mine, fx: plainFx(b, c, 'trick check', () => false) }, { bonus: theirs, fx: plainFx(b, t, 'trick resistance', () => false) });
  const [r1, r2] = duel.rolls;
  const ok = duel.winner === 'a';
  const line = `${c.name} tricks ${t.name}: Deception d20 ${r1} ${sign(mine)} = ${duel.totals.a} vs d20 ${r2} ${sign(theirs)} = ${duel.totals.b}${opposedNote(duel)}`;
  const dice = [{ label: 'Trick', roll: r1, mod: mine, total: duel.totals.a, dc: duel.totals.b }];
  if (ok) {
    t.tricked = { by: c.id, round: b.round };
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${line} — ${t.name} is heedless of the danger until ${c.name}'s next turn.`, dice, important: true });
  } else if (duel.degrees > 1) {
    c.distracted = true;
    log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${line} — it backfires: ${c.name} is in a bad position, vulnerable until the start of its next turn.`, dice });
  } else {
    log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${line} — ${t.name} is not fooled.`, dice });
  }
  return ok;
}

/** The AI: trick a foe that is attacking us, with Redirect and one of its allies next to us to take the shot. True when the standard action went on it. */
export function trickTurn(b, c, choice, enemies, mode, rng) {
  if (!c.adv.Redirect || mode === 'none' || c.skills.Deception < 2) return false;
  if (choice && choice.plan === 'attack' && (choice.ev ?? 0) >= 0.8) return false; // it has something better to do
  const attacker = enemies.find((e) => !e.tricked?.by && e.attacks.some((a) => a.roll && !a.area && (a.range === 'close' ? inReach(b, e, c, a) : inRangeNow(b, e, a, c))) && redirectTargets(b, c, e, e.attacks.find((a) => a.roll)).length);
  if (!attacker) return false;
  trick(b, c, attacker, rng);
  return true;
}

/**
 * An attack by `from` missed c, who tricked it: Redirect turns it on another target next to c. `land(target, roll)` carries a hit
 * out. Returns true when the attack was redirected (hit or miss).
 */
export function redirect(b, from, atk, c, r, rng, land) {
  if (!c.adv.Redirect || from.tricked?.by !== c.id || from.tricked.round < b.round - 1) return false;
  const others = redirectTargets(b, c, from, atk);
  if (!others.length) return false;
  from.tricked = null;
  const t2 = others[0];
  const roll = d20(rng);
  const mod = r.mod;
  const which = atk.kind === 'close' ? 'Parry' : 'Dodge';
  const dc = 10 + defenseVs(t2, which, from);
  const total = roll + mod;
  const hit = roll === 20 || (roll !== 1 && total >= dc);
  const text = `${c.name} redirects the missed ${atk.name} onto ${t2.name} (Redirect): d20 ${roll} ${sign(mod)} = ${total} vs ${which} DC ${dc}`;
  const dice = [{ label: 'Attack', roll, mod, total, dc }];
  if (!hit) { log(b, { kind: 'miss', actor: from.id, target: t2.id, text: `${text} — miss.`, dice }); return true; }
  land(t2, { ...r, roll, total, dcUsed: dc, hit, crit: false, dice, text });
  return true;
}
