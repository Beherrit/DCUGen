// The Fights page of the Battle Room: the saved fights (newest first, filter by source and by character, delete),
// one fight opened in the viewer, and the leaderboard. battle.js calls renderFights and openFight.

import { h, clear, toast, openDialog } from '../dom.js';
import { roomTabs } from './room.js';
import { SOURCES, SOURCE_LABELS } from '../../engine/records/record.js';
import { listRecords, deleteRecord, keepLogs, setKeepLogs } from './store.js';
import { renderViewer, when } from './viewer.js';
import { renderBoard } from './board-view.js';

const freshLog = () => ({ filter: 'all', logWho: null, showDice: true });
const S = { page: 'list', open: null, source: '', q: '', log: freshLog() };

/** Show one saved fight the next time the Fights page is drawn. */
export function openFight(id) {
  S.page = 'list';
  S.open = id;
  S.log = freshLog();
}

const matches = (e, q) => !q || [e.summary, e.label, ...(e.who || [])].some((t) => String(t || '').toLowerCase().includes(q));

function listRow(e, redraw) {
  const del = async () => {
    const ok = await openDialog({ title: 'Delete this fight?', body: h('p', { style: { margin: 0 } }, e.summary), buttons: [{ label: 'Keep', value: false }, { label: 'Delete', value: true, danger: true }] });
    if (ok) { deleteRecord(e.id); toast('Fight deleted'); redraw(); }
  };
  return h('li', { class: 'fl-row' },
    h('div', { class: 'fl-main' },
      h('span', { class: 'fl-sum' }, e.summary),
      h('span', { class: 'hint' }, `${when(e.date)} · ${SOURCE_LABELS[e.source] || e.source}${e.label ? ` · ${e.label}` : ''}`)),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm', type: 'button', onClick: () => { openFight(e.id); redraw(); } }, 'Open'),
      h('button', { class: 'btn sm ghost danger', type: 'button', 'aria-label': `Delete: ${e.summary}`, onClick: del }, 'Delete')));
}

function drawList(host, redraw) {
  clear(host);
  const all = listRecords();
  const q = S.q.trim().toLowerCase();
  const shown = all.filter((e) => (!S.source || e.source === S.source) && matches(e, q));
  if (!all.length) { host.append(h('p', { class: 'hint', id: 'fl-empty' }, 'No saved fights yet. Play one in the Battle Room and it is kept here, with its whole log.')); return; }
  if (!shown.length) { host.append(h('p', { class: 'hint' }, 'No saved fight matches that.')); return; }
  host.append(h('ul', { class: 'fl-list', id: 'fl-list' }, shown.map((e) => listRow(e, redraw))), h('p', { class: 'hint' }, `${shown.length} of ${all.length} fights.`));
}

function filters(onList) {
  const source = h('select', { id: 'fl-source', 'aria-label': 'Filter by source', onChange: (e) => { S.source = e.target.value; onList(); } },
    h('option', { value: '' }, 'All sources'), SOURCES.map((s) => h('option', { value: s, selected: s === S.source }, SOURCE_LABELS[s])));
  const q = h('input', { type: 'search', id: 'fl-q', placeholder: 'Find a character…', 'aria-label': 'Find a character', value: S.q, onInput: (e) => { S.q = e.target.value; onList(); } });
  return [source, q];
}

/** Draw the Fights page into root. go(sub) switches the Battle Room sub-tab. */
export function renderFights(root, go) {
  clear(root);
  const body = h('div', { class: 'fl-body' });
  const redraw = () => renderFights(root, go);
  const pageBtns = h('div', { class: 'seg fl-pages', role: 'group', 'aria-label': 'Fights page', style: { width: '260px' } },
    [['list', 'Saved fights'], ['board', 'Leaderboard']].map(([v, t]) => h('button', { type: 'button', id: `fl-page-${v}`, 'aria-pressed': String(S.page === v && !S.open), onClick: () => { S.page = v; S.open = null; redraw(); } }, t)));
  const keep = h('label', { class: 'bt-copies', title: 'Save every finished fight in the Battle Room here, with its whole log' },
    h('input', { type: 'checkbox', id: 'fl-keep', checked: keepLogs(), onChange: (e) => { setKeepLogs(e.target.checked); } }), ' Keep fight logs');
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Battle Room'), h('p', null, 'Every finished fight can be kept with its whole log, opened again later, and counted on a leaderboard.'))),
    roomTabs('fights', go),
    h('section', { class: 'panel bt-panel fl-panel' },
      h('div', { class: 'fl-tools' }, pageBtns, h('span', { class: 'spacer' }), S.open ? null : (S.page === 'board' ? filters(() => renderBoard(body, S)).slice(0, 1) : filters(() => drawList(body, redraw))), keep),
      body));
  if (S.open) renderViewer(body, S.open, S.log, () => { S.open = null; redraw(); });
  else if (S.page === 'board') renderBoard(body, S);
  else drawList(body, redraw);
}
