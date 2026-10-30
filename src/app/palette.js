// Jump-anywhere search: Ctrl+K (Cmd+K on a Mac), or the Search button in the top bar. One box for every section, the things
// you do most, every character, every World page, every rule and every creature. Arrow keys and Enter.

import { h, clear } from './dom.js';
import { rankItems, starterItems, groupByKind } from '../engine/palette.js';

let provider = () => [];
let layer = null;

/** items() returns everything searchable: [{ id, label, kind, hint, words, weight, run }]. */
export function initPalette(items) {
  provider = items;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); if (layer) closePalette(); else openPalette(); }
  });
  const btn = h('button', { class: 'icon-btn palette-btn', type: 'button', id: 'palette-btn', title: 'Search everything (Ctrl+K)', 'aria-label': 'Search everything', onClick: () => openPalette() }, 'Search');
  document.getElementById('theme-toggle').before(btn);
}

export function closePalette() {
  if (!layer) return;
  const l = layer; layer = null;
  l.remove();
}

export function openPalette(initial = '') {
  if (layer) { layer.querySelector('input')?.focus(); return; }
  let all = [];
  try { all = provider(); } catch { all = []; }
  let shown = [];
  let at = 0;
  const input = h('input', { type: 'search', id: 'palette-q', placeholder: 'Search characters, pages, rules, creatures, or what to do…', 'aria-label': 'Search everything', autocomplete: 'off', value: initial, role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list' });
  const list = h('ul', { class: 'palette-list', id: 'palette-list', role: 'listbox' });
  const run = (it) => { closePalette(); try { it.run(); } catch (err) { console.error(err); } };
  const draw = () => {
    const q = input.value.trim();
    shown = q ? groupByKind(rankItems(all, q, { limit: 40 })) : starterItems(all);
    at = Math.min(at, Math.max(0, shown.length - 1));
    clear(list);
    if (!shown.length) { list.append(h('li', { class: 'palette-none' }, 'Nothing matches. Try fewer letters.')); return; }
    let lastKind = null;
    shown.forEach((it, i) => {
      if (it.kind !== lastKind) { list.append(h('li', { class: 'palette-kind', role: 'presentation' }, it.kind)); lastKind = it.kind; }
      list.append(h('li', { class: `palette-item ${i === at ? 'on' : ''}`, role: 'option', id: `palette-${i}`, 'aria-selected': String(i === at),
        onMousemove: () => { if (at !== i) { at = i; mark(); } }, onClick: () => run(it) },
        h('span', { class: 'palette-label' }, it.label),
        it.hint ? h('small', null, it.hint) : null));
    });
    mark();
  };
  const mark = () => {
    list.querySelectorAll('.palette-item').forEach((el, i) => { el.classList.toggle('on', i === at); el.setAttribute('aria-selected', String(i === at)); });
    const on = list.querySelector('.palette-item.on');
    input.setAttribute('aria-activedescendant', on?.id || '');
    on?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { at = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) run(shown[at]); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
  layer = h('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search everything', onMousedown: (e) => { if (e.target === layer) closePalette(); } },
    h('div', { class: 'palette-box' }, input, list, h('div', { class: 'palette-foot' }, h('span', null, 'Up and Down to move · Enter to open · Esc to close'), h('span', null, 'Ctrl+K anywhere'))));
  document.body.append(layer);
  draw();
  input.focus();
}
