// What a flaw costs the user after an attack went off: the ranks that fade, the fatigue of a Tiring effect, being left
// vulnerable (Distracting), the backlash of a Side Effect, the recoil of a Prone effect, braced less against knockback
// (Push Over), and the note that a Chained prerequisite succeeded. `afterUse` runs once per use, with whether it landed.

import { log, sign, byId } from './util.js';
import { rollCheck, critNote } from './checks.js';
import { applyEffect, damageResult } from './attack-effects.js';
import { makeProne } from './prone.js';
import { flawKey } from './flaws.js';

/** Side Effect (DCA 137): on a failed use (a miss, or the target resisting) or on every use, the effect rebounds on the user, who gets the usual resistance check. */
function sideEffect(b, R, c, atk, rng, landed) {
  const mode = atk.flaws.sideEffect;
  if (mode === 'failure' && landed) return;
  log(b, { kind: 'condition', actor: c.id, target: c.id, text: `${atk.name}: Side Effect (${mode === 'always' ? 'every use' : 'on failure'}): the effect rebounds on ${c.name}.`, important: true });
  // house rule: the book leaves the side effect to the GM; here it is the effect itself at its own rank (one of the book's
  // examples), and the user's own immunities do not stop it ("you aren't immune to its side effect").
  const rebound = { ...atk, flaws: null, descriptors: [], area: null, name: `${atk.name} (side effect)` };
  applyEffect(b, R, c, rebound, c, rng, { auto: true, crit: false });
}

/** Prone (MA 98): after the effect, an Agility or Acrobatics check against DC 10 plus its rank keeps the user standing; as a 2-point flaw there is no check. */
function proneUse(b, c, atk, rng) {
  if (c.conditions.some((x) => x.name === 'Prone')) return;
  if (atk.flaws.proneUse === 2) {
    makeProne(c, c, 'drop', 'thrown down by its own effect');
    log(b, { kind: 'condition', actor: c.id, text: `${atk.name}: Prone: using it always throws ${c.name} down.`, important: true });
    return;
  }
  const dc = 10 + atk.rank;
  const bonus = Math.max(c.skills.Acrobatics ?? -99, c.d.abilities.Agility ?? 0);
  const r = rollCheck(rng, bonus, dc);
  const held = r.success;
  if (!held) makeProne(c, c, 'drop', 'thrown down by its own effect');
  log(b, { kind: held ? 'note' : 'condition', actor: c.id, text: `${atk.name}: Prone: ${c.name} tries to stay on its feet, d20 ${r.roll} ${sign(bonus)} = ${r.total} vs DC ${dc}${critNote(r)} — ${held ? 'stays up' : 'knocked prone'}.`, dice: [{ label: 'Stay on your feet', roll: r.roll, mod: bonus, total: r.total, dc }], important: !held });
}

/**
 * Feedback (DCA 135): a Snare is the one manifestation the engine has, and the snared fighter hits it when it tries to
 * break out with Damage. The maker makes a resistance check against that Damage rank, with the Snare's rank as the bonus
 * in place of Toughness. Nothing happens when the break-out is by Sleight of Hand (nothing is damaged).
 */
export function snareFeedback(b, target, lead, rng) {
  const maker = byId(b, lead.from);
  const snare = maker?.attacks.find((a) => a.id === lead.source);
  if (!snare?.flaws?.feedback || snare.effect !== 'Snare' || maker.out) return;
  const damage = Math.max(0, ...target.attacks.filter((a) => a.effect === 'Damage' && !a.area).map((a) => a.rank));
  if (!damage || damage < (target.skills?.['Sleight of Hand'] ?? 0)) return;
  const dc = 15 + damage;
  const r = rollCheck(rng, snare.rank, dc);
  const base = `Feedback: ${target.name} damages ${snare.name} (Damage ${damage}); ${maker.name} resists with the Snare's rank: d20 ${r.roll} ${sign(snare.rank)} = ${r.total} vs DC ${dc}${critNote(r)}`;
  if (!r.fails) { log(b, { kind: 'resist', actor: maker.id, target: target.id, text: `${base} — unharmed.` }); return; }
  damageResult(b, target, maker, r.fails, base, [{ label: 'Feedback', roll: r.roll, mod: snare.rank, total: r.total, dc }]);
}

/** The flaws that charge the user once the attack has been made. */
export function afterUse(b, R, c, atk, rng, landed) {
  const f = atk.flaws;
  if (!f) return;
  const key = flawKey(atk);
  if (landed) c.flaw.done[key] = b.round;
  if (f.fades) {
    c.flaw.faded[key] = (c.flaw.faded[key] || 0) + f.fades;
    const left = Math.max(0, atk.rank - c.flaw.faded[key]);
    log(b, { kind: 'note', actor: c.id, text: `${atk.name}: Fades: ${left ? `down to rank ${left}` : 'no ranks left'}.` });
  }
  if (f.tiring) {
    c.fatigue += 1;
    log(b, { kind: 'condition', actor: c.id, text: `${atk.name}: Tiring: ${c.name} is now ${c.fatigue >= 3 ? 'spent' : c.fatigue >= 2 ? 'exhausted' : 'fatigued'}.` });
  }
  if (f.distracting) {
    c.distracted = true;
    log(b, { kind: 'note', actor: c.id, text: `${atk.name}: Distracting: ${c.name} is vulnerable until the start of its next turn.` });
  }
  if (f.pushOver) c.flaw.pushOver = f.pushOver;
  if (f.proneUse) proneUse(b, c, atk, rng);
  if (f.sideEffect) sideEffect(b, R, c, atk, rng, landed);
}
