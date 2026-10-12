// Sync through a file in a cloud folder (Dropbox, OneDrive, Google Drive, iCloud Drive...). The app keeps
// one JSON file there up to date; every device that points at the same file merges what the others wrote
// (characters by the time they were saved, deletions included, world pages joined) and writes back. No
// account or server needed: the cloud folder app moves the file between devices.
//
// Uses the File System Access API (Chrome, Edge, Opera, and the desktop app). Other browsers keep using
// "Back up everything" / "Restore".

import { h, toast, openDialog } from './dom.js';
import { snapshotAll, restoreAll, registerSyncDialog } from './backup.js';

const META = 'dcugen.sync.v1'; // { device, name, lastPullAt, lastPushAt }
// Things that belong to this device: open tabs, current page, theme, how lists are shown.
const LOCAL_ONLY = ['dcugen.tabs.v1', 'dcugen.tab', 'dcugen.theme', 'dcugen.sheetview', 'dcugen.gmtab', 'dcugen.roster.view', META];

export const syncSupported = () => typeof window.showSaveFilePicker === 'function' && !!window.__dcugenStorage?.db;

function meta() { try { return JSON.parse(localStorage.getItem(META) || 'null') || {}; } catch { return {}; } }
function setMeta(m) { try { localStorage.setItem(META, JSON.stringify(m)); } catch { /* ignore */ } }
function device() {
  const m = meta();
  if (!m.device) { m.device = `d-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`; setMeta(m); }
  return m.device;
}

const handle = () => window.__dcugenStorage?.handle('syncfile');
let dirty = false;
let busy = false;
let status = 'off'; // off | ok | needs-permission | error
const listeners = new Set();
const setStatus = (s) => { status = s; for (const fn of listeners) fn(s); };

async function permitted(fh, ask) {
  const opts = { mode: 'readwrite' };
  try {
    if ((await fh.queryPermission(opts)) === 'granted') return true;
    if (ask && (await fh.requestPermission(opts)) === 'granted') return true;
  } catch { /* old browser */ }
  return false;
}

async function readFile(fh) {
  const text = await (await fh.getFile()).text();
  if (!text.trim()) return null;
  const data = JSON.parse(text);
  if (data?.app !== 'DCUGen') throw new Error('That file is not a DCUGen sync file.');
  return data;
}

async function writeFile(fh) {
  const snap = snapshotAll();
  for (const k of LOCAL_ONLY) delete snap.data[k];
  snap.kind = 'sync'; snap.device = device();
  const w = await fh.createWritable();
  await w.write(JSON.stringify(snap));
  await w.close();
  setMeta({ ...meta(), lastPushAt: snap.savedAt });
  return snap;
}

/**
 * Pull what other devices wrote, then push the merged result. Returns { pulled } (true when something
 * came in, and the page should reload to show it).
 */
export async function syncNow({ ask = false, quiet = false } = {}) {
  if (busy) return { pulled: false };
  const fh = await handle();
  if (!fh) { setStatus('off'); return { pulled: false }; }
  if (!(await permitted(fh, ask))) { setStatus('needs-permission'); return { pulled: false }; }
  busy = true;
  try {
    let pulled = false;
    const remote = await readFile(fh);
    const m = meta();
    if (remote && remote.device !== device() && String(remote.savedAt) > String(m.lastPullAt || '')) {
      restoreAll(remote, { mode: 'merge', skip: LOCAL_ONLY });
      setMeta({ ...meta(), lastPullAt: remote.savedAt });
      pulled = true;
    }
    await writeFile(fh);
    dirty = false;
    setStatus('ok');
    if (!quiet) toast(pulled ? 'Synced: changes from your other devices came in' : 'Synced');
    return { pulled };
  } catch (e) {
    setStatus('error');
    if (!quiet) toast(`Sync failed: ${e.message}`);
    return { pulled: false };
  } finally { busy = false; }
}

async function connect(existing) {
  try {
    const opts = { types: [{ description: 'DCUGen sync file', accept: { 'application/json': ['.json'] } }] };
    const fh = existing ? (await window.showOpenFilePicker(opts))[0] : await window.showSaveFilePicker({ ...opts, suggestedName: 'DCUGen-sync.json' });
    await window.__dcugenStorage.handle('syncfile', fh);
    setMeta({ ...meta(), name: fh.name, lastPullAt: '' });
    const { pulled } = await syncNow({ ask: true, quiet: true });
    toast(pulled ? `Connected to ${fh.name}. Pulled in your other devices' data. Reloading…` : `Connected to ${fh.name}. Changes save there from now on.`);
    if (pulled) setTimeout(() => location.reload(), 700);
  } catch (e) { if (e?.name !== 'AbortError') toast(`Couldn't use that file: ${e.message}`); }
}

export async function syncDialog() {
  if (!syncSupported()) {
    await openDialog({ title: 'Sync with a cloud folder', body: [
      h('p', { style: { margin: 0 } }, 'This browser can\'t keep a file updated on its own. Sync works in Chrome, Edge and Opera on a computer, and in the DCUGen desktop app.'),
      h('p', { class: 'hint', style: { margin: '8px 0 0' } }, 'Here, use Backup > "Back up everything" and open the file on your other device with "Restore a backup".')] });
    return;
  }
  const fh = await handle();
  const m = meta();
  const when = (t) => (t ? new Date(t).toLocaleString() : 'never');
  const body = [
    h('p', { style: { margin: 0 } }, 'Keep everything (roster, world, battles, notes, settings) in one file inside a folder your cloud app syncs: Dropbox, OneDrive, Google Drive or iCloud Drive. Point every computer at the same file and they stay in step. Open characters and the theme stay per device.'),
    fh ? h('p', { style: { margin: '10px 0 0' } }, h('b', null, `Syncing with ${m.name || fh.name}. `), `Last sent ${when(m.lastPushAt)}, last received ${when(m.lastPullAt)}.`)
      : h('p', { class: 'hint', style: { margin: '10px 0 0' } }, 'First computer: "Create a sync file" and save it in your cloud folder. Other computers: "Use an existing sync file" and pick that same file.'),
  ];
  const v = await openDialog({
    title: 'Sync with a cloud folder',
    body,
    buttons: fh
      ? [{ label: 'Stop syncing', value: 'stop' }, { label: 'Use a different file', value: 'open' }, { label: 'Sync now', value: 'now', primary: true }]
      : [{ label: 'Cancel', value: null }, { label: 'Use an existing sync file', value: 'open' }, { label: 'Create a sync file', value: 'create', primary: true }],
  });
  if (v === 'create') await connect(false);
  if (v === 'open') await connect(true);
  if (v === 'now') { const { pulled } = await syncNow({ ask: true }); if (pulled) setTimeout(() => location.reload(), 700); }
  if (v === 'stop') { await window.__dcugenStorage.handle('syncfile', null); setMeta({ device: device() }); setStatus('off'); toast('Sync stopped. Your data stays here, and the file stays in your cloud folder.'); }
}
registerSyncDialog(syncDialog);

/** A small button in the top bar showing sync state; click to sync, reconnect or set up. */
export function syncButton() {
  const btn = h('button', { class: 'icon-btn sync-btn', type: 'button', id: 'sync-btn', hidden: true, onClick: async () => {
    if (status === 'needs-permission' || status === 'error') { const { pulled } = await syncNow({ ask: true }); if (pulled) setTimeout(() => location.reload(), 700); } else syncDialog();
  } });
  const paint = (s) => {
    btn.hidden = s === 'off';
    btn.textContent = s === 'ok' ? '⟳' : '⚠';
    btn.title = s === 'ok' ? 'Synced with your cloud folder. Click for details.' : s === 'needs-permission' ? 'Click to reconnect your sync file (the browser asks once per visit)' : 'Sync had a problem. Click to try again.';
    btn.classList.toggle('warn', s !== 'ok');
  };
  listeners.add(paint);
  paint(status);
  return btn;
}

/** At start: sync if allowed, then send changes every few seconds. */
export async function startSync() {
  if (!syncSupported()) return;
  // Note every change to the app's data (except what stays on this device).
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function setItem(k, v) { set.call(this, k, v); if (this === localStorage && String(k).startsWith('dcugen.') && !LOCAL_ONLY.includes(String(k))) dirty = true; };
  const fh = await handle();
  if (!fh) return;
  const { pulled } = await syncNow({ quiet: true });
  if (pulled && !sessionStorage.getItem('dcugen.sync.reloaded')) {
    sessionStorage.setItem('dcugen.sync.reloaded', '1');
    toast('Changes from your other devices came in. Reloading…');
    setTimeout(() => location.reload(), 700);
    return;
  }
  sessionStorage.removeItem('dcugen.sync.reloaded');
  setInterval(() => { if (dirty && status === 'ok') syncNow({ quiet: true }); }, 5000);
  addEventListener('pagehide', () => { if (dirty && status === 'ok') syncNow({ quiet: true }); });
}
