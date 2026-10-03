// The portrait block on the case file, the Bio page and the World.
//
// Three sources: an AI painting from a free service (about one image every 15 seconds without an
// account, so they load one at a time through a queue and keep retrying while the built-in art
// stands in), the built-in comic art drawn by the app, or a picture you upload yourself.

import { h, toast, copyText, openDialog } from './dom.js';
import { portraitOf, setPortrait, clearPortrait, newPortraitSeed, portraitPrompt, PORTRAIT_SERVICE, PORTRAIT_SOURCES } from '../engine/portrait.js';

const CREDIT = `AI portraits come from ${PORTRAIT_SERVICE.name}: free and open source, no account. Only the prompt is sent; the image lives in your browser's cache. The free tier allows ${PORTRAIT_SERVICE.limit}, so portraits load one at a time and keep trying while the built-in art stands in. Built-in comic art is drawn by the app itself and works offline.`;
const MAX_TRIES = 40;

// ---- one-at-a-time loader ----------------------------------------------------------------------------
const okUrls = new Set();
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
    if (!job.img.isConnected) { busy = false; pump(); return; }
    lastRequest = Date.now();
    const done = (ok) => {
      busy = false;
      if (ok) okUrls.add(job.url);
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

export function aiPortraitReady(url) { return okUrls.has(url); }

// ---- uploads and PNG rendering -----------------------------------------------------------------------

/** Read a picture the user chose, scaled to the portrait size, as a JPEG data URL. */
export function readPictureFile(file, { width = 400, height = 500 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
        const w = img.naturalWidth * scale; const hh = img.naturalHeight * scale;
        ctx.drawImage(img, (width - w) / 2, (height - hh) / 2, w, hh);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture the browser can read.')); };
    img.src = url;
  });
}

function drawToPng(src, { width = 400, height = 500, crossOrigin = false } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
        const w = img.naturalWidth * scale; const hh = img.naturalHeight * scale;
        ctx.drawImage(img, (width - w) / 2, (height - hh) / 2, w, hh);
        canvas.toBlob((blob) => (blob ? blob.arrayBuffer().then((b) => resolve(new Uint8Array(b))) : reject(new Error('no blob'))), 'image/png');
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('image failed'));
    img.src = src;
  });
}

/** The portrait as PNG bytes for exports: the uploaded picture, the AI painting if it is available, else the built-in art. */
export async function portraitPng(ch) {
  const p = portraitOf(ch);
  if (p.hidden) return null;
  if (p.source === 'upload' && p.image) { try { return await drawToPng(p.image); } catch { /* fall through */ } }
  if (p.source === 'ai') { try { return await drawToPng(p.url, { crossOrigin: true }); } catch { /* the service refused or blocked the canvas: use the built-in art */ } }
  try { return await drawToPng(p.avatar); } catch { return null; }
}

// ---- the block ----------------------------------------------------------------------------------------

/**
 * change(fn): clone, apply, save. Omit it for a read-only portrait.
 */
export function portraitBlock(ch, { change, size = 'file' } = {}) {
  const p = portraitOf(ch);
  if (p.hidden && !change) return null;
  const img = h('img', { class: 'portrait-img', alt: `Portrait of ${ch.identity?.codename || 'the character'}`, width: 400, height: 500, referrerpolicy: 'no-referrer' });
  const status = h('div', { class: 'portrait-status', hidden: true });
  const frame = h('div', { class: 'portrait-frame' }, img, status);
  let tries = 0;
  const showBuiltin = (note) => { img.src = p.avatar; frame.classList.add('builtin'); if (note) { status.textContent = note; status.hidden = false; } else status.hidden = true; };
  const tryAi = async () => {
    if (!frame.isConnected && tries > 0) return;
    const ok = await loadAi(img, p.url, { onWait: (ms) => { status.textContent = ms > 800 ? `AI portrait in ${Math.ceil(ms / 1000)}s…` : 'Painting…'; status.hidden = false; } });
    if (ok) { status.hidden = true; frame.classList.remove('builtin'); return; }
    tries++;
    if (tries < MAX_TRIES && frame.isConnected) { showBuiltin(`The free service is busy; trying again in 15s (${tries})…`); setTimeout(tryAi, GAP); return; }
    showBuiltin('AI portrait unavailable right now. Showing built-in art; re-roll to try again.');
  };
  if (!p.hidden) {
    if (p.source === 'upload') { img.src = p.image; frame.classList.add('builtin'); }
    else if (p.source === 'builtin') showBuiltin();
    else { showBuiltin('Painting…'); tryAi(); }
  }

  const settings = async () => {
    const ta = h('textarea', { style: { minHeight: '120px' } }, p.prompt);
    const src = h('select', null, Object.entries(PORTRAIT_SOURCES).filter(([k]) => k !== 'upload' || p.image).map(([k, v]) => h('option', { value: k, selected: k === p.source }, v)));
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
  const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { const data = await readPictureFile(f); change((c) => setPortrait(c, { image: data, hidden: false })); toast('Your picture is on the sheet'); } catch (err) { toast(err.message); }
  } });
  const controls = change ? h('div', { class: 'portrait-tools no-print' },
    p.hidden
      ? [h('button', { class: 'btn sm', type: 'button', title: CREDIT, onClick: () => change((c) => setPortrait(c, { hidden: false, seed: c.portrait?.seed ?? newPortraitSeed(), source: 'ai' })) }, '🖼 New portrait'),
        h('button', { class: 'btn sm', type: 'button', title: 'Use a picture of your own', onClick: () => fileIn.click() }, 'Upload…'), fileIn]
      : [
        h('button', { class: 'btn sm', type: 'button', title: p.source === 'upload' ? 'Replace your picture with a new AI portrait' : 'Same prompt, new dice', onClick: () => change((c) => setPortrait(c, { seed: newPortraitSeed(), source: 'ai', image: null })) }, '🎲 New portrait'),
        h('button', { class: 'btn sm', type: 'button', title: 'Use a picture of your own', onClick: () => fileIn.click() }, 'Upload…'),
        h('button', { class: 'btn sm', type: 'button', title: 'Source and prompt', onClick: settings }, p.source === 'upload' ? 'Your picture' : p.source === 'builtin' ? 'Built-in art' : p.custom ? 'AI · edited prompt' : 'AI prompt'),
        h('button', { class: 'btn sm ghost', type: 'button', title: 'Copy the prompt to use in any other image tool', onClick: async () => toast((await copyText(p.prompt)) ? 'Prompt copied' : 'Copy failed') }, 'Copy prompt'),
        h('button', { class: 'btn sm ghost danger', type: 'button', title: 'Remove the portrait from this character', onClick: () => change((c) => clearPortrait(c)) }, '🗑 Delete portrait'),
        fileIn,
      ]) : null;
  if (p.hidden) return h('div', { class: `portrait ${size} hidden` }, controls);
  return h('div', { class: `portrait ${size}`, title: p.prompt }, frame, controls);
}

/** A small, read-only portrait image (World pages): the upload, the AI picture if it is already cached, else the built-in art. */
export function portraitImg(ch, { alt = '' } = {}) {
  const p = portraitOf(ch);
  if (p.hidden) return null;
  const img = h('img', { alt, loading: 'lazy', referrerpolicy: 'no-referrer' });
  if (p.source === 'upload') img.src = p.image;
  else if (p.source === 'ai' && okUrls.has(p.url)) img.src = p.url;
  else img.src = p.avatar;
  return img;
}

export { portraitPrompt };
