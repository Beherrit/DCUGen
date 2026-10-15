// Easier reading: bigger text, colour-coded powers and advantages (name, how it works, what it does), an
// easy-to-read font and stronger contrast. A per-device choice, from "Aa" in the top bar.

import { h, openDialog } from './dom.js';

const KEY = 'dcugen.read';
export const SIZES = { normal: ['Normal', 1], large: ['Large', 1.15], xl: ['Extra large', 1.3], xxl: ['Huge', 1.5] };
const DEFAULTS = { size: 'normal', color: true, font: false, contrast: false };

export function readingPrefs() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || 'null') || {}) }; } catch { return { ...DEFAULTS }; }
}

export function applyReading(p = readingPrefs()) {
  const root = document.documentElement;
  const z = SIZES[p.size]?.[1] || 1;
  root.style.setProperty('--read-zoom', String(z));
  root.classList.toggle('read-zoom', z !== 1);
  root.classList.toggle('read-color', !!p.color);
  root.classList.toggle('read-font', !!p.font);
  root.classList.toggle('read-contrast', !!p.contrast);
}

function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } applyReading(p); }

export async function readingDialog() {
  const p = readingPrefs();
  const sizeRow = h('div', { class: 'seg read-sizes', role: 'group', 'aria-label': 'Text size' },
    Object.entries(SIZES).map(([k, [label, z]]) => h('button', { type: 'button', 'aria-pressed': String(p.size === k), 'data-size': k, style: { fontSize: `${Math.round(14 * z)}px` }, onClick: (e) => {
      p.size = k; save(p);
      for (const b of e.target.parentElement.children) b.setAttribute('aria-pressed', String(b === e.target));
    } }, label)));
  const toggle = (key, label, hint) => h('label', { class: 'read-toggle' },
    h('input', { type: 'checkbox', id: `read-${key}`, checked: !!p[key], onChange: (e) => { p[key] = e.target.checked; save(p); } }),
    h('span', null, h('b', null, label), h('small', null, hint)));
  await openDialog({
    title: 'Easier reading',
    body: [
      h('div', { class: 'label' }, 'Text size'), sizeRow,
      toggle('color', 'Colour-coded powers and advantages', 'The name in red, how it works in blue, what it does in green, each in its own type.'),
      h('div', { class: 'read-sample' },
        h('span', { class: 'power-name' }, 'Flame Blast'),
        h('div', { class: 'power-text' }, 'Ranged Damage 10, resisted by Toughness (DC 25)'),
        h('div', { class: 'power-about' }, 'A jet of fire that sets the target alight.')),
      toggle('font', 'Easy-read font', 'Atkinson Hyperlegible, made for low vision: letters that are hard to mix up.'),
      toggle('contrast', 'Stronger contrast', 'Darker grey text and clearer borders.'),
      h('p', { class: 'hint', style: { margin: 0 } }, 'These stay on this device. Ctrl and + also zoom the whole page in your browser.'),
    ],
    buttons: [{ label: 'Done', value: true, primary: true }],
  });
}

/** The "Aa" button in the top bar. */
export function initReading() {
  applyReading();
  const btn = h('button', { class: 'icon-btn read-btn', type: 'button', id: 'read-btn', title: 'Easier reading: text size, colours, font', 'aria-label': 'Easier reading', onClick: () => readingDialog() }, 'Aa');
  document.getElementById('theme-toggle').before(btn);
}
