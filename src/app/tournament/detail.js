// The selected match: who plays, the score, and each game with a button that opens its saved fight log in Fights.
// cx is { t, view, ui, go(sub) }.

import { h } from '../dom.js';
import { openFight } from '../records/fights-view.js';
import { gameKept } from './keep.js';

const SCORE = (m) => `${m.a.text} ${m.a.score ?? 0} to ${m.b.score ?? 0} ${m.b.text}`;

function gameRow(g, go) {
  const kept = gameKept(g.recordId);
  return h('li', { class: `tn-game${g.stalemate ? ' stale' : ''}`, 'data-record': g.recordId },
    h('span', { class: 'tn-game-text' }, h('b', null, g.label), h('small', null, g.text)),
    kept
      ? h('button', { type: 'button', class: 'btn sm tn-game-open', 'aria-label': `Open ${g.label} in Fights`, onClick: () => { openFight(g.recordId); go('fights'); } }, 'Open in Fights')
      : h('span', { class: 'hint' }, 'Not kept in Fights'));
}

/** The panel for the selected match, or a hint to pick one. */
export function detailPanel(cx) {
  const { view, ui, go } = cx;
  const m = view.sections.flatMap((s) => s.rounds).flatMap((r) => r.matches).find((x) => x.id === ui.sel);
  if (!m) return h('section', { class: 'panel bt-panel', id: 'tn-detail' }, h('h2', null, 'Match'), h('p', { class: 'hint', style: { margin: 0 } }, 'Press a match in the bracket to see its games and open them in Fights.'));
  const body = m.games.length
    ? h('ol', { class: 'tn-games', id: 'tn-games' }, m.games.map((g) => gameRow(g, go)))
    : h('p', { class: 'hint', style: { margin: 0 }, id: 'tn-nogames' }, m.status === 'bye' ? 'A bye: nobody to fight, so the entrant moves on.' : m.status === 'skipped' ? 'The winners champion won the grand final, so there is no reset.' : 'Not played yet.');
  return h('section', { class: 'panel bt-panel', id: 'tn-detail' },
    h('h2', null, m.label),
    m.games.length ? h('p', { style: { margin: 0 } }, h('b', null, SCORE(m)), m.bySeed ? ' (the better seed went on after stalemates)' : '') : null,
    body);
}
