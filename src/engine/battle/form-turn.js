// Changing build in a fight: Alternate Form and Metamorph (form-swap.js), Shapeshift (shapeshift.js) and Mimic (mimic.js). Each
// candidate is scored by putting the build on and reading form-score.js against the foes now; the best one that beats the
// current build by enough is worth taking. The action it costs decides when: a free or move action is taken at the start of the
// turn (a move action leaves the standard action for the attack); a standard action competes with the attack as a turn option.

import { canAct } from './conditions.js';
import { inReach } from './geometry.js';
import { formScore, formGain, MIN_FORM_GAIN } from './form-score.js';
import { swapPowerOf, swapForm, probeForm, currentForm } from './form-swap.js';
import { shapeshiftsOf, scoreShapes, assumeShape, shapeOf } from './shapeshift.js';
import { mimicsOf, copyOf, scan } from './mimic.js';
import { withMods } from './mods.js';
import { hasForms } from '../forms.js';

/** Every change c could make now: [{ action: 'free' | 'move' | 'standard', u, run }]. */
export function formChoices(b, R, c, enemies) {
  if (!enemies.length || canAct(c) === 'none') return [];
  const out = [];
  const now = formScore(b, c, enemies);
  const swap = swapPowerOf(c.ch);
  if (swap) {
    for (let i = 0; i < c.ch.forms.length; i++) {
      if (i === currentForm(c)) continue;
      const u = formGain(now, formScore(b, probeForm(b, R, c, i), enemies));
      if (u > 0) out.push({ action: swap.action, u, run: (bb, RR, cc) => swapForm(bb, RR, cc, i, swap.action) });
    }
  }
  for (const s of shapeshiftsOf(c.ch)) {
    for (const { shape, score } of scoreShapes(c, s, () => formScore(b, c, enemies))) {
      const u = shape.key === shapeOf(c) ? 0 : formGain(now, score);
      if (u > 0) out.push({ action: 'move', u, run: (bb, RR, cc) => assumeShape(bb, cc, s, shape) });
    }
  }
  for (const s of mimicsOf(c.ch)) {
    for (const e of enemies) {
      if (s.touch && !inReach(b, c, e)) continue;
      for (const atk of e.attacks) {
        const copy = copyOf(R, c, s, e, atk);
        if (!copy || c.attacks.some((a) => a.id === copy.id)) continue;
        const u = formGain(now, withMods(c, [{ kind: 'attack', attack: copy }], () => formScore(b, c, enemies)));
        if (u > 0) out.push({ action: 'standard', u, run: (bb, RR, cc) => scan(bb, cc, s, e, copy) });
      }
    }
  }
  return out.filter((x) => x.u >= MIN_FORM_GAIN);
}

const best = (list) => list.reduce((m, x) => (!m || x.u > m.u ? x : m), null);

/** The start of a turn: take a free or move-action change of build when one is worth it. Returns the mode the rest of the turn has. */
export function formTurn(b, R, c, enemies, mode) {
  if (!hasForms(c.ch) && !shapeshiftsOf(c.ch).length) return mode;
  const pick = best(formChoices(b, R, c, enemies).filter((x) => x.action !== 'standard'));
  if (!pick || (pick.action === 'move' && mode !== 'full')) return mode;
  pick.run(b, R, c);
  return pick.action === 'move' ? 'standard' : mode;
}

/** The standard-action changes (a Mimic scan, a cheaper Alternate Form) as an option beside the attack. */
export function formOption(b, R, c, enemies) {
  if (!hasForms(c.ch) && !shapeshiftsOf(c.ch).length && !mimicsOf(c.ch).length) return null;
  const pick = best(formChoices(b, R, c, enemies).filter((x) => x.action === 'standard'));
  return pick ? { kind: 'form', u: pick.u, run: pick.run } : null;
}

