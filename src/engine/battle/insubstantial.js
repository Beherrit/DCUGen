// Insubstantial (Hero's Handbook p103-104) as fight state: the forms a fighter has, what a form makes it immune to,
// and what an insubstantial attacker cannot do. The AI's choice to switch is in insub-turn.js.
//
// Each Insubstantial power (and each alternate of one) is one form: rank 1 fluid, 2 gaseous, 3 energy, 4 incorporeal.
// Switching is a free action once per round, and the form is sustained. Book defenses:
//  - 1 fluid: flows out of any hold or snare (not watertight). No immunity.
//  - 2 gaseous: Immunity to physical Damage. "Energy and area attacks still affect you normally." No Strength.
//  - 3 energy: Immunity to physical Damage, and to the energy that makes up the form itself. No Strength.
//  - 4 incorporeal: Immunity to physical and energy Damage. Sensory effects and Will effects still work on it, as do
//    effects with Affects Insubstantial; one other common effect or descriptor works on it (read from the power's
//    detail). No Strength, and it cannot affect the physical world except with Affects Corporeal (rank = the extra's
//    steps, up to the effect's full rank) or with sensory effects.
// Affects Insubstantial (DCA 125): rank 1 works at half rank against an insubstantial target, rank 2 at full rank.
// house rule: the rank 4 "one other common effect or descriptor" is the Insubstantial power's detail text, and nothing
// when that is empty. Only the form's Strength is lost: an Affects Corporeal on Strength is not read.

import { allPowers } from '../derive.js';
import { canonical } from './descriptors.js';
import { hasExtra } from './util.js';

const damaging = (atk) => atk.effect === 'Damage' || atk.effect === 'Mental Blast';
const tierNames = (atk) => (atk.tiers || []).flat();
export const FORM_NAMES = { 1: 'fluid', 2: 'gaseous', 3: 'energy', 4: 'incorporeal' };

/** A hold, snare or bond: what a fluid form simply flows out of. */
export const entraps = (a) => a.effect === 'Snare' || tierNames(a).some((n) => ['Bound', 'Restrained', 'Immobile'].includes(n));

/** The forms a character has: one per Insubstantial power or alternate. innate: permanent (Innate or Continuous), so never switched off. */
export function formsOf(ch) {
  const out = [];
  for (const { power: p } of allPowers(ch, { includeAlternates: true })) {
    if (p.effect !== 'Insubstantial') continue;
    const rank = Math.max(1, Math.min(4, p.rank || 1));
    const own = (p.descriptors || []).flatMap((x) => canonical(x));
    out.push({ key: p.id || p.name, name: p.name || FORM_NAMES[rank], rank, kind: FORM_NAMES[rank], own, works: canonical(p.detail || ''), innate: hasExtra(p, 'Innate') || hasExtra(p, 'Continuous') });
  }
  return out;
}

/** Why the fighter's form stops this attack (the descriptor), ignoring Affects Insubstantial; null when it does not. */
function stops(f, atk) {
  if (!damaging(atk) || !f || f.rank < 2) return null;
  const ds = atk.descriptors || [];
  if (f.works?.some((d) => ds.includes(d))) return null;
  if (f.rank === 2 && atk.area) return null;
  if (ds.includes('physical')) return 'physical';
  if (f.rank === 4 && ds.includes('energy')) return 'energy';
  if (f.rank === 3) return f.own.find((d) => ds.includes(d)) || null;
  return null;
}

/** The immunity entries an insubstantial fighter gets from its current form (empty when solid). */
export function insubEntries(c) {
  const f = c.insub;
  if (!f) return NONE;
  const word = `${f.kind} form`;
  const out = [{ label: `holds and snares (${word})`, hits: (a) => entraps(a) }];
  if (f.rank >= 2) {
    const what = f.rank === 4 ? 'physical and energy damage' : f.rank === 3 ? 'physical damage and its own energy' : 'physical damage';
    out.push({ label: `${what} (${word})`, hits: (a) => (a.affectsInsub ? null : stops(f, a)) });
    out.push({ label: `${what} (${word}, half rank)`, half: true, hits: (a) => (a.affectsInsub === 1 ? stops(f, a) : null) });
  }
  return out;
}
const NONE = [];

/**
 * Ranks an insubstantial attacker loses on this attack. From rank 2 it has no Strength, so Strength-based attacks lose
 * the Strength part; incorporeal (rank 4) cannot affect the physical world at all except with Affects Corporeal or a
 * sensory effect. 0 when the fighter is solid or the attack is untouched.
 */
export function insubLoss(c, atk) {
  const f = c.insub;
  if (!f || f.rank < 2 || !atk.rank) return 0;
  let lost = 0;
  const str = Math.max(0, c.d?.abilities?.Strength ?? 0);
  if (atk.unarmed || atk.power?.strengthBased || (atk.equipment && atk.kind === 'close')) lost = Math.min(atk.rank, str);
  const sensory = atk.effect === 'Dazzle' || atk.effect === 'Illusion';
  if (f.rank === 4 && !sensory) lost = Math.max(lost, atk.rank - Math.min(atk.rank, atk.affectsCorporeal || 0));
  return lost;
}

/** The form's name in plain words for the log. */
export const formWords = (f) => `${f.kind} (Insubstantial ${f.rank})`;

/** Keep a saved form only while the character still has it, and put innate forms back on. Returns the form or null. */
export function restoreForm(c) {
  const forms = formsOf(c.ch);
  const keep = c.insub ? forms.find((f) => f.key === c.insub.key) : null;
  if (keep) return keep;
  return forms.find((f) => f.innate) || null;
}
