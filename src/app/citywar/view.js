// The City war page of the Battle Room: a 12 by 12 city map where teams march on their neighbors and fight until one is
// left. This file puts the pieces together and holds the page state; battle.js only calls renderCityWar.
// env is { R, go(sub), watch(battle) }: the rules, the Battle Room's sub-tab switch, and "load this fight into One fight".

import { h, clear, toast } from '../dom.js';
import { roomTabs } from '../records/room.js';
import { buildFightBattle, moveTeam, setTerrain, terrainAt, fightLabel, TERRAINS, cellName } from '../../engine/citywar.js';
import { loadWar, saveWar } from './store.js';
import { drawMap, mapKey } from './map.js';
import { setupPanel } from './setup.js';
import { controls, logPanel } from './runpanel.js';
import { standingsTable, oddsPanel } from './results.js';

let war = null;
const ui = { sel: null, placing: false, showMoves: false, showAll: false, draft: null, odds: null };

const save = () => saveWar(war);

/** A click on a cell: in setup it selects a team, moves the selected one (Place team) or cycles the terrain. */
function clickCell(x, y, team, rerender) {
  if (war.status !== 'setup') { ui.sel = team ? team.id : ui.sel; rerender(); return; }
  if (ui.placing && ui.sel) {
    if (team) { toast(`${cellName(x, y)} is taken by ${team.name}`); return; }
    moveTeam(war, ui.sel, x, y);
    ui.placing = false;
  } else if (team) ui.sel = ui.sel === team.id ? null : team.id;
  else setTerrain(war, x, y, TERRAINS[(TERRAINS.indexOf(terrainAt(war, x, y)) + 1) % TERRAINS.length]);
  save(); rerender();
}

export function renderCityWar(root, env) {
  war ||= loadWar();
  const render = () => renderCityWar(root, env);
  const watch = (rec) => {
    if (!rec) { toast('That fight is no longer in the war'); return; }
    try { env.watch(buildFightBattle(war, env.R, rec), fightLabel(war, rec)); } catch (e) { toast(e.message); }
  };
  const cx = { war, R: env.R, ui, save, render, watch };
  clear(root);
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Battle Room'),
      h('p', null, 'City war: teams start on a 12 by 12 city map, march on their nearest neighbor and fight until one is left. Fights in buildings are enclosed, a team caught right after a fight is ambushed, and a team resting in a park hides.'))),
    roomTabs('citywar', env.go),
    h('div', { class: 'cw-layout' },
      h('div', { class: 'cw-main' },
        h('section', { class: 'panel bt-panel' }, controls(cx), drawMap(war, ui, (x, y, team) => clickCell(x, y, team, render)), mapKey()),
        war.status === 'setup' ? null : standingsTable(war),
        oddsPanel(cx),
        logPanel(cx)),
      setupPanel(cx)));
}
