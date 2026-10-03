// The portrait block on the case file, the Bio page and the World.
//
// Three sources: an AI painting from a free service (about one image every 15 seconds without an
// account, so they load one at a time through a queue and keep retrying while the built-in art
// stands in), the built-in comic art drawn by the app, or a picture you upload yourself.

import { h, toast, copyText, openDialog } from './dom.js';
import { portraitOf, setPortrait, clearPortrait, newPortraitSeed, portraitPrompt, PORTRAIT_SERVICE, PORTRAIT_SOURCES } from '../engine/portrait.js';

const CREDIT = `AI portraits come from ${PORTRAIT_SERVICE.name}: free and open source, no account. Only the prompt is sent; the image lives in your browser's cache. The free tier allows ${PORTRAIT_SERVICE.limit}, so portraits load one at a time and keep trying while the built-in art stands in. Built-in comic art is drawn by the app itself and works offline.`;

// ---- one-at-a-time painter ----------------------------------------------------------------------------
// Fetches the painting (so the service's answer is known), shrinks it to the portrait size and hands
// back a JPEG data URL that the character keeps. One request at a time, 15 seconds apart.
const GAP = 15500;
const queue = [];
let busy = false;
let lastRequest = 0;
const listeners = new Set();
export function onPainter(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const notify = () => { for (const fn of listeners) { try { fn(painterState()); } catch { /* ignore */ } } };
export function painterState() { return { queued: queue.length, busy, nextIn: Math.max(0, lastRequest + GAP - Date.now()) }; }

function blobToPortrait(blob, { width = 400, height = 500 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
        const w = img.naturalWidth * scale; const hh = img.naturalHeight * scale;
        ctx.drawImage(img, (width - w) / 2, (height - hh) / 2, w, hh);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not a picture')); };
    img.src = url;
  });
}

async function paintOnce(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, referrerPolicy: 'no-referrer', cache: 'force-cache' });
    if (!res.ok) {
      const retry = Number(res.headers.get('retry-after')) || 0;
      const why = res.status === 429 ? 'rate limit' : res.status === 401 || res.status === 402 ? 'the service now wants an account for this' : res.status >= 500 ? 'the service is overloaded' : `HTTP ${res.status}`;
      return { ok: false, why, retry, fatal: res.status === 401 || res.status === 402 };
    }
    const blob = await res.blob();
    if (!/^image\//.test(blob.type) && blob.size < 2000) return { ok: false, why: 'not an image' };
    return { ok: true, image: await blobToPortrait(blob) };
  } catch (e) {
    return { ok: false, why: e.name === 'AbortError' ? 'took too long' : /Failed to fetch|NetworkError|TypeError/.test(String(e)) ? 'no connection, or the service refused the browser' : e.message };
  } finally { clearTimeout(timer); }
}

function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) { notify(); return; }
  if (job.cancelled?.()) { pump(); return; }
  busy = true; notify();
  const wait = Math.max(0, lastRequest + GAP - Date.now());
  job.onWait?.(wait);
  setTimeout(async () => {
    if (job.cancelled?.()) { busy = false; pump(); return; }
    lastRequest = Date.now();
    const r = await paintOnce(job.url);
    busy = false;
    job.onDone?.(r);
    setTimeout(pump, 50);
  }, wait);
}

/** Queue a painting. Resolves { ok, image?, why?, retry?, fatal? }. */
export function requestPainting(url, { onWait, cancelled } = {}) {
  return new Promise((resolve) => { queue.push({ url, onWait, cancelled, onDone: resolve }); pump(); });
}

let fatalNote = null;
export function paintingAvailable() { return !fatalNote; }

/**
 * Paint a character: queue the AI portrait and save it into the character when it arrives.
 * save(image) stores it (the app passes a function that clones, sets and saves). Resolves true/false.
 */
export async function paintCharacter(ch, save, { onStatus, cancelled, tries = 40 } = {}) {
  const p = portraitOf(ch);
  if (p.hidden || p.source !== 'ai') return false;
  for (let i = 0; i < tries; i++) {
    if (cancelled?.()) return false;
    const r = await requestPainting(p.url, { onWait: (ms) => onStatus?.(ms > 800 ? `Painting in ${Math.ceil(ms / 1000)}s…` : 'Painting…'), cancelled });
    if (r.ok) { save(r.image); return true; }
    if (r.fatal) { fatalNote = r.why; onStatus?.(`AI portraits unavailable: ${r.why}.`); return false; }
    onStatus?.(`${r.why}; trying again in ${Math.max(15, r.retry || 0)}s (${i + 1})…`);
    await new Promise((res) => setTimeout(res, Math.max(GAP, (r.retry || 0) * 1000)));
  }
  onStatus?.('The service kept refusing. Re-roll to try again later.');
  return false;
}

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
  try { return await drawToPng(p.avatar); } catch { return null; }
}

// ---- the block ----------------------------------------------------------------------------------------

/**
 * change(fn): clone, apply, save. Omit it for a read-only portrait.
 */
export function portraitBlock(ch, { change, size = 'file' } = {}) {
  const p = portraitOf(ch);
  if (p.hidden && !change) return null;
  const img = h('img', { class: 'portrait-img', alt: `Portrait of ${ch.identity?.codename || 'the character'}`, width: 400, height: 500 });
  const status = h('div', { class: 'portrait-status', hidden: true });
  const frame = h('div', { class: 'portrait-frame' }, img, status);
  const setStatus = (t) => { status.textContent = t; status.hidden = !t; };
  if (!p.hidden) {
    if (p.source === 'upload') { img.src = p.image; }
    else { img.src = p.avatar; frame.classList.add('builtin'); }
    if (p.source === 'ai' && change) {
      setStatus('Painting…');
      paintCharacter(ch, (image) => change((c) => setPortrait(c, { image, aiSaved: true })), { onStatus: setStatus, cancelled: () => !frame.isConnected });
    } else if (p.source === 'ai') setStatus('Built-in art (open on the Forge to paint)');
  }

  const settings = async () => {
    const ta = h('textarea', { style: { minHeight: '120px' } }, p.prompt);
    const src = h('select', null, Object.entries(PORTRAIT_SOURCES).filter(([k]) => k !== 'upload' || p.image).map(([k, v]) => h('option', { value: k, selected: k === p.source }, k === 'upload' && ch.portrait?.aiSaved ? 'The saved AI painting' : v)));
    const ok = await openDialog({
      title: 'Portrait',
      body: [
        h('label', { class: 'field' }, h('span', null, 'Source'), src),
        h('label', { class: 'field' }, h('span', null, 'Prompt (for the AI painting; built from the sheet, the looks and the bio)'), ta),
        h('p', { class: 'hint', style: { margin: 0 } }, CREDIT),
      ],
      buttons: [{ label: 'Cancel', value: null }, { label: 'Reset prompt', value: 'reset' }, { label: 'Save', value: 'save', primary: true }],
    });
    if (ok === 'save') change((c) => setPortrait(c, { prompt: ta.value.trim(), source: src.value, seed: ta.value.trim() !== p.prompt ? newPortraitSeed() : undefined, image: src.value === 'upload' ? undefined : null }));
    if (ok === 'reset') change((c) => setPortrait(c, { prompt: '', source: src.value === 'upload' ? 'ai' : src.value, seed: newPortraitSeed(), image: null }));
  };
  const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { const data = await readPictureFile(f); change((c) => setPortrait(c, { image: data, hidden: false, aiSaved: false })); toast('Your picture is on the sheet'); } catch (err) { toast(err.message); }
  } });
  const newPortrait = () => change((c) => setPortrait(c, { seed: newPortraitSeed(), source: 'ai', image: null, hidden: false }));
  const controls = change ? h('div', { class: 'portrait-tools no-print' },
    p.hidden
      ? [h('button', { class: 'btn sm', type: 'button', title: CREDIT, onClick: newPortrait }, '🖼 New portrait'),
        h('button', { class: 'btn sm', type: 'button', title: 'Use a picture of your own', onClick: () => fileIn.click() }, 'Upload…'), fileIn]
      : [
        h('button', { class: 'btn sm', type: 'button', title: 'A new AI painting with the same prompt and new dice', onClick: newPortrait }, '🎲 New portrait'),
        h('button', { class: 'btn sm', type: 'button', title: 'Use a picture of your own', onClick: () => fileIn.click() }, 'Upload…'),
        h('button', { class: 'btn sm', type: 'button', title: 'Source and prompt', onClick: settings }, p.source === 'upload' ? (ch.portrait?.aiSaved ? 'AI painting ✓' : 'Your picture') : p.source === 'builtin' ? 'Built-in art' : p.custom ? 'AI · edited prompt' : 'AI prompt'),
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
  const img = h('img', { alt, loading: 'lazy' });
  img.src = p.source === 'upload' ? p.image : p.avatar;
  return img;
}

export { portraitPrompt };

/**
 * Paint everyone on the roster who still has the built-in art (one painting every 15 seconds, in the
 * background). getList() returns the current roster; save(rosterId, image) stores a finished painting.
 * onProgress({ done, total, current, status }) reports. Returns a cancel function.
 */
export function paintRoster(getList, save, onProgress) {
  let cancelled = false;
  (async () => {
    const todo = getList().filter((c) => { const p = portraitOf(c); return !p.hidden && p.source === 'ai'; });
    let done = 0;
    for (const ch of todo) {
      if (cancelled) break;
      const name = ch.identity?.codename || 'character';
      onProgress?.({ done, total: todo.length, current: name, status: 'queued' });
      const ok = await paintCharacter(ch, (image) => save(ch.rosterId, image), { onStatus: (t) => onProgress?.({ done, total: todo.length, current: name, status: t }), cancelled: () => cancelled, tries: 6 });
      done++;
      onProgress?.({ done, total: todo.length, current: name, status: ok ? 'painted' : 'skipped' });
      if (!paintingAvailable()) break;
    }
    onProgress?.({ done, total: todo.length, current: null, status: cancelled ? 'stopped' : 'finished' });
  })();
  return () => { cancelled = true; };
}
