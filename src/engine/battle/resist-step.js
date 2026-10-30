// The target's side of a hit: its resistance check and everything that changes it. applyEffect (attack-effects.js) calls
// resistStep once the effect is on its way and gets back either a finished result (resisted) or the degrees of failure.
//
// - Great Endurance (DCA 74): +5 on checks to avoid fatigue and to resist suffocation.
// - Second Chance (DCA 78): one more check against the named hazard, and the better result counts.
// - Partial Resistance (MA 93): a success with less than two degrees only halves the effect's ranks (a second check, or
//   with +2 a flat degree of failure, follows).
// - Stacking (MA 94): each repeated use on the same target in a round raises the DC.
// - Minions (DCA 174): a minion that fails any resistance check suffers the worst degree of the effect.

import { sign, log } from './util.js';
import { rollCheck, critNote } from './checks.js';
import { dcOf } from './odds.js';
import { resistFx } from './fortune.js';
import { resistRoll } from './flaw-resist.js';

const FATIGUING = /fatigu|exhaust/i;
const STOP_WORDS = new Set(['with', 'the', 'and', 'effects', 'effect', 'attacks', 'attack', 'from', 'against']);

/** +5 Great Endurance on a Fortitude check against suffocation or an effect that starts by fatiguing (DCA 74). */
export function enduranceBonus(t, atk) {
  if (!t.adv?.['Great Endurance'] || atk.resistance !== 'Fortitude') return 0;
  const fatigues = atk.effect === 'Suffocation' || (atk.tiers?.[0] || []).some((n) => FATIGUING.test(n));
  return fatigues ? 5 : 0;
}

/** Does one of the target's Second Chance advantages name this hazard? Its parameter's words must all appear in the attack's name, effect, resistance or descriptors. */
export function secondChanceFor(t, atk) {
  const text = `${atk.name} ${atk.effect} ${atk.resistance} ${(atk.descriptors || []).join(' ')}`.toLowerCase();
  return (t.ch?.advantages || []).some((a) => {
    if (a.name !== 'Second Chance') return false;
    const words = String(a.param || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    return words.length > 0 && words.every((w) => text.includes(w));
  });
}

/** The DC bonus Stacking has built up on this target against this attack (decays one a round). */
export function stackBonus(b, c, atk, t) {
  const e = t.stacks?.[`${c.id}|${atk.id}`];
  if (!atk.ex?.stacking || !e) return 0;
  return Math.max(0, e.n - Math.max(0, b.round - 1 - e.round)) * atk.ex.stacking;
}

function noteStack(b, c, atk, t) {
  if (!atk.ex?.stacking) return;
  const key = `${c.id}|${atk.id}`;
  t.stacks ||= {};
  const was = stackBonus(b, c, atk, t) / atk.ex.stacking;
  t.stacks[key] = { n: was + 1, round: b.round };
}

/** The degrees a minion suffers when it fails: the effect's worst (DCA 174). */
function worstFails(atk, rank, fails) {
  if (atk.effect === 'Weaken') return Math.max(fails, rank);
  return Math.max(fails, atk.maxDegree || atk.tiers?.length || fails);
}

/**
 * Roll the target's resistance check against this hit. Returns { result } when the effect was resisted, else
 * { fails, rank, base, dice } for the effect to go on with (rank is lower after a Partial Resistance).
 */
export function resistStep(b, c, atk, t, rng, { rank, crit, multi, resistName, resist }) {
  const stack = stackBonus(b, c, atk, t);
  const dc = dcOf(atk, rank) + (crit ? 5 : 0) + multi + stack;
  noteStack(b, c, atk, t);
  const grit = enduranceBonus(t, atk);
  let res = resistRoll(rng, t, atk, resistName, resist + grit, dc, resistFx(b, t, atk, c)); // Resistible adds a second check
  let again = '';
  if (res.r.fails && secondChanceFor(t, atk)) {
    const second = resistRoll(rng, t, atk, resistName, resist + grit, dc, null);
    again = ` (Second Chance: re-rolled ${second.r.total}${second.r.fails < res.r.fails ? ', better' : ', no better'})`;
    if (second.r.fails < res.r.fails) res = second;
  }
  const { r, name, bonus } = res;
  const dice = [{ label: `${name} check`, roll: r.roll, mod: bonus, total: r.total, dc }];
  const base = `${t.name} resists with ${name}: d20 ${r.roll} ${sign(bonus)} = ${r.total} vs DC ${dc}${crit ? ' (+5, critical)' : ''}${stack ? ` (+${stack}, Stacking)` : ''}${grit ? ' (includes +5, Great Endurance)' : ''}${critNote(r)}${again}`;
  if (!r.fails && r.degrees < 2 && atk.ex?.partialRes && Math.floor(rank / 2) >= 1) return partial(b, c, atk, t, rng, { rank, crit, multi, resist: resist + grit, resistName, base, dice, stack });
  if (!r.fails) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${base} — ${r.crit && r.base.success ? 'natural 20, ' : ''}resisted.`, dice }); return { result: { landed: false, degrees: 0, rank } }; }
  const fails = t.minion && b.options.minionRule ? worstFails(atk, rank, r.fails) : r.fails;
  return { fails, rank, base: fails > r.fails ? `${base} — a minion suffers the worst degree` : base, dice };
}

/** Partial Resistance (MA 93): the one-degree success halves the effect; the +1 version allows a second check, the +2 version counts it as a degree of failure. */
function partial(b, c, atk, t, rng, { rank, crit, multi, resist, resistName, base, dice, stack }) {
  const half = Math.floor(rank / 2);
  const level = atk.ex.partialRes;
  if (level === 2) {
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${base} — only one degree of success: Partial Resistance halves the effect to rank ${half} and counts as a degree of failure.`, dice });
    return { fails: 1, rank: half, base, dice };
  }
  const dc = dcOf(atk, half) + (crit ? 5 : 0) + multi + stack;
  const r2 = rollCheck(rng, resist, dc);
  const dice2 = [...dice, { label: `${resistName} check (reduced)`, roll: r2.roll, mod: resist, total: r2.total, dc }];
  const line = `${base} — only one degree of success: Partial Resistance halves the effect to rank ${half}; second check d20 ${r2.roll} ${sign(resist)} = ${r2.total} vs DC ${dc}`;
  if (r2.success) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${line} — resisted.`, dice: dice2 }); return { result: { landed: false, degrees: 0, rank: half } }; }
  return { fails: r2.fails, rank: half, base: `${line} — failed`, dice: dice2 };
}
