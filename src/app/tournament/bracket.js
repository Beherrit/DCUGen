// The bracket: rounds as columns of match cards (the losers bracket and the grand final in their own rows below the
// winners bracket). The bracket scrolls sideways inside its own box so the page never does. A card is a button: pressing
// it selects the match and the detail panel under the bracket lists its games.

import { h } from '../dom.js';

const FOOT = { bye: 'Bye', skipped: 'Not needed', waiting: 'Waiting', ready: 'Ready', done: '' };

function footOf(m, next) {
  if (m.id === next) return 'Next up';
  if (m.status === 'done') return m.draw ? 'Draw' : m.bySeed ? 'Decided by seed' : `${m.games.length} game${m.games.length === 1 ? '' : 's'}`;
  return FOOT[m.status];
}

function sideRow(s, showScore) {
  return h('span', { class: `tn-side${s.winner ? ' win' : ''}${s.pending ? ' wait' : ''}` },
    h('span', { class: 'tn-name' }, s.seed ? h('small', null, `${s.seed} `) : null, s.text),
    h('b', { class: 'tn-score' }, showScore && s.score !== null ? s.score : ''));
}

/** One match as a card. */
function card(m, ui, next, pick) {
  const scored = m.status === 'done';
  const selected = ui.sel === m.id;
  return h('button', {
    type: 'button', class: `tn-match st-${m.status}${selected ? ' sel' : ''}${m.id === next ? ' next' : ''}`, 'data-match': m.id, 'aria-pressed': String(selected),
    'aria-label': `${m.label}: ${m.a.text} against ${m.b.text}${footOf(m, next) ? `, ${footOf(m, next)}` : ''}`, onClick: () => pick(m.id),
  }, h('span', { class: 'tn-label' }, m.label), sideRow(m.a, scored), sideRow(m.b, scored), h('span', { class: 'tn-foot' }, footOf(m, next)));
}

function round(r, ui, next, pick) {
  return h('div', { class: 'tn-round' }, h('h4', null, r.title), h('div', { class: 'tn-matches' }, r.matches.map((m) => card(m, ui, next, pick))));
}

/** The whole bracket from a bracketView. cx is { ui, render }. */
export function bracketPanel(view, cx) {
  const { ui, render } = cx;
  const pick = (id) => { ui.sel = ui.sel === id ? null : id; render(); };
  return h('section', { class: 'panel bt-panel', id: 'tn-bracket-panel' },
    h('h2', null, view.format === 'round-robin' ? 'Rounds' : 'Bracket'),
    h('div', { class: 'tn-bracket', id: 'tn-bracket', tabindex: '0', role: 'region', 'aria-label': 'Bracket, scrolls sideways' },
      view.sections.map((s) => h('div', { class: 'tn-section', 'data-section': s.id },
        view.sections.length > 1 ? h('h3', null, s.title) : null,
        h('div', { class: 'tn-rounds' }, s.rounds.map((r) => round(r, ui, view.next, pick)))))));
}
