// Tables: the standings (points and tiebreaks in a round robin, how far each got in a bracket) and the round robin's
// results grid. cx is { t, view, ui, render }.

import { h } from '../dom.js';
import { standings } from '../../engine/tournament.js';

const STATUS = { champion: 'Champion', out: 'Out', alive: 'In' };

function rowCells(t, r) {
  if (t.format === 'round-robin') return [r.rank, h('b', null, r.name), r.played, r.won, r.drawn, r.lost, h('b', null, r.points), `${r.gamesWon}-${r.gamesLost}`, r.kos, r.decidedBy || ''];
  return [r.rank, h('b', null, r.name), r.seed, r.won, r.lost, `${r.gamesWon}-${r.gamesLost}`, r.kos, STATUS[r.status]];
}

const HEADS = {
  'round-robin': ['#', 'Entrant', 'Played', 'Won', 'Drawn', 'Lost', 'Points', 'Games', 'KOs dealt', 'Decided by'],
  bracket: ['#', 'Entrant', 'Seed', 'Won', 'Lost', 'Games', 'KOs dealt', 'Status'],
};

/** The standings table. */
export function standingsPanel(t) {
  const rows = standings(t).map((r) => h('tr', { class: r.status === 'out' ? 'out' : '' }, rowCells(t, r).map((c, i) => h('td', { class: i === 1 ? '' : 'num' }, c))));
  const heads = HEADS[t.format === 'round-robin' ? 'round-robin' : 'bracket'];
  return h('section', { class: 'panel bt-panel', id: 'tn-standings-panel' }, h('h2', null, t.status === 'over' ? 'Final standings' : 'Standings'),
    h('div', { class: 'table-scroll' }, h('table', { class: 'skills bt-mc-table', id: 'tn-standings' },
      h('thead', null, h('tr', null, heads.map((c) => h('th', null, c)))), h('tbody', null, rows))));
}

/** The round robin grid: each row's result against each column ("W 1-0", "L 0-1", "D"). Pressing a cell selects that match. */
export function gridPanel(view, cx) {
  const { ui, render } = cx;
  const g = view.grid;
  const head = h('tr', null, h('th', null, ''), g.names.map((n) => h('th', { scope: 'col' }, n)));
  const body = g.cells.map((row, i) => h('tr', null, h('th', { scope: 'row' }, g.names[i]), row.map((c) => h('td', { class: `tn-cell${c.result ? ` r-${c.result}` : ''}` },
    c.matchId ? h('button', { type: 'button', class: 'linkish', 'data-match': c.matchId, onClick: () => { ui.sel = c.matchId; render(); } }, c.text) : c.text))));
  return h('section', { class: 'panel bt-panel', id: 'tn-grid-panel' }, h('h2', null, 'Results grid'),
    h('div', { class: 'table-scroll' }, h('table', { class: 'skills bt-mc-table tn-grid', id: 'tn-grid' }, h('thead', null, head), h('tbody', null, body))));
}
