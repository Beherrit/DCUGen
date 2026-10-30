// The Tournament page of the Battle Room: setup, then the bracket (or round robin tables), controls, the selected match
// with its games, and title odds. This file puts the pieces together and holds the page state; battle.js only calls
// renderTournament. env is { R, go(sub) }: the rules and the Battle Room's sub-tab switch.

import { h, clear } from '../dom.js';
import { roomTabs } from '../records/room.js';
import { bracketView } from '../../engine/tournament.js';
import { loadState, saveState } from './store.js';
import { setupPanel } from './setup.js';
import { controls } from './controls.js';
import { bracketPanel } from './bracket.js';
import { detailPanel } from './detail.js';
import { standingsPanel, gridPanel } from './table.js';
import { oddsPanel } from './odds.js';

let state = null;
const ui = { sel: null, checked: new Set(), drag: null, odds: null };

export function renderTournament(root, env) {
  state ||= loadState();
  const render = () => renderTournament(root, env);
  const save = () => saveState(state);
  const cx = { state, t: state.t, R: env.R, ui, save, render, go: env.go };
  clear(root);
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Battle Room'),
      h('p', null, 'Tournament: brackets and round robins of fights. Single or double elimination with byes and a bracket reset, or a round robin with points and tiebreaks. Every game is saved to Fights.'))),
    roomTabs('tournament', env.go),
    h('div', { class: 'tn-main' }, state.t ? running(cx) : setupPanel(cx)));
}

function running(cx) {
  const { t } = cx;
  const view = bracketView(t);
  const rx = { ...cx, view };
  return [
    controls(rx),
    bracketPanel(view, rx),
    detailPanel(rx),
    view.grid ? gridPanel(view, rx) : null,
    standingsPanel(t),
    oddsPanel(rx),
  ];
}
