// Results: the standings table, and "Run 50 cities": the same teams and map fought out 50 times with different dice,
// showing each team's win share as a percentage with a bar. cx is { war, R, ui }.

import { h, clear } from '../dom.js';
import { TEAM_TACTICS } from '../../engine/battle.js';
import { standings, playOdds, tallyOdds, newTally } from '../../engine/citywar.js';

const COUNT = 50;
let oddsHost = null; // the odds block on screen now: the run draws into whichever one is current

const tacticLabel = (id) => (id && id !== 'none' ? TEAM_TACTICS[id]?.label || id : 'Own styles');

export function standingsTable(war) {
  const rows = standings(war).map((r) => h('tr', { class: r.alive ? 'alive' : 'out' },
    h('td', null, h('i', { class: 'cw-dot', style: { background: r.color } }), ' ', h('b', null, r.name)),
    h('td', null, tacticLabel(r.tactic)),
    h('td', { class: 'num' }, r.won), h('td', { class: 'num' }, r.left), h('td', { class: 'num' }, r.kos),
    h('td', { class: 'num' }, r.alive ? (war.status === 'over' ? 'Winner' : 'In') : r.fled ? `Left, turn ${r.outTurn}` : r.outTurn)));
  return h('section', { class: 'panel bt-panel', id: 'cw-standings-panel' }, h('h2', null, war.status === 'over' ? 'Final standings' : 'Standings'),
    h('div', { class: 'table-scroll' }, h('table', { class: 'skills bt-mc-table', id: 'cw-standings' },
      h('thead', null, h('tr', null, ['Team', 'Tactic', 'Fights won', 'Fighters left', 'KOs dealt', 'Eliminated'].map((c) => h('th', null, c)))), h('tbody', null, rows))));
}

/** The block inside the odds panel: a button, progress while it runs, then a bar per team. */
function drawOdds(host, cx) {
  const { war, ui } = cx;
  clear(host);
  const o = ui.odds;
  const run = () => runOdds(cx);
  host.append(h('div', { class: 'btn-row' },
    h('button', { type: 'button', class: 'btn', id: 'cw-odds', disabled: war.teams.length < 2 || !!o?.running, onClick: run }, o?.running ? `Running ${o.tally.n} of ${COUNT}…` : `Run ${COUNT} cities`),
    o && !o.running ? h('span', { class: 'hint' }, `Average ${(o.tally.turnsTotal / Math.max(1, o.tally.n)).toFixed(1)} turns per war.`) : null));
  if (!o || !o.tally.n) return;
  const n = o.tally.n;
  const rows = war.teams.map((t) => ({ t, wins: o.tally.wins[t.id] || 0 })).sort((a, b) => b.wins - a.wins);
  host.append(h('ul', { class: 'cw-odds', id: 'cw-odds-list' }, rows.map(({ t, wins }) => h('li', null,
    h('span', { class: 'cw-odds-name' }, h('i', { class: 'cw-dot', style: { background: t.color } }), ` ${t.name}`),
    h('span', { class: 'cw-bar', role: 'img', 'aria-label': `${Math.round((wins / n) * 100)} percent` }, h('i', { style: { width: `${(wins / n) * 100}%`, background: t.color } })),
    h('b', { class: 'num' }, `${Math.round((wins / n) * 100)}%`)))),
  o.tally.none ? h('p', { class: 'hint' }, `${o.tally.none} of ${n} wars had no single winner.`) : null);
}

/** Play the campaigns one at a time, giving the page a moment between them. */
function runOdds(cx) {
  const { war, R, ui } = cx;
  const setup = JSON.parse(JSON.stringify(war));
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
  oddsHost = h('div', { class: 'cw-odds-host' });
  drawOdds(oddsHost, cx);
  return h('section', { class: 'panel bt-panel', id: 'cw-odds-panel' }, h('h2', null, 'Who wins most often?'),
    h('p', { class: 'hint', style: { margin: 0 } }, `Plays the same city ${COUNT} times from the way it is set up, each with different dice, and counts the winners. Nothing here is saved to Fights.`), oddsHost);
}
