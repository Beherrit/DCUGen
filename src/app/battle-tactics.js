// The Battle Room's team tactic controls: one choice per team, who a Bodyguard team protects, and the status chips.

import { h } from './dom.js';
import { TEAM_TACTICS } from '../engine/battle.js';

const tacticOf = (battle, team) => (TEAM_TACTICS[battle.options.teamTactics?.[team]] ? battle.options.teamTactics[team] : 'none');

/** The choice of who a Bodyguard team protects (blank: the fighter with the lowest Toughness). */
function vipPicker(cx, team) {
  const { battle, save, render } = cx;
  const current = battle.options.vip?.[team] || '';
  const onChange = (e) => {
    battle.options.vip = { ...battle.options.vip };
    if (e.target.value) battle.options.vip[team] = e.target.value; else delete battle.options.vip[team];
    save(); render();
  };
  return h('label', { class: 'bt-copies', title: 'The fighter this team protects. Left blank, it is the one with the lowest Toughness.' }, `Team ${team} protects `,
    h('select', { id: `bt-vip-${team}`, 'aria-label': `Team ${team} fighter to protect`, onChange },
      h('option', { value: '' }, 'Lowest Toughness'),
      battle.combatants.filter((c) => c.team === team).map((c) => h('option', { value: c.id, selected: c.id === current }, c.name))));
}

/** One select per team listing the team tactics, plus the VIP choice for a Bodyguard team. */
export function tacticPanel(cx, teams) {
  const { battle, save, render } = cx;
  const rows = teams.map((team) => {
    const chosen = tacticOf(battle, team);
    const onChange = (e) => {
      battle.options.teamTactics = { ...battle.options.teamTactics, [team]: e.target.value };
      save(); render();
    };
    const select = h('select', { id: `bt-tactic-${team}`, 'aria-label': `Team ${team} tactic`, title: TEAM_TACTICS[chosen].blurb, onChange },
      Object.entries(TEAM_TACTICS).map(([id, t]) => h('option', { value: id, selected: id === chosen, title: t.blurb }, t.label)));
    return h('div', { class: 'add-row', style: { alignItems: 'center' } },
      h('label', { class: 'bt-copies', title: TEAM_TACTICS[chosen].blurb }, `Team ${team} tactic `, select),
      chosen === 'bodyguard' ? vipPicker(cx, team) : null);
  });
  return h('div', { class: 'bt-tactics' },
    h('div', { class: 'label' }, 'Team tactics'),
    h('p', { class: 'hint', style: { margin: 0 } }, 'Optional: give a whole side one plan instead of letting each fighter play its own style.'),
    rows);
}

/** Status chips for the teams that play a tactic: "Team A: Focus Fire". */
export function tacticChips(battle, chip) {
  return [...new Set(battle.combatants.map((c) => c.team))].sort()
    .filter((team) => tacticOf(battle, team) !== 'none')
    .map((team) => chip(`Team ${team}: ${TEAM_TACTICS[tacticOf(battle, team)].label}`));
}
