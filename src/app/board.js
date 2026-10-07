// The evidence board: the World as a detective's corkboard. Pages are pinned as Polaroids and index
// cards, ties between them are red string, sticky notes hold the GM's theories, clippings come from
// the newsstand. Drag anything; positions live in the vault and travel with world keys.

import { h, clear, toast, openDialog } from './dom.js';
import { RELATIONS, ENTITY_TYPES, searchWorld } from '../engine/world.js';
import { portraitOf } from '../engine/portrait.js';

const W = 1600; const H = 1000;
const NOTE_COLORS = ['#fff59d', '#ffcc80', '#f8bbd0', '#c5e1a5', '#b3e5fc'];
const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const hashRot = (id) => ((id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 9) - 4);

function boardOf(saved) {
  if (!saved.board) saved.board = { items: {}, notes: [], strings: [] };
  saved.board.items = saved.board.items || {}; saved.board.notes = saved.board.notes || []; saved.board.strings = saved.board.strings || [];
  return saved.board;
}

function pin(board, id, { x = null, y = null } = {}) {
  if (board.items[id]) return;
  const n = Object.keys(board.items).length;
  board.items[id] = { x: x ?? 80 + (n % 6) * 240 + Math.random() * 30, y: y ?? 60 + Math.floor(n / 6) * 260 + Math.random() * 30, rot: hashRot(id) };
}

/** Pin a page from anywhere (an entity page's button). */
export function pinToBoard(saved, id) { pin(boardOf(saved), id); }

export function boardPage(ctx) {
  const { world, saved, save, go } = ctx;
  const board = boardOf(saved);
  const pinned = Object.keys(board.items).filter((id) => world.entities.has(id));
  const ents = pinned.map((id) => world.entities.get(id));
  const ties = world.links.filter((l) => board.items[l.from] && board.items[l.to] && !l.until);
  const stage = h('div', { class: 'eb-stage', style: { width: `${W}px`, height: `${H}px` } });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'eb-strings'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
  const items = new Map();

  const center = (id) => { const el = items.get(id); const p = board.items[id] || (id.startsWith('n') ? board.notes.find((n) => n.id === id) : null); if (!el || !p) return null; return { x: p.x + el.offsetWidth / 2, y: p.y + el.offsetHeight / 2 }; };
  const drawStrings = () => {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const line = (a, b, color, label, dashed = false) => {
      const A = center(a); const B = center(b); if (!A || !B) return;
      const mx = (A.x + B.x) / 2; const my = (A.y + B.y) / 2 + 18;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${A.x},${A.y} Q${mx},${my} ${B.x},${B.y}`); path.setAttribute('stroke', color); path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '2.2'); if (dashed) path.setAttribute('stroke-dasharray', '6 5');
      svg.append(path);
      if (label) { const t = document.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('x', mx); t.setAttribute('y', my - 4); t.setAttribute('class', 'eb-string-label'); t.setAttribute('text-anchor', 'middle'); t.textContent = label; svg.append(t); }
      for (const P of [A, B]) { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', P.x); c.setAttribute('cy', P.y); c.setAttribute('r', '5'); c.setAttribute('class', 'eb-pin'); svg.append(c); }
    };
    for (const l of ties) line(l.from, l.to, '#c62828', RELATIONS[l.rel]?.label?.toLowerCase() || '');
    for (const s of board.strings) line(s.a, s.b, '#1565c0', s.text || '', true);
  };

  const drag = (el, pos, onEnd) => {
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, textarea, input')) return;
      e.preventDefault();
      const sx = e.clientX; const sy = e.clientY; const ox = pos.x; const oy = pos.y;
      const scale = stage.getBoundingClientRect().width / W || 1;
      el.setPointerCapture(e.pointerId); el.classList.add('dragging');
      const move = (ev) => { pos.x = Math.max(0, Math.min(W - 60, ox + (ev.clientX - sx) / scale)); pos.y = Math.max(0, Math.min(H - 40, oy + (ev.clientY - sy) / scale)); el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`; drawStrings(); };
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.classList.remove('dragging'); onEnd?.(); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    });
  };

  const unpin = (id) => { delete board.items[id]; board.strings = board.strings.filter((s) => s.a !== id && s.b !== id); save(); ctx.renderWorld(); };
  const cardFor = (e) => {
    const pos = board.items[e.id];
    const ch = e.character;
    const por = ch ? portraitOf(ch) : null;
    const img = por && !por.hidden ? h('img', { src: (por.source === 'upload' && por.image) || por.avatar, alt: '' }) : null;
    const meta = ENTITY_TYPES[e.type] || { glyph: '✦', color: '#888' };
    let el;
    if (e.type === 'person') el = h('div', { class: 'eb-item eb-polaroid' }, h('div', { class: 'eb-photo', style: { '--c': e.color || meta.color } }, img || h('span', { class: 'eb-initials' }, e.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())), h('div', { class: 'eb-caption' }, e.name), e.status && e.status !== 'Active' ? h('div', { class: 'eb-status' }, e.status) : null);
    else if (e.type === 'paper' && e.paper) el = h('div', { class: 'eb-item eb-clipping' }, h('div', { class: 'eb-clip-mast' }, e.paper.masthead), h('div', { class: 'eb-clip-head' }, (e.paper.stories?.[0]?.headline) || e.name), h('div', { class: 'eb-clip-text' }, e.paper.stories?.[0]?.deck || e.summary || ''));
    else if (e.type === 'handout' && e.handout) el = h('div', { class: 'eb-item eb-doc' }, h('div', { class: 'eb-doc-kind' }, (e.fields?.Kind || 'Handout').toUpperCase()), h('div', { class: 'eb-doc-title' }, e.handout.title || e.name), h('div', { class: 'eb-clip-text' }, e.summary || ''));
    else el = h('div', { class: 'eb-item eb-card', style: { '--c': e.color || meta.color } }, h('div', { class: 'eb-card-type' }, `${meta.glyph} ${(ENTITY_TYPES[e.type]?.one || e.type).toUpperCase()}`), h('div', { class: 'eb-card-name' }, e.name), e.summary ? h('div', { class: 'eb-clip-text' }, String(e.summary).split(/(?<=[.!?])\s/)[0]) : null);
    el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`; el.style.setProperty('--rot', `${pos.rot || 0}deg`);
    el.append(h('div', { class: 'eb-tools no-print' }, h('button', { type: 'button', class: 'eb-tool', title: 'Open the page', onClick: () => go(e.id) }, '↗'), h('button', { type: 'button', class: 'eb-tool', title: 'Take it down', onClick: () => unpin(e.id) }, '✕')));
    el.append(h('span', { class: 'eb-pushpin' }));
    drag(el, pos, save);
    items.set(e.id, el);
    return el;
  };
  const noteEl = (n) => {
    const el = h('div', { class: 'eb-item eb-note', style: { left: `${n.x}px`, top: `${n.y}px`, '--rot': `${n.rot || 0}deg`, background: n.color || NOTE_COLORS[0] } },
      h('textarea', { 'aria-label': 'Sticky note', rows: 4, onInput: (ev) => { n.text = ev.target.value; }, onChange: () => save() }, n.text || ''),
      h('div', { class: 'eb-tools no-print' }, h('button', { type: 'button', class: 'eb-tool', title: 'Colour', onClick: () => { n.color = NOTE_COLORS[(NOTE_COLORS.indexOf(n.color || NOTE_COLORS[0]) + 1) % NOTE_COLORS.length]; el.style.background = n.color; save(); } }, '◐'), h('button', { type: 'button', class: 'eb-tool', title: 'Tear it off', onClick: () => { board.notes = board.notes.filter((x) => x !== n); board.strings = board.strings.filter((s) => s.a !== n.id && s.b !== n.id); save(); ctx.renderWorld(); } }, '✕')),
      h('span', { class: 'eb-tape' }));
    drag(el, n, save);
    items.set(n.id, el);
    return el;
  };
  stage.append(svg, ...ents.map(cardFor), ...board.notes.map(noteEl));
  requestAnimationFrame(drawStrings);

  const pinDialog = async () => {
    const q = h('input', { type: 'search', placeholder: 'Search pages…', 'aria-label': 'Search' });
    const results = h('div', { class: 'wd-results', style: { maxHeight: '260px', overflow: 'auto' } });
    const draw = () => { clear(results); const found = q.value.trim() ? searchWorld(world, q.value, { limit: 20 }) : [...world.entities.values()].filter((e) => e.character).slice(0, 20); for (const e of found) if (!board.items[e.id]) results.append(h('button', { type: 'button', class: 'wd-link', onClick: () => { pin(board, e.id); save(); ctx.renderWorld(); } }, h('span', { class: 'wd-glyph', style: { background: e.color || ENTITY_TYPES[e.type]?.color } }, ENTITY_TYPES[e.type]?.glyph || '✦'), e.name, h('small', null, ` ${ENTITY_TYPES[e.type]?.one || e.type}`))); };
    q.addEventListener('input', draw); draw();
    await openDialog({ title: 'Pin a page to the board', body: [q, results, h('p', { class: 'hint', style: { margin: 0 } }, 'Click a page to pin it. Ties between pinned pages appear as red string.')], buttons: [{ label: 'Done', value: null }] });
  };
  const stringDialog = async () => {
    const opts = [...pinned.map((id) => [id, world.entities.get(id).name]), ...board.notes.map((n) => [n.id, `Note: ${(n.text || '').slice(0, 30) || 'blank'}`])];
    if (opts.length < 2) { toast('Pin two things first.'); return; }
    const a = h('select', null, opts.map(([id, name]) => h('option', { value: id }, name)));
    const b = h('select', null, opts.map(([id, name], i) => h('option', { value: id, selected: i === 1 }, name)));
    const t = h('input', { type: 'text', placeholder: 'What the string means (optional)' });
    const ok = await openDialog({ title: 'Run a string', body: [h('label', { class: 'field' }, h('span', null, 'From'), a), h('label', { class: 'field' }, h('span', null, 'To'), b), h('label', { class: 'field' }, h('span', null, 'Label'), t)], buttons: [{ label: 'Cancel', value: false }, { label: 'Pin it', value: true, primary: true }] });
    if (!ok || a.value === b.value) return;
    board.strings.push({ a: a.value, b: b.value, text: t.value.trim() }); save(); ctx.renderWorld();
  };
  const pinCast = () => { let n = 0; for (const e of world.entities.values()) if (e.character && !board.items[e.id]) { pin(board, e.id); n++; } save(); ctx.renderWorld(); toast(n ? `${n} pinned` : 'Everyone from the roster is already up'); };
  const shuffle = () => { let i = 0; for (const id of Object.keys(board.items)) { board.items[id] = { x: 80 + (i % 6) * 245, y: 60 + Math.floor(i / 6) * 270, rot: hashRot(id) }; i++; } save(); ctx.renderWorld(); };
  const clearBoard = async () => { const ok = await openDialog({ title: 'Clear the board?', body: h('p', { style: { margin: 0 } }, 'Everything comes down: pins, notes and strings. The pages themselves are untouched.'), buttons: [{ label: 'Keep', value: false }, { label: 'Clear', value: true, danger: true }] }); if (ok) { saved.board = { items: {}, notes: [], strings: [] }; save(); ctx.renderWorld(); } };
  const print = () => { document.body.classList.add('eb-printing'); const finish = () => document.body.classList.remove('eb-printing'); window.addEventListener('afterprint', finish, { once: true }); setTimeout(() => { window.print(); setTimeout(finish, 500); }, 60); };

  return h('div', { class: 'wd-page eb-page' },
    h('header', { class: 'wd-hero small eb-hero' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Evidence board'), h('h1', null, 'What do we know?'), h('p', { class: 'wd-tagline' }, `${pinned.length} pinned, ${ties.length} ties as red string, ${board.notes.length} notes. Drag anything. Pin people, factions, places, front pages and handouts; the ties between them show up by themselves.`))),
    h('div', { class: 'toolbar wd-actions no-print' },
      h('button', { class: 'btn primary', type: 'button', onClick: pinDialog }, '📌 Pin a page'),
      h('button', { class: 'btn', type: 'button', onClick: pinCast }, '🧑 Pin the roster'),
      h('button', { class: 'btn', type: 'button', onClick: () => { board.notes.push({ id: newId(), x: 60 + Math.random() * 300, y: 60 + Math.random() * 200, rot: Math.round(Math.random() * 8 - 4), text: '', color: NOTE_COLORS[board.notes.length % NOTE_COLORS.length] }); save(); ctx.renderWorld(); } }, '🗒 Sticky note'),
      h('button', { class: 'btn', type: 'button', onClick: stringDialog }, '🧵 Run a string'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost', type: 'button', onClick: shuffle }, 'Tidy'),
      h('button', { class: 'btn ghost', type: 'button', onClick: print }, '🖨 Print'),
      h('button', { class: 'btn ghost danger', type: 'button', onClick: clearBoard }, 'Clear')),
    pinned.length || board.notes.length ? h('div', { class: 'eb-wrap' }, stage) : h('div', { class: 'empty' }, h('h2', null, 'An empty corkboard'), h('p', null, 'Pin the roster to start, then add notes and run strings between what the players suspect.')));
}
