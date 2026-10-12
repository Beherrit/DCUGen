// Version history: named snapshots of a character, kept in this browser (and in sync/backups). A version
// is taken every time the character is saved to the roster, and whenever you save one by hand ("before
// the respec"). Restoring puts it back on the Forge, as an edit you can undo.

import { costBreakdown } from '../engine/costs.js';

const KEY = 'dcugen.history.v1'; // { [characterKey]: [{ id, at, label, pp, ch }] }
const PER_CHARACTER = 40;

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const write = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch { return false; } };

/** Which history a character belongs to: its roster entry, or its own id. */
export const historyKey = (ch) => ch?.rosterId || ch?.id || null;

const strip = (ch) => {
  const c = JSON.parse(JSON.stringify(ch));
  // Pictures are big and the roster keeps the current one; versions keep the rest.
  if (c.portrait?.image) { delete c.portrait.image; delete c.portrait.aiSaved; c.portrait.source = c.portrait.source === 'upload' ? undefined : c.portrait.source; }
  for (const k of ['savedAt']) delete c[k];
  return c;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Save a version. Skips it when nothing changed since the last one (unless it has a new label). */
export function addVersion(ch, label, R) {
  const key = historyKey(ch);
  if (!key) return null;
  const all = read();
  const list = all[key] || [];
  const snap = strip(ch);
  const last = list[list.length - 1];
  if (last && same(last.ch, snap) && (!label || label === last.label)) return last;
  let pp = null;
  try { pp = costBreakdown(ch, R).total; } catch { /* unknown */ }
  const v = { id: `v-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`, at: new Date().toISOString(), label: label || 'Saved', pp, ch: snap };
  all[key] = [...list, v].slice(-PER_CHARACTER);
  write(all);
  return v;
}

export function versionsOf(ch) {
  const key = historyKey(ch);
  return key ? [...(read()[key] || [])].reverse() : [];
}

export function removeVersion(ch, id) {
  const key = historyKey(ch);
  const all = read();
  if (!all[key]) return;
  all[key] = all[key].filter((v) => v.id !== id);
  if (!all[key].length) delete all[key];
  write(all);
}

/** A version brought back onto the current character (keeps its roster entry and current picture). */
export function restoreVersion(current, v) {
  const c = JSON.parse(JSON.stringify(v.ch));
  if (current.rosterId) c.rosterId = current.rosterId;
  if (current.portrait?.image && !c.portrait?.image) c.portrait = { ...(c.portrait || {}), image: current.portrait.image, aiSaved: current.portrait.aiSaved, source: current.portrait.source };
  return c;
}

/** Re-key a character's history (a roll that got a roster entry on its first save). */
export function moveHistory(fromKey, toKey) {
  if (!fromKey || !toKey || fromKey === toKey) return;
  const all = read();
  if (!all[fromKey]) return;
  all[toKey] = [...(all[toKey] || []), ...all[fromKey]].slice(-PER_CHARACTER);
  delete all[fromKey];
  write(all);
}
