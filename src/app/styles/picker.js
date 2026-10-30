// "Add a fighting style": a searchable list of the book's styles, grouped by category, each with its summary.

import { h } from '../dom.js';
import { CATEGORIES } from '../../engine/martial/lookup.js';

const matches = (s, q) => !q || `${s.name} ${s.summary} ${s.category} ${s.type}`.toLowerCase().includes(q);

/** The grouped list of styles that match the search, as buttons. Known styles are left out. */
function listBody(styles, known, query, onPick) {
  const q = query.trim().toLowerCase();
  const left = styles.filter((s) => !known.has(s.name) && matches(s, q));
  if (!left.length) return h('p', { class: 'fs-none' }, 'No style matches.');
  return CATEGORIES.map((cat) => {
    const inCat = left.filter((s) => s.category === cat);
    if (!inCat.length) return null;
    return h('div', { class: 'fs-group' },
      h('h4', null, `${cat} (${inCat.length})`),
      inCat.map((s) => h('button', { class: 'fs-pick', type: 'button', onClick: () => onPick(s) },
        h('b', null, s.name), h('span', { class: 'fs-pts' }, `${s.points} pp`),
        h('small', null, `${s.type}. ${s.summary}`))));
  });
}

/**
 * opts: { styles (the book's list), known (Set of names the character has), onPick(styleDef) }
 * The list opens on demand and filters as you type.
 */
export function stylePicker({ styles, known, onPick }) {
  const list = h('div', { class: 'fs-list', id: 'fs-list' });
  const input = h('input', { type: 'search', id: 'fs-search', placeholder: `Search ${styles.length} styles: aikido, sword, boxing, ninja...`, 'aria-label': 'Search fighting styles' });
  const redraw = () => { list.replaceChildren(...[listBody(styles, known, input.value, onPick)].flat(Infinity).filter(Boolean)); };
  input.addEventListener('input', redraw);
  const box = h('details', { class: 'fs-add no-print', id: 'fs-add' },
    h('summary', null, '+ Add a fighting style'),
    h('p', { class: 'hint' }, 'Each style costs the Initiate advantage (1 pp) to start. Buy its stances, weapons and maneuvers below. Styles come from Mutants & Masterminds: Martial Arts 3e.'),
    input, list);
  box.addEventListener('toggle', () => { if (box.open && !list.childNodes.length) redraw(); });
  return box;
}
