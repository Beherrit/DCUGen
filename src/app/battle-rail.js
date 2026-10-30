// The Battle Room's left rail in three tabs, so setting up a fight needs no long scroll:
// Fighters (who fights), Teams (how many sides, ambush, tactics) and Arena (scale, room, cover, optional rules).
import { h } from './dom.js';

export const RAIL_TABS = [
  { id: 'fighters', label: 'Fighters' },
  { id: 'teams', label: 'Teams' },
  { id: 'arena', label: 'Arena' },
];

/** The tab bar and the open tab's content. panes is { fighters: [...], teams: [...], arena: [...] }; ui.railTab remembers the tab. */
export function railTabs(cx, panes) {
  const { ui, render } = cx;
  const open = RAIL_TABS.some((t) => t.id === ui.railTab) ? ui.railTab : 'fighters';
  const bar = h('div', { class: 'bt-rail-tabs', role: 'tablist', 'aria-label': 'Set up the fight' },
    RAIL_TABS.map((t) => h('button', {
      type: 'button', role: 'tab', id: `bt-rail-${t.id}`, class: `bt-rail-tab ${t.id === open ? 'on' : ''}`,
      'aria-selected': String(t.id === open), 'aria-controls': 'bt-rail-pane',
      onClick: () => { ui.railTab = t.id; render(); },
    }, t.label)));
  return [bar, h('div', { class: 'bt-rail-pane', id: 'bt-rail-pane', role: 'tabpanel', 'aria-labelledby': `bt-rail-${open}` }, panes[open])];
}
