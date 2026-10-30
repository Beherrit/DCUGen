// The city map: a 12 by 12 CSS grid. Each cell is shaded by its terrain and carries a one-letter mark (B, S, P) so
// the shades are not the only clue; a team stands on its cell as a colored marker with a short name.

import { h } from '../dom.js';
import { TERRAIN_LABELS, TERRAIN_MARKS, cellName, terrainAt, teamAt, fighters } from '../../engine/citywar.js';

/** "Harbor Kings" -> "HK", "Pier Nine" -> "PN", "Copper" -> "COP". */
export function shortName(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
  return (words[0] || '?').slice(0, 3).toUpperCase();
}

/** Black or white text, whichever reads on this color. */
function inkOn(hex) {
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#111' : '#fff';
}

function marker(team) {
  const left = fighters(team).length;
  return h('span', { class: `cw-team${team.resting ? ' resting' : ''}`, style: { background: team.color, color: inkOn(team.color) }, title: `${team.name}: ${left} of ${team.members.length} fighters standing${team.resting ? ', resting' : ''}` }, shortName(team.name));
}

/** A cell's spoken label: "F7, a building, Harbor Kings (resting)". */
function cellLabel(war, x, y, team) {
  const t = TERRAIN_LABELS[terrainAt(war, x, y)];
  return `${cellName(x, y)}, ${t}${team ? `, ${team.name}${team.resting ? ' (resting)' : ''}` : ''}`;
}

/**
 * Draw the map. ui = { sel (selected team id), placing }; onCell(x, y, team) is called for any click. The selected team's
 * cell gets a ring, and a cell can be tabbed to and pressed.
 */
export function drawMap(war, ui, onCell) {
  const cells = [];
  for (let y = 0; y < war.size; y++) {
    for (let x = 0; x < war.size; x++) {
      const terrain = terrainAt(war, x, y);
      const team = teamAt(war, x, y);
      cells.push(h('button', {
        type: 'button', class: `cw-cell t-${terrain}${team && team.id === ui.sel ? ' sel' : ''}`, 'data-x': x, 'data-y': y,
        'data-cell': cellName(x, y), 'data-terrain': terrain, 'aria-label': cellLabel(war, x, y, team), onClick: () => onCell(x, y, team),
      }, h('span', { class: 'cw-mark', 'aria-hidden': 'true' }, TERRAIN_MARKS[terrain]), team ? marker(team) : null));
    }
  }
  return h('div', { class: 'cw-map', id: 'cw-map', style: { '--n': war.size }, role: 'group', 'aria-label': 'City map' }, cells);
}

/** The key under the map: what each shade and letter means. */
export function mapKey() {
  const item = (t, text) => h('span', { class: 'cw-key-item' }, h('i', { class: `cw-swatch t-${t}` }, TERRAIN_MARKS[t]), ` ${text}`);
  return h('div', { class: 'cw-key' }, item('street', 'Street (open ground)'), item('building', 'Building (enclosed fight)'), item('park', 'Park (a resting team hides)'));
}
