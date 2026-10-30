// Healing, hero points, the Recover action and Regeneration.

import { log } from './util.js';
import { rollCheck, critNote } from './checks.js';

/** Healing (Hero's Handbook p103): a DC 10 check, one damage condition healed per degree, worst first. A failed check cannot be tried again on the same subject in the fight. */
export function heal(b, c, patient, rng) {
  const dc = 10;
  const r = rollCheck(rng, c.healing.rank, dc);
  const { roll, total } = r;
  const deg = r.success ? r.degrees : 0;
  if (!r.success) patient.healFailed = true;
  const fixed = [];
  for (let i = 0; i < deg; i++) {
    if (patient.staggered) { patient.staggered = false; fixed.push('staggered'); }
    else if (patient.dazed) { patient.dazed = false; fixed.push('dazed'); }
    else if (patient.bruises > 0) { patient.bruises--; fixed.push('a bruise'); }
    else break;
  }
  c.stats.healed += fixed.length;
  log(b, { kind: fixed.length ? 'heal' : 'miss', actor: c.id, target: patient.id, text: `${c.name} uses ${c.healing.name} on ${patient === c ? `${c.name === 'it' ? 'itself' : 'themself'}` : patient.name}: d20 ${roll} + ${c.healing.rank} = ${total} vs DC 10${critNote(r, { degrees: true })} — ${fixed.length ? `removes ${fixed.join(', ')}` : 'no effect'}.`, dice: [{ label: 'Healing', roll, mod: c.healing.rank, total, dc }], important: fixed.length > 1 });
}

/** Spend a hero point to 'recover' (dazed and stunned, else fatigue) or only from 'fatigue'. */
export function spendHeroPoint(b, c, use) {
  if (c.heroPoints <= 0) return false;
  c.heroPoints--;
  if (use === 'recover' || use === 'fatigue') {
    // A hero point removes dazed, fatigued or stunned, or turns exhausted into fatigued (DCA 21)
    const fixed = [];
    if (use === 'recover' && c.dazed && !c.staggered) { c.dazed = false; fixed.push('dazed'); }
    const stun = use === 'recover' && c.conditions.find((x) => x.name === 'Stunned');
    if (stun) { c.conditions = c.conditions.filter((x) => x.source !== stun.source); fixed.push('stunned'); }
    if (c.fatigue > 0 && !fixed.length) { c.fatigue--; fixed.push(c.fatigue ? 'exhausted (now fatigued)' : 'fatigue'); }
    log(b, { kind: 'hero', actor: c.id, text: `${c.name} spends a hero point to recover${fixed.length ? ` from being ${fixed.join(' and ')}` : ''} (${c.heroPoints} left).`, important: true });
  }
  return true;
}

/**
 * Recover (DCA 177): the whole turn to catch your breath, once per conflict. Removes the highest level of damage
 * or fatigue, and gives +2 to active defenses until the start of the next turn.
 */
export function recoverAction(b, c) {
  c.recovered = true;
  let what;
  if (c.staggered) { c.staggered = false; c.dazed = true; what = 'staggered (still dazed)'; }
  else if (c.fatigue >= 2) { c.fatigue--; what = 'exhausted (now fatigued)'; }
  else if (c.dazed) { c.dazed = false; what = 'dazed'; }
  else if (c.fatigue) { c.fatigue--; what = 'fatigue'; }
  else if (c.bruises) { c.bruises--; what = 'a bruise'; }
  c.defMod = 2;
  log(b, { kind: 'heal', actor: c.id, text: `${c.name} takes a moment to recover${what ? `: no longer ${what}` : ''}, +2 to defenses until their next turn (once per fight).`, important: true });
}

export function regenerate(b, c) {
  if (!c.regenRank || (!c.bruises && !c.dazed && !c.staggered)) return;
  c.regen += c.regenRank;
  const fixed = [];
  while (c.regen >= 10) {
    c.regen -= 10;
    if (c.staggered) { c.staggered = false; fixed.push('staggered'); }
    else if (c.dazed) { c.dazed = false; fixed.push('dazed'); }
    else if (c.bruises) { c.bruises--; fixed.push('a bruise'); }
    else break;
  }
  if (fixed.length) log(b, { kind: 'heal', actor: c.id, text: `${c.name} regenerates: no longer ${fixed.join(', ')}.` });
}
