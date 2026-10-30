// One saved fight, read-only: the result, each fighter's numbers, and the same "What happened" log the Battle Room
// shows (Every action / Key moments, one fighter, the rolls toggle). Export downloads the plain-text log.

import { h, clear, download, slug, toast } from '../dom.js';
import { teamColor, renderLogInto, logControls } from '../battle-log.js';
import { SOURCE_LABELS } from '../../engine/records/record.js';
import { summaryLine } from '../../engine/records/summary.js';
import { loadRecord, exportRecord } from './store.js';

export const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso || '') : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };

const fightersOf = (rec) => Object.entries(rec.teams).sort(([a], [b]) => (a < b ? -1 : 1)).flatMap(([team, list]) => list.map((f) => ({ ...f, team })));

function resultBox(rec) {
  const { winner, gotAway } = rec.result || {};
  const headline = winner ? `Team ${winner} ${gotAway ? 'got away' : 'won'}` : 'No winner';
  return h('div', { class: 'bt-result', style: { '--t': winner ? teamColor(winner) : 'var(--ink-3)' } },
    h('b', null, headline),
    h('span', null, summaryLine(rec)),
    h('span', { class: 'hint' }, `${when(rec.date)} · ${SOURCE_LABELS[rec.source] || rec.source}${rec.label ? ` · ${rec.label}` : ''} · seed ${rec.seed}`));
}

const END_TEXT = { standing: 'Standing', out: 'Out', fled: 'Fled', 'got-away': 'Got away' };

function statsTable(rec) {
  const cols = ['Fighter', 'PL', 'End', 'Attacks', 'Hits', 'Crits', 'KOs', 'Dealt', 'Taken', 'Healed'];
  const rows = fightersOf(rec).map((f) => h('tr', null,
    h('td', null, h('span', { class: 'bt-team sm', style: { background: teamColor(f.team) } }, f.team), ' ', h('b', null, f.name)),
    h('td', { class: 'num' }, f.pl), h('td', { title: f.status }, END_TEXT[f.end] || f.end),
    ...[f.stats.attacks, f.stats.hits, f.stats.crits, f.stats.kos, f.stats.dealt, f.stats.taken, f.stats.healed].map((v) => h('td', { class: 'num' }, v))));
  return h('div', { class: 'table-scroll' },
    h('table', { class: 'skills bt-mc-table', id: 'fv-stats' }, h('thead', null, h('tr', null, cols.map((c) => h('th', null, c)))), h('tbody', null, rows)),
    h('p', { class: 'hint', style: { margin: '6px 0 0' } }, 'Dealt and Taken are damage degrees.'));
}

/** Draw the saved fight `id` into host. ls is the log view state ({ filter, logWho, showDice }); back() returns to the list. */
export function renderViewer(host, id, ls, back) {
  clear(host);
  const rec = loadRecord(id);
  if (!rec) {
    host.append(h('p', { class: 'hint' }, 'That fight is no longer saved.'), h('button', { class: 'btn', type: 'button', onClick: back }, 'Back to the list'));
    return;
  }
  const fighters = fightersOf(rec);
  const logHost = h('div', { class: 'bt-log', id: 'fv-log' });
  const redraw = () => renderLogInto(logHost, { log: rec.log, fighters, status: 'over', ...ls }, teamColor);
  const ctl = logControls(ls, fighters, { onLog: redraw, onFilter: () => renderViewer(host, id, ls, back) });
  const exportIt = () => {
    const text = exportRecord(id);
    if (!text) { toast('Could not read that fight'); return; }
    download(`${slug(rec.name)}-${slug(rec.seed)}-log.txt`, text, 'text/plain');
  };
  host.append(
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', id: 'fv-back', onClick: back }, 'Back to the list'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', id: 'fv-export', onClick: exportIt }, 'Export log')),
    h('h2', { class: 'fv-title' }, rec.name),
    resultBox(rec),
    h('section', { class: 'panel bt-panel' }, h('h2', null, 'Fighters'), statsTable(rec)),
    h('section', { class: 'panel bt-panel bt-log-panel', id: 'fv-log-panel' },
      h('div', { class: 'bt-log-tools' }, h('h2', null, 'What happened'), h('span', { class: 'spacer' }), ctl.whoSel, ctl.diceToggle),
      ctl.filter, logHost));
  redraw();
}
