// The "Fighting styles" section of the character sheet (Mutants & Masterminds: Martial Arts 3e).
// sheetview.js calls this with one hook; everything about styles on the sheet lives in src/app/styles/.

import { h } from '../dom.js';
import { stylesOf } from '../../engine/martial/lookup.js';
import { addStyle } from '../../engine/martial/styles.js';
import { styleCard } from './card.js';
import { stylePicker } from './picker.js';

/**
 * Returns the section, or null when the character knows no style and the sheet is not being edited.
 * ctx: { editing, change(fn), stepper, cost (the sheet's cost breakdown) }
 */
export function stylesSection(ch, R, ctx) {
  const styles = stylesOf(ch);
  if (!styles.length && !ctx.editing) return null;
  const known = new Set(styles.map((s) => s.name));
  return h('section', { class: 'sec fs-section', id: 'fighting-styles' },
    h('h3', null, 'Fighting styles', h('span', { class: 'pts' }, `${ctx.cost.styles} pp`)),
    styles.length ? null : h('p', { class: 'fs-none' }, 'No fighting styles. A style gives stances, weapons and combat maneuvers from the Martial Arts book.'),
    styles.map((s) => styleCard(ch, R, s, ctx)),
    ctx.editing ? stylePicker({
      styles: R.raw.styles || [], known,
      onPick: (def) => ctx.change((c) => { addStyle(c, R, def.name); }),
    }) : null);
}
