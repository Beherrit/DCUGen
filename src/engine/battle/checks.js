// One way to resolve a check (Hero's Handbook printed pages 10 to 14): degrees, the critical success, opposed checks.
//
// - A total at or over the DC is one degree of success, and each full 5 over adds one. A total under it is one degree
//   of failure, and each full 5 under adds one.
// - A natural 20 is a critical success: work out the degree, then raise it by one. That can turn a one-degree failure
//   into a success, and a two-degree failure into one. (Attack checks have their own natural 20 and natural 1 rules
//   in attack-roll.js: always a hit, and a threat.)
// - Opposed checks: the higher result wins; on a tie the higher bonus wins; with the same bonus a d20 decides
//   (1 to 10 for the first side, 11 to 20 for the second). The loser's result is the DC for counting degrees.

import { d20 } from './util.js';

/** The result of one roll against a DC: { total, dc, success, degrees, crit, base } (`base` is before the critical). */
export function checkResult(roll, bonus, dc) {
  const total = roll + bonus;
  const base = total >= dc ? { success: true, degrees: 1 + Math.floor((total - dc) / 5) } : { success: false, degrees: 1 + Math.floor((dc - total - 1) / 5) };
  const crit = roll === 20;
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

/** Roll d20 and check it against a DC. `fails` is the degrees of failure after the critical (0 when it succeeded), for resistance checks. */
export function rollCheck(rng, bonus, dc) {
  const roll = d20(rng);
  const r = checkResult(roll, bonus, dc);
  return { ...r, roll, fails: r.success ? 0 : r.degrees };
}

/** Who wins before any die is thrown: 'a', 'b', or null when only a d20 can settle it. `tie` names the rule that decided it. */
function decide(ra, rb, a, b) {
  const ta = ra + a.bonus; const tb = rb + b.bonus;
  if ((ra === 20) !== (rb === 20)) {
    // The lone natural 20 raises its side one degree: it wins unless it fell short by two degrees or more.
    const side = ra === 20 ? 'a' : 'b';
    const own = side === 'a' ? ta : tb; const other = side === 'a' ? tb : ta;
    const won = checkResult(20, own - 20, other).success;
    return { winner: won ? side : side === 'a' ? 'b' : 'a', tie: null, bumped: won && own <= other };
  }
  if (ta !== tb) return { winner: ta > tb ? 'a' : 'b', tie: null, bumped: false };
  if (a.bonus !== b.bonus) return { winner: a.bonus > b.bonus ? 'a' : 'b', tie: 'bonus', bumped: false };
  return { winner: null, tie: 'die', bumped: false };
}

/**
 * An opposed check between a and b, each { bonus, roll? } (a roll that is already made, such as a re-roll, is used as
 * it is). Returns { winner: 'a' | 'b', degrees, rolls: [a, b], totals: { a, b }, tie, tieRoll, bumped }. The d20 for a
 * full tie is thrown only then, 1 to 10 for a (put the acting fighter there) and 11 to 20 for b.
 */
export function opposedCheck(rng, a, b) {
  const ra = a.roll ?? d20(rng); const rb = b.roll ?? d20(rng);
  const d = decide(ra, rb, a, b);
  let { winner } = d; let tieRoll = null;
  if (!winner) { tieRoll = d20(rng); winner = tieRoll <= 10 ? 'a' : 'b'; }
  const totals = { a: ra + a.bonus, b: rb + b.bonus };
  const w = winner === 'a' ? { roll: ra, bonus: a.bonus } : { roll: rb, bonus: b.bonus };
  const degrees = checkResult(w.roll, w.bonus, totals[winner === 'a' ? 'b' : 'a']).degrees;
  return { winner, degrees, rolls: [ra, rb], totals, tie: d.tie, tieRoll, bumped: d.bumped };
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
      const { winner } = decide(ra, rb, { bonus: mine }, { bonus: theirs });
      wins += winner === 'a' ? 1 : winner === null ? 0.5 : 0;
    }
  }
  return wins / 400;
}
