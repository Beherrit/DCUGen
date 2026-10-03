// The portrait block on the case file, the Bio page and the World.
//
// AI portraits come from a free service that allows about one image every 15 seconds without an
// account, so they load one at a time through a small queue, retry after a wait, and fall back
// to the built-in comic art while they wait or if the service refuses.

import { h, toast, copyText, openDialog } from './dom.js';
import { portraitOf, setPortrait, newPortraitSeed, portraitPrompt, PORTRAIT_SERVICE, PORTRAIT_SOURCES } from '../engine/portrait.js';

const CREDIT = `AI portraits come from ${PORTRAIT_SERVICE.name}: free and open source, no account. Only the prompt is sent; the image lives in your browser's cache. The free tier allows ${PORTRAIT_SERVICE.limit}, so portraits load one at a time. Built-in comic art is drawn by the app itself and works offline.`;

// ---- one-at-a-time loader ----------------------------------------------------------------------------
const okUrls = new Set();
const badUrls = new Map(); // url -> tries
const queue = [];
let busy = false;
let lastRequest = 0;
const GAP = 15500;

function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  if (!job.img.isConnected) { pump(); return; }
  busy = true;
  const run = () => {
    lastRequest = Date.now();
    const done = (ok) => {
      busy = false;
      if (ok) okUrls.add(job.url); else badUrls.set(job.url, (badUrls.get(job.url) || 0) + 1);
      job.onDone?.(ok);
      setTimeout(pump, ok ? 50 : 500);
    };
    job.img.onload = () => done(true);
    job.img.onerror = () => done(false);
    job.img.src = job.url;
  };
  const wait = okUrls.has(job.url) ? 0 : Math.max(0, lastRequest + GAP - Date.now());
  job.onWait?.(wait);
  setTimeout(run, wait);
}

/** Load an AI portrait into an <img> politely. Resolves true/false. */
function loadAi(img, url, { onWait } = {}) {
  return new Promise((resolve) => {
    if (okUrls.has(url)) { img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = url; return; }
    queue.push({ img, url, onWait, onDone: resolve });
    pump();
  });
}

/**
 * change(fn): clone, apply, save. Omit it for a read-only portrait.
 * size: 'file' (case file header) | 'small' (cards)
 */
export function portraitBlock(ch, { change, size = 'file' } = {}) {
  const p = portraitOf(ch);
  if (p.hidden && !change) return null;
  const img = h('img', { class: 'portrait-img', alt: `Portrait of ${ch.identity?.codename || 'the character'}`, width: 400, height: 500, referrerpolicy: 'no-referrer' });
  const status = h('div', { class: 'portrait-status', hidden: true });
  const frame = h('div', { class: 'portrait-frame' }, img, status);
  let retries = 0;
  const showBuiltin = (note) => { img.src = p.avatar; frame.classList.add('builtin'); if (note) { status.textContent = note; status.hidden = false; } else status.hidden = true; };
  const tryAi = async () => {
    const ok = await loadAi(img, p.url, { onWait: (ms) => { status.textContent = ms > 800 ? `AI portrait in ${Math.ceil(ms / 1000)}s…` : 'Painting…'; status.hidden = false; } });
    if (ok) { status.hidden = true; frame.classList.remove('builtin'); return; }
    if (retries < 2) { retries++; showBuiltin(`The free service refused this one (busy or rate-limited). Retrying in 15s… (${retries}/2)`); setTimeout(tryAi, GAP); return; }
    showBuiltin('AI portrait unavailable right now. Showing built-in art; re-roll to try again.');
  };
  if (!p.hidden) { if (p.source === 'builtin') showBuiltin(); else { showBuiltin('Painting…'); tryAi(); } }

  const settings = async () => {
    const ta = h('textarea', { style: { minHeight: '120px' } }, p.prompt);
    const src = h('select', null, Object.entries(PORTRAIT_SOURCES).map(([k, v]) => h('option', { value: k, selected: k === p.source }, v)));
    const ok = await openDialog({
      title: 'Portrait',
      body: [
        h('label', { class: 'field' }, h('span', null, 'Source'), src),
        h('label', { class: 'field' }, h('span', null, 'Prompt (for the AI painting; built from the sheet, the looks and the bio)'), ta),
        h('p', { class: 'hint', style: { margin: 0 } }, CREDIT),
      ],
      buttons: [{ label: 'Cancel', value: null }, { label: 'Reset prompt', value: 'reset' }, { label: 'Save', value: 'save', primary: true }],
    });
    if (ok === 'save') change((c) => setPortrait(c, { prompt: ta.value.trim(), source: src.value, seed: ta.value.trim() !== p.prompt ? newPortraitSeed() : undefined }));
    if (ok === 'reset') change((c) => setPortrait(c, { prompt: '', source: src.value, seed: newPortraitSeed() }));
  };
  const controls = change ? h('div', { class: 'portrait-tools no-print' },
    p.hidden
      ? h('button', { class: 'btn sm', type: 'button', title: CREDIT, onClick: () => change((c) => setPortrait(c, { hidden: false, seed: c.portrait?.seed ?? newPortraitSeed() })) }, '🖼 Portrait')
      : [
        h('button', { class: 'btn sm', type: 'button', title: 'Same prompt, new dice', onClick: () => change((c) => setPortrait(c, { seed: newPortraitSeed() })) }, '🎲 Re-roll'),
        h('button', { class: 'btn sm', type: 'button', title: 'Source and prompt', onClick: settings }, p.source === 'builtin' ? 'Built-in art' : p.custom ? 'AI · edited prompt' : 'AI prompt'),
        h('button', { class: 'btn sm ghost', type: 'button', title: 'Copy the prompt to use in any other image tool', onClick: async () => toast((await copyText(p.prompt)) ? 'Prompt copied' : 'Copy failed') }, 'Copy'),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Hide the portrait', title: 'Hide the portrait', onClick: () => change((c) => setPortrait(c, { hidden: true })) }, '✕'),
      ]) : null;
  if (p.hidden) return h('div', { class: `portrait ${size} hidden` }, controls);
  return h('div', { class: `portrait ${size}`, title: p.prompt }, frame, controls);
}

/** A small, read-only portrait image (World pages): the AI picture if it is already cached, else the built-in art. */
export function portraitImg(ch, { alt = '' } = {}) {
  const p = portraitOf(ch);
  if (p.hidden) return null;
  const img = h('img', { alt, loading: 'lazy', referrerpolicy: 'no-referrer' });
  if (p.source === 'ai' && okUrls.has(p.url)) img.src = p.url;
  else img.src = p.avatar;
  return img;
}

export { portraitPrompt };
