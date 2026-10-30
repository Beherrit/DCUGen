// Deflect (Hero's Handbook p95): the Defend action done for other characters at a distance. The deflector rolls d20 (10 or
// less counts as 11) plus its Deflect rank in place of an active defense, minus 2 for an ally at medium range and 5 at long
// range (measured from the deflector to the one protected). It does not work against area effects or perception range
// attacks (they have no attack roll, so they never get here), nor against anything but Dodge and Parry.
//
// - Taking the Defend action to deflect (deflect-plan.js) sets `deflecting`: until its next turn the fighter protects itself
//   and every ally in range, any number of times.
// - The Reaction extra makes it a reaction instead, once a round, for the fighter itself and allies within short range.
// - Reflect sends a deflected attack back (reflect.js).
// The deflector's roll stands against the target's flat defense: the attacker has to beat the better of the two.

import { allPowers } from '../derive.js';
import { bandFor } from '../range.js';
import { hasExtra, d20, alive } from './util.js';
import { canAct } from './conditions.js';
import { feet, lineClear } from './geometry.js';

/** A character's best Deflect power: { name, rank, reaction, reflect, redirect }, or null. */
export function deflectOf(ch) {
  const p = allPowers(ch, { includeAlternates: false }).map((x) => x.power).filter((x) => x.effect === 'Deflect').sort((x, y) => y.rank - x.rank)[0];
  if (!p) return null;
  return { name: p.name, rank: p.rank, reaction: hasExtra(p, 'Reaction'), reflect: hasExtra(p, 'Reflect'), redirect: hasExtra(p, 'Redirect') && hasExtra(p, 'Reflect') };
}

/** The range penalty (0, -2 or -5) for d deflecting for t, or null when t is out of reach or out of sight. */
export function deflectPenalty(b, d, t) {
  const band = bandFor(feet(b, d, t), Math.max(1, d.deflect.rank));
  if (band.band === 'out' || (d !== t && !lineClear(b, d, t))) return null;
  return band.penalty;
}

/** Who could deflect an attack on t, with the penalty each would take: those holding a Defend, and reactions not yet used this round. */
export function deflectors(b, t) {
  const out = [];
  for (const d of alive(b)) {
    if (d.team !== t.team || !d.deflect || canAct(d) === 'none') continue;
    if (d === t && t.deflecting) continue; // its own Defend already uses the rank (attack-roll.js)
    const held = !!d.deflecting;
    const reaction = d.deflect.reaction && d.deflectRound !== b.round;
    const penalty = deflectPenalty(b, d, t);
    if ((!held && !reaction) || penalty === null) continue;
    if (!held && d !== t && penalty !== 0) continue; // a reaction covers the fighter and allies within short range
    out.push({ d, penalty, held });
  }
  return out;
}

/**
 * An attack on t is about to be rolled against `dcUsed`. The best deflector rolls if it could beat that. Returns
 * { dc, by, total } with the new number to beat, or null when nothing was rolled or the roll did not help.
 * A held Defend is used before a reaction, then the highest rank.
 */
export function deflectAgainst(b, atk, t, rng, dcUsed, notes) {
  if (atk.reflected) return null;
  const options = deflectors(b, t).filter((o) => 20 + o.d.deflect.rank + o.penalty > dcUsed);
  options.sort((x, y) => (y.held - x.held) || (y.d.deflect.rank + y.penalty) - (x.d.deflect.rank + x.penalty));
  const pick = options[0];
  if (!pick) return null;
  const { d, penalty } = pick;
  if (!pick.held) d.deflectRound = b.round;
  const r = d20(rng);
  const roll = r <= 10 ? r + 10 : r;
  const total = roll + d.deflect.rank + penalty;
  const sum = `d20 ${r}${r <= 10 ? ' (+10)' : ''} + ${d.deflect.rank}${penalty ? ` − ${-penalty} (${penalty === -2 ? 'medium' : 'long'} range)` : ''} = ${total}`;
  const helps = total > dcUsed;
  notes.push(`${d.name} ${helps ? 'deflects' : 'tries to deflect'}${d === t ? '' : ` for ${t.name}`}: ${sum}`);
  return helps ? { dc: total, by: d, total, sum } : null;
}

/** The text of a successful deflection, for the log: who deflected for whom and the numbers. */
export const deflectLine = (t, r) => `${r.deflect.by.name} deflects the attack on ${t.name}: ${r.deflect.sum} vs attack total ${r.total}.`;
