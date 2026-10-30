// Alternate Form (Hero's Handbook p88) and Morph with Metamorph (p108): a character that has other builds (engine/forms.js: each
// form is a whole build) and a power to change into them takes the form that fights best. Alternate Form needs the action its
// Activation flaw names (a move action by default, a standard action for the cheaper version); Metamorph is a free action, once a
// round. Changing form keeps the fight state (bruises, conditions, place) and rebuilds the fighter's numbers from the new build.
// A fight starts in the form the fighter began it in (startForm). Not modelled: the Heroic form's Activation on every power, and a
// form that is not a build of the same character (a Shapeshift has its own menu: shapeshift.js).

import { allPowers } from '../derive.js';
import { hasExtra, log } from './util.js';
import { hasForms, activeForm, switchForm } from '../forms.js';
import { flawsOf } from './flaws.js';
import { makeCombatant, rebuildCombatant } from './combatant.js';
import { dropMods } from './mods.js';

/** What a character's change of form costs: { power, action: 'free' | 'move' | 'standard' }, or null when it cannot change form in a fight. */
export function swapPowerOf(ch) {
  if (!hasForms(ch)) return null;
  const forms = [ch, ...ch.forms.map((f) => ({ powers: f.powers }))];
  for (const holder of forms) {
    for (const { power: p } of allPowers(holder, { includeAlternates: true })) {
      if (p.effect === 'Morph' && hasExtra(p, 'Metamorph')) return { power: p, action: 'free' };
      if (p.effect === 'Alternate Form') return { power: p, action: flawsOf(p)?.activation === 2 ? 'standard' : 'move' };
    }
  }
  return null;
}

/** The index of the build the fighter is in. */
export const currentForm = (c) => activeForm(c.ch);

/** Change to form i: the numbers are rebuilt from the other build, the fight state stays. */
export function swapForm(b, R, c, i, action) {
  const was = c.ch.forms[currentForm(c)]?.name || 'its form';
  dropMods(c, 'shape'); dropMods(c, 'mimic'); // a copied or assumed trait does not carry over
  c.ch = switchForm(c.ch, i);
  rebuildCombatant(c, R);
  log(b, { kind: 'note', actor: c.id, text: `${c.name} changes form from ${was} to ${c.ch.forms[i]?.name || 'another form'} (${action === 'free' ? 'a free action' : `a ${action} action`}).`, important: true });
}

const probes = new WeakMap();

/** A stand-in for the fighter in form i, with the fight state that matters to a score copied over (never put in the battle). */
export function probeForm(b, R, c, i) {
  const key = `${b.seed}|${i}|${currentForm(c)}`;
  const mine = probes.get(c) || probes.set(c, new Map()).get(c);
  if (!mine.has(key)) mine.set(key, makeCombatant(R, switchForm(c.ch, i), { id: `${c.id}-form${i}`, team: c.team, name: 'probe', style: c.style }));
  const p = mine.get(key);
  Object.assign(p, { x: c.x, y: c.y, bruises: c.bruises, staggered: c.staggered, dazed: c.dazed, conditions: c.conditions, weakened: c.weakened, fatigue: c.fatigue });
  return p;
}

/** A fight starts in the form it was set up in: put a fighter that ended a run in another form back. */
export function restoreStartForm(R, c) {
  if (c.startForm == null || !hasForms(c.ch) || currentForm(c) === c.startForm) return;
  c.ch = switchForm(c.ch, c.startForm);
}
