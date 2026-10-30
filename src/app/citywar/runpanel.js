// Running the war: Step turn, Run to the end, Replay, the turn counter, and the log of campaign events (newest first,
// each fight with a "Watch this fight" button). cx is { war, R, ui, save, render, watch(rec) }.

import { h, toast } from '../dom.js';
import { stepCity, runCity, resetCity, teamById } from '../../engine/citywar.js';
import { keepCityFight, trimKept } from './keep.js';

const SHOWN = 60;

function statusText(war) {
  if (war.status === 'setup') return war.teams.length < 2 ? 'Add at least two teams to start.' : 'Ready. Step a turn or run it to the end.';
  if (war.status === 'over') return war.winner ? `${teamById(war, war.winner).name} won after ${war.turn} turns.` : `No single winner after ${war.turn} turns.`;
  return `${war.teams.filter((t) => t.status === 'alive').length} teams left.`;
}

/** The control row with the turn counter. */
export function controls(cx) {
  const { war, R, ui, save, render } = cx;
  const over = war.status === 'over';
  const ready = war.teams.length >= 2;
  const go = (fn) => () => { try { fn(); } catch (e) { toast(e.message); } trimKept(); save(); render(); };
  return h('div', { class: 'cw-controls' },
    h('div', { class: 'cw-turn', 'aria-live': 'polite' }, h('b', { id: 'cw-turn' }, `Turn ${war.turn}`), h('span', { id: 'cw-status', class: 'hint' }, statusText(war))),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary', id: 'cw-step', disabled: over || !ready, onClick: go(() => { ui.placing = false; stepCity(war, R, { onFight: keepCityFight }); }) }, 'Step turn'),
      h('button', { type: 'button', class: 'btn', id: 'cw-end', disabled: over || !ready, onClick: go(() => { ui.placing = false; runCity(war, R, { onFight: keepCityFight }); }) }, 'Run to the end'),
      h('button', { type: 'button', class: 'btn', id: 'cw-replay', disabled: war.status === 'setup', title: 'Same teams, same seed: plays the same war again', onClick: go(() => resetCity(war)) }, 'Replay')));
}

/** The log, newest first. ui.showMoves adds the marching lines; fights get a Watch button. */
export function logPanel(cx) {
  const { war, ui, watch, render } = cx;
  const lines = war.log.filter((l) => ui.showMoves || l.kind !== 'move').slice().reverse();
  const shown = ui.showAll ? lines : lines.slice(0, SHOWN);
  const item = (l) => h('li', { class: `cw-log-${l.kind}` },
    h('span', null, l.text),
    l.kind === 'fight' ? h('button', { type: 'button', class: 'btn sm cw-watch', 'aria-label': `Watch this fight: ${l.text}`, onClick: () => watch(war.battles.find((b) => b.n === l.battle)) }, 'Watch this fight') : null);
  return h('section', { class: 'panel bt-panel cw-log-panel', id: 'cw-log-panel' },
    h('div', { class: 'bt-log-tools' }, h('h2', null, 'What happened'), h('span', { class: 'spacer' }),
      h('label', { class: 'bt-copies' }, h('input', { type: 'checkbox', id: 'cw-moves', checked: !!ui.showMoves, onChange: (e) => { ui.showMoves = e.target.checked; render(); } }), ' Show marching')),
    lines.length ? h('ol', { class: 'cw-log', id: 'cw-log' }, shown.map(item)) : h('p', { class: 'hint', id: 'cw-log-empty' }, 'Nothing has happened yet.'),
    lines.length > shown.length ? h('button', { type: 'button', class: 'btn sm', id: 'cw-log-more', onClick: () => { ui.showAll = true; render(); } }, `Show all ${lines.length} lines`) : null);
}
