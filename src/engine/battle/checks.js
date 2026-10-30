// One way to resolve a check (Hero's Handbook printed pages 10 to 14): degrees, the critical success, opposed checks.
//
// - A total at or over the DC is one degree of success, and each full 5 over adds one. A total under it is one degree
//   of failure, and each full 5 under adds one.
// - A natural 20 is a critical success: work out the degree, then raise it by one. That can turn a one-degree failure
//   into a success, and a two-degree failure into one. (Attack checks have their own natural 20 and natural 1 rules
//   in attack-roll.js: always a hit, and a threat.)
// - Opposed checks: the higher result wins; on a tie the higher bonus wins; with the same bonus a d20 decides
//   (1 to 10 for the first side, 11 to 20 for the second). The loser's result is the DC for counting degrees.
// - A fighter's own check can carry a fortune hook `fx` (fortune.js): `fx.fixed(bonus, dc)` may give a roll to use
//   instead of throwing the die (Ultimate Effort), and `fx.improve(rng, info)` may give a better roll once the first
//   one failed (Improve Roll, Luck). A hook may also carry `curse(rng, info)`: Luck Control forcing a passed check to be
//   re-rolled at the worse of the two. All three return { roll, natural } or null. A roll that was not thrown, or was
//   re-rolled, is only a natural 20 when the die itself came up 20, so `natural` travels with the roll.

import { d20 } from './util.js';

/** The result of one roll against a DC: { total, dc, success, degrees, crit, base } (`base` is before the critical). `natural` says whether the die came up 20. */
export function checkResult(roll, bonus, dc, natural = roll === 20) {
  const total = roll + bonus;
  const base = total >= dc ? { success: true, degrees: 1 + Math.floor((total - dc) / 5) } : { success: false, degrees: 1 + Math.floor((dc - total - 1) / 5) };
  const crit = natural;
  let { success, degrees } = base;
  if (crit) {
    if (success) degrees++;
    else if (degrees === 1) success = true;
    else degrees--;
  }
  return { total, dc, success, degrees, crit, base };
}

/** The log note for a critical success. Failures that it eased always get it; successes only when degrees matter. */
export function critNote(r, { degrees = false } = {}) {
  return r.crit && (degrees || !r.base.success) ? ' (natural 20: +1 degree)' : '';
}

/** Roll d20 and check it against a DC. `fails` is the degrees of failure after the critical (0 when it succeeded), for resistance checks. `fx` is the fighter's fortune hook, if any. */
export function rollCheck(rng, bonus, dc, fx = null) {
  const fixed = fx?.fixed?.(bonus, dc) ?? null;
  let roll = fixed ? fixed.roll : d20(rng);
  let natural = fixed ? fixed.natural : roll === 20;
  let r = checkResult(roll, bonus, dc, natural);
  if (!fixed && r.success && fx?.curse) {
    const worse = fx.curse(rng, { ...r, roll, bonus });
    if (worse) { ({ roll, natural } = worse); r = checkResult(roll, bonus, dc, natural); }
  }
  if (!fixed && !r.success && fx?.improve) {
    const better = fx.improve(rng, { ...r, roll, bonus, fails: r.degrees });
    if (better) { ({ roll, natural } = better); r = checkResult(roll, bonus, dc, natural); }
  }
  return { ...r, roll, fails: r.success ? 0 : r.degrees };
}

/** One side of an opposed check: its die, its bonus, and whether the die itself was a 20. */
const side = (roll, bonus) => ({ roll, bonus, nat: roll === 20 });

/** Who wins before any die is thrown: 'a', 'b', or null when only a d20 can settle it. `tie` names the rule that decided it. */
function decide(a, b) {
  const ta = a.roll + a.bonus; const tb = b.roll + b.bonus;
  if (a.nat !== b.nat) {
    // The lone natural 20 raises its side one degree: it wins unless it fell short by two degrees or more.
    const first = a.nat ? 'a' : 'b';
    const own = first === 'a' ? ta : tb; const other = first === 'a' ? tb : ta;
    const won = checkResult(20, own - 20, other, true).success;
    return { winner: won ? first : first === 'a' ? 'b' : 'a', tie: null, bumped: won && own <= other };
  }
  if (ta !== tb) return { winner: ta > tb ? 'a' : 'b', tie: null, bumped: false };
  if (a.bonus !== b.bonus) return { winner: a.bonus > b.bonus ? 'a' : 'b', tie: 'bonus', bumped: false };
  return { winner: null, tie: 'die', bumped: false };
}

/** A side that is behind may improve its own roll with its fortune hook; it is told the total it has to beat. */
function improveSide(rng, me, other, fx) {
  const dc = other.roll + other.bonus + 1;
  const miss = dc - me.roll - me.bonus;
  const got = fx.improve(rng, { ...checkResult(me.roll, me.bonus, dc, me.nat), roll: me.roll, bonus: me.bonus, dc, fails: 1 + Math.floor((miss - 1) / 5) });
  if (got) { me.roll = got.roll; me.nat = got.natural; }
}

/**
 * An opposed check between a and b, each { bonus, roll?, fx? } (a roll that is already made, such as a re-roll, is used as
 * it is; `fx` is the fighter's fortune hook, which may improve the roll while that side is behind). Returns
 * { winner: 'a' | 'b', degrees, rolls: [a, b], totals: { a, b }, tie, tieRoll, bumped }. The d20 for a full tie is thrown
 * only then, 1 to 10 for a (put the acting fighter there) and 11 to 20 for b.
 */
export function opposedCheck(rng, a, b) {
  const sa = side(a.roll ?? d20(rng), a.bonus); const sb = side(b.roll ?? d20(rng), b.bonus);
  if (a.fx?.improve && decide(sa, sb).winner === 'b') improveSide(rng, sa, sb, a.fx);
  if (b.fx?.improve && decide(sa, sb).winner === 'a') improveSide(rng, sb, sa, b.fx);
  const d = decide(sa, sb);
  let { winner } = d; let tieRoll = null;
  if (!winner) { tieRoll = d20(rng); winner = tieRoll <= 10 ? 'a' : 'b'; }
  const totals = { a: sa.roll + sa.bonus, b: sb.roll + sb.bonus };
  const w = winner === 'a' ? sa : sb;
  const degrees = checkResult(w.roll, w.bonus, totals[winner === 'a' ? 'b' : 'a'], w.nat).degrees;
  return { winner, degrees, rolls: [sa.roll, sb.roll], totals, tie: d.tie, tieRoll, bumped: d.bumped };
}

/** The log note for how an opposed check was settled, or an empty string for a plain win. */
export function opposedNote(res) {
  if (res.bumped) return ' (natural 20: +1 degree)';
  if (res.tie === 'bonus') return ' (tied: the higher bonus wins)';
  if (res.tie === 'die') return ` (tied, same bonus: d20 ${res.tieRoll} decides)`;
  return '';
}

/** The chance that the first side wins an opposed check against the second, by the same rules. */
export function opposedOdds(mine, theirs) {
  let wins = 0;
  for (let ra = 1; ra <= 20; ra++) {
    for (let rb = 1; rb <= 20; rb++) {
      const { winner } = decide(side(ra, mine), side(rb, theirs));
      wins += winner === 'a' ? 1 : winner === null ? 0.5 : 0;
    }
  }
  return wins / 400;
}
