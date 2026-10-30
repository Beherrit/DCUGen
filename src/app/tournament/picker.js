// Picking entrants: two searchable lists, Your characters and the Bestiary, as the fight setup has. Each Add puts one
// character on the entrant list as an entrant of its own; "Make a team" in the list then groups entrants.
// cx is { draft, R, changed() }.

import { h, clear, toast } from '../dom.js';
import { state } from '../store.js';
import { catalogEntries } from '../../engine/workshop.js';
import { catalogToCharacter } from '../../engine/catalog.js';

const nameOf = (ch) => ch.identity?.codename || ch.identity?.realName || 'Fighter';

/** Put a character on the list as an entrant of its own. Same names get a number so they can be told apart. */
export function addEntrant(draft, label, ch) {
  const same = draft.entrants.filter((e) => e.name === label || e.name.startsWith(`${label} `)).length;
  draft.entrants.push({ uid: draft.nextUid++, name: same ? `${label} ${same + 1}` : label, tactic: 'none', members: [{ ch: JSON.parse(JSON.stringify(ch)), label }] });
}

function pickRow(label, meta, onAdd) {
  return h('div', { class: 'cw-pick' },
    h('span', { class: 'cw-pick-text' }, h('b', { title: label }, label), h('small', null, meta)),
    h('button', { type: 'button', class: 'btn sm', 'aria-label': `Add ${label} as an entrant`, onClick: onAdd }, 'Add'));
}

const none = (text) => h('p', { class: 'hint', style: { margin: 0 } }, text);

function mineList(cx) {
  const mine = [];
  for (const t of state.tabs || []) mine.push(t);
  for (const c of state.roster || []) if (!mine.some((m) => m.rosterId && m.rosterId === c.rosterId)) mine.push(c);
  const q = h('input', { type: 'search', id: 'tn-mine-q', placeholder: 'Find one of your characters…', 'aria-label': 'Find one of your characters' });
  const list = h('div', { class: 'cw-pick-list', id: 'tn-mine' });
  const draw = () => {
    clear(list);
    const term = q.value.trim().toLowerCase();
    const shown = mine.filter((ch) => !term || `${ch.identity?.codename || ''} ${ch.identity?.realName || ''}`.toLowerCase().includes(term)).slice(0, 40);
    if (!mine.length) list.append(none('Roll or save characters on the Forge and they show up here.'));
    for (const ch of shown) list.append(pickRow(nameOf(ch), `PL ${ch.pl}`, () => { addEntrant(cx.draft, nameOf(ch), ch); cx.changed(); }));
    if (mine.length && !shown.length) list.append(none('Nothing matches.'));
  };
  q.addEventListener('input', draw);
  draw();
  return [q, list];
}

function beastList(cx) {
  const all = catalogEntries(cx.R);
  const q = h('input', { type: 'search', id: 'tn-beast-q', placeholder: 'Bestiary: thug, wolf, robot…', 'aria-label': 'Search the bestiary' });
  const list = h('div', { class: 'cw-pick-list', id: 'tn-beasts' });
  const draw = () => {
    clear(list);
    const term = q.value.trim().toLowerCase();
    const found = all.filter((e) => !term || `${e.name} ${e.category} ${(e.tags || []).join(' ')}`.toLowerCase().includes(term)).slice(0, term ? 40 : 15);
    for (const e of found) {
      list.append(pickRow(e.name, `PL ${e.pl} · ${e.category}${e.minion ? ' · minion' : ''}`, () => {
        try { const ch = catalogToCharacter(e); ch.alignment = 'villain'; addEntrant(cx.draft, e.name, ch); cx.changed(); } catch (err) { toast(err.message); }
      }));
    }
    if (!found.length) list.append(none('Nothing matches.'));
  };
  q.addEventListener('input', draw);
  draw();
  return [q, list];
}

/** The two lists, inside a closed-by-default block. */
export function pickerPanel(cx) {
  return h('details', { class: 'cw-add', id: 'tn-add' }, h('summary', null, 'Add entrants'),
    h('div', { class: 'label' }, 'Your characters'), ...mineList(cx), h('div', { class: 'label' }, 'Bestiary'), ...beastList(cx));
}
