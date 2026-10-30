// Title odds: "Run 50 tournaments" plays the same tournament again and again with different dice and shows each entrant's
// share of the titles as a percentage with a bar. Nothing here is saved to Fights. cx is { t, R, ui }.

import { h, clear } from '../dom.js';
import { playOdds, tallyOdds, newTally, copyTournament } from '../../engine/tournament.js';

const COUNT = 50;
let oddsHost = null; // the odds block on screen now: the run draws into whichever one is current

function drawOdds(host, cx) {
  const { t, ui } = cx;
  clear(host);
  const o = ui.odds;
  host.append(h('div', { class: 'btn-row' },
    h('button', { type: 'button', class: 'btn', id: 'tn-odds', disabled: !!o?.running, onClick: () => runOdds(cx) }, o?.running ? `Running ${o.tally.n} of ${COUNT}…` : `Run ${COUNT} tournaments`),
    o && !o.running ? h('span', { class: 'hint' }, `Average ${(o.tally.matches / Math.max(1, o.tally.n)).toFixed(1)} matches per tournament.`) : null));
  if (!o || !o.tally.n) return;
  const n = o.tally.n;
  const rows = t.entrants.map((e) => ({ e, titles: o.tally.titles[e.id] || 0 })).sort((a, b) => b.titles - a.titles);
  host.append(h('ul', { class: 'tn-odds', id: 'tn-odds-list' }, rows.map(({ e, titles }) => h('li', null,
    h('span', { class: 'tn-odds-name' }, e.name),
    h('span', { class: 'tn-bar', role: 'img', 'aria-label': `${Math.round((titles / n) * 100)} percent` }, h('i', { style: { width: `${(titles / n) * 100}%` } })),
    h('b', { class: 'num' }, `${Math.round((titles / n) * 100)}%`)))));
}

/** Play the tournaments one at a time, giving the page a moment between them. */
function runOdds(cx) {
  const { t, R, ui } = cx;
  const setup = copyTournament(t);
  ui.odds = { running: true, tally: newTally(setup) };
  drawOdds(oddsHost, cx);
  const next = (i) => {
    if (i >= COUNT) { ui.odds.running = false; if (oddsHost) drawOdds(oddsHost, cx); return; }
    tallyOdds(ui.odds.tally, playOdds(setup, R, i));
    if (oddsHost) drawOdds(oddsHost, cx);
    setTimeout(() => next(i + 1), 0);
  };
  setTimeout(() => next(0), 0);
}

export function oddsPanel(cx) {
  oddsHost = h('div', { class: 'tn-odds-host' });
  drawOdds(oddsHost, cx);
  return h('section', { class: 'panel bt-panel', id: 'tn-odds-panel' }, h('h2', null, 'Who wins most often?'),
    h('p', { class: 'hint', style: { margin: 0 } }, `Plays this whole tournament ${COUNT} times from the way it is set up, each with different dice, and counts the titles. Nothing here is saved to Fights.`), oddsHost);
}
