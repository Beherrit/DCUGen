// The two flaws that change the target's side of an attack: Sense-Dependent (DCA 137: the target must perceive the
// effect, and a Dodge check averts it) and Resistible (DCA 137: a second resistance check, and the better one counts).
// applyEffect (attack-effects.js) calls both.

import { sign, log, d20 } from './util.js';
import { rollCheck, critNote } from './checks.js';
import { resistOf, checkPenalty, defenseVs } from './conditions.js';
import { dodgeFx } from './fortune.js';
import { cannotPerceive } from './flaw-odds.js';

const SENSE_NAME = { sight: 'see', hearing: 'hear', smell: 'smell', touch: 'feel', taste: 'taste' };

/**
 * Sense-Dependent: a target that cannot use the sense is immune; any other target gets a Dodge check against the
 * effect's DC, and a success means it looked away or covered its ears. Returns true when the effect is stopped.
 */
export function senseStops(b, c, atk, t, rng, dc, rank) {
  const sense = atk.flaws?.sense;
  if (!sense) return false;
  const word = sense.word;
  if (cannotPerceive(t, word)) {
    log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${atk.name}: Sense-Dependent (${word}): ${t.name} cannot ${SENSE_NAME[word] || 'perceive'}, so it is immune.` });
    return true;
  }
  const dodge = resistOf(t, 'Dodge');
  if (dodge === null) return false;
  const r = rollCheck(rng, dodge, dc, dodgeFx(b, t, atk, rank));
  const averted = r.success;
  log(b, { kind: averted ? 'resist' : 'note', actor: c.id, target: t.id, text: `${atk.name}: Sense-Dependent${word ? ` (${word})` : ''}: ${t.name} Dodge d20 ${r.roll} ${sign(dodge)} = ${r.total} vs DC ${dc}${critNote(r)} — ${averted ? 'looks away in time: no effect' : 'perceives it'}.`, dice: [{ label: 'Dodge to avert', roll: r.roll, mod: dodge, total: r.total, dc }] });
  return averted;
}

/**
 * Inexact (MA 97): an Area effect needs its own attack check against each target in it, and a target it misses is not
 * affected (a target it hits still gets its Dodge check). house rule: an area has no attack bonus of its own, so the check
 * uses the fighter's attack bonus with the power's kind (Fighting for a close area, Dexterity for a ranged one).
 */
export function inexactHit(b, c, atk, v, rng) {
  const which = atk.range === 'close' ? 'Parry' : 'Dodge';
  const bonus = (atk.bonus ?? (which === 'Parry' ? c.d.abilities.Fighting : c.d.abilities.Dexterity) ?? 0) - checkPenalty(c);
  const dc = 10 + defenseVs(v, which, c);
  const roll = d20(rng);
  const total = roll + bonus;
  const hit = roll === 20 || (roll !== 1 && total >= dc);
  log(b, { kind: hit ? 'note' : 'miss', actor: c.id, target: v.id, text: `${atk.name}: Inexact: attack check on ${v.name} d20 ${roll} ${sign(bonus)} = ${total} vs ${which} DC ${dc} — ${hit ? 'it catches them' : 'it misses them'}.`, dice: [{ label: 'Attack', roll, mod: bonus, total, dc }] });
  return hit;
}

/**
 * The target's resistance roll. With Resistible it also rolls the defense the flaw names and the better result stands
 * (the one with fewer degrees of failure). Returns { r, name, bonus }: the roll that counts, and what it was made with.
 */
export function resistRoll(rng, t, atk, resistName, resist, dc, fx) {
  const r = rollCheck(rng, resist, dc, fx);
  const extra = atk.flaws?.resistible;
  const other = extra ? resistOf(t, extra) : null;
  if (other == null) return { r, name: resistName, bonus: resist };
  const r2 = rollCheck(rng, other, dc);
  return r2.fails < r.fails ? { r: r2, name: `${extra} (Resistible)`, bonus: other } : { r, name: `${resistName} (Resistible: ${extra} ${r2.total} was no better)`, bonus: resist };
}
