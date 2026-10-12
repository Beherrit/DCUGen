// The battle map: a grid with everyone on the GM screen as tokens. Drag them around; pick one to see its
// range rings and how far everyone else is (with the range penalty); drop a Burst, Cone, Line or Cloud
// and everyone inside lights up, then one button sends the hit through the GM screen (each player's app
// rolls its own Dodge for half and resistance). Players see the map, read-only, in their Play view.

import { h, clear, toast } from './dom.js';
import { lobby, lobbySend } from './lobby.js';
import { parseHit, describeHit } from '../engine/gmboard.js';
import { AREA_BASE, fmtFt } from '../engine/range.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); for (const c of kids.flat()) if (c != null) el.append(c); return el; };
const CELL = 26;
const SHAPES = ['Burst', 'Cone', 'Line', 'Cloud', 'Cylinder'];

export function defaultMap() { return { w: 36, h: 22, scale: 10, tokens: {}, template: null, sel: null }; }

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Who is inside a template (positions in squares, template sizes in feet). */
export function insideTemplate(t, tokens, scale) {
  if (!t) return [];
  const r = t.ft / scale;
  const out = [];
  for (const [key, p] of Object.entries(tokens)) {
    const c = { x: p.x + 0.5, y: p.y + 0.5 };
    let hit = false;
    if (t.shape === 'Cone' || t.shape === 'Line') {
      const ox = t.ox; const oy = t.oy; const dx = t.x - ox; const dy = t.y - oy; const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len; const uy = dy / len;
      const vx = c.x - ox; const vy = c.y - oy;
      const along = vx * ux + vy * uy; const across = Math.abs(vx * uy - vy * ux);
      if (t.shape === 'Cone') hit = along > 0 && along <= r && across <= along * 0.5 + 0.3;
      else hit = along > 0 && along <= r && across <= Math.max(0.5, (5 / scale) / 2 + 0.3);
    } else hit = Math.hypot(c.x - t.x, c.y - t.y) <= r + 0.3;
    if (hit) out.push(key);
  }
  return out;
}

/** The map as an SVG element. opts: { interactive, onDown(key, ev), onBoard(ev), highlight: Set, sel } */
export function drawMap(map, people, opts = {}) {
  const W = map.w * CELL; const H = map.h * CELL;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bm-svg', role: 'img', 'aria-label': 'Battle map' });
  const grid = svg('g', { class: 'bm-grid' });
  for (let x = 0; x <= map.w; x++) grid.append(svg('line', { x1: x * CELL, y1: 0, x2: x * CELL, y2: H }));
  for (let y = 0; y <= map.h; y++) grid.append(svg('line', { x1: 0, y1: y * CELL, x2: W, y2: y * CELL }));
  root.append(svg('rect', { width: W, height: H, class: 'bm-bg' }), grid);
  // range rings for the selected token
  const sel = map.sel && map.tokens[map.sel] ? map.sel : null;
  const selPerson = people.find((p) => p.key === sel);
  if (sel && selPerson) {
    const p = map.tokens[sel];
    const cx = (p.x + 0.5) * CELL; const cy = (p.y + 0.5) * CELL;
    const ranged = (selPerson.status.ranges || []).filter((r) => r.short).sort((a, b) => b.long - a.long)[0];
    if (ranged) {
      for (const [band, cls] of [['long', 'far'], ['medium', 'mid'], ['short', 'near']]) root.append(svg('circle', { cx, cy, r: (ranged[band] / map.scale) * CELL, class: `bm-ring ${cls}` }));
      root.append(svg('text', { x: cx, y: cy - (ranged.short / map.scale) * CELL - 4, class: 'bm-ring-label', 'text-anchor': 'middle' }, `${ranged.name}: short ${fmtFt(ranged.short)}`));
    }
    root.append(svg('circle', { cx, cy, r: CELL * 1.5, class: 'bm-ring close' }));
  }
  // the area template
  const t = map.template;
  if (t) {
    const r = (t.ft / map.scale) * CELL;
    if (t.shape === 'Cone' || t.shape === 'Line') {
      const ox = t.ox * CELL; const oy = t.oy * CELL; const ang = Math.atan2(t.y - t.oy, t.x - t.ox);
      if (t.shape === 'Cone') {
        const a1 = ang - Math.atan(0.5); const a2 = ang + Math.atan(0.5); const rr = r / Math.cos(Math.atan(0.5));
        root.append(svg('path', { d: `M${ox} ${oy} L${ox + Math.cos(a1) * rr} ${oy + Math.sin(a1) * rr} L${ox + Math.cos(a2) * rr} ${oy + Math.sin(a2) * rr} Z`, class: 'bm-template' }));
      } else {
        const wpx = Math.max(CELL, (5 / map.scale) * CELL);
        root.append(svg('rect', { x: ox, y: oy - wpx / 2, width: r, height: wpx, transform: `rotate(${(ang * 180) / Math.PI} ${ox} ${oy})`, class: 'bm-template' }));
      }
    } else root.append(svg('circle', { cx: t.x * CELL, cy: t.y * CELL, r, class: 'bm-template' }));
  }
  // tokens
  for (const person of people) {
    const pos = map.tokens[person.key];
    if (!pos) continue;
    const s = person.status;
    const down = s.play?.damage === 'incapacitated';
    const g = svg('g', { class: `bm-token ${opts.highlight?.has(person.key) ? 'caught' : ''} ${sel === person.key ? 'sel' : ''} ${down ? 'down' : ''} ${s.villain ? 'villain' : ''}`, transform: `translate(${(pos.x + 0.5) * CELL} ${(pos.y + 0.5) * CELL})`, 'data-key': person.key },
      svg('circle', { r: CELL * 0.62, fill: s.color || '#888' }),
      svg('text', { y: CELL * 0.22, 'text-anchor': 'middle', class: 'bm-initial' }, (s.name || '?').trim()[0].toUpperCase()),
      svg('text', { y: CELL * 1.25, 'text-anchor': 'middle', class: 'bm-name' }, s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name));
    if (opts.interactive) g.addEventListener('pointerdown', (e) => opts.onDown?.(person.key, e));
    root.append(g);
  }
  if (opts.interactive) root.addEventListener('pointerdown', (e) => { if (!e.target.closest('.bm-token')) opts.onBoard?.(e); });
  return root;
}

function toSquares(svgEl, map, e) {
  const r = svgEl.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * map.w, y: ((e.clientY - r.top) / r.height) * map.h };
}

let broadcastTimer = null;
function broadcast(map, people) {
  if (lobby.status !== 'on' || lobby.role !== 'host') return;
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    const tokens = {};
    for (const p of people) if (map.tokens[p.key]) tokens[p.key] = { ...map.tokens[p.key], name: p.status.name, color: p.status.color, villain: p.status.villain, down: p.status.play?.damage === 'incapacitated' };
    lobbySend({ t: 'map', map: { w: map.w, h: map.h, scale: map.scale, tokens, template: map.template } });
  }, 250);
}

/** The GM's map page. ctx: { R, people, gs, save, rerender, applyHit } */
export function mapPanel(ctx) {
  const { people, gs } = ctx;
  if (!gs.map) gs.map = defaultMap();
  const map = gs.map;
  // place anyone new: heroes down the left, everyone else down the right
  let li = 0; let ri = 0;
  for (const p of people) {
    if (map.tokens[p.key]) continue;
    map.tokens[p.key] = p.status.villain ? { x: map.w - 4, y: 3 + 2 * ri++ } : { x: 3, y: 3 + 2 * li++ };
  }
  const host = h('div', { class: 'bm-host' });
  const info = h('div', { class: 'bm-info' });
  const tool = { shape: 'Burst', steps: 1, effect: 'Damage 10', ...(map.tool || {}), placing: false };
  const caught = () => new Set(insideTemplate(map.template, Object.fromEntries(people.filter((p) => map.tokens[p.key]).map((p) => [p.key, map.tokens[p.key]])), map.scale));
  const persist = () => { const { placing, ...keep } = tool; map.tool = keep; ctx.save(); broadcast(map, people); };

  const redraw = () => {
    clear(host);
    const inside = caught();
    let drag = null;
    const el = drawMap(map, people, {
      interactive: true, highlight: inside,
      onDown: (key, e) => {
        e.preventDefault();
        if (tool.placing) { placeAt(e); return; }
        map.sel = key; drag = { key, moved: false };
        el.setPointerCapture?.(e.pointerId);
        redraw();
        drag = { key, moved: false };
        const svgEl = host.querySelector('svg');
        const move = (ev) => { const q = toSquares(svgEl, map, ev); const nx = Math.max(0, Math.min(map.w - 1, Math.floor(q.x))); const ny = Math.max(0, Math.min(map.h - 1, Math.floor(q.y))); const cur = map.tokens[key]; if (cur.x !== nx || cur.y !== ny) { map.tokens[key] = { x: nx, y: ny }; drag.moved = true; const g = svgEl.querySelector(`[data-key="${CSS.escape(key)}"]`); if (g) g.setAttribute('transform', `translate(${(nx + 0.5) * CELL} ${(ny + 0.5) * CELL})`); } };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); persist(); redraw(); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      },
      onBoard: (e) => { if (tool.placing) placeAt(e); else if (map.sel) { map.sel = null; persist(); redraw(); } },
    });
    host.append(el);
    drawInfo(inside);
  };

  const placeAt = (e) => {
    const svgEl = host.querySelector('svg');
    const q = toSquares(svgEl, map, e);
    const ft = (AREA_BASE[tool.shape]?.ft || 30) * 2 ** Math.max(0, tool.steps - 1);
    const from = map.sel && map.tokens[map.sel] ? { x: map.tokens[map.sel].x + 0.5, y: map.tokens[map.sel].y + 0.5 } : { x: q.x - 1, y: q.y };
    map.template = { shape: tool.shape, ft, x: q.x, y: q.y, ox: from.x, oy: from.y };
    tool.placing = false;
    persist(); redraw();
  };

  const drawInfo = (inside) => {
    clear(info);
    const sel = people.find((p) => p.key === map.sel);
    if (sel) {
      const me = map.tokens[sel.key];
      const ranged = (sel.status.ranges || []).filter((r) => r.short).sort((a, b) => b.long - a.long)[0];
      info.append(h('h3', null, `📏 From ${sel.status.name}`),
        h('ul', { class: 'bm-dists' }, people.filter((p) => p.key !== sel.key && map.tokens[p.key]).map((p) => {
          const ft = Math.round(dist(me, map.tokens[p.key]) * map.scale);
          const band = !ranged ? '' : ft <= ranged.short ? 'short range' : ft <= ranged.medium ? 'medium (−2)' : ft <= ranged.long ? 'long (−5)' : 'out of range';
          return h('li', { class: ft <= map.scale * 1.5 ? 'adjacent' : '' }, h('b', null, p.status.name), ` ${fmtFt(ft)}`, ft <= map.scale * 1.5 ? h('span', { class: 'chip' }, 'close') : band ? h('span', { class: `chip ${band === 'out of range' ? 'warn' : ''}` }, `${ranged.name}: ${band}`) : null);
        })));
    } else info.append(h('p', { class: 'hint' }, 'Pick a token to see its range rings and how far everyone is. Drag tokens to move them.'));
    if (map.template) {
      const names = people.filter((p) => inside.has(p.key)).map((p) => p.status.name);
      const effect = h('input', { type: 'text', id: 'bm-effect', value: tool.effect, 'aria-label': 'What the area does', placeholder: 'e.g. Damage 10, Affliction 8 vs Will' });
      effect.addEventListener('change', () => { tool.effect = effect.value; persist(); });
      info.append(h('h3', null, `💥 ${map.template.shape}, ${fmtFt(map.template.ft)}`),
        h('p', null, names.length ? `Caught: ${names.join(', ')}` : 'Nobody inside.'),
        h('div', { class: 'seed-row' }, effect, h('button', { class: 'btn primary', type: 'button', id: 'bm-hit', disabled: !names.length, onClick: () => {
          tool.effect = effect.value;
          const hit = parseHit(`${tool.effect} hits ${names.join(' and ')}`, people.map((p) => p.status.name));
          if (hit.error) { toast(hit.error); return; }
          hit.targets = names; hit.area = true;
          ctx.applyHit(hit);
          persist(); ctx.rerender();
        } }, 'Hit everyone in it')),
        h('p', { class: 'hint' }, 'Each of them makes a Dodge check (DC 10 + rank) for half, then resists.'),
        h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { map.template = null; persist(); redraw(); } }, 'Remove the template'));
    }
  };

  const shapeSel = h('select', { 'aria-label': 'Area shape', id: 'bm-shape' }, SHAPES.map((s) => h('option', { value: s, selected: s === tool.shape }, s)));
  shapeSel.addEventListener('change', () => { tool.shape = shapeSel.value; persist(); });
  const steps = h('select', { 'aria-label': 'Area size', id: 'bm-steps' }, [1, 2, 3, 4].map((n) => h('option', { value: n, selected: n === tool.steps }, n === 1 ? 'Area 1' : `Area ${n} (×${2 ** (n - 1)})`)));
  steps.addEventListener('change', () => { tool.steps = Number(steps.value); persist(); });
  const scale = h('select', { 'aria-label': 'Scale', id: 'bm-scale' }, [5, 10, 25, 50].map((n) => h('option', { value: n, selected: n === map.scale }, `1 square = ${n} ft`)));
  scale.addEventListener('change', () => { map.scale = Number(scale.value); persist(); redraw(); });
  const toolbar = h('div', { class: 'bm-tools rc-row' },
    h('label', null, 'Template', shapeSel), steps,
    h('button', { class: 'btn sm primary', type: 'button', id: 'bm-place', onClick: () => { tool.placing = true; toast(map.sel && (tool.shape === 'Cone' || tool.shape === 'Line') ? `Click where the ${tool.shape.toLowerCase()} points (it comes from the selected token)` : `Click where the ${tool.shape.toLowerCase()} goes`); } }, 'Place it'),
    h('span', { class: 'spacer' }), scale,
    h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { map.tokens = {}; map.template = null; map.sel = null; persist(); ctx.rerender(); } }, 'Reset positions'));
  redraw();
  broadcast(map, people);
  return h('div', { class: 'bm' }, toolbar, h('div', { class: 'bm-layout' }, host, h('aside', { class: 'panel bm-side' }, info)),
    h('p', { class: 'hint' }, lobby.status === 'on' && lobby.role === 'host' ? 'Your players see this map in their Play view.' : 'Open a table and your players see this map in their Play view.'));
}

// ---- players: the GM's map, read-only, in the Play view ---------------------------------------------------
let shared = null;
let onShared = null;
export function receiveMapFromHost(map) { shared = map; onShared?.(); }
export function onSharedMap(fn) { onShared = fn; }
export function sharedMapView(myKeys = []) {
  if (!shared) return null;
  const people = Object.entries(shared.tokens || {}).map(([key, t]) => ({ key, status: { name: t.name, color: t.color, villain: t.villain, play: { damage: t.down ? 'incapacitated' : 'none' }, ranges: [] } }));
  const map = { ...shared, sel: myKeys.find((k) => shared.tokens?.[k]) || null };
  const inside = new Set(insideTemplate(shared.template, shared.tokens || {}, shared.scale));
  return h('section', { class: 'play-card bm-play' }, h('h3', null, '🗺 The map'), drawMap(map, people, { highlight: inside }), h('p', { class: 'hint' }, `1 square = ${shared.scale} ft. The GM moves the tokens.`));
}
export { describeHit };
