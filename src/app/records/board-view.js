// The leaderboard table: characters by rating across the saved fights, optionally for one source only.

import { h, clear } from '../dom.js';
import { leaderboard } from '../../engine/records/leaderboard.js';
import { listRecords, loadSlim } from './store.js';

/** Draw the table into host. source '' counts every saved fight. */
export function renderBoard(host, { source = '' } = {}) {
  clear(host);
  const entries = listRecords().filter((e) => !source || e.source === source);
  const rows = leaderboard(loadSlim(entries));
  if (!rows.length) {
    host.append(h('p', { class: 'hint', id: 'fb-empty' }, 'No saved fights to count yet. Play a fight in the Battle Room and the characters in it appear here.'));
    return;
  }
  const head = ['#', 'Character', 'Rating', 'Fights', 'W-L-D', 'KOs'];
  host.append(h('div', { class: 'table-scroll' },
    h('table', { class: 'skills bt-mc-table fb-table', id: 'fb-table' },
      h('thead', null, h('tr', null, head.map((c) => h('th', null, c)))),
      h('tbody', null, rows.map((r, i) => h('tr', null,
        h('td', { class: 'num' }, i + 1), h('td', null, h('b', null, r.name)), h('td', { class: 'num' }, Math.round(r.rating)),
        h('td', { class: 'num' }, r.fights), h('td', { class: 'num' }, `${r.wins}-${r.losses}-${r.draws}`), h('td', { class: 'num' }, r.kos)))))),
    h('p', { class: 'hint', style: { margin: '6px 0 0' } }, 'Everyone starts at 1000. Each fight moves the rating by the result against the other side\'s average (K 24).'));
}
