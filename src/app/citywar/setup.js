// The side panel in setup: the team list (name, color, tactic, members, remove), Place team, Quick fill, New terrain
// and the seed. cx is { war, R, ui, save, render }.

import { h, toast, openDialog } from '../dom.js';
import { randomSeed } from '../../engine/rng.js';
import { TEAM_TACTICS } from '../../engine/battle.js';
import { generateTerrain, quickFill, removeTeam, resetCity, withSeed, cellName } from '../../engine/citywar.js';
import { addTeamPanel } from './addteam.js';

/** One row of the team list. */
function teamRow(cx, t, locked) {
  const { war, ui, save, render } = cx;
  const tactic = h('select', { class: 'cw-tactic', 'aria-label': `Tactic for ${t.name}`, disabled: locked, onChange: (e) => { t.tactic = e.target.value; save(); render(); } },
    Object.entries(TEAM_TACTICS).map(([id, v]) => h('option', { value: id, selected: id === t.tactic, title: v.blurb }, v.label)));
  return h('li', { class: `cw-team-row${ui.sel === t.id ? ' sel' : ''}${t.status === 'out' ? ' out' : ''}`, 'data-team': t.id },
    h('button', { type: 'button', class: 'cw-team-pick', 'aria-pressed': String(ui.sel === t.id), title: 'Select this team', onClick: () => { ui.sel = ui.sel === t.id ? null : t.id; render(); } },
      h('i', { class: 'cw-dot', style: { background: t.color } }), h('b', null, t.name), h('small', null, ` ${cellName(t.x, t.y)} · ${t.members.length} member${t.members.length === 1 ? '' : 's'}`)),
    tactic,
    locked ? null : h('button', { type: 'button', class: 'btn sm ghost danger', 'aria-label': `Remove ${t.name}`, onClick: () => { removeTeam(war, t.id); if (ui.sel === t.id) ui.sel = null; save(); render(); } }, 'Remove'));
}

async function confirmClear(war) {
  if (!war.teams.length) return true;
  return openDialog({ title: 'Replace the teams?', body: h('p', { style: { margin: 0 } }, `Quick fill adds 12 new teams next to the ${war.teams.length} already here. Clear the old ones first?`), buttons: [{ label: 'Keep them', value: false }, { label: 'Clear them', value: true, danger: true }] });
}

/** The side panel while the war is being set up (the team list stays, read-only, once it runs). */
export function setupPanel(cx) {
  const { war, R, ui, save, render } = cx;
  const locked = war.status !== 'setup';
  const fill = async () => {
    if (war.teams.length && (await confirmClear(war))) war.teams = [];
    const made = quickFill(war, R);
    ui.sel = made[0]?.id || null;
    save(); render(); toast(`${made.length} teams on the map`);
  };
  const seedIn = h('input', { type: 'text', id: 'cw-seed', value: war.seed, 'aria-label': 'Seed', disabled: locked, onChange: (e) => { withSeed(war, e.target.value.trim() || randomSeed()); save(); render(); } });
  return h('aside', { class: 'rail cw-side', 'aria-label': 'Teams' },
    h('h2', null, 'Teams'),
    locked ? h('p', { class: 'hint', style: { margin: 0 } }, 'The war is running. Press Replay to set it up again.') : null,
    war.teams.length ? h('ul', { class: 'cw-teams', id: 'cw-teams' }, war.teams.map((t) => teamRow(cx, t, locked))) : h('p', { class: 'hint', id: 'cw-empty' }, 'No teams yet. Quick fill makes 12, or add your own.'),
    locked ? null : h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary', id: 'cw-quickfill', onClick: fill }, 'Quick fill 12 teams'),
      h('button', { type: 'button', class: `btn${ui.placing ? ' on' : ''}`, id: 'cw-place', 'aria-pressed': String(!!ui.placing), disabled: !ui.sel, title: 'Select a team, then click a free cell to move it there', onClick: () => { ui.placing = !ui.placing; render(); } }, 'Place team'),
      h('button', { type: 'button', class: 'btn', id: 'cw-terrain', onClick: () => { war.cells = generateTerrain(`${war.seed}::${(ui.terrainRolls = (ui.terrainRolls || 0) + 1)}`, war.size); save(); render(); } }, 'New terrain')),
    locked ? null : h('p', { class: 'hint', style: { margin: 0 } }, ui.placing ? 'Click a free cell to move the selected team there.' : 'Click a free cell to change its terrain: street, building, park.'),
    locked ? null : addTeamPanel(cx),
    h('div', { class: 'label' }, 'Seed'),
    h('div', { class: 'add-row' }, seedIn,
      h('button', { type: 'button', class: 'btn', id: 'cw-newseed', disabled: locked, onClick: () => { withSeed(war, randomSeed()); save(); render(); } }, 'New seed')),
    h('p', { class: 'hint', style: { margin: 0 } }, 'The seed picks the dice. The same seed on the same map and teams plays the same war.'),
    locked ? h('button', { type: 'button', class: 'btn', id: 'cw-setup-again', onClick: () => { resetCity(war); save(); render(); } }, 'Back to setup') : null);
}
