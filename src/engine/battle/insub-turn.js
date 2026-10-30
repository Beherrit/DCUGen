// Insubstantial in play: the free action to change form (once per round, at the start of the fighter's turn) and
// flowing out of a hold. The AI turns insubstantial when that beats the harm coming in, and solid again to fight
// with effects the form cannot use. What each form is and does is in insubstantial.js.

import { log, byId } from './util.js';
import { expectedValue } from './odds.js';
import { formsOf, formWords } from './insubstantial.js';

/** How much better off the fighter is in this form (null is solid): the harm it can do less most of the harm coming in. */
function worth(b, c, enemies, form) {
  const was = c.insub;
  c.insub = form;
  let mine = 0; let theirs = 0;
  for (const e of enemies) {
    for (const a of c.attacks) mine = Math.max(mine, expectedValue(c, a, e, { b }));
    theirs += Math.max(0, ...e.attacks.map((a) => expectedValue(e, a, c, { b })));
  }
  c.insub = was;
  return mine - 0.7 * theirs;
}

const held = (c) => !!c.grabbedBy || c.conditions.some((x) => x.entrap);
const MARGIN = 0.1; // not worth a change of form for less

/** A fluid or thinner form flows out of any hold, snare or bond that is not watertight (DCA 103). */
export function flowOut(b, c) {
  if (!c.insub || !held(c)) return false;
  const holder = byId(b, c.grabbedBy);
  if (holder) holder.holding = null;
  const what = holder ? `${holder.name}'s grip` : 'the snare';
  c.grabbedBy = null;
  c.conditions = c.conditions.filter((x) => !x.entrap && x.source !== 'grab');
  log(b, { kind: 'condition', actor: c.id, text: `${c.name} flows out of ${what} in ${formWords(c.insub)}.`, important: true });
  return true;
}

function describe(f) {
  if (f.rank === 4) return 'physical and energy damage cannot hurt it, but it cannot affect the physical world either';
  if (f.rank === 3) return 'physical damage cannot hurt it, and it has no Strength';
  if (f.rank === 2) return 'physical damage (but not area attacks) cannot hurt it, and it has no Strength';
  return 'no hold can keep it';
}

/**
 * The free action: pick the form (or solid) that is worth most against these enemies and change to it, saying why.
 * A fighter held or snared counts any form as worth 2 more, because it flows out.
 */
export function insubTurn(b, c, enemies) {
  const forms = formsOf(c.ch);
  if (!forms.length || forms.some((f) => f.innate)) return;
  const bonus = held(c) ? 2 : 0;
  const score = (f) => worth(b, c, enemies, f) + (f ? bonus : 0);
  const now = c.insub ? forms.find((f) => f.key === c.insub.key) || null : null;
  let best = now; let top = score(now) + MARGIN;
  for (const f of [null, ...forms]) {
    if (f === now || (f && now && f.key === now.key)) continue;
    const s = score(f);
    if (s > top) { best = f; top = s; }
  }
  if (best !== now) {
    c.insub = best;
    log(b, { kind: 'note', actor: c.id, text: best ? `${c.name} turns ${formWords(best)}: ${describe(best)}.` : `${c.name} turns solid again, to fight with attacks the ${now.kind} form could not use.`, important: true });
  }
  flowOut(b, c);
}
