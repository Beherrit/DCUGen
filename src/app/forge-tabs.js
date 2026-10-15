// The Forge's open characters: tabs that survive a reload, undo and redo per tab, and keeping an open
// character in step when it changes elsewhere (the table, the GM screen).

import { h, toast } from './dom.js';
import { state, emit, upsert } from './store.js';
import { F } from './forge-common.js';

// ---- open characters as tabs ----------------------------------------------------------------
const TABS_KEY = 'dcugen.tabs.v1';
const MAX_TABS = 12;
if (!state.tabs) state.tabs = [];
if (state.active == null) state.active = 0;

// A saved character's portrait picture is already kept on the roster, so the open tabs point at it
// instead of storing a second copy. Pictures are big, and this browser's storage is not.
const FROM_ROSTER = '@roster';
function slimTab(ch) {
  const img = ch?.portrait?.image;
  if (!img || !ch.rosterId) return ch;
  if (state.roster.find((x) => x.rosterId === ch.rosterId)?.portrait?.image !== img) return ch;
  return { ...ch, portrait: { ...ch.portrait, image: FROM_ROSTER } };
}
function fatTab(ch) {
  if (ch?.portrait?.image !== FROM_ROSTER) return ch;
  const img = state.roster.find((x) => x.rosterId === ch.rosterId)?.portrait?.image;
  const portrait = { ...ch.portrait };
  if (img) portrait.image = img; else { delete portrait.image; if (portrait.source === 'upload') delete portrait.source; }
  return { ...ch, portrait };
}
const noPictures = (ch) => (ch?.portrait?.image ? { ...ch, portrait: { ...ch.portrait, image: undefined, source: undefined } } : ch);

let warnedFull = false;
/**
 * Keep the open tabs so a reload (or a redeploy) shows the same characters. When this browser's storage
 * is full, fall back to this window's session storage, then to a copy without uploaded pictures, so the
 * character being worked on is never lost to a new roll.
 */
export function saveTabs() {
  const pack = (tabs) => JSON.stringify({ tabs, active: state.active, at: Date.now() });
  const slim = pack(state.tabs.map(slimTab));
  let where = null;
  try { localStorage.setItem(TABS_KEY, slim); where = 'local'; } catch { /* storage full or blocked */ }
  if (!where) try { sessionStorage.setItem(TABS_KEY, slim); where = 'session'; } catch { /* full too */ }
  if (!where) try { localStorage.setItem(TABS_KEY, pack(state.tabs.map(slimTab).map(noPictures))); where = 'local'; } catch { /* nothing left */ }
  if (where === 'local') try { sessionStorage.removeItem(TABS_KEY); } catch { /* ignore */ }
  if (where !== 'local' && !warnedFull) {
    warnedFull = true;
    toast('This browser\'s storage is nearly full, so open characters may not survive closing the tab. Save them to the roster, or make room (Roster > Backup, then delete old characters or pictures).');
  }
}

function readTabs(store) {
  try { const t = JSON.parse(store.getItem(TABS_KEY) || 'null'); return t?.tabs?.length ? t : null; } catch { return null; }
}

/** Restore the open tabs from the last visit. Returns true if any were restored. */
export function restoreTabs() {
  let local = null; let session = null;
  try { local = readTabs(localStorage); } catch { /* blocked */ }
  try { session = readTabs(sessionStorage); } catch { /* blocked */ }
  const saved = session && (!local || (session.at || 0) > (local.at || 0)) ? session : local;
  if (!saved) return false;
  state.tabs = saved.tabs.slice(0, MAX_TABS).map(fatTab);
  state.active = Math.max(0, Math.min(saved.active || 0, state.tabs.length - 1));
  state.current = state.tabs[state.active];
  try { F.renderCurrent(); } catch (e) { console.error(e); }
  return true;
}

// ---- undo / redo ------------------------------------------------------------------------------------
// Every change to an open character (an edit, a re-roll in the same tab, a form switch, a drain, a save)
// keeps the version before it, per tab, so Ctrl+Z / Ctrl+Y walk back and forth. Kept for this visit only.
const UNDO_DEPTH = 80;
const undoStacks = []; // parallel to state.tabs: { past: [], future: [] }
function stackAt(i) {
  while (undoStacks.length < state.tabs.length) undoStacks.push({ past: [], future: [] });
  return undoStacks[i];
}
function remember(i, prev) {
  if (!prev) return;
  const s = stackAt(i);
  s.past.push(prev);
  if (s.past.length > UNDO_DEPTH) s.past.shift();
  s.future = [];
}
/** Replace the active tab's character, remembering the old one. */
export function putActive(c) {
  if (state.tabs[state.active] && state.tabs[state.active] !== c) remember(state.active, state.tabs[state.active]);
  state.current = c; state.tabs[state.active] = c;
}
export function canUndo() { return !!stackAt(state.active)?.past.length; }
export function canRedo() { return !!stackAt(state.active)?.future.length; }
export function undo() {
  const s = stackAt(state.active);
  if (!s?.past.length) { toast('Nothing to undo'); return; }
  s.future.push(state.tabs[state.active]);
  const prev = s.past.pop();
  state.tabs[state.active] = prev; state.current = prev; state.editing = state.editing && true;
  saveTabs(); F.renderCurrent(); emit('current');
}
export function redo() {
  const s = stackAt(state.active);
  if (!s?.future.length) { toast('Nothing to redo'); return; }
  s.past.push(state.tabs[state.active]);
  const next = s.future.pop();
  state.tabs[state.active] = next; state.current = next;
  saveTabs(); F.renderCurrent(); emit('current');
}

/**
 * Change a character that is open in a tab (or else on the roster) from outside the Forge: a GM's hit
 * or hero point arriving over the lobby. fn gets a copy to change. Returns the changed copy, or null.
 */
export function updateOpen(rosterId, fn) {
  const i = state.tabs.findIndex((t) => t.rosterId === rosterId);
  if (i >= 0) {
    const c = JSON.parse(JSON.stringify(state.tabs[i]));
    fn(c);
    if (i === state.active) putActive(c); else { remember(i, state.tabs[i]); state.tabs[i] = c; }
    saveTabs(); F.renderCurrent(); emit('current');
    return c;
  }
  const r = state.roster.find((x) => x.rosterId === rosterId);
  if (!r) return null;
  const c = JSON.parse(JSON.stringify(r));
  fn(c);
  return upsert(c);
}

/**
 * Show a character. By default it replaces the active tab; newTab opens it in a new tab
 * (or switches to the tab already showing that saved character).
 */
export function setCurrent(ch, { fresh: isFresh = false, editing = false, newTab = false } = {}) {
  if (newTab || !state.tabs.length) {
    const existing = ch.rosterId ? state.tabs.findIndex((t) => t.rosterId === ch.rosterId) : -1;
    if (existing >= 0) {
      if (state.tabs[existing] !== ch) remember(existing, state.tabs[existing]);
      state.tabs[existing] = ch;
      state.active = existing;
    } else {
      stackAt(state.tabs.length - 1);
      if (state.tabs.length >= MAX_TABS) { state.tabs.shift(); undoStacks.shift(); }
      state.tabs.push(ch);
      undoStacks[state.tabs.length - 1] = { past: [], future: [] };
      state.active = state.tabs.length - 1;
    }
  } else {
    putActive(ch);
  }
  state.current = ch;
  state.editing = editing;
  F.fresh = isFresh;
  saveTabs();
  F.renderCurrent();
  emit('current');
}

export function switchTab(i) {
  if (!state.tabs[i]) return;
  state.active = i;
  state.current = state.tabs[i];
  state.editing = false;
  saveTabs();
  F.renderCurrent();
  emit('current');
}

function closeTab(i) {
  state.tabs.splice(i, 1);
  undoStacks.splice(i, 1);
  if (!state.tabs.length) { state.active = 0; state.current = null; state.editing = false; saveTabs(); F.renderCurrent(); emit('current'); return; }
  if (i < state.active || state.active >= state.tabs.length) state.active -= 1;
  state.active = Math.max(0, Math.min(state.active, state.tabs.length - 1));
  state.current = state.tabs[state.active];
  state.editing = false;
  saveTabs();
  F.renderCurrent();
  emit('current');
}

export function tabStrip() {
  return h('div', { class: 'char-tabs', role: 'tablist', 'aria-label': 'Open characters' },
    state.tabs.map((c, i) => h('div', { class: `char-tab ${i === state.active ? 'active' : ''}`, role: 'presentation', style: { '--c': c.theme?.color || '#888888' } },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === state.active), class: 'char-tab-btn', title: `${c.identity?.codename || 'Unnamed'} · PL ${c.pl}`, onClick: () => switchTab(i) },
        h('span', { class: 'swatch' }), h('span', { class: 'char-tab-name' }, c.identity?.codename || 'Unnamed'), h('span', { class: 'char-tab-pl num' }, c.pl)),
      h('button', { type: 'button', class: 'x', 'aria-label': `Close ${c.identity?.codename || 'tab'}`, onClick: (e) => { e.stopPropagation(); closeTab(i); } }, '✕'))),
    h('button', { type: 'button', class: 'char-tab-new', title: 'Roll a new character in a new tab', 'aria-label': 'New tab', onClick: () => F.roll(undefined, { newTab: true }) }, '+'));
}
