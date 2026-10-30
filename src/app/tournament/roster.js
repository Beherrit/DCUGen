// The entrant list of the setup: each entrant is a team of one or more characters with a tactic. Rows can be renamed,
// moved up and down (or dragged) to set the seeding order, removed, ticked and grouped with "Make a team", or split
// back into single characters. cx is { draft, ui, changed() }; ui.checked is the set of ticked entrant ids.

import { h, clear, toast } from '../dom.js';
import { TEAM_TACTICS } from '../../engine/battle.js';

const summary = (e) => (e.members.length === 1 ? `PL ${e.members[0].ch.pl}` : `${e.members.length} members: ${e.members.map((m) => m.label).join(', ')}`);

function move(draft, i, to) {
  if (to < 0 || to >= draft.entrants.length || to === i) return;
  const [e] = draft.entrants.splice(i, 1);
  draft.entrants.splice(to, 0, e);
}

function tacticSelect(e, cx) {
  return h('select', { class: 'cw-tactic', 'aria-label': `Tactic for ${e.name}`, onChange: (ev) => { e.tactic = ev.target.value; cx.changed(false); } },
    Object.entries(TEAM_TACTICS).map(([id, v]) => h('option', { value: id, selected: id === e.tactic, title: v.blurb }, v.label)));
}

function row(e, i, cx) {
  const { draft, ui, changed } = cx;
  const checked = ui.checked.has(e.uid);
  const btn = (label, aria, fn, extra = '') => h('button', { type: 'button', class: `btn sm ghost${extra}`, 'aria-label': aria, onClick: fn }, label);
  return h('li', {
    class: 'tn-entrant', draggable: 'true', 'data-uid': e.uid,
    onDragstart: (ev) => { ui.drag = e.uid; ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', String(e.uid)); } catch { /* some browsers refuse */ } },
    onDragover: (ev) => ev.preventDefault(),
    onDrop: (ev) => { ev.preventDefault(); const from = draft.entrants.findIndex((x) => x.uid === ui.drag); if (from >= 0) { move(draft, from, i); ui.drag = null; changed(); } },
  },
    h('input', { type: 'checkbox', class: 'tn-check', checked, 'aria-label': `Pick ${e.name} for a team`, onChange: (ev) => { if (ev.target.checked) ui.checked.add(e.uid); else ui.checked.delete(e.uid); changed(false); } }),
    h('span', { class: 'tn-seed', title: 'Seed (when the order is as listed)' }, `${i + 1}`),
    h('input', { type: 'text', class: 'tn-ename', value: e.name, 'aria-label': `Name of entrant ${i + 1}`, onChange: (ev) => { e.name = ev.target.value.trim() || e.name; changed(false); } }),
    h('small', { class: 'tn-members' }, summary(e)),
    tacticSelect(e, cx),
    h('span', { class: 'tn-row-btns' },
      btn('Up', `Move ${e.name} up`, () => { move(draft, i, i - 1); changed(); }),
      btn('Down', `Move ${e.name} down`, () => { move(draft, i, i + 1); changed(); }),
      e.members.length > 1 ? btn('Split', `Split ${e.name} into single characters`, () => split(cx, e)) : null,
      btn('Remove', `Remove ${e.name}`, () => { draft.entrants.splice(i, 1); ui.checked.delete(e.uid); changed(); }, ' danger')));
}

function split(cx, e) {
  const { draft, ui, changed } = cx;
  const at = draft.entrants.indexOf(e);
  const singles = e.members.map((m) => ({ uid: draft.nextUid++, name: m.label, tactic: 'none', members: [m] }));
  draft.entrants.splice(at, 1, ...singles);
  ui.checked.delete(e.uid);
  changed();
}

/** Group the ticked entrants into one team (placed where the first of them was). */
function group(cx, name, tactic) {
  const { draft, ui, changed } = cx;
  const picked = draft.entrants.filter((e) => ui.checked.has(e.uid));
  if (picked.length < 2) { toast('Tick at least two entrants first'); return; }
  const at = draft.entrants.indexOf(picked[0]);
  const team = { uid: draft.nextUid++, name: name.trim() || `Team ${draft.nextUid}`, tactic, members: picked.flatMap((e) => e.members) };
  draft.entrants = draft.entrants.filter((e) => !ui.checked.has(e.uid));
  draft.entrants.splice(Math.min(at, draft.entrants.length), 0, team);
  ui.checked.clear();
  changed();
}

function makeTeamRow(cx) {
  const name = h('input', { type: 'text', id: 'tn-teamname', placeholder: 'Team name', 'aria-label': 'Name for the new team' });
  const tactic = h('select', { id: 'tn-teamtactic', class: 'cw-tactic', 'aria-label': 'Tactic for the new team' }, Object.entries(TEAM_TACTICS).map(([id, v]) => h('option', { value: id, title: v.blurb }, v.label)));
  return h('div', { class: 'add-row tn-maketeam' }, name, tactic,
    h('button', { type: 'button', class: 'btn', id: 'tn-maketeam', title: 'Tick two or more entrants, then group them into one team', onClick: () => group(cx, name.value, tactic.value) }, 'Make a team of the ticked'));
}

/** Draw the list into host. */
export function drawRoster(host, cx) {
  clear(host);
  const { draft } = cx;
  if (!draft.entrants.length) { host.append(h('p', { class: 'hint', id: 'tn-empty', style: { margin: 0 } }, 'No entrants yet. Quick fill makes 8 random heroes, or add your own below.')); return; }
  host.append(
    h('ol', { class: 'tn-entrants', id: 'tn-entrants' }, draft.entrants.map((e, i) => row(e, i, cx))),
    h('p', { class: 'hint', style: { margin: 0 } }, draft.seeding === 'random' ? 'The order is drawn from the seed when the tournament starts.' : 'Top of the list is seed 1. Drag a row or use Up and Down to reorder.'),
    makeTeamRow(cx));
}
