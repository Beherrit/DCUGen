// Getting around cover: Indirect (DCA 130) and Ricochet (DCA 132, with Pinball and Recoverable from MA 93-94, and the Bad
// Bounce flaw from MA 94).
// - Indirect: the effect comes from another point, so the cover between the user and the target does not count (cover.js
//   ignoresCover). The book says it may count as a surprise attack (p178: the target is vulnerable).
// - Ricochet: one bounce per rank off a solid surface (a cover piece, or the walls of an enclosed room), to attack around
//   corners and overcome cover. It may grant a bonus to hit from surprise, at the GM's discretion (p132).
// - house rule: the first Indirect attack, or Ricochet used to get around cover, against each target is a surprise attack
//   (the target is vulnerable to it); the book leaves it to the GM, and this is how it is read here.
// - Bad Bounce: each bounce needs its own attack check against DC 10 (the surface is immobile), +2 per earlier bounce.
// - Pinball: each bounce hits whatever it bounces off with the effect (a Damage bounce hurts the piece of cover).
// - Recoverable: bounces left over bring the attack back to the user, who catches it with a Dexterity check against the
//   attack check result; two degrees of failure and it is made against the user.

import { log, d20, sign } from './util.js';
import { checkResult } from './checks.js';
import { coverBetween, bouncesOffSomething } from './cover.js';
import { bounceDc } from './flaw-odds.js';
import { damagePiece } from './cover-damage.js';

/** The first Indirect attack, or Ricochet round cover, on each target is a surprise attack: it is vulnerable to that attack. */
export function surprisePrep(b, c, atk, t) {
  if (!atk.roll || t.feinted) return;
  const around = atk.ex?.ricochet && bouncesOffSomething(b) && coverBetween(b, c, atk, t);
  const why = atk.ex?.indirect ? 'Indirect' : around ? 'Ricochet' : null;
  if (!why || (t.surprisedBy || []).includes(c.id)) return;
  (t.surprisedBy ||= []).push(c.id);
  t.feinted = { by: c.id, round: b.round, why: `surprise attack (${why})` };
  log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: ${why} comes at ${t.name} from an unexpected direction: a surprise attack, so ${t.name} is vulnerable to it.` });
}

/**
 * A Ricochet attack on a target behind cover banks off the cover. Returns { ok, used }: ok is false when a Bad Bounce check
 * failed (the attack is wasted); used is the bounces spent.
 */
export function bounce(b, c, atk, t, rng) {
  if (!atk.ex?.ricochet) return { ok: true, used: 0 };
  const piece = bouncesOffSomething(b) ? coverBetween(b, c, atk, t) : null;
  if (!piece) return { ok: true, used: 0 };
  log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: Ricochet: it banks off the ${piece.name} to get at ${t.name}.` });
  if (atk.flaws?.badBounce && atk.roll) {
    const dc = bounceDc(0, 0, true);
    const roll = d20(rng);
    const total = roll + atk.bonus;
    const hit = roll !== 1 && total >= dc;
    log(b, { kind: hit ? 'note' : 'miss', actor: c.id, target: t.id, text: `${atk.name}: Bad Bounce: ${c.name} must hit the ${piece.name} first: d20 ${roll} ${sign(atk.bonus)} = ${total} vs DC ${dc} — ${hit ? 'it bounces true' : 'it ricochets the wrong way and is wasted'}.`, dice: [{ label: 'Bounce', roll, mod: atk.bonus, total, dc }] });
    if (!hit) return { ok: false, used: 1 };
  }
  if (atk.ex.pinball && atk.effect === 'Damage') damagePiece(b, c, piece, atk.rank, rng); // Pinball: the bounce hurts what it bounces off
  return { ok: true, used: 1 };
}

/** Recoverable: spare bounces bring the attack back. Returns the degrees of failure to catch it (0 when caught or when nothing came back). */
export function recoverCatch(b, c, atk, rng, total, used) {
  const spare = (atk.ex?.ricochet || 0) - used;
  if (!atk.ex?.recoverable || spare < 1) return 0;
  const bonus = c.d.abilities.Dexterity ?? 0;
  const roll = d20(rng);
  const r = checkResult(roll, bonus, total);
  log(b, { kind: r.success ? 'note' : 'miss', actor: c.id, text: `${atk.name}: Recoverable: it comes back to ${c.name}, who must catch it: Dexterity d20 ${roll} ${sign(bonus)} = ${r.total} vs ${total} — ${r.success ? 'caught' : r.degrees >= 2 ? 'missed it badly, and it is made against them' : 'missed, and it flies on'}.`, dice: [{ label: 'Catch', roll, mod: bonus, total: r.total, dc: total }] });
  return r.success ? 0 : r.degrees;
}
