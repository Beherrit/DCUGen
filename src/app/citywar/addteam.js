// "Add team": a name, a color, and members picked from Your characters and the Bestiary, like the fight setup does.
// cx is { war, R, ui, save, render }; ui.draft is { name, color, members: [{ ch, label }] }.

import { h, clear, toast } from '../dom.js';
import { state } from '../store.js';
import { catalogEntries } from '../../engine/workshop.js';
import { catalogToCharacter } from '../../engine/catalog.js';
import { addTeam, teamAt, GANG_COLORS } from '../../engine/citywar.js';
import { makeRng } from '../../engine/rng.js';

const freshDraft = (war) => ({ name: '', color: GANG_COLORS[war.teams.length % GANG_COLORS.length], members: [] });
const nameOf = (ch) => ch.identity?.codename || ch.identity?.realName || 'Fighter';

/** A free cell for a new team, picked from the seed so the same setup gives the same place. */
export function freeCell(war) {
  const free = [];
  for (let y = 0; y < war.size; y++) for (let x = 0; x < war.size; x++) if (!teamAt(war, x, y)) free.push({ x, y });
  return free.length ? makeRng(`${war.seed}::place::${war.teams.length}`).pick(free) : null;
}

function pickRow(label, meta, onAdd) {
  return h('div', { class: 'cw-pick' },
    h('span', { class: 'cw-pick-text' }, h('b', { title: label }, label), h('small', null, meta)),
    h('button', { type: 'button', class: 'btn sm', 'aria-label': `Add ${label} to the new team`, onClick: onAdd }, 'Add'));
}

/** The two searchable lists of people to add. */
function pickers(cx, redrawDraft) {
  const { R, ui } = cx;
  const mine = [];
  for (const t of state.tabs || []) mine.push(t);
  for (const c of state.roster || []) if (!mine.some((m) => m.rosterId && m.rosterId === c.rosterId)) mine.push(c);
  const mineQ = h('input', { type: 'search', id: 'cw-mine-q', placeholder: 'Find one of your characters…', 'aria-label': 'Find one of your characters' });
  const mineList = h('div', { class: 'cw-pick-list', id: 'cw-mine' });
  const drawMine = () => {
    clear(mineList);
    const term = mineQ.value.trim().toLowerCase();
    const shown = mine.filter((ch) => !term || `${ch.identity?.codename || ''} ${ch.identity?.realName || ''}`.toLowerCase().includes(term)).slice(0, 40);
    if (!mine.length) mineList.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Roll or save characters on the Forge and they show up here.'));
    for (const ch of shown) mineList.append(pickRow(nameOf(ch), `PL ${ch.pl}`, () => { ui.draft.members.push({ ch, label: nameOf(ch) }); redrawDraft(); }));
    if (mine.length && !shown.length) mineList.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing matches.'));
  };
  mineQ.addEventListener('input', drawMine);
  const all = catalogEntries(R);
  const beastQ = h('input', { type: 'search', id: 'cw-beast-q', placeholder: 'Bestiary: thug, wolf, robot…', 'aria-label': 'Search the bestiary' });
  const beastList = h('div', { class: 'cw-pick-list', id: 'cw-beasts' });
  const drawBeasts = () => {
    clear(beastList);
    const term = beastQ.value.trim().toLowerCase();
    const found = all.filter((e) => !term || `${e.name} ${e.category} ${(e.tags || []).join(' ')}`.toLowerCase().includes(term)).slice(0, term ? 40 : 15);
    for (const e of found) {
      beastList.append(pickRow(e.name, `PL ${e.pl} · ${e.category}${e.minion ? ' · minion' : ''}`, () => {
        try { const ch = catalogToCharacter(e); ch.alignment = 'villain'; ui.draft.members.push({ ch, label: e.name }); redrawDraft(); } catch (err) { toast(err.message); }
      }));
    }
    if (!found.length) beastList.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing matches.'));
  };
  beastQ.addEventListener('input', drawBeasts);
  drawMine(); drawBeasts();
  return [h('div', { class: 'label' }, 'Your characters'), mineQ, mineList, h('div', { class: 'label' }, 'Bestiary'), beastQ, beastList];
}

/** The Add team block for the setup panel. */
export function addTeamPanel(cx) {
  const { war, ui, save, render } = cx;
  ui.draft ||= freshDraft(war);
  const draft = ui.draft;
  const members = h('div', { class: 'cw-draft', id: 'cw-draft' });
  const drawDraft = () => {
    clear(members);
    if (!draft.members.length) members.append(h('p', { class: 'hint', style: { margin: 0 } }, 'No members yet: add some from the lists below.'));
    draft.members.forEach((m, i) => members.append(h('div', { class: 'cw-pick' },
      h('span', { class: 'cw-pick-text' }, h('b', null, m.label), h('small', null, `PL ${m.ch.pl}`)),
      h('button', { type: 'button', class: 'btn sm ghost', 'aria-label': `Remove ${m.label} from the new team`, onClick: () => { draft.members.splice(i, 1); drawDraft(); } }, 'Remove'))));
  };
  const create = () => {
    const spot = freeCell(war);
    if (!spot) { toast('The map is full'); return; }
    if (!draft.members.length) { toast('Add at least one member first'); return; }
    const copies = draft.members.map((m) => JSON.parse(JSON.stringify(m.ch)));
    const team = addTeam(war, { name: draft.name.trim() || `Team ${war.nextTeam}`, color: draft.color, members: copies, ...spot });
    ui.sel = team.id; ui.draft = freshDraft(war);
    save(); render(); toast(`${team.name} added at the map`);
  };
  drawDraft();
  return h('details', { class: 'cw-add', id: 'cw-add' }, h('summary', null, 'Add team'),
    h('div', { class: 'add-row' },
      h('input', { type: 'text', id: 'cw-name', placeholder: 'Team name', 'aria-label': 'Team name', value: draft.name, onInput: (e) => { draft.name = e.target.value; } }),
      h('input', { type: 'color', id: 'cw-color', 'aria-label': 'Team color', value: draft.color, onInput: (e) => { draft.color = e.target.value; } })),
    members,
    ...pickers(cx, drawDraft),
    h('button', { type: 'button', class: 'btn primary', id: 'cw-create', onClick: create }, 'Add team to the map'));
}
