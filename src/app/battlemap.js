// The battle map: as many maps as you like, each a grid over an optional uploaded picture, with walls,
// cover, difficult ground, water and hazards painted on the squares, everyone on the GM screen as tokens
// (with their portraits), and area templates you can drag, aim and resize. Pick a token to see how far
// everyone is, the range penalty, and whether a wall or cover is in the way. One button sends an area hit
// through the GM screen. Players see the map live (and can walk their own token), and anyone can open it
// in 3D: orbit around the scene or stand in a token's shoes.

import { h, clear, toast, openDialog } from './dom.js';
import { lobby, lobbySend } from './lobby.js';
import { parseHit } from '../engine/gmboard.js';
import { AREA_BASE, fmtFt } from '../engine/range.js';
import { TERRAIN, PROPS, PROP_CATS, GROUNDS, WEATHER, LIGHTS, SHAPES, newMap, newProp, propHeightFt, migrateMaps, sizeOf, centerOf, templateGeom, insideTemplate, sightLine, feetBetween, paintBox, resizeMap, assetId } from '../engine/mapgeo.js';
import { open3D } from './map3d.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); for (const c of kids.flat()) if (c != null) el.append(c); return el; };
const CELL = 26;
/** Font size that fits a piece's short word across its footprint. */
const shortSize = (P, w, d) => Math.min(13, d * 0.5, (w * 1.6) / P.short.length);
const TCOLORS = ['#e3242b', '#7b4fd6', '#e0a030', '#1f8a70', '#2b6cb0'];
const imgKey = (id) => `dcugen.mapimg.${id}`;
const ftFor = (shape, steps) => (AREA_BASE[shape]?.ft || 30) * 2 ** Math.max(0, (steps || 1) - 1);
const isAimed = (t) => t.shape === 'Cone' || t.shape === 'Line';

// ---- pictures: map backgrounds and token portraits ---------------------------------------------------------
const assets = new Map(); // id -> data URL (the host's own, and what players have been sent)
function bgUrl(map) {
  if (!map.bg?.img) return null;
  if (assets.has(map.bg.img)) return assets.get(map.bg.img);
  const d = localStorage.getItem(imgKey(map.bg.img));
  if (d) assets.set(map.bg.img, d);
  return d;
}
function portraitAsset(url) {
  if (!url) return null;
  const id = assetId(url);
  assets.set(id, url);
  return id;
}

/** Shrink a picture so it stays light enough to save and send to phones. Returns { data, w, h, ow, oh }. */
function loadPicture(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ow = img.naturalWidth; const oh = img.naturalHeight;
      const k = Math.min(1, 2400 / Math.max(ow, oh));
      const c = document.createElement('canvas');
      c.width = Math.round(ow * k); c.height = Math.round(oh * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let data = c.toDataURL('image/jpeg', 0.85);
      if (data.length > 2_500_000) data = c.toDataURL('image/jpeg', 0.7);
      resolve({ data, w: c.width, h: c.height, ow, oh });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn\'t a picture this browser can read.')); };
    img.src = url;
  });
}

// ---- drawing --------------------------------------------------------------------------------------------------
function templateShape(t, g, scale, cls) {
  const r = (t.ft / scale) * CELL;
  if (isAimed(t)) {
    const ox = g.ox * CELL; const oy = g.oy * CELL;
    if (t.shape === 'Cone') {
      const a1 = g.ang - Math.atan(0.5); const a2 = g.ang + Math.atan(0.5); const rr = r / Math.cos(Math.atan(0.5));
      return svg('path', { d: `M${ox} ${oy} L${ox + Math.cos(a1) * rr} ${oy + Math.sin(a1) * rr} L${ox + Math.cos(a2) * rr} ${oy + Math.sin(a2) * rr} Z`, class: cls });
    }
    const wpx = Math.max(CELL, (5 / scale) * CELL);
    return svg('rect', { x: ox, y: oy - wpx / 2, width: r, height: wpx, transform: `rotate(${(g.ang * 180) / Math.PI} ${ox} ${oy})`, class: cls });
  }
  return svg('circle', { cx: g.x * CELL, cy: g.y * CELL, r, class: cls });
}

/**
 * The map as an SVG element.
 * view: { map, tokens: [{ key, x, y, size, name, color, villain, down, hidden, img }], bg, gm, sel, selT, caught: Set, ranged }
 */
export function drawMap(view) {
  const { map } = view;
  const W = map.w * CELL; const H = map.h * CELL;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bm-svg', role: 'img', 'aria-label': `Battle map: ${map.name || ''}`, width: map.w * (map.zoom || 26), height: map.h * (map.zoom || 26) });
  root.append(svg('defs', {}, svg('clipPath', { id: 'bm-round', clipPathUnits: 'objectBoundingBox' }, svg('circle', { cx: 0.5, cy: 0.5, r: 0.5 }))));
  const ground = GROUNDS[map.ground] || GROUNDS.grass;
  root.append(svg('rect', { width: W, height: H, class: 'bm-bg', fill: ground.board }));
  if (view.bg && map.bg) {
    const b = map.bg;
    root.append(svg('image', { href: view.bg, x: b.x * CELL, y: b.y * CELL, width: b.w * CELL, height: b.h * CELL, preserveAspectRatio: 'none', opacity: b.opacity ?? 1, class: 'bm-picture' }));
  }
  const terr = svg('g', { class: 'bm-terrain' });
  for (const [k, kind] of Object.entries(map.terrain || {})) {
    const T = TERRAIN[kind]; if (!T) continue;
    const [x, y] = k.split(',').map(Number);
    terr.append(svg('rect', { x: x * CELL, y: y * CELL, width: CELL, height: CELL, class: `bm-t bm-t-${kind}`, fill: T.color }));
  }
  root.append(terr);
  // pieces: flat ones (roads, ponds, parks) lie under the grid, the rest stand on it
  const flats = svg('g', { class: 'bm-flats' });
  const props = svg('g', { class: 'bm-props' });
  for (const p of map.props || []) {
    const P = PROPS[p.kind]; if (!P) continue;
    const x = p.x * CELL; const y = p.y * CELL; const w = p.w * CELL; const d = p.d * CELL;
    const fill = p.color || P.color;
    const g = svg('g', { class: `bm-prop ${P.flat ? 'flat' : ''} ${view.selP === p.id ? 'sel' : ''}`, 'data-prop': p.id });
    const long = p.w > p.d;
    if (P.model === 'road') {
      g.append(svg('rect', { x, y, width: w, height: d, fill: '#3d4048', class: 'bm-prop-body' }));
      g.append(svg('line', { x1: long ? x + 4 : x + w / 2, y1: long ? y + d / 2 : y + 4, x2: long ? x + w - 4 : x + w / 2, y2: long ? y + d / 2 : y + d - 4, class: 'bm-road-line' }));
    } else if (P.model === 'pond' || P.model === 'lava' || P.model === 'crater') {
      g.append(svg('ellipse', { cx: x + w / 2, cy: y + d / 2, rx: w / 2, ry: d / 2, fill: P.model === 'crater' ? '#7a7874' : fill, class: `bm-prop-body bm-${P.model}` }));
      if (P.model === 'crater') g.append(svg('ellipse', { cx: x + w / 2, cy: y + d / 2, rx: w / 2 - 4, ry: d / 2 - 4, fill: '#5f5d59' }));
    } else if (P.model === 'crosswalk') {
      g.append(svg('rect', { x, y, width: w, height: d, fill: '#3d4048', class: 'bm-prop-body' }));
      for (let i = 0; i < p.w * 3; i++) g.append(svg('rect', { x: x + 2 + i * (CELL / 3), y: y + 3, width: CELL / 6, height: d - 6, fill: '#f4f4f4' }));
    } else if (P.flat) {
      g.append(svg('rect', { x, y, width: w, height: d, rx: P.model === 'park' ? 6 : 1, fill, class: 'bm-prop-body' }));
      g.append(svg('text', { x: x + w / 2, y: y + d / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'bm-prop-short', style: `font-size:${shortSize(P, w, d)}px;opacity:.8` }, P.short));
    } else {
      const tall = Math.min(1.4, (propHeightFt(p) / map.scale) * 0.12 + 0.12) * CELL; // a shadow that grows with height
      const round = P.model === 'person' || P.model === 'pine' || P.model === 'oak' || P.model === 'bush' || P.model === 'rock' || P.model === 'dog' || P.model === 'fountain' || P.model === 'reactor';
      g.append(svg('rect', { x: x + tall * 0.6, y: y + tall * 0.6, width: w, height: d, rx: round ? Math.min(w, d) / 2 : 3, class: 'bm-prop-shadow' }));
      g.append(svg('rect', { x, y, width: w, height: d, rx: round ? Math.min(w, d) / 2 : P.blocks ? 2 : CELL * 0.25, fill, class: 'bm-prop-body' }));
      if (P.roof === 'gable') g.append(svg('line', { x1: long || p.w === p.d ? x + 3 : x + w / 2, y1: long || p.w === p.d ? y + d / 2 : y + 3, x2: long || p.w === p.d ? x + w - 3 : x + w / 2, y2: long || p.w === p.d ? y + d / 2 : y + d - 3, class: 'bm-prop-ridge' }));
      g.append(svg('text', { x: x + w / 2, y: y + d / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'bm-prop-short', style: `font-size:${shortSize(P, w, d)}px` }, P.short));
      if (p.floors > 1) g.append(svg('text', { x: x + w - 3, y: y + 11, 'text-anchor': 'end', class: 'bm-prop-floors' }, `${p.floors}F`));
    }
    if (view.gm && view.selP === p.id) g.append(svg('rect', { x: x + w - 6, y: y + d - 6, width: 12, height: 12, class: 'bm-handle size', 'data-handle': 'size' }));
    (P.flat ? flats : props).append(g);
  }
  root.append(flats);
  if (map.grid > 0) {
    const grid = svg('g', { class: 'bm-grid', opacity: map.grid, stroke: ground.line });
    for (let x = 0; x <= map.w; x++) grid.append(svg('line', { x1: x * CELL, y1: 0, x2: x * CELL, y2: H }));
    for (let y = 0; y <= map.h; y++) grid.append(svg('line', { x1: 0, y1: y * CELL, x2: W, y2: y * CELL }));
    root.append(grid);
  }
  root.append(props);
  const byKey = Object.fromEntries(view.tokens.map((t) => [t.key, t]));
  // range rings for the selected token
  const me = view.sel && byKey[view.sel];
  if (me) {
    const c = centerOf(me); const cx = c.x * CELL; const cy = c.y * CELL;
    const ranged = view.ranged;
    if (ranged) {
      for (const [band, cls] of [['long', 'far'], ['medium', 'mid'], ['short', 'near']]) root.append(svg('circle', { cx, cy, r: (ranged[band] / map.scale) * CELL, class: `bm-ring ${cls}` }));
      root.append(svg('text', { x: cx, y: cy - (ranged.short / map.scale) * CELL - 4, class: 'bm-ring-label', 'text-anchor': 'middle' }, `${ranged.name}: short ${fmtFt(ranged.short)}`));
    }
    root.append(svg('circle', { cx, cy, r: CELL * (sizeOf(me) / 2 + 1), class: 'bm-ring close' }));
  }
  // area templates
  (map.templates || []).forEach((t, i) => {
    const g = templateGeom(t, byKey);
    const color = t.color || TCOLORS[i % TCOLORS.length];
    const grp = svg('g', { class: `bm-tpl ${view.selT === t.id ? 'sel' : ''}`, 'data-tpl': t.id, style: `--tc:${color}` }, templateShape(t, g, map.scale, 'bm-template'));
    if (view.gm) {
      const hx = (isAimed(t) ? g.ox : g.x) * CELL; const hy = (isAimed(t) ? g.oy : g.y) * CELL;
      grp.append(svg('circle', { cx: hx, cy: hy, r: 7, class: 'bm-handle move', 'data-handle': 'move' }));
      if (isAimed(t)) {
        const r = (t.ft / map.scale) * CELL;
        grp.append(svg('circle', { cx: hx + Math.cos(g.ang) * r, cy: hy + Math.sin(g.ang) * r, r: 7, class: 'bm-handle aim', 'data-handle': 'aim' }));
      }
    }
    root.append(grp);
  });
  // tokens
  for (const t of view.tokens) {
    const s = sizeOf(t); const rad = CELL * (s / 2) * 0.86;
    const c = centerOf(t);
    const g = svg('g', { class: `bm-token ${view.caught?.has(t.key) ? 'caught' : ''} ${view.sel === t.key ? 'sel' : ''} ${t.down ? 'down' : ''} ${t.villain ? 'villain' : ''} ${t.hidden ? 'hidden' : ''} ${t.mine ? 'mine' : ''}`, transform: `translate(${c.x * CELL} ${c.y * CELL})`, 'data-key': t.key },
      svg('circle', { r: rad, fill: t.color || '#888', class: 'bm-disc' }));
    if (t.img) g.append(svg('image', { href: t.img, x: -rad + 2, y: -rad + 2, width: (rad - 2) * 2, height: (rad - 2) * 2, 'clip-path': 'url(#bm-round)', preserveAspectRatio: 'xMidYMin slice' }));
    else g.append(svg('text', { y: CELL * 0.22 * s, 'text-anchor': 'middle', class: 'bm-initial', style: `font-size:${15 * s}px` }, (t.name || '?').trim()[0].toUpperCase()));
    g.append(svg('circle', { r: rad, class: 'bm-ring-token' }));
    g.append(svg('text', { y: rad + 11, 'text-anchor': 'middle', class: 'bm-name' }, t.name.length > 16 ? `${t.name.slice(0, 15)}…` : t.name));
    if (t.hidden) g.append(svg('text', { y: -rad - 3, 'text-anchor': 'middle', class: 'bm-badge' }, 'hidden'));
    root.append(g);
  }
  // the weather and the light, laid over everything (clicks pass through)
  const sky = svg('g', { class: 'bm-sky', 'pointer-events': 'none' });
  if (map.light === 'night') sky.append(svg('rect', { width: W, height: H, fill: '#071230', opacity: 0.38 }));
  if (map.light === 'dusk') sky.append(svg('rect', { width: W, height: H, fill: '#c2562b', opacity: 0.16 }));
  const wx = map.weather;
  if (wx && wx !== 'clear') {
    const id = `bm-wx-${wx}`;
    const pat = { rain: ['line', 18, '#9fc3e6', 0.7], storm: ['line', 12, '#9fb7d6', 0.8], snow: ['dot', 22, '#ffffff', 0.9], blizzard: ['dot', 12, '#ffffff', 0.95], sandstorm: ['dot', 10, '#c99a55', 0.7], ash: ['dot', 26, '#ff8a3a', 0.8] }[wx];
    if (pat) {
      const [kind, size, colour, op] = pat;
      const mark = kind === 'line' ? svg('line', { x1: size * 0.7, y1: 0, x2: size * 0.3, y2: size * 0.8, stroke: colour, 'stroke-width': 1.4, opacity: op }) : svg('circle', { cx: size / 2, cy: size / 2, r: wx === 'blizzard' ? 1.6 : 1.8, fill: colour, opacity: op });
      const p = svg('pattern', { id, width: size, height: size, patternUnits: 'userSpaceOnUse' }, mark,
        svg('animateTransform', { attributeName: 'patternTransform', type: 'translate', from: '0 0', to: `${wx === 'sandstorm' ? size : wx === 'ash' ? 0 : -size * 0.3} ${wx === 'ash' ? -size : wx === 'sandstorm' ? size * 0.2 : size}`, dur: wx === 'snow' || wx === 'ash' ? '3s' : wx === 'blizzard' || wx === 'sandstorm' ? '0.9s' : '0.45s', repeatCount: 'indefinite' }));
      root.querySelector('defs').append(p);
      sky.append(svg('rect', { width: W, height: H, fill: `url(#${id})` }));
    }
    const haze = { fog: ['#e8ecef', 0.45], blizzard: ['#ffffff', 0.3], sandstorm: ['#d9b27a', 0.3], storm: ['#1b2433', 0.2], rain: ['#4a5868', 0.1], ash: ['#3a1c12', 0.25] }[wx];
    if (haze) sky.append(svg('rect', { width: W, height: H, fill: haze[0], opacity: haze[1] }));
  }
  if (sky.childNodes.length) root.append(sky);
  return root;
}

function toSquares(svgEl, map, e) {
  const r = svgEl.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * map.w, y: ((e.clientY - r.top) / r.height) * map.h };
}

// ---- sending the map to the players --------------------------------------------------------------------------
let last = null; // the GM's current map context, for players' moves and picture requests
let broadcastTimer = null;
function payload(map, people, portraitFor) {
  const tokens = {};
  for (const p of people) {
    const pos = map.tokens[p.key];
    if (!pos || pos.hidden) continue;
    tokens[p.key] = { x: pos.x, y: pos.y, size: sizeOf(pos), name: p.status.name, color: p.status.color, villain: p.status.villain, down: p.status.play?.damage === 'incapacitated', img: portraitAsset(portraitFor?.(p.key)) };
  }
  bgUrl(map);
  const templates = (map.templates || []).map((t) => ({ ...t, ...(t.from && !tokens[t.from] ? { ...templateGeom(t, map.tokens), from: null } : {}) }));
  return { id: map.id, name: map.name, w: map.w, h: map.h, scale: map.scale, grid: map.grid, ground: map.ground, weather: map.weather, light: map.light, bg: map.bg, terrain: map.terrain, props: map.props, tokens, templates };
}
function broadcast(map, people, portraitFor) {
  if (lobby.status !== 'on' || lobby.role !== 'host') return;
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => lobbySend({ t: 'map', map: payload(map, people, portraitFor) }), 250);
}

/** A player asked for pictures they don't have yet (the map background, portraits). */
export function serveMapAssets(ids, to) {
  for (const id of (ids || []).slice(0, 40)) {
    const data = assets.get(id) || localStorage.getItem(imgKey(id));
    if (data) lobbySend({ t: 'map-asset', id, data, to });
  }
}

/** A player moved their own token. Only their own characters, and only on the map the GM has up. */
export function receiveMapMove(msg) {
  if (!last) return;
  const { map, people, owns } = last;
  if (msg.mapId !== map.id || !map.tokens[msg.key] || !owns(msg.key, msg.fromName)) return;
  const s = sizeOf(map.tokens[msg.key]);
  map.tokens[msg.key].x = Math.max(0, Math.min(map.w - s, Math.round(msg.x)));
  map.tokens[msg.key].y = Math.max(0, Math.min(map.h - s, Math.round(msg.y)));
  last.save(); broadcast(map, people, last.portraitFor); last.redraw?.();
}

// ---- the GM's map page ---------------------------------------------------------------------------------------
/** ctx: { R, people, gs, save, rerender, applyHit, portraitFor(key), owns(key, playerName) } */
export function mapPanel(ctx) {
  const { people, gs } = ctx;
  const map = migrateMaps(gs);
  const ui = (gs.mapUi ||= { mode: 'move', paint: 'wall', box: false, shape: 'Burst', steps: 1 });
  // place anyone new: heroes down the left, everyone else down the right
  let li = 0; let ri = 0;
  const taken = (x, y) => Object.values(map.tokens).some((t) => t.x === x && t.y === y);
  for (const p of people) {
    if (map.tokens[p.key]) continue;
    let pos;
    do { pos = p.status.villain ? { x: Math.max(0, map.w - 4), y: Math.min(map.h - 1, 3 + 2 * ri++) } : { x: 3, y: Math.min(map.h - 1, 3 + 2 * li++) }; } while (taken(pos.x, pos.y) && (li + ri) < map.h * 2);
    map.tokens[p.key] = pos;
  }
  const portraitFor = ctx.portraitFor || (() => null);
  const persist = () => { ctx.save(); broadcast(map, people, portraitFor); };
  const scroller = h('div', { class: 'bm-scroll' });
  const side = h('aside', { class: 'panel bm-side' });
  const present = () => people.filter((p) => map.tokens[p.key]);
  const tokenView = () => present().map((p) => ({ key: p.key, ...map.tokens[p.key], name: p.status.name, color: p.status.color, villain: p.status.villain, down: p.status.play?.damage === 'incapacitated', img: portraitFor(p.key) }));
  const positions = () => Object.fromEntries(present().map((p) => [p.key, map.tokens[p.key]]));
  const selProp = () => map.props.find((p) => p.id === map.selP) || null;
  const selTemplate = () => map.templates.find((t) => t.id === map.selT) || null;
  const rangedOf = (key) => (people.find((p) => p.key === key)?.status.ranges || []).filter((r) => r.short).sort((a, b) => b.long - a.long)[0] || null;

  const redraw = () => {
    const keep = { x: scroller.scrollLeft, y: scroller.scrollTop };
    clear(scroller);
    const t = selTemplate();
    const caught = new Set(t ? insideTemplate(t, positions(), map.scale) : []);
    const el = drawMap({ map, tokens: tokenView(), bg: bgUrl(map), gm: true, sel: map.sel, selT: map.selT, selP: map.selP, caught, ranged: map.sel ? rangedOf(map.sel) : null });
    el.classList.add(`mode-${ui.mode}`);
    el.addEventListener('pointerdown', (e) => onDown(e, el));
    scroller.append(el);
    scroller.scrollLeft = keep.x; scroller.scrollTop = keep.y;
    drawSide(caught);
  };
  last = { map, people, save: ctx.save, portraitFor, owns: ctx.owns || (() => false), redraw };

  // one handler for every kind of drag on the board
  const onDown = (e, el) => {
    if (e.button > 0) return;
    const q = toSquares(el, map, e);
    // the board may be redrawn mid-drag, so follow the pointer on the window and measure the current board
    const drag = (move, up) => {
      e.preventDefault();
      const board = () => scroller.querySelector('svg') || el;
      const mv = (ev) => { if (ev.pointerId === e.pointerId) move(toSquares(board(), map, ev), ev); };
      const done = (ev) => { if (ev.pointerId !== e.pointerId) return; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done); up?.(ev); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', done); window.addEventListener('pointercancel', done);
    };
    if (ui.mode === 'paint') {
      const kind = ui.paint === 'erase' ? null : ui.paint;
      const sx = Math.floor(q.x); const sy = Math.floor(q.y);
      if (ui.box) {
        const box = svg('rect', { class: 'bm-boxsel' }); el.append(box);
        let ex = sx; let ey = sy;
        const show = () => { const x = Math.min(sx, ex); const y = Math.min(sy, ey); box.setAttribute('x', x * CELL); box.setAttribute('y', y * CELL); box.setAttribute('width', (Math.abs(ex - sx) + 1) * CELL); box.setAttribute('height', (Math.abs(ey - sy) + 1) * CELL); };
        show();
        drag((p) => { ex = Math.floor(p.x); ey = Math.floor(p.y); show(); }, () => { paintBox(map, sx, sy, ex, ey, kind); persist(); redraw(); });
      } else {
        const paint = (p) => { const x = Math.floor(p.x); const y = Math.floor(p.y); if (x < 0 || y < 0 || x >= map.w || y >= map.h) return; const k = `${x},${y}`; if ((map.terrain[k] || null) === kind) return; paintBox(map, x, y, x, y, kind); const terr = (scroller.querySelector('svg') || el).querySelector('.bm-terrain'); if (kind) terr.append(svg('rect', { x: x * CELL, y: y * CELL, width: CELL, height: CELL, class: `bm-t bm-t-${kind}`, fill: TERRAIN[kind].color })); else redraw(); };
        paint(q);
        drag(paint, () => { persist(); redraw(); });
      }
      return;
    }
    const propEl = e.target.closest('[data-prop]');
    const propHandle = e.target.closest('[data-handle="size"]');
    // in Build, clicking a road or a pond puts the new piece on it; anything standing gets picked up
    if (propEl && ui.mode !== 'paint' && !(ui.mode === 'build' && propEl.classList.contains('flat') && !propHandle)) {
      const p = map.props.find((x) => x.id === propEl.dataset.prop);
      map.selP = p.id; map.sel = null; map.selT = null;
      if (propHandle) {
        drag((q2) => { const w = Math.max(1, Math.min(map.w - p.x, Math.round(q2.x - p.x))); const d = Math.max(1, Math.min(map.h - p.y, Math.round(q2.y - p.y))); if (w !== p.w || d !== p.d) { p.w = w; p.d = d; redrawFast(); } }, () => { persist(); redraw(); });
      } else {
        const off = { x: q.x - p.x, y: q.y - p.y };
        redraw();
        drag((q2) => { const nx = Math.max(0, Math.min(map.w - p.w, Math.round(q2.x - off.x))); const ny = Math.max(0, Math.min(map.h - p.d, Math.round(q2.y - off.y))); if (nx !== p.x || ny !== p.y) { p.x = nx; p.y = ny; redrawFast(); } }, () => { persist(); redraw(); });
      }
      return;
    }
    if (ui.mode === 'build') {
      const P = PROPS[ui.prop] || PROPS.house;
      const p = newProp(ui.prop in PROPS ? ui.prop : 'house', Math.max(0, Math.min(map.w - P.w, q.x - P.w / 2 + 0.5)), Math.max(0, Math.min(map.h - P.d, q.y - P.d / 2 + 0.5)));
      map.props.push(p); map.selP = p.id; map.sel = null; map.selT = null;
      persist(); redraw();
      return;
    }
    if (ui.mode === 'template') {
      const ft = ftFor(ui.shape, ui.steps);
      const t = { id: Math.random().toString(36).slice(2, 9), shape: ui.shape, steps: ui.steps, ft, effect: ui.effect || 'Damage 10' };
      const from = map.sel && map.tokens[map.sel] ? map.sel : null;
      if (isAimed(t)) {
        if (from) { const c = centerOf(map.tokens[from]); Object.assign(t, { from, ox: c.x, oy: c.y, ang: Math.atan2(q.y - c.y, q.x - c.x) }); } else Object.assign(t, { ox: q.x, oy: q.y, ang: 0 });
      } else Object.assign(t, { x: q.x, y: q.y });
      map.templates.push(t);
      map.selT = t.id; ui.mode = 'move';
      persist(); drawTools(); redraw();
      toast('Drag the round handle to move it, the other to aim it.');
      return;
    }
    // move mode: a template handle, a token, a template, or the empty board (pans)
    const handle = e.target.closest('[data-handle]');
    const tplEl = e.target.closest('[data-tpl]');
    const tokEl = e.target.closest('.bm-token');
    if (handle && tplEl) {
      const t = map.templates.find((x) => x.id === tplEl.dataset.tpl);
      map.selT = t.id;
      if (handle.dataset.handle === 'aim') {
        drag((p) => { const g = templateGeom(t, map.tokens); t.ang = Math.atan2(p.y - g.oy, p.x - g.ox); redrawFast(); }, () => { persist(); redraw(); });
      } else {
        const g0 = templateGeom(t, map.tokens);
        const off = isAimed(t) ? { x: q.x - g0.ox, y: q.y - g0.oy } : { x: q.x - g0.x, y: q.y - g0.y };
        drag((p) => { if (isAimed(t)) { Object.assign(t, { from: null, ox: p.x - off.x, oy: p.y - off.y }); } else Object.assign(t, { from: null, x: p.x - off.x, y: p.y - off.y }); redrawFast(); }, () => { persist(); redraw(); });
      }
      return;
    }
    if (tokEl) {
      const key = tokEl.dataset.key; const pos = map.tokens[key];
      map.sel = key; map.selP = null;
      const off = { x: q.x - pos.x, y: q.y - pos.y };
      const s = sizeOf(pos);
      redraw();
      drag((p) => {
        const nx = Math.max(0, Math.min(map.w - s, Math.round(p.x - off.x))); const ny = Math.max(0, Math.min(map.h - s, Math.round(p.y - off.y)));
        if (nx === pos.x && ny === pos.y) return;
        pos.x = nx; pos.y = ny;
        redrawFast();
      }, () => { persist(); redraw(); });
      return;
    }
    if (tplEl) { map.selT = tplEl.dataset.tpl; persist(); redraw(); return; }
    // empty board: drag to scroll around a big map; a plain click clears the selection
    const start = { x: e.clientX, y: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop }; let moved = false;
    drag((_, ev) => { const dx = ev.clientX - start.x; const dy = ev.clientY - start.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; scroller.scrollLeft = start.sl - dx; scroller.scrollTop = start.st - dy; },
      () => { if (!moved && (map.sel || map.selT || map.selP)) { map.sel = null; map.selT = null; map.selP = null; persist(); redraw(); } });
  };
  let fastQueued = false;
  const redrawFast = () => { if (fastQueued) return; fastQueued = true; requestAnimationFrame(() => { fastQueued = false; redraw(); }); };

  // ---- the side panel: what's selected --------------------------------------------------------------------
  const drawSide = (caught) => {
    clear(side);
    const t = selTemplate();
    const sel = people.find((p) => p.key === map.sel && map.tokens[p.key]);
    if (ui.mode === 'paint') {
      side.append(h('h3', null, 'Painting'), h('p', { class: 'hint' }, ui.box ? 'Drag a box to fill it.' : 'Click or drag across squares.'),
        h('ul', { class: 'bm-legend' }, Object.entries(TERRAIN).map(([k, T]) => h('li', null, h('span', { class: 'bm-swatch', style: { background: T.color } }), h('b', null, T.label), ` ${T.hint}`))));
    }
    if (ui.mode === 'build') {
      const pick = (fn) => () => { fn(); ctx.save(); drawSide(caught); };
      side.append(h('div', { class: 'bm-build' },
        h('h3', null, 'Build'),
        h('div', { class: 'bm-cats', role: 'tablist', 'aria-label': 'Kinds of pieces' }, PROP_CATS.map(([c, label]) => h('button', { type: 'button', role: 'tab', id: `bm-cat-${c}`, 'aria-pressed': String((ui.cat || 'buildings') === c), onClick: pick(() => { ui.cat = c; }) }, label))),
        h('div', { class: 'bm-pieces', role: 'group', 'aria-label': 'Pieces' }, Object.entries(PROPS).filter(([, P]) => P.cat === (ui.cat || 'buildings')).map(([k, P]) => h('button', { type: 'button', class: 'bm-piece', id: `bm-piece-${k}`, 'aria-pressed': String((ui.prop || 'house') === k), title: P.label, onClick: pick(() => { ui.prop = k; }) }, h('small', null, P.label))))));
    }
    const pr = selProp();
    if (pr) {
      const P = PROPS[pr.kind];
      const num = (label, value, set, attrs) => { const i = h('input', { type: 'number', value, ...attrs }); i.addEventListener('change', () => { const v = Number(i.value); if (Number.isFinite(v)) { set(v); persist(); redraw(); } }); return h('label', { class: 'bm-num' }, label, i); };
      const color = h('input', { type: 'color', value: pr.color || P.color, 'aria-label': 'Colour', id: 'bm-p-color' });
      color.addEventListener('input', () => { pr.color = color.value; redrawFast(); });
      color.addEventListener('change', () => persist());
      const tall = pr.floors != null
        ? h('div', { class: 'bm-floors' },
          h('button', { class: 'btn sm ghost icon', type: 'button', 'aria-label': 'One floor less', onClick: () => { pr.floors = Math.max(1, pr.floors - 1); persist(); redraw(); } }, '−'),
          num('Floors', pr.floors, (v) => { pr.floors = Math.max(1, Math.min(150, Math.round(v))); }, { min: 1, max: 150, id: 'bm-p-floors' }),
          h('button', { class: 'btn sm ghost icon', type: 'button', id: 'bm-p-up', 'aria-label': 'One floor more', onClick: () => { pr.floors = Math.min(150, pr.floors + 1); persist(); redraw(); } }, '+'),
          h('span', { class: 'hint' }, `${pr.floors * 12} ft tall`))
        : num('Height (ft)', pr.ft, (v) => { pr.ft = Math.max(1, Math.min(300, v)); }, { min: 1, max: 300 });
      side.append(h('h3', null, P.label),
        h('p', { class: 'hint' }, P.blocks ? 'Blocks movement and line of sight.' : P.cover ? `Gives ${P.cover === 5 ? 'total' : 'partial'} cover: −${P.cover} to attacks through it.` : ''),
        h('div', { class: 'rc-row' },
          num('Wide', pr.w, (v) => { pr.w = Math.max(1, Math.min(map.w - pr.x, Math.round(v))); }, { min: 1, max: 60, id: 'bm-p-w' }),
          num('Deep', pr.d, (v) => { pr.d = Math.max(1, Math.min(map.h - pr.y, Math.round(v))); }, { min: 1, max: 60, id: 'bm-p-d' })),
        tall,
        h('div', { class: 'rc-row' }, h('label', { class: 'bm-num' }, 'Colour', color),
          h('button', { class: 'btn sm ghost', type: 'button', title: 'Turn it a quarter turn', onClick: () => { [pr.w, pr.d] = [Math.min(pr.d, map.w - pr.x), Math.min(pr.w, map.h - pr.y)]; pr.rot = ((pr.rot || 0) + 90) % 360; persist(); redraw(); } }, '⟳ Turn'),
          h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { const c = { ...pr, id: Math.random().toString(36).slice(2, 9), x: Math.min(map.w - pr.w, pr.x + 1), y: Math.min(map.h - pr.d, pr.y + 1) }; map.props.push(c); map.selP = c.id; persist(); redraw(); } }, 'Copy'),
          h('button', { class: 'btn sm ghost', type: 'button', id: 'bm-p-remove', onClick: () => { map.props = map.props.filter((x) => x !== pr); map.selP = null; persist(); redraw(); } }, 'Remove')),
        h('p', { class: 'hint' }, 'Drag it to move. Drag the corner square to stretch it.'));
    }
    if (t) {
      const names = people.filter((p) => caught.has(p.key)).map((p) => p.status.name);
      const shape = h('select', { 'aria-label': 'Shape', id: 'bm-t-shape' }, SHAPES.map((s) => h('option', { value: s, selected: s === t.shape }, s)));
      shape.addEventListener('change', () => {
        const g = templateGeom(t, map.tokens);
        t.shape = shape.value; t.ft = ftFor(t.shape, t.steps);
        if (isAimed(t) && t.ox == null) Object.assign(t, { ox: g.x, oy: g.y, ang: 0 });
        if (!isAimed(t) && t.x == null) Object.assign(t, { x: g.ox, y: g.oy });
        persist(); redraw();
      });
      const steps = h('select', { 'aria-label': 'Area size', id: 'bm-t-steps' }, [1, 2, 3, 4, 5, 6].map((n) => h('option', { value: n, selected: n === (t.steps || 1) }, `${fmtFt(ftFor(t.shape, n))}${n > 1 ? ` (Area ×${2 ** (n - 1)})` : ''}`)));
      steps.addEventListener('change', () => { t.steps = Number(steps.value); t.ft = ftFor(t.shape, t.steps); persist(); redraw(); });
      const follow = h('select', { 'aria-label': 'Comes from', id: 'bm-t-from' }, h('option', { value: '' }, 'Stays where it is'), present().map((p) => h('option', { value: p.key, selected: t.from === p.key }, `Follows ${p.status.name}`)));
      follow.addEventListener('change', () => { const g = templateGeom(t, map.tokens); if (isAimed(t)) Object.assign(t, { ox: g.ox, oy: g.oy }); else Object.assign(t, { x: g.x, y: g.y }); t.from = follow.value || null; persist(); redraw(); });
      const effect = h('input', { type: 'text', id: 'bm-effect', value: t.effect || '', 'aria-label': 'What the area does', placeholder: 'e.g. Damage 10, Affliction 8 vs Will' });
      effect.addEventListener('change', () => { t.effect = effect.value; ui.effect = effect.value; persist(); });
      side.append(h('h3', null, `${t.shape}, ${fmtFt(t.ft)}`),
        h('div', { class: 'rc-row bm-trow' }, shape, steps), follow,
        h('p', null, names.length ? `Caught: ${names.join(', ')}` : 'Nobody inside.'),
        h('div', { class: 'seed-row' }, effect, h('button', { class: 'btn primary', type: 'button', id: 'bm-hit', disabled: !names.length, onClick: () => {
          t.effect = effect.value;
          const hit = parseHit(`${t.effect} hits ${names.join(' and ')}`, people.map((p) => p.status.name));
          if (hit.error) { toast(hit.error); return; }
          hit.targets = names; hit.area = true;
          ctx.applyHit(hit);
          persist(); ctx.rerender();
        } }, 'Hit everyone in it')),
        h('p', { class: 'hint' }, 'Each of them makes a Dodge check (DC 10 + rank) for half, then resists. Drag the round handle to move it; on a cone or line, drag the far handle to aim it.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { map.templates = map.templates.filter((x) => x !== t); map.selT = null; persist(); redraw(); } }, 'Remove'),
          h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { map.selT = null; persist(); redraw(); } }, 'Done')));
    }
    if (sel) {
      const me = map.tokens[sel.key];
      const ranged = rangedOf(sel.key);
      const size = h('select', { 'aria-label': 'Token size', id: 'bm-size' }, [[1, '1 square'], [2, '2×2 (large)'], [3, '3×3 (huge)'], [4, '4×4 (gargantuan)'], [6, '6×6 (colossal)']].map(([n, l]) => h('option', { value: n, selected: n === sizeOf(me) }, l)));
      size.addEventListener('change', () => { me.size = Number(size.value); me.x = Math.min(me.x, map.w - me.size); me.y = Math.min(me.y, map.h - me.size); persist(); redraw(); });
      side.append(h('h3', null, `From ${sel.status.name}`),
        h('div', { class: 'rc-row' }, size,
          h('button', { class: 'btn sm ghost', type: 'button', id: 'bm-hide', 'aria-pressed': String(!!me.hidden), title: 'Hidden tokens are only on your screen', onClick: () => { me.hidden = !me.hidden; persist(); redraw(); } }, me.hidden ? 'Hidden from players' : 'Players see it'),
          h('button', { class: 'btn sm ghost', type: 'button', onClick: () => open3DFor(sel.key) }, 'Their view')),
        h('ul', { class: 'bm-dists' }, present().filter((p) => p.key !== sel.key).map((p) => {
          const other = map.tokens[p.key];
          const ft = feetBetween(me, other, map.scale);
          const adjacent = ft <= map.scale * 0.5;
          const band = !ranged ? '' : ft <= ranged.short ? 'short range' : ft <= ranged.medium ? 'medium (−2)' : ft <= ranged.long ? 'long (−5)' : 'out of range';
          const los = sightLine(map, me, other);
          return h('li', { class: adjacent ? 'adjacent' : '' }, h('b', null, p.status.name), ` ${fmtFt(Math.max(ft, map.scale))}`,
            adjacent ? h('span', { class: 'chip' }, 'close') : band ? h('span', { class: `chip ${band === 'out of range' ? 'warn' : ''}` }, `${ranged.name}: ${band}`) : null,
            los.blocked ? h('span', { class: 'chip warn', title: 'A wall is in the way: no line of sight' }, 'no line') : los.cover ? h('span', { class: 'chip', title: los.cover === 5 ? 'Total cover' : 'Partial cover' }, `cover −${los.cover}`) : null);
        })));
    }
    if (ui.mode === 'build' && !pr) side.append(h('p', { class: 'hint' }, 'Click the map to put the piece down. Click a piece on the map to stretch it, make it taller, recolour, turn or copy it.'));
    if (!t && !sel && !pr && ui.mode !== 'paint' && ui.mode !== 'build') {
      side.append(h('h3', null, map.name || 'Battle map'),
        h('p', { class: 'hint' }, 'Pick a token to see distances, range, and whether walls or cover are in the way. Drag tokens to move them; drag the empty board to scroll a big map.'),
        moodHints(map),
        h('p', { class: 'hint' }, 'Picture puts a map image under the grid. Paint marks walls, cover and rough ground. Template drops an area you can drag and aim. 3D shows it all in three dimensions.'));
    }
  };

  // ---- tools ----------------------------------------------------------------------------------------------
  const tools = h('div', { class: 'bm-tools' });
  const switchMap = (id) => { gs.mapId = id; map.sel = null; ctx.save(); ctx.rerender(); };
  const sceneSel = (id, label, table, value, set) => {
    const s = h('select', { id, 'aria-label': label, title: label }, Object.entries(table).map(([k, v]) => h('option', { value: k, selected: k === value }, v.label)));
    s.addEventListener('change', () => { set(s.value); persist(); redraw(); });
    return s;
  };
  const drawTools = () => {
    clear(tools);
    const pick = h('select', { 'aria-label': 'Map', id: 'bm-map' }, gs.maps.map((m) => h('option', { value: m.id, selected: m.id === map.id }, m.name || 'Map')));
    pick.addEventListener('change', () => switchMap(pick.value));
    const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, id: 'bm-file' });
    fileIn.addEventListener('change', async () => { const f = fileIn.files?.[0]; fileIn.value = ''; if (f) await setPicture(f); });
    const modeBtn = (m, label, title) => h('button', { type: 'button', 'aria-pressed': String(ui.mode === m), id: `bm-mode-${m}`, title, onClick: () => { ui.mode = m; ctx.save(); drawTools(); redraw(); } }, label);
    const row1 = h('div', { class: 'bm-row' },
      h('label', { class: 'bm-mappick' }, 'Map', pick),
      h('button', { class: 'btn sm', type: 'button', id: 'bm-new', onClick: () => newMapDialog() }, '+ New map'),
      h('button', { class: 'btn sm ghost', type: 'button', onClick: () => renameMap() }, 'Rename'),
      h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { const c = JSON.parse(JSON.stringify(map)); c.id = Math.random().toString(36).slice(2, 10); c.name = `${map.name} (copy)`; gs.maps.push(c); switchMap(c.id); } }, 'Duplicate'),
      gs.maps.length > 1 ? h('button', { class: 'btn sm ghost', type: 'button', onClick: () => deleteMap() }, 'Delete') : null,
      h('span', { class: 'spacer' }),
      sceneSel('bm-ground', 'Ground', GROUNDS, map.ground || 'grass', (v) => { map.ground = v; }),
      sceneSel('bm-weather', 'Weather', WEATHER, map.weather || 'clear', (v) => { map.weather = v; }),
      sceneSel('bm-light', 'Time of day', LIGHTS, map.light || 'day', (v) => { map.light = v; }),
      fileIn,
      h('button', { class: 'btn sm', type: 'button', id: 'bm-picture', onClick: () => fileIn.click() }, map.bg ? 'Change picture' : 'Upload a map picture'),
      h('button', { class: 'btn sm primary', type: 'button', id: 'bm-3d', onClick: () => open3DFor(null) }, '3D view'));
    const zoom = (k) => { map.zoom = Math.max(8, Math.min(80, Math.round((map.zoom || 26) * k))); ctx.save(); redraw(); };
    const fit = () => { const w = scroller.clientWidth - 2; map.zoom = Math.max(8, Math.min(80, Math.floor(w / map.w))); ctx.save(); redraw(); };
    const row2 = h('div', { class: 'bm-row' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Tool' },
        modeBtn('move', 'Move', 'Move tokens and templates'),
        modeBtn('build', 'Build', 'Put down houses, skyscrapers, trees, cars and more'),
        modeBtn('paint', 'Paint', 'Paint walls, cover and terrain on the squares'),
        modeBtn('template', 'Template', 'Click the map to drop an area template')),
      ui.mode === 'paint' ? [
        (() => { const s = h('select', { 'aria-label': 'Paint', id: 'bm-paint' }, Object.entries(TERRAIN).map(([k, T]) => h('option', { value: k, selected: ui.paint === k }, T.label)), h('option', { value: 'erase', selected: ui.paint === 'erase' }, 'Eraser')); s.addEventListener('change', () => { ui.paint = s.value; ctx.save(); }); return s; })(),
        h('label', { class: 'bm-check' }, h('input', { type: 'checkbox', id: 'bm-box', checked: ui.box, onChange: (e) => { ui.box = e.target.checked; ctx.save(); redraw(); } }), 'Box'),
        h('button', { class: 'btn sm ghost', type: 'button', onClick: async () => { if (await openDialog({ title: 'Clear the terrain?', body: [h('p', null, 'Every painted square on this map goes.')], buttons: [{ label: 'Cancel', value: false }, { label: 'Clear it', value: true, primary: true }] })) { map.terrain = {}; persist(); redraw(); } } }, 'Clear all'),
      ] : null,
      ui.mode === 'build' ? h('span', { class: 'hint' }, 'Pick a piece on the right, then click the map.') : null,
      ui.mode === 'template' ? [
        (() => { const s = h('select', { 'aria-label': 'Area shape', id: 'bm-shape' }, SHAPES.map((x) => h('option', { value: x, selected: x === ui.shape }, x))); s.addEventListener('change', () => { ui.shape = s.value; ctx.save(); }); return s; })(),
        (() => { const s = h('select', { 'aria-label': 'Area size', id: 'bm-steps' }, [1, 2, 3, 4].map((n) => h('option', { value: n, selected: n === ui.steps }, n === 1 ? 'Area 1' : `Area ×${2 ** (n - 1)}`))); s.addEventListener('change', () => { ui.steps = Number(s.value); ctx.save(); }); return s; })(),
        h('span', { class: 'hint' }, map.sel ? 'Click where it goes (a cone or line comes from the selected token)' : 'Click where it goes'),
      ] : null,
      h('span', { class: 'spacer' }),
      h('div', { class: 'bm-zoom' },
        h('button', { class: 'btn sm ghost icon', type: 'button', 'aria-label': 'Zoom out', onClick: () => zoom(1 / 1.25) }, '−'),
        h('button', { class: 'btn sm ghost', type: 'button', onClick: fit, title: 'Fit the width' }, 'Fit'),
        h('button', { class: 'btn sm ghost icon', type: 'button', 'aria-label': 'Zoom in', onClick: () => zoom(1.25) }, '+')));
    tools.append(row1, row2, settings());
  };

  const settings = () => {
    const num = (label, value, set, attrs = {}) => { const i = h('input', { type: 'number', value, ...attrs }); i.addEventListener('change', () => { const v = Number(i.value); if (Number.isFinite(v)) { set(v); persist(); drawTools(); redraw(); } }); return h('label', { class: 'bm-num' }, label, i); };
    const scale = h('select', { 'aria-label': 'Scale', id: 'bm-scale' }, [5, 10, 25, 50, 100].map((n) => h('option', { value: n, selected: n === map.scale }, `1 square = ${n} ft`)));
    scale.addEventListener('change', () => { map.scale = Number(scale.value); for (const t of map.templates) t.ft = ftFor(t.shape, t.steps); persist(); redraw(); });
    const grid = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: map.grid, 'aria-label': 'Grid lines' });
    grid.addEventListener('input', () => { map.grid = Number(grid.value); redrawFast(); });
    grid.addEventListener('change', () => persist());
    const b = map.bg;
    return h('details', { class: 'bm-settings', open: gs.mapSettingsOpen || null, onToggle: (e) => { gs.mapSettingsOpen = e.target.open; ctx.save(); } },
      h('summary', null, 'Map size, scale, grid and picture'),
      h('div', { class: 'rc-row' },
        num('Squares across', map.w, (v) => resizeMap(map, v, map.h), { min: 5, max: 200, id: 'bm-w' }),
        num('Squares down', map.h, (v) => resizeMap(map, map.w, v), { min: 5, max: 200, id: 'bm-h' }),
        scale,
        h('label', { class: 'bm-num' }, 'Grid lines', grid)),
      b ? h('div', { class: 'rc-row' },
        h('span', { class: 'hint' }, 'Line the picture up with the grid:'),
        num('Picture width (squares)', +b.w.toFixed(2), (v) => { const k = b.h / b.w; b.w = Math.max(1, v); b.h = b.w * k; }, { step: 0.1, min: 1, id: 'bm-bgw' }),
        num('Shift right', +b.x.toFixed(2), (v) => { b.x = v; }, { step: 0.1 }),
        num('Shift down', +b.y.toFixed(2), (v) => { b.y = v; }, { step: 0.1 }),
        num('Opacity %', Math.round((b.opacity ?? 1) * 100), (v) => { b.opacity = Math.max(0.1, Math.min(1, v / 100)); }, { min: 10, max: 100, step: 5 }),
        h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { resizeMap(map, Math.ceil(b.x + b.w), Math.ceil(b.y + b.h)); persist(); drawTools(); redraw(); } }, 'Fit the map to the picture'),
        h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { const id = map.bg.img; map.bg = null; dropPicture(id); persist(); drawTools(); redraw(); } }, 'Remove the picture')) : null,
      h('div', { class: 'rc-row' },
        h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { map.tokens = {}; map.sel = null; persist(); ctx.rerender(); } }, 'Reset token positions'),
        h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { map.templates = []; map.selT = null; persist(); redraw(); } }, 'Remove all templates'),
        h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { map.props = []; map.selP = null; persist(); redraw(); } }, 'Remove all buildings')));
  };

  const dropPicture = (id) => { if (!gs.maps.some((m) => m.bg?.img === id)) { try { localStorage.removeItem(imgKey(id)); } catch { /* ignore */ } assets.delete(id); } };

  const setPicture = async (file) => {
    let pic;
    try { pic = await loadPicture(file); } catch (e) { toast(e.message); return; }
    const guess = Math.max(8, Math.min(120, Math.round(pic.ow / 70)));
    const across = h('input', { type: 'number', min: 4, max: 200, value: guess, id: 'bm-across' });
    const ok = await openDialog({
      title: 'How many squares across?',
      body: [h('img', { src: pic.data, alt: '', class: 'bm-preview' }),
        h('p', null, 'If the picture has a grid printed on it, count the squares across the top. If not, pick how big the place should be (at 10 ft a square, 30 squares is 300 ft).'),
        h('label', { class: 'bm-num' }, 'Squares across', across),
        h('p', { class: 'hint' }, `Picture: ${pic.ow} × ${pic.oh} pixels. You can fine-tune the alignment later under Map size, scale, grid and picture.`)],
      buttons: [{ label: 'Cancel', value: false }, { label: 'Put it under the grid', value: true, primary: true }],
    });
    if (!ok) return;
    const n = Math.max(4, Math.min(200, Number(across.value) || guess));
    const id = assetId(pic.data);
    try { localStorage.setItem(imgKey(id), pic.data); } catch { toast('Not enough room to save the picture in this browser.'); return; }
    assets.set(id, pic.data);
    const old = map.bg?.img;
    map.bg = { img: id, x: 0, y: 0, w: n, h: (n * pic.h) / pic.w, opacity: 1 };
    if (old && old !== id) dropPicture(old);
    resizeMap(map, n, Math.ceil(map.bg.h));
    map.zoom = Math.max(8, Math.min(60, Math.floor((scroller.clientWidth || 900) / map.w)));
    persist(); drawTools(); redraw();
    toast('Picture added. Paint walls and cover over it with Paint.');
  };

  const newMapDialog = async () => {
    const name = h('input', { type: 'text', value: `Map ${gs.maps.length + 1}`, id: 'bm-newname' });
    const w = h('input', { type: 'number', value: 36, min: 5, max: 200 }); const hh = h('input', { type: 'number', value: 22, min: 5, max: 200 });
    const copy = h('input', { type: 'checkbox', checked: true });
    const ok = await openDialog({ title: 'A new map', body: [h('label', { class: 'field' }, h('span', null, 'Name'), name), h('div', { class: 'rc-row' }, h('label', { class: 'bm-num' }, 'Squares across', w), h('label', { class: 'bm-num' }, 'Squares down', hh)), h('label', { class: 'bm-check' }, copy, 'Bring the tokens from this map')], buttons: [{ label: 'Cancel', value: false }, { label: 'Make it', value: true, primary: true }] });
    if (!ok) return;
    const m = newMap(name.value.trim() || 'Map', { scale: map.scale });
    resizeMap(m, Number(w.value) || 36, Number(hh.value) || 22);
    if (copy.checked) for (const [k, t] of Object.entries(map.tokens)) if (t.x < m.w && t.y < m.h) m.tokens[k] = { ...t };
    gs.maps.push(m);
    switchMap(m.id);
  };
  const renameMap = async () => {
    const name = h('input', { type: 'text', value: map.name || '' });
    if (await openDialog({ title: 'Rename the map', body: [name], buttons: [{ label: 'Cancel', value: false }, { label: 'Rename', value: true, primary: true }] })) { map.name = name.value.trim() || map.name; persist(); drawTools(); redraw(); }
  };
  const deleteMap = async () => {
    if (!await openDialog({ title: `Delete ${map.name}?`, body: [h('p', null, 'The map, its terrain and token positions go. This can\'t be undone.')], buttons: [{ label: 'Cancel', value: false }, { label: 'Delete it', value: true, primary: true }] })) return;
    gs.maps = gs.maps.filter((m) => m !== map);
    if (map.bg?.img) dropPicture(map.bg.img);
    switchMap(gs.maps[0].id);
  };

  const open3DFor = (focus) => open3D({ map, tokens: tokenView(), bg: bgUrl(map), focus, gm: true });

  drawTools();
  redraw();
  if (!map.fitted) requestAnimationFrame(() => { if (!scroller.isConnected || !scroller.clientWidth) return; map.fitted = true; map.zoom = Math.max(8, Math.min(60, Math.floor((scroller.clientWidth - 2) / map.w))); ctx.save(); redraw(); });
  broadcast(map, people, portraitFor);
  return h('div', { class: 'bm' }, tools, h('div', { class: 'bm-layout' }, scroller, side),
    h('p', { class: 'hint' }, lobby.status === 'on' && lobby.role === 'host' ? 'Your players see this map in their Play view (not hidden tokens) and can move their own token.' : 'Open a table and your players see this map in their Play view.'));
}

/** What the weather and the light do at the table, as a reminder. */
function moodHints(map) {
  const lines = [WEATHER[map.weather]?.hint, LIGHTS[map.light]?.hint].filter(Boolean);
  return lines.length ? h('div', { class: 'bm-mood' }, lines.map((l) => h('p', null, l))) : null;
}

// ---- players: the GM's map in the Play view ------------------------------------------------------------------
let shared = null;
let onShared = null;
const asked = new Set();
function askForPictures(map) {
  const want = [map.bg?.img, ...Object.values(map.tokens || {}).map((t) => t.img)].filter((id) => id && !assets.has(id) && !asked.has(id));
  if (!want.length) return;
  want.forEach((id) => asked.add(id));
  lobbySend({ t: 'map-assets', ids: want });
}
export function receiveMapFromHost(map) { shared = { ...map, zoom: shared?.id === map.id ? shared.zoom : null }; askForPictures(map); onShared?.(); }
export function receiveMapAsset(id, data) {  if (id && typeof data === 'string' && /^data:image\//.test(data)) { assets.set(id, data); onShared?.(); } }
export function onSharedMap(fn) { onShared = fn; }
export function sharedMapView(myKeys = []) {
  if (!shared) return null;
  const map = { ...shared, zoom: shared.zoom || 18 };
  const mine = myKeys.find((k) => map.tokens?.[k]) || null;
  const tokens = Object.entries(map.tokens || {}).map(([key, t]) => ({ key, ...t, img: t.img ? assets.get(t.img) : null, mine: key === mine }));
  const positions = Object.fromEntries(tokens.map((t) => [t.key, t]));
  const caught = new Set((map.templates || []).flatMap((t) => insideTemplate(t, positions, map.scale)));
  const scroller = h('div', { class: 'bm-scroll bm-scroll-play' });
  const draw = () => {
    clear(scroller);
    const el = drawMap({ map, tokens, bg: map.bg?.img ? assets.get(map.bg.img) : null, sel: mine, caught });
    if (mine) {
      el.addEventListener('pointerdown', (e) => {
        if (!e.target.closest(`[data-key="${CSS.escape(mine)}"]`)) return;
        e.preventDefault();
        const t = positions[mine]; const s = sizeOf(t);
        const q = toSquares(el, map, e); const off = { x: q.x - t.x, y: q.y - t.y };
        try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
        const g = el.querySelector(`[data-key="${CSS.escape(mine)}"]`);
        const mv = (ev) => { const p = toSquares(el, map, ev); t.x = Math.max(0, Math.min(map.w - s, Math.round(p.x - off.x))); t.y = Math.max(0, Math.min(map.h - s, Math.round(p.y - off.y))); const c = centerOf(t); g.setAttribute('transform', `translate(${c.x * CELL} ${c.y * CELL})`); };
        const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); shared.tokens[mine] = { ...shared.tokens[mine], x: t.x, y: t.y }; lobbySend({ t: 'map-move', mapId: map.id, key: mine, x: t.x, y: t.y }); };
        el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
      });
    }
    scroller.append(el);
  };
  draw();
  const zoom = (k) => { shared.zoom = Math.max(8, Math.min(60, Math.round(map.zoom * k))); map.zoom = shared.zoom; draw(); };
  return h('section', { class: 'play-card bm-play' },
    h('div', { class: 'bm-row' }, h('h3', null, `${map.name || 'The map'}`), h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm ghost icon', type: 'button', 'aria-label': 'Zoom out', onClick: () => zoom(1 / 1.25) }, '−'),
      h('button', { class: 'btn sm ghost icon', type: 'button', 'aria-label': 'Zoom in', onClick: () => zoom(1.25) }, '+'),
      h('button', { class: 'btn sm primary', type: 'button', id: 'bm-play-3d', onClick: () => open3D({ map, tokens, bg: map.bg?.img ? assets.get(map.bg.img) : null, focus: mine }) }, '3D')),
    scroller,
    moodHints(map),
    h('p', { class: 'hint' }, `1 square = ${map.scale} ft.${mine ? ' Drag your token to move; the GM sees it.' : ' The GM moves the tokens.'}`));
}
