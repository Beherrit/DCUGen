// Backup and restore of everything the app keeps in this browser: roster, open tabs, world, battle,
// GM notes and screen, preferences. One file. Restore merges characters and world pages, and
// replaces the rest. The desktop app uses the same snapshot to mirror the data to disk.

import { h, toast, download, openDialog } from './dom.js';

export const APP_KEYS_PREFIX = 'dcugen.';
const MERGE_ROSTER = 'dcugen.roster.v1';
const MERGE_WORLD = 'dcugen.world.v1';
const DELETED = 'dcugen.roster.deleted.v1';

/** Every dcugen.* key and its raw value. */
export function snapshotAll() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(APP_KEYS_PREFIX)) data[k] = localStorage.getItem(k);
    }
  } catch { /* storage unavailable */ }
  return { app: 'DCUGen', kind: 'backup', version: 1, savedAt: new Date().toISOString(), data };
}

function mergeTombs(a = [], b = []) {
  const by = new Map();
  for (const t of [...a, ...b]) if (t?.rosterId && (!by.has(t.rosterId) || String(t.at) > String(by.get(t.rosterId).at))) by.set(t.rosterId, t);
  return [...by.values()];
}

export function mergeRoster(current, incoming, tombs = []) {
  const gone = new Map(tombs.map((t) => [t.rosterId, String(t.at || '')]));
  // A character deleted after it was last saved stays deleted, here and in what comes in.
  const alive = (ch) => !ch?.rosterId || !gone.has(ch.rosterId) || String(ch.savedAt || '') > gone.get(ch.rosterId);
  current = current.filter(alive);
  incoming = incoming.filter(alive);
  const out = [...current];
  for (const ch of incoming) {
    if (!ch?.rosterId) { out.push(ch); continue; }
    const i = out.findIndex((x) => x.rosterId === ch.rosterId);
    if (i < 0) out.push(ch);
    else if (String(ch.savedAt || '') >= String(out[i].savedAt || '')) out[i] = ch;
  }
  return out;
}

function mergeWorld(current, incoming) {
  if (!current) return incoming;
  const out = { ...current, entities: { ...(current.entities || {}), ...(incoming.entities || {}) }, overrides: { ...(current.overrides || {}), ...(incoming.overrides || {}) } };
  out.links = [...(current.links || [])];
  for (const l of incoming.links || []) if (!out.links.some((x) => x.id === l.id)) out.links.push(l);
  out.hidden = [...new Set([...(current.hidden || []), ...(incoming.hidden || [])])];
  if (incoming.name && (!current.name || current.name === 'My World')) { out.name = incoming.name; out.tagline = incoming.tagline || current.tagline; out.description = incoming.description || current.description; }
  return out;
}

/** Apply a backup. mode: 'merge' (default) keeps what is here and adds what is new; 'replace' overwrites. Returns counts. */
export function restoreAll(backup, { mode = 'merge', skip = [] } = {}) {
  if (!backup || backup.app !== 'DCUGen' || !backup.data) throw new Error('That is not a DCUGen backup file.');
  let keys = 0;
  let tombs = [];
  if (mode === 'merge') {
    try { tombs = mergeTombs(JSON.parse(localStorage.getItem(DELETED) || '[]'), JSON.parse(backup.data[DELETED] || '[]')); } catch { tombs = []; }
    if (tombs.length) try { localStorage.setItem(DELETED, JSON.stringify(tombs)); } catch { /* full */ }
  }
  for (const [k, v] of Object.entries(backup.data)) {
    if (!k.startsWith(APP_KEYS_PREFIX) || typeof v !== 'string') continue;
    if (skip.includes(k) || (mode === 'merge' && k === DELETED)) continue;
    let value = v;
    if (mode === 'merge' && k === MERGE_ROSTER) {
      try { value = JSON.stringify(mergeRoster(JSON.parse(localStorage.getItem(k) || '[]'), JSON.parse(v), tombs)); } catch { value = v; }
    } else if (mode === 'merge' && k === MERGE_WORLD) {
      try { value = JSON.stringify(mergeWorld(JSON.parse(localStorage.getItem(k) || 'null'), JSON.parse(v))); } catch { value = v; }
    } else if (mode === 'merge' && ['dcugen.tab', 'dcugen.theme', 'dcugen.sheetview', 'dcugen.gmtab'].includes(k)) continue;
    try { localStorage.setItem(k, value); keys++; } catch { /* full */ }
  }
  return { keys };
}

export function downloadBackup() {
  const snap = snapshotAll();
  const n = Object.keys(snap.data).length;
  download(`dcugen-backup-${snap.savedAt.slice(0, 10)}.json`, JSON.stringify(snap, null, 1), 'application/json');
  toast(`Backup saved (${n} items)`);
}

export async function restoreDialog() {
  const file = h('input', { type: 'file', accept: '.json,application/json' });
  const mode = h('select', null, h('option', { value: 'merge' }, 'Merge: keep what is here, add and update from the file'), h('option', { value: 'replace' }, 'Replace: the file wins'));
  const ok = await openDialog({
    title: 'Restore a backup',
    body: [h('p', { style: { margin: 0 } }, 'Brings back a backup made with "Back up everything": roster, world, battle, notes, screen and settings. The page reloads afterwards.'), h('label', { class: 'field' }, h('span', null, 'Backup file'), file), h('label', { class: 'field' }, h('span', null, 'How'), mode)],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Restore', value: true, primary: true }],
  });
  if (!ok) return;
  const f = file.files?.[0];
  if (!f) { toast('Pick a backup file first'); return; }
  try {
    const data = JSON.parse(await f.text());
    const r = restoreAll(data, { mode: mode.value });
    toast(`Restored ${r.keys} items. Reloading…`);
    setTimeout(() => location.reload(), 600);
  } catch (e) { toast(`Restore failed: ${e.message}`); }
}

export function backupMenuItems() {
  return [
    { label: 'Back up everything (.json)', hint: 'Roster, world, battle, notes, screen, settings: one file to keep or move', run: downloadBackup },
    { label: 'Restore a backup…', hint: 'Merge or replace from a backup file', run: restoreDialog },
    { label: 'Sync with a cloud folder…', hint: 'Keep everything in a file in Dropbox, OneDrive, Google Drive or iCloud, for every device', run: () => import_syncDialog() },
    { label: `Storage: ${storageLine()}`, hint: 'Where your data lives in this browser', run: () => storageDialog() },
  ];
}

// ---- storage status ---------------------------------------------------------------------------------------------
let syncDialogFn = null;
/** The sync dialog lives in syncfile.js, which imports this file; it registers itself here. */
export function registerSyncDialog(fn) { syncDialogFn = fn; }
function import_syncDialog() { if (syncDialogFn) syncDialogFn(); else toast('Sync is not available here.'); }

function storageLine() {
  const s = window.__dcugenStorage;
  if (!s) return 'browser storage';
  return `${(s.bytes() / 1e6).toFixed(1)} MB in ${s.backend}`;
}

async function storageDialog() {
  const s = window.__dcugenStorage;
  let quota = null;
  try { const e = await navigator.storage?.estimate?.(); if (e?.quota) quota = e; } catch { /* unsupported */ }
  let persisted = null;
  try { persisted = await navigator.storage?.persisted?.(); } catch { /* unsupported */ }
  await openDialog({
    title: 'Where your data lives',
    body: [
      h('p', { style: { margin: 0 } }, s?.backend === 'IndexedDB'
        ? `Your roster, world, open characters and settings are kept in this browser's IndexedDB: ${(s.bytes() / 1e6).toFixed(1)} MB used. It holds hundreds of megabytes, so portraits no longer fill it up.`
        : 'This browser only offers its small storage (about 5 MB). Back up now and then, or use the desktop app.'),
      quota ? h('p', { class: 'hint', style: { margin: '8px 0 0' } }, `The browser allows this site about ${Math.round(quota.quota / 1e6)} MB${persisted ? ', and has promised not to clear it on its own' : ''}.`) : null,
      h('p', { class: 'hint', style: { margin: '8px 0 0' } }, 'It still lives in this browser only. To have it on every device, use "Sync with a cloud folder". To keep a copy, use "Back up everything".'),
    ],
  });
}
