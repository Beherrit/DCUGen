// Backup and restore of everything the app keeps in this browser: roster, open tabs, world, battle,
// GM notes and screen, preferences. One file. Restore merges characters and world pages, and
// replaces the rest. The desktop app uses the same snapshot to mirror the data to disk.

import { h, toast, download, openDialog } from './dom.js';

export const APP_KEYS_PREFIX = 'dcugen.';
const MERGE_ROSTER = 'dcugen.roster.v1';
const MERGE_WORLD = 'dcugen.world.v1';

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

function mergeRoster(current, incoming) {
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
export function restoreAll(backup, { mode = 'merge' } = {}) {
  if (!backup || backup.app !== 'DCUGen' || !backup.data) throw new Error('That is not a DCUGen backup file.');
  let keys = 0;
  for (const [k, v] of Object.entries(backup.data)) {
    if (!k.startsWith(APP_KEYS_PREFIX) || typeof v !== 'string') continue;
    let value = v;
    if (mode === 'merge' && k === MERGE_ROSTER) {
      try { value = JSON.stringify(mergeRoster(JSON.parse(localStorage.getItem(k) || '[]'), JSON.parse(v))); } catch { value = v; }
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
  ];
}
