// The portrait block on the case file, the Bio page and the World.
//
// Three sources: an AI painting from a free service (about one image every 15 seconds without an
// account, so they load one at a time through a queue and keep retrying while the built-in art
// stands in), the built-in comic art drawn by the app, or a picture you upload yourself.

import { h, toast, copyText, openDialog } from './dom.js';
import { portraitOf, setPortrait, clearPortrait, newPortraitSeed, portraitPrompt, PORTRAIT_SERVICE, PORTRAIT_SERVICES, PORTRAIT_SOURCES, PORTRAIT_STYLES, PORTRAIT_NEGATIVE, setPortraitDefaults, portraitDefaults } from '../engine/portrait.js';

const CREDIT = `AI portraits come from a free, open source service (AI Horde by default: volunteers' GPUs running real Stable Diffusion models, so semi-realistic and anime styles work; or ${PORTRAIT_SERVICE.name}). Only the prompt is sent. Portraits paint one at a time while the built-in art stands in. Built-in comic art is drawn by the app itself and works offline.`;

// ---- preferences: service, default style, AI Horde key ---------------------------------------------------
const PREFS_KEY = 'dcugen.portrait.prefs';
export const prefs = (() => { try { return { service: 'horde', style: 'comic', hordeKey: '', ...(JSON.parse(localStorage.getItem(PREFS_KEY) || 'null') || {}) }; } catch { return { service: 'horde', style: 'comic', hordeKey: '' }; } })();
if (!PORTRAIT_SERVICES[prefs.service]) prefs.service = 'horde';
if (!PORTRAIT_STYLES[prefs.style]) prefs.style = 'comic';
setPortraitDefaults({ service: prefs.service, style: prefs.style });
export function savePortraitPrefs(patch = {}) {
  Object.assign(prefs, patch);
  setPortraitDefaults({ service: prefs.service, style: prefs.style });
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* full */ }
}

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

/** Load a picture through an <img>; with cors, the browser asks the service for permission to copy it. */
function loadImage(url, { cors = false, timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { img.src = ''; reject(new Error('took too long')); }, timeout);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('image failed')); };
    img.src = url;
  });
}

function imageToPortrait(img, { width = 400, height = 500 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const w = img.naturalWidth * scale; const hh = img.naturalHeight * scale;
  ctx.drawImage(img, (width - w) / 2, (height - hh) / 2, w, hh);
  return canvas.toDataURL('image/jpeg', 0.88); // throws when the browser was not allowed to copy it
}

/**
 * One painting, three ways in order: a direct fetch (the service's exact answer is known and the
 * picture is copied into the character), then an image load the browser is allowed to copy, then a
 * plain image load that at least shows the picture ("live": the sheet keeps loading it from the
 * service's address, which the browser caches). Resolves { ok, image?, live?, why?, retry?, fatal? }.
 */
async function paintOnce(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  let why = null; let retry = 0;
  try {
    const res = await fetch(url, { signal: ctrl.signal, referrerPolicy: 'no-referrer', cache: 'force-cache' });
    if (res.ok) {
      const blob = await res.blob();
      if (/^image\//.test(blob.type) || blob.size >= 2000) return { ok: true, image: await blobToPortrait(blob) };
      why = 'not an image';
    } else {
      retry = Number(res.headers.get('retry-after')) || 0;
      why = res.status === 429 ? 'rate limit' : res.status === 401 || res.status === 402 ? 'the service now wants an account for this' : res.status >= 500 ? 'the service is overloaded' : `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 402) return { ok: false, why, retry, fatal: true };
      if (res.status === 429 || res.status >= 500) return { ok: false, why, retry };
    }
  } catch (e) {
    why = e.name === 'AbortError' ? 'took too long' : null;
  } finally { clearTimeout(timer); }
  // Second way: the browser loads it as a picture and, if the service allows, lets the app copy it.
  try {
    const img = await loadImage(url, { cors: true });
    try { return { ok: true, image: imageToPortrait(img) }; } catch { return { ok: true, live: true }; }
  } catch { /* third way below */ }
  // Third way: a plain picture load. Shows, but cannot be copied into the character.
  try { await loadImage(url); return { ok: true, live: true }; } catch { /* give up this round */ }
  return { ok: false, why: why || 'no connection, or the service refused the browser', retry };
}

// ---- AI Horde: submit, wait in the queue, collect -------------------------------------------------------------
const HORDE = 'https://aihorde.net/api/v2';
const hordeHeaders = () => ({ 'Content-Type': 'application/json', apikey: (prefs.hordeKey || '').trim() || '0000000000', 'Client-Agent': 'DCUGen:7:https://github.com/Beherrit/DCUGen' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** fetch that gives up: a blocked network should fail fast, not hang the queue. */
function fetchT(url, opts = {}, ms = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function paintHorde(job, { onStatus, cancelled } = {}) {
  const body = {
    prompt: `${job.prompt} ### ${PORTRAIT_NEGATIVE}`,
    params: { width: 512, height: 640, steps: 24, cfg_scale: 6.5, sampler_name: 'k_euler_a', karras: true, n: 1, seed: String(job.seed ?? 1) },
    nsfw: false, censor_nsfw: true, r2: false, shared: true, slow_workers: true,
    models: job.models && job.models.length ? job.models : undefined,
  };
  let res;
  try { res = await fetchT(`${HORDE}/generate/async`, { method: 'POST', headers: hordeHeaders(), body: JSON.stringify(body) }); } catch (e) { return { ok: false, why: e.name === 'AbortError' ? 'AI Horde did not answer (network blocked?)' : 'no connection to AI Horde (or the browser blocked it)', retry: 20 }; }
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const msg = data.message || `HTTP ${res.status}`;
    if (res.status === 429) return { ok: false, why: `AI Horde: ${msg}`, retry: 30 };
    if (res.status === 403 && /anonymous|kudos/i.test(msg) && body.models) { return { ok: false, why: `AI Horde: ${msg}`, retry: 20, anyModel: true }; }
    return { ok: false, why: `AI Horde: ${msg}`, fatal: /invalid api key|not allowed/i.test(msg) };
  }
  const id = data.id;
  if (!id) return { ok: false, why: 'AI Horde gave no job id' };
  const started = Date.now();
  let askedAnyModel = false;
  while (Date.now() - started < 20 * 60 * 1000) {
    if (cancelled?.()) { fetch(`${HORDE}/generate/status/${id}`, { method: 'DELETE', headers: hordeHeaders() }).catch(() => {}); return { ok: false, why: 'cancelled' }; }
    let c = {};
    try { c = await (await fetchT(`${HORDE}/generate/check/${id}`, { headers: hordeHeaders() })).json(); } catch { await sleep(5000); continue; }
    if (c.faulted) return { ok: false, why: 'AI Horde: the job faulted' };
    if (c.is_possible === false && !askedAnyModel) { askedAnyModel = true; if (body.models) return { ok: false, why: 'no AI Horde worker runs those models right now', retry: 5, anyModel: true }; }
    if (c.done) break;
    const pos = c.queue_position ?? 0; const wait = c.wait_time ?? 0;
    onStatus?.(c.processing ? 'Painting on AI Horde…' : `Queued at AI Horde${pos ? ` (${pos} ahead` : ' ('}${wait ? `${pos ? ', ' : ''}~${Math.max(5, wait)}s` : ''})…`);
    await sleep(Math.min(20000, Math.max(3000, (wait || 6) * 1000 / 2)));
  }
  let st = {};
  try { st = await (await fetchT(`${HORDE}/generate/status/${id}`, { headers: hordeHeaders() })).json(); } catch { return { ok: false, why: 'could not collect the picture from AI Horde', retry: 10 }; }
  const g = st.generations?.[0];
  if (!g?.img) return { ok: false, why: 'AI Horde took too long: trying again later', retry: 30 };
  if (g.censored) return { ok: false, why: 'AI Horde censored that one: new dice', retry: 2 };
  const src = /^https?:/.test(g.img) ? g.img : `data:image/webp;base64,${g.img}`;
  try {
    if (/^data:/.test(src)) { const img = await loadImage(src); return { ok: true, image: imageToPortrait(img), model: g.model }; }
    const img = await loadImage(src, { cors: true }); return { ok: true, image: imageToPortrait(img), model: g.model };
  } catch { return { ok: false, why: 'the picture came back unreadable', retry: 5 }; }
}

function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) { notify(); return; }
  if (job.cancelled?.()) { pump(); return; }
  busy = true; notify();
  const gap = job.service === 'horde' ? 2000 : GAP;
  const wait = Math.max(0, lastRequest + gap - Date.now());
  job.onWait?.(wait);
  setTimeout(async () => {
    if (job.cancelled?.()) { busy = false; pump(); return; }
    lastRequest = Date.now();
    const r = job.service === 'horde' ? await paintHorde(job, { onStatus: job.onStatus, cancelled: job.cancelled }) : await paintOnce(job.url);
    busy = false;
    job.onDone?.(r);
    setTimeout(pump, 50);
  }, wait);
}

/** Queue a painting. Resolves { ok, image?, why?, retry?, fatal? }. */
export function requestPainting(job, { onWait, onStatus, cancelled } = {}) {
  const j = typeof job === 'string' ? { url: job, service: 'pollinations' } : job;
  return new Promise((resolve) => { queue.push({ ...j, onWait, onStatus, cancelled, onDone: resolve }); pump(); });
}

let fatalNote = null;
export function paintingAvailable() { return !fatalNote; }

/**
 * Paint a character: queue the AI portrait and save it into the character when it arrives.
 * save({ image, live, url }) stores it: image is a data URL to keep on the character; when it is null and
 * live is true the picture showed but could not be copied, so the character keeps showing it from the
 * service (setPortrait(c, { live: true })). Resolves true/false.
 */
export async function paintCharacter(ch, save, { onStatus, cancelled, tries = 40 } = {}) {
  const p = portraitOf(ch);
  if (p.hidden || p.source !== 'ai') return false;
  let models = p.models;
  for (let i = 0; i < tries; i++) {
    if (cancelled?.()) return false;
    const job = p.service === 'horde' ? { service: 'horde', prompt: p.prompt, seed: p.seed, models } : { service: 'pollinations', url: p.url };
    const r = await requestPainting(job, { onWait: (ms) => onStatus?.(ms > 800 ? `Painting in ${Math.ceil(ms / 1000)}s…` : p.service === 'horde' ? 'Sending to AI Horde…' : 'Painting…'), onStatus, cancelled });
    if (r.ok) { save({ image: r.image || null, live: !!r.live, url: p.url, model: r.model || null }); return true; }
    if (r.why === 'cancelled') return false;
    if (r.anyModel) models = null;
    if (r.fatal) { fatalNote = r.why; onStatus?.(`AI portraits unavailable: ${r.why}.`); return false; }
    const again = Math.max(p.service === 'horde' ? 5 : 15, r.retry || 0);
    onStatus?.(`${r.why}; trying again in ${again}s (${i + 1})…`);
    await new Promise((res) => setTimeout(res, again * 1000));
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

/** The portrait as PNG bytes for exports: the uploaded picture (or saved AI painting), the live AI picture when the service allows a copy, else the built-in art. */
export async function portraitPng(ch) {
  const p = portraitOf(ch);
  if (p.hidden) return null;
  if (p.source === 'upload' && p.image) { try { return await drawToPng(p.image); } catch { /* fall through */ } }
  if (p.live) { try { return await drawToPng(p.url, { crossOrigin: true }); } catch { /* the service did not allow the copy: built-in art */ } }
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
  const showLive = () => { img.src = p.url; frame.classList.remove('builtin'); frame.classList.add('live'); };
  const paint = () => {
    setStatus('Painting…');
    paintCharacter(ch, ({ image, live }) => {
      if (image) change((c) => setPortrait(c, { image, aiSaved: true }));
      else if (live) { showLive(); setStatus(''); if (!p.live) change((c) => setPortrait(c, { live: true })); }
    }, { onStatus: setStatus, cancelled: () => !frame.isConnected });
  };
  if (!p.hidden) {
    if (p.source === 'upload') { img.src = p.image; }
    else if (p.live) {
      // the picture loads straight from the service; if it is gone, paint again (or show the built-in art)
      img.onerror = () => { img.onerror = null; img.src = p.avatar; frame.classList.add('builtin'); frame.classList.remove('live'); if (change) paint(); else setStatus('Built-in art (the painting did not load)'); };
      showLive();
    } else { img.src = p.avatar; frame.classList.add('builtin'); }
    if (p.source === 'ai' && !p.live && change) paint();
    else if (p.source === 'ai' && !p.live) setStatus('Built-in art (open on the Forge to paint)');
  }

  const settings = async () => {
    const ta = h('textarea', { style: { minHeight: '110px' } }, p.prompt);
    const src = h('select', null, Object.entries(PORTRAIT_SOURCES).filter(([k]) => k !== 'upload' || p.image).map(([k, v]) => h('option', { value: k, selected: k === p.source }, k === 'upload' && ch.portrait?.aiSaved ? 'The saved AI painting' : v)));
    const style = h('select', null, Object.entries(PORTRAIT_STYLES).map(([k, v]) => h('option', { value: k, selected: k === p.style }, v.label)));
    const asDefault = h('input', { type: 'checkbox', checked: true });
    const service = h('select', null, Object.entries(PORTRAIT_SERVICES).map(([k, v]) => h('option', { value: k, selected: k === prefs.service }, v.name)));
    const key = h('input', { type: 'password', value: prefs.hordeKey || '', placeholder: 'Optional: your AI Horde API key (faster queue)', autocomplete: 'off' });
    const blurb = h('p', { class: 'hint', style: { margin: 0 } });
    const refresh = () => { blurb.textContent = PORTRAIT_SERVICES[service.value].blurb; key.parentElement.hidden = service.value !== 'horde'; };
    service.addEventListener('change', refresh);
    setTimeout(refresh, 0);
    // the prompt follows the style unless the user wrote their own
    style.addEventListener('change', () => { if (!p.custom) ta.value = portraitPrompt(ch, { style: style.value }); });
    const ok = await openDialog({
      title: 'Portrait',
      body: [
        h('div', { class: 'jr-row' }, h('label', { class: 'field', style: { flex: 1 } }, h('span', null, 'Style'), style), h('label', { class: 'field', style: { flex: 1 } }, h('span', null, 'Source'), src)),
        h('label', { class: 'wd-inline', style: { fontWeight: 500 } }, asDefault, ' Use this style for every new portrait'),
        h('label', { class: 'field' }, h('span', null, 'Prompt (built from the sheet, the looks and the bio)'), ta),
        h('div', { class: 'label', style: { marginTop: '6px' } }, 'Painter (for all characters)'),
        h('label', { class: 'field' }, h('span', null, 'Service'), service),
        h('label', { class: 'field' }, h('span', null, 'AI Horde key'), key, h('small', { class: 'hint' }, 'Anonymous works but waits longer. A key is free: ', h('a', { href: PORTRAIT_SERVICES.horde.register, target: '_blank', rel: 'noopener' }, 'aihorde.net/register'), '. It is kept in this browser only.')),
        blurb,
        h('p', { class: 'hint', style: { margin: 0 } }, CREDIT),
      ],
      buttons: [{ label: 'Cancel', value: null }, { label: 'Reset prompt', value: 'reset' }, { label: 'Save', value: 'save', primary: true }],
    });
    if (!ok) return;
    const serviceChanged = service.value !== prefs.service;
    savePortraitPrefs({ service: service.value, hordeKey: key.value.trim(), ...(asDefault.checked ? { style: style.value } : {}) });
    const styleChanged = style.value !== p.style;
    if (ok === 'save') change((c) => setPortrait(c, { style: style.value, prompt: ta.value.trim(), source: src.value, seed: ta.value.trim() !== p.prompt || styleChanged ? newPortraitSeed() : undefined, image: src.value === 'upload' ? undefined : null, live: false }));
    if (ok === 'reset') change((c) => setPortrait(c, { style: style.value, prompt: '', source: src.value === 'upload' ? 'ai' : src.value, seed: newPortraitSeed(), image: null, live: false }));
    if (ok === 'save' && !styleChanged && ta.value.trim() === p.prompt && serviceChanged) change((c) => setPortrait(c, { live: false }));
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
        h('button', { class: 'btn sm', type: 'button', title: 'Source and prompt', onClick: settings }, p.source === 'upload' ? (ch.portrait?.aiSaved ? 'AI painting ✓' : 'Your picture') : p.source === 'builtin' ? 'Built-in art' : `${PORTRAIT_STYLES[p.style]?.label || 'AI'} · ${p.custom ? 'edited prompt' : 'style & painter'}`),
        h('button', { class: 'btn sm ghost', type: 'button', title: 'Copy the prompt to use in any other image tool', onClick: async () => toast((await copyText(p.prompt)) ? 'Prompt copied' : 'Copy failed') }, 'Copy prompt'),
        h('button', { class: 'btn sm ghost danger', type: 'button', title: 'Remove the portrait from this character', onClick: () => change((c) => clearPortrait(c)) }, '🗑 Delete portrait'),
        fileIn,
      ]) : null;
  if (p.hidden) return h('div', { class: `portrait ${size} hidden` }, controls);
  return h('div', { class: `portrait ${size}`, title: p.prompt }, frame, controls);
}

/** A small, read-only portrait image (World pages): the upload, the live AI picture, else the built-in art. */
export function portraitImg(ch, { alt = '' } = {}) {
  const p = portraitOf(ch);
  if (p.hidden) return null;
  const img = h('img', { alt, loading: 'lazy' });
  if (p.live) { img.onerror = () => { img.onerror = null; img.src = p.avatar; }; img.src = p.url; }
  else img.src = p.source === 'upload' ? p.image : p.avatar;
  return img;
}

export { portraitPrompt };

/**
 * Paint everyone on the roster who still has the built-in art (one painting every 15 seconds, in the
 * background). getList() returns the current roster; save(rosterId, { image, live }) stores a finished painting.
 * onProgress({ done, total, current, status }) reports. Returns a cancel function.
 */
export function paintRoster(getList, save, onProgress) {
  let cancelled = false;
  (async () => {
    const todo = getList().filter((c) => { const p = portraitOf(c); return !p.hidden && p.source === 'ai' && !p.live; });
    let done = 0;
    for (const ch of todo) {
      if (cancelled) break;
      const name = ch.identity?.codename || 'character';
      onProgress?.({ done, total: todo.length, current: name, status: 'queued' });
      const ok = await paintCharacter(ch, (r) => save(ch.rosterId, r), { onStatus: (t) => onProgress?.({ done, total: todo.length, current: name, status: t }), cancelled: () => cancelled, tries: 6 });
      done++;
      onProgress?.({ done, total: todo.length, current: name, status: ok ? 'painted' : 'skipped' });
      if (!paintingAvailable()) break;
    }
    onProgress?.({ done, total: todo.length, current: null, status: cancelled ? 'stopped' : 'finished' });
  })();
  return () => { cancelled = true; };
}
