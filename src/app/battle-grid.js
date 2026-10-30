// The Battle Room board: a 12 by 12 grid drawn as SVG that scales to the panel (the squares stay square), with
// fighters as tokens, cover pieces on their squares, the walls of an enclosed room, and the range bands and move
// reach of the selected fighter. In setup you can drag a token to another square or click a square to drop the
// chosen kind of cover. cx is { battle, ui, save, render, teamColor }; battle.js passes it in.

import { h, inkFor } from './dom.js';
import { fmtFt, rangeBands } from '../engine/range.js';
import { GRID_SIZE, SCALES, CUSTOM_FT, customFt, scaleOf, squareFtOf, syncGrid, squareName, isWall, addCover, reachableFrom, squaresInMove, bandFrom, squares, feet, statusLine } from '../engine/battle.js';

const NS = 'http://www.w3.org/2000/svg';
const CELL = 10;      // one square, in drawing units
const MARGIN = 7;     // room for the column letters and row numbers
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v === true ? '' : String(v));
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
};

export const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const COLS = 'ABCDEFGHIJKL';

/** The attack the shading shows: the highest-rank ranged attack, else the highest-rank close one. */
function shownAttack(c) {
  const usable = c.attacks.filter((a) => a.rank > 0 || a.range !== 'close');
  const ranged = usable.filter((a) => a.range === 'ranged').sort((x, y) => y.rank - x.rank)[0];
  return ranged || usable.filter((a) => a.range === 'close').sort((x, y) => y.rank - x.rank)[0] || null;
}

/** Which band class a square is in for the attack of the selected fighter, or null when out of range. */
function bandClass(battle, sel, atk, x, y) {
  if (!atk) return null;
  if (atk.range === 'close') return squares(sel, { x, y }) <= Math.max(1, Math.floor((sel.elongFt || 0) / battle.grid.squareFt) + 1) ? 'short' : null;
  if (atk.range !== 'ranged') return null;
  const band = bandFrom(battle, sel, atk, { x, y }).band;
  return band === 'out' ? null : band;
}

/** The sentence under the board for a selected fighter. */
function legend(battle, sel, atk) {
  if (!atk) return `${sel.name} has no attack to show.`;
  if (atk.range === 'close') return `${sel.name}: ${atk.name} reaches the same or a next square; the dotted outline is where ${sel.name} can move this turn.`;
  if (atk.range !== 'ranged') return `${sel.name}: ${atk.name} needs a clear line, with no limit in range; the dotted outline is where ${sel.name} can move this turn.`;
  const [s, m, l] = rangeBands(Math.max(1, atk.rank), atk.ext || 0);
  return `${sel.name}: ${atk.name} is short to ${fmtFt(s.ft)}, medium to ${fmtFt(m.ft)} (−2), long to ${fmtFt(l.ft)} (−5). The dotted outline is where ${sel.name} can move this turn.`;
}

/** Hover text for an enemy of the selected fighter: the band, the penalty and the distance. */
function hoverText(battle, sel, atk, other) {
  const ft = feet(battle, sel, other);
  if (!atk) return `${other.name}: ${fmtFt(ft)} from ${sel.name}.`;
  if (atk.range === 'close') return `${other.name}: ${fmtFt(ft)} away, ${squares(sel, other) <= 1 ? 'in reach' : 'out of reach'} for ${atk.name}.`;
  const band = bandFrom(battle, sel, atk, other);
  return `${other.name}: ${fmtFt(ft)} away, ${band.band === 'out' ? 'out of range' : `${band.band} range${band.penalty ? ` (${band.penalty})` : ' (no penalty)'}`} for ${atk.name}.`;
}

/** Small offsets so fighters sharing a square can all be seen. */
const OFFSETS = [[[0, 0]], [[-2.3, 0], [2.3, 0]], [[-2.3, 1.7], [2.3, 1.7], [0, -2.4]], [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]];

function drawCells(svg, cx, sel, atk) {
  const { battle } = cx;
  const reach = sel ? reachableFrom(battle, sel, squaresInMove(battle, sel)) : null;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const wall = isWall(battle, x, y);
      const band = !wall && sel ? bandClass(battle, sel, atk, x, y) : null;
      const move = !wall && reach?.has(`${x},${y}`);
      svg.append(el('rect', { x: x * CELL, y: y * CELL, width: CELL, height: CELL, class: `bg-cell ${wall ? 'wall' : (x + y) % 2 ? 'odd' : ''} ${band ? `band-${band}` : ''} ${move ? 'move' : ''}`, 'data-x': x, 'data-y': y }, el('title', {}, wall ? 'Wall' : squareName(x, y))));
    }
  }
}

function drawLabels(svg) {
  for (let i = 0; i < GRID_SIZE; i++) {
    svg.append(el('text', { x: i * CELL + CELL / 2, y: -2.2, class: 'bg-label', 'text-anchor': 'middle' }, COLS[i]));
    svg.append(el('text', { x: -2.5, y: i * CELL + CELL / 2 + 1.2, class: 'bg-label', 'text-anchor': 'middle' }, String(i + 1)));
  }
}

function drawPieces(svg, battle) {
  for (const p of battle.cover || []) {
    svg.append(el('g', { class: `bg-piece ${p.state}` },
      el('rect', { x: p.x * CELL + 1, y: p.y * CELL + 1, width: CELL - 2, height: CELL - 2, rx: 1.2 }),
      el('text', { x: p.x * CELL + CELL / 2, y: p.y * CELL + CELL / 2 + 1.1, 'text-anchor': 'middle' }, initials(p.name)),
      el('title', {}, `${p.name} at ${squareName(p.x, p.y)}: ${p.level} cover, Toughness ${p.toughness}, ${p.state}`)));
  }
}

/** One fighter's token. In setup it can be dragged to another square. */
function token(cx, c, slot, count, svg, redraw) {
  const { battle, ui, save, teamColor } = cx;
  const [dx, dy] = OFFSETS[Math.min(count, 4) - 1][slot % 4];
  const r = count > 1 ? 3.4 : 4.4;
  const acting = c.id === battle.order[battle.turn - 1];
  const maker = c.summon ? battle.combatants.find((x) => x.id === c.summon.by) : null;
  const called = c.summon ? `${c.summon.duplicate ? 'duplicate' : 'summoned'} by ${maker?.name || 'a summoner'}` : '';
  const g = el('g', { class: `bg-token ${c.out || c.fled ? 'down' : ''} ${acting ? 'acting' : ''} ${ui.selId === c.id ? 'sel' : ''} ${c.summon ? 'summoned' : ''}`, tabindex: 0, role: 'button', 'aria-label': `${c.name}, ${called ? `${called}, ` : ''}team ${c.team}, ${statusLine(c)}, at ${squareName(c.x, c.y)}`, 'data-id': c.id },
    el('circle', { cx: c.x * CELL + CELL / 2 + dx, cy: c.y * CELL + CELL / 2 + dy, r, fill: c.color, stroke: teamColor(c.team), 'stroke-width': ui.selId === c.id || acting ? 1.6 : 1, 'stroke-dasharray': c.summon ? '1.4 1' : null }),
    el('text', { x: c.x * CELL + CELL / 2 + dx, y: c.y * CELL + CELL / 2 + dy + 1.2, 'text-anchor': 'middle', fill: inkFor(c.color), class: 'bg-initials', style: count > 1 ? 'font-size:3px' : null }, initials(c.name)),
    el('title', {}, `${c.name} (team ${c.team}${called ? `, ${called}` : ''}) at ${squareName(c.x, c.y)} · ${statusLine(c)}`));
  const select = () => { ui.selId = ui.selId === c.id ? null : c.id; redraw(); };
  g.addEventListener('click', (e) => { if (!g.dataset.dragged) { e.stopPropagation(); select(); } g.dataset.dragged = ''; });
  g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
  if (battle.status === 'setup') dragToken(g, svg, c, battle, save, redraw);
  return g;
}

/** Which square a pointer is over, in grid coordinates (null outside the grid). */
function squareAt(svg, e) {
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  const x = Math.floor(p.x / CELL); const y = Math.floor(p.y / CELL);
  return x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE ? { x, y } : null;
}

/** Setup: drag a token to another square (not onto a wall or a standing piece). */
function dragToken(g, svg, c, battle, save, redraw) {
  g.style.cursor = 'grab';
  g.addEventListener('pointerdown', (e) => {
    g.setPointerCapture(e.pointerId);
    const start = squareAt(svg, e);
    let over = start;
    const move = (ev) => {
      over = squareAt(svg, ev) || over;
      if (start && over) { g.dataset.dragged = over.x !== start.x || over.y !== start.y ? '1' : ''; g.setAttribute('transform', `translate(${(over.x - start.x) * CELL} ${(over.y - start.y) * CELL})`); }
    };
    const done = (ev) => {
      g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', done); g.removeEventListener('pointercancel', done);
      g.releasePointerCapture?.(ev.pointerId);
      const blocked = !over || isWall(battle, over.x, over.y) || over.x < battle.grid.play.x0 || over.x > battle.grid.play.x1 || over.y < battle.grid.play.y0 || over.y > battle.grid.play.y1
        || (battle.cover || []).some((p) => p.x === over.x && p.y === over.y && p.state !== 'destroyed');
      if (!g.dataset.dragged) { g.removeAttribute('transform'); return; } // a plain click: leave the token for its click handler
      if (!blocked) { c.x = over.x; c.y = over.y; save(); }
      redraw();
    };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', done); g.addEventListener('pointercancel', done);
  });
}

/** The board, as a host element that redraws itself when a fighter is selected or moved. */
export function gridBoard(cx) {
  const { battle, ui, render } = cx;
  const host = h('div', { class: 'bt-grid-wrap' });
  const info = h('p', { class: 'bt-grid-info hint', 'aria-live': 'polite' });
  const draw = () => {
    const sel = battle.combatants.find((c) => c.id === ui.selId) || null;
    const atk = sel ? shownAttack(sel) : null;
    const svg = el('svg', { class: 'bt-grid', viewBox: `${-MARGIN} ${-MARGIN} ${GRID_SIZE * CELL + MARGIN} ${GRID_SIZE * CELL + MARGIN}`, role: 'group', 'aria-label': `The battlefield: ${GRID_SIZE} by ${GRID_SIZE} squares of ${fmtFt(battle.grid.squareFt)}` });
    drawCells(svg, cx, sel, atk); drawLabels(svg); drawPieces(svg, battle);
    const bySquare = new Map();
    for (const c of battle.combatants) { const k = `${c.x},${c.y}`; (bySquare.get(k) || bySquare.set(k, []).get(k)).push(c); }
    for (const list of bySquare.values()) list.forEach((c, i) => svg.append(token(cx, c, i, list.length, svg, draw)));
    svg.addEventListener('click', (e) => {
      const sq = squareAt(svg, e);
      if (battle.status === 'setup' && ui.placing && sq && !isWall(battle, sq.x, sq.y)) { addCover(battle, ui.coverKind || 'brick-wall', sq.x, sq.y); cx.save(); render(); }
      else if (ui.selId) { ui.selId = null; draw(); }
    });
    svg.addEventListener('pointermove', (e) => {
      const sq = squareAt(svg, e);
      const other = sq && sel ? battle.combatants.find((c) => c !== sel && c.x === sq.x && c.y === sq.y && c.team !== sel.team) : null;
      info.textContent = other ? hoverText(battle, sel, atk, other) : sel ? legend(battle, sel, atk) : sq ? `${squareName(sq.x, sq.y)}` : '';
    });
    info.textContent = sel ? legend(battle, sel, atk) : battle.status === 'setup' ? 'Pick a fighter to see its ranges and reach. Drag a token to move it.' : 'Pick a fighter to see its ranges and reach.';
    host.replaceChildren(svg, info);
  };
  draw();
  return host;
}

/** A box for any number of feet per square, shown when the Custom scale is chosen. */
function customFtInput(cx) {
  const { battle, save, render } = cx;
  const set = (v) => { battle.options.scale = 'custom'; battle.options.squareFt = customFt(v); syncGrid(battle); save(); render(); };
  return h('label', { class: 'bt-copies' }, 'Feet per square ',
    h('input', { type: 'number', id: 'bt-scale-ft', min: CUSTOM_FT.min, max: CUSTOM_FT.max, step: 1, list: 'bt-scale-ft-list', value: squareFtOf(battle.options),
      'aria-label': 'Feet per square', style: { width: '7em' }, onChange: (e) => set(e.target.value) }),
    h('datalist', { id: 'bt-scale-ft-list' }, CUSTOM_FT.suggest.map((ft) => h('option', { value: ft }))));
}

/** The scale picker: Street, Block, District or a custom number of feet, with a line saying what the choice means. */
export function scalePicker(cx) {
  const { battle, save, render } = cx;
  const now = scaleOf(battle.options);
  const enclosed = !!battle.options.enclosed;
  const ft = squareFtOf(battle.options);
  const pick = (key) => { battle.options.scale = key; if (key === 'custom' && !battle.options.squareFt) battle.options.squareFt = ft; syncGrid(battle); save(); render(); };
  const btn = (key, text) => h('button', { type: 'button', class: `btn sm ${key === now ? 'on' : ''}`, id: `bt-scale-${key}`, 'aria-pressed': key === now, disabled: enclosed, onClick: () => pick(key) }, text);
  const blurb = now === 'custom' ? `Squares of ${ft} ft, a board ${ft * GRID_SIZE} ft across.` : SCALES[now].blurb;
  return h('div', { class: 'bt-scale' },
    h('div', { class: 'label' }, 'Scale'),
    h('div', { class: 'bt-scale-row', role: 'group', 'aria-label': 'Scale of the grid' },
      Object.entries(SCALES).map(([key, s]) => btn(key, `${s.label} ${s.ft} ft`)), btn('custom', 'Custom')),
    now === 'custom' && !enclosed ? customFtInput(cx) : null,
    h('p', { class: 'hint', style: { margin: 0 } }, enclosed ? 'An enclosed space is always a room 60 ft across in 5 ft squares.' : `${blurb} Ranges and moves are in feet, so the same fight plays out differently at each scale.`));
}
