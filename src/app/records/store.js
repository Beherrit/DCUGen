// Saved fight records in the browser's storage: one key per fight ('dcugen.fight.<id>') and a small index
// ('dcugen.fights.index') with just what the list needs. A save writes one fight and the index, never the archive.
// Every call is wrapped: when storage is blocked or full, nothing throws and the answer is empty or false.

import { recordId, SOURCES } from '../../engine/records/record.js';
import { summaryLine, recordText } from '../../engine/records/summary.js';

export const FIGHT_PREFIX = 'dcugen.fight.';
export const INDEX_KEY = 'dcugen.fights.index';
export const KEEP_KEY = 'dcugen.fights.keep';
export const KEEP_MAX = 2000;

const slim = new Map();

/** Is "Keep fight logs" on? It is, unless it was switched off. */
export function keepLogs() {
  try { return localStorage.getItem(KEEP_KEY) !== '0'; } catch { return true; }
}

export function setKeepLogs(on) {
  try { localStorage.setItem(KEEP_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
}

/** The index: [{ id, date, source, label, summary, who }] in the order they were saved. */
function readIndex() {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string') : [];
  } catch { return []; }
}

function writeIndex(list) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

const entryOf = (rec) => ({
  id: rec.id, date: rec.date, source: SOURCES.includes(rec.source) ? rec.source : 'battle-room', label: rec.label || '',
  summary: summaryLine(rec), who: [...new Set(Object.values(rec.teams || {}).flat().map((f) => f.name))],
});

/** The first id for this seed that is not taken yet (a replay of the same seed gets the next number). */
export function freeId(seed) {
  const taken = new Set(readIndex().map((e) => e.id));
  let n = 1;
  while (taken.has(recordId(seed, n))) n++;
  return n;
}

/** Keep a record. Returns its id, or null when it could not be written. */
export function saveRecord(rec) {
  try {
    localStorage.setItem(FIGHT_PREFIX + rec.id, JSON.stringify(rec));
  } catch { return null; }
  const index = readIndex().filter((e) => e.id !== rec.id);
  index.push(entryOf(rec));
  if (!writeIndex(index)) { try { localStorage.removeItem(FIGHT_PREFIX + rec.id); } catch { /* ignore */ } return null; }
  return rec.id;
}

export function loadRecord(id) {
  try {
    const rec = JSON.parse(localStorage.getItem(FIGHT_PREFIX + id) || 'null');
    return rec && rec.teams && Array.isArray(rec.log) ? rec : null;
  } catch { return null; }
}

/** The index entries, newest first (by date, then id). */
export function listRecords() {
  return readIndex().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
}

export const hasRecord = (id) => readIndex().some((e) => e.id === id);

export function deleteRecord(id) {
  slim.delete(id);
  try { localStorage.removeItem(FIGHT_PREFIX + id); } catch { /* ignore */ }
  return writeIndex(readIndex().filter((e) => e.id !== id));
}

/** The plain-text log of a saved fight (empty when it is gone). */
export function exportRecord(id) {
  const rec = loadRecord(id);
  return rec ? recordText(rec) : '';
}

/** Drop the oldest fights beyond `keep`. Returns how many went. */
export function pruneRecords(keep = KEEP_MAX) {
  const index = readIndex();
  if (index.length <= keep) return 0;
  const oldest = [...index].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1)).slice(0, index.length - keep);
  const gone = new Set(oldest.map((e) => e.id));
  for (const id of gone) { slim.delete(id); try { localStorage.removeItem(FIGHT_PREFIX + id); } catch { /* ignore */ } }
  writeIndex(index.filter((e) => !gone.has(e.id)));
  return gone.size;
}

/** The records without their logs (all the leaderboard needs), read once per session and kept in memory. */
export function loadSlim(entries = listRecords()) {
  const out = [];
  for (const e of entries) {
    if (!slim.has(e.id)) { const rec = loadRecord(e.id); if (rec) slim.set(e.id, { ...rec, log: [] }); }
    if (slim.has(e.id)) out.push(slim.get(e.id));
  }
  return out;
}
