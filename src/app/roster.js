// Roster: saved characters, in worlds. Top-level folders are worlds (the multiverse: Earth-1, Earth-2,
// a homebrew setting...), with folders inside them; "The Multiverse Hub" shows everyone in every world.
// A folder tree on the left (nested with "/", counts, colours,
// collapse), characters on the right grouped by team; move them with the card's menu, by dragging a
// card onto a folder, or by selecting several and using the bar at the bottom. Sort, search, filter
// by side, cards or a compact list. The folder travels with the character (ch.folder), so exports,
// backups, world keys and the lobby carry it.

import { h, clear, toast, openDialog, inkFor } from './dom.js';
import { state, saveRoster, upsert, removeFromRoster, newId } from './store.js';
import { exportExcel, exportJson, exportRosterExcel, exportRosterJson } from './exporters.js';
import { importDialog as importAndOpen } from './importer.js';
import { sheet as makeSheet } from '../engine/render.js';
import { backupMenuItems } from './backup.js';
import { paintRoster } from './portrait.js';
import { setPortrait, portraitOf } from '../engine/portrait.js';

const FOLDERS_KEY = 'dcugen.roster.folders.v1';
const VIEW_KEY = 'dcugen.roster.view';
let R;
let root;
let hooks = {};
let query = '';
let side = 'all';
let confirmDelete = null;
const ui = { folder: null, sort: 'saved', view: 'cards', selecting: false, selected: new Set(), dragOver: null };

// ---- folders -------------------------------------------------------------------------------------------------

function readFolders() { try { const f = JSON.parse(localStorage.getItem(FOLDERS_KEY) || 'null'); if (f?.list) return f; } catch { /* ignore */ } return { list: [], collapsed: {} }; }
let folders = readFolders();
function saveFolders() { try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)); } catch { /* full */ } }
try { Object.assign(ui, JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'), { selected: new Set(), selecting: false, dragOver: null }); } catch { /* ignore */ }
function saveView() { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ sort: ui.sort, view: ui.view, folder: ui.folder })); } catch { /* ignore */ } }

const cleanPath = (p) => String(p || '').split('/').map((x) => x.trim()).filter(Boolean).join('/');
const parentOf = (p) => cleanPath(p).split('/').slice(0, -1).join('/');
const leafOf = (p) => cleanPath(p).split('/').pop() || '';
const inFolder = (ch, path) => (path == null ? true : path === '' ? !ch.folder : ch.folder === path || String(ch.folder || '').startsWith(`${path}/`));

/** Every folder path: registered ones, ones characters use, and all their parents. Sorted. */
function allFolders() {
  const set = new Set();
  const addWithParents = (p) => { const parts = cleanPath(p).split('/').filter(Boolean); for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/')); };
  for (const f of folders.list) addWithParents(f.path);
  for (const ch of state.roster) if (ch.folder) addWithParents(ch.folder);
  return [...set].sort((a, b) => a.localeCompare(b));
}
function folderMeta(path) { return folders.list.find((f) => f.path === path) || null; }
function ensureFolder(path, extra = {}) {
  const p = cleanPath(path);
  if (!p) return null;
  const parts = p.split('/');
  for (let i = 1; i <= parts.length; i++) { const sub = parts.slice(0, i).join('/'); if (!folderMeta(sub)) folders.list.push({ path: sub, ...(i === parts.length ? extra : {}) }); }
  saveFolders();
  return p;
}
function moveTo(chars, path) {
  const p = cleanPath(path);
  if (p) ensureFolder(p);
  let n = 0;
  for (const ch of chars) {
    const live = state.roster.find((x) => x.rosterId === ch.rosterId);
    if (!live || (live.folder || '') === p) continue;
    const copy = JSON.parse(JSON.stringify(live));
    if (p) copy.folder = p; else delete copy.folder;
    upsert(copy); n++;
  }
  return n;
}
function renameFolder(from, to) {
  const a = cleanPath(from); const b = cleanPath(to);
  if (!a || !b || a === b) return;
  for (const f of folders.list) if (f.path === a || f.path.startsWith(`${a}/`)) f.path = b + f.path.slice(a.length);
  for (const k of Object.keys(folders.collapsed)) if (k === a || k.startsWith(`${a}/`)) { folders.collapsed[b + k.slice(a.length)] = folders.collapsed[k]; delete folders.collapsed[k]; }
  for (const ch of state.roster) if (ch.folder === a || String(ch.folder || '').startsWith(`${a}/`)) ch.folder = b + ch.folder.slice(a.length);
  saveRoster(); saveFolders();
  if (ui.folder === a || String(ui.folder || '').startsWith(`${a}/`)) ui.folder = b + ui.folder.slice(a.length);
}
function deleteFolder(path) {
  const p = cleanPath(path); const parent = parentOf(p);
  folders.list = folders.list.filter((f) => f.path !== p && !f.path.startsWith(`${p}/`));
  for (const ch of state.roster) if (ch.folder === p || String(ch.folder || '').startsWith(`${p}/`)) { if (parent) ch.folder = parent; else delete ch.folder; }
  saveRoster(); saveFolders();
  if (ui.folder === p || String(ui.folder || '').startsWith(`${p}/`)) ui.folder = parent || null;
}

export function initRoster(rules, el, h2) {
  R = rules;
  root = el;
  hooks = h2;
  renderRoster();
}

// ---- filtering and sorting -------------------------------------------------------------------------------------

function matches(ch) {
  if (!inFolder(ch, ui.folder)) return false;
  if (side !== 'all' && (ch.alignment || 'hero') !== side) return false;
  if (!query) return true;
  const hay = [ch.identity?.codename, ch.identity?.realName, ch.archetype?.name, ch.theme?.name, ch.team, ch.identity?.base, ch.folder, ...(ch.factions || []).map((f) => f.name)].join(' ').toLowerCase();
  return hay.includes(query.toLowerCase());
}
const SORTS = { saved: 'Recently saved', name: 'Name', pl: 'Power level', side: 'Side', archetype: 'Archetype', folder: 'World' };
function sorted(list) {
  const name = (c) => (c.identity?.codename || c.identity?.realName || '').toLowerCase();
  const by = {
    saved: (a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')),
    name: (a, b) => name(a).localeCompare(name(b)),
    pl: (a, b) => (b.pl || 0) - (a.pl || 0) || name(a).localeCompare(name(b)),
    side: (a, b) => (a.alignment || 'hero').localeCompare(b.alignment || 'hero') || name(a).localeCompare(name(b)),
    archetype: (a, b) => (a.archetype?.name || '').localeCompare(b.archetype?.name || '') || name(a).localeCompare(name(b)),
    folder: (a, b) => (a.folder || '').localeCompare(b.folder || '') || name(a).localeCompare(name(b)),
  }[ui.sort] || ((a, b) => 0);
  return [...list].sort(by);
}

// ---- pieces -------------------------------------------------------------------------------------------------------

function folderPicker(current, onPick, { allowNew = true, label = 'Move to…' } = {}) {
  const sel = h('select', { class: 'btn sm', 'aria-label': label, title: 'Move to a folder', onChange: async (e) => {
    const v = e.target.value;
    if (v === '__new') { const name = await newFolderDialog(current ? parentOf(current) : ''); if (name) onPick(name); e.target.value = '__cur'; return; }
    if (v !== '__cur') onPick(v === '__root' ? '' : v);
  } },
  h('option', { value: '__cur', selected: true }, label),
  h('option', { value: '__root' }, current ? '🌌 Hub only (no world)' : '✓ Hub only (no world)'),
  allFolders().map((p) => h('option', { value: p, disabled: p === current }, `${'　'.repeat(p.split('/').length - 1)}${p === current ? '✓ ' : ''}${p.includes('/') ? '' : '🌍 '}${leafOf(p)}`)),
  allowNew ? h('option', { value: '__new' }, current ? '+ New folder…' : '+ New world…') : null);
  return sel;
}

/**
 * The "Save to world" dropdown on the Forge: the Hub (no world), every world and folder, or a new world.
 * onPick gets the folder path ('' for the Hub only).
 */
export function worldSelect(current, onPick, { id } = {}) {
  const cur = cleanPath(current);
  const all = allFolders();
  if (cur && !all.includes(cur)) all.push(cur);
  const sel = h('select', { id, 'aria-label': 'Save to world', title: 'Which world this character belongs to. Everyone shows up in The Multiverse Hub.', onChange: async (e) => {
    const v = e.target.value;
    if (v === '__new') {
      const path = await newFolderDialog('');
      if (path) onPick(path); else e.target.value = cur;
      return;
    }
    onPick(v);
  } },
  h('option', { value: '', selected: !cur }, '🌌 The Multiverse Hub only'),
  all.map((p) => h('option', { value: p, selected: p === cur }, `${'　'.repeat(p.split('/').length - 1)}${p.includes('/') ? '📁' : '🌍'} ${leafOf(p)}`)),
  h('option', { value: '__new' }, '+ New world…'));
  return sel;
}

async function newFolderDialog(parent = '') {
  const name = h('input', { type: 'text', placeholder: parent ? 'Folder name' : 'World name, e.g. Earth-2 (use / for a folder inside a world)', 'aria-label': parent ? 'Folder name' : 'World name' });
  const color = h('input', { type: 'color', value: '#4b5563', style: { width: '48px', padding: '2px' } });
  const ok = await openDialog({ title: parent ? `New folder in ${parent}` : 'New world', body: [h('label', { class: 'field' }, h('span', null, 'Name'), name), h('label', { class: 'field' }, h('span', null, 'Colour'), color), h('p', { class: 'hint', style: { margin: 0 } }, 'Worlds hold characters, and every character also shows up in The Multiverse Hub. Drag a card onto a world, use "Move to…" on a card, or select several and move them together. "Earth-2/Villains" makes a folder inside a world.')], buttons: [{ label: 'Cancel', value: false }, { label: 'Create', value: true, primary: true }] });
  if (!ok || !name.value.trim()) return null;
  const path = ensureFolder(parent ? `${parent}/${name.value.trim()}` : name.value.trim(), { color: color.value });
  renderRoster();
  return path;
}

function card(ch) {
  let s;
  try { s = makeSheet(ch, R); } catch { s = null; }
  const color = ch.theme?.color || '#555';
  const legal = s ? s.legal : false;
  const main = s?.offense.find((o) => o.attack && o.attack.name !== 'Unarmed');
  const sel = ui.selected.has(ch.rosterId);
  const toggle = () => { if (sel) ui.selected.delete(ch.rosterId); else ui.selected.add(ch.rosterId); ui.selecting = true; renderRoster(); };
  const el = h('article', { class: `card ${sel ? 'selected' : ''}`, draggable: 'true',
    onDragstart: (e) => { const ids = sel ? [...ui.selected] : [ch.rosterId]; e.dataTransfer.setData('text/dcugen-roster', JSON.stringify(ids)); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); },
    onDragend: () => el.classList.remove('dragging') },
    h('div', { class: 'card-head', style: { '--hero': color, '--hero-ink': inkFor(color) } },
      h('label', { class: 'card-pick no-print', title: 'Select' }, h('input', { type: 'checkbox', checked: sel, 'aria-label': `Select ${ch.identity?.codename || 'character'}`, onChange: toggle })),
      h('div', { class: 'cn' }, ch.identity?.codename || 'Unnamed'),
      h('div', { class: 'rn' }, [ch.identity?.realName, `PL ${ch.pl}`, ch.alignment === 'villain' ? 'Villain' : 'Hero'].filter(Boolean).join(' · ')),
      ch.folder && ui.folder !== ch.folder ? h('button', { type: 'button', class: 'card-folder', title: 'Open this folder', onClick: () => { ui.folder = ch.folder; saveView(); renderRoster(); } }, `${ch.folder.includes('/') ? '📁' : '🌍'} ${ch.folder}`) : null),
    h('div', { class: 'card-body' },
      h('div', { class: 'tagwrap' },
        ch.archetype?.name && h('span', { class: 'chip' }, ch.archetype.name),
        ch.theme?.name && h('span', { class: 'chip' }, ch.theme.name),
        h('span', { class: `status ${legal ? 'ok' : 'bad'}` }, legal ? `✓ ${s.cost.total}/${s.cost.budget}` : 'Check rules')),
      s ? h('div', { class: 'card-stats' },
        [['Dodge', s.d.defenses.Dodge], ['Parry', s.d.defenses.Parry], ['Tough', s.d.defenses.Toughness], ['Will', s.d.defenses.Will]].map(([k, v]) =>
          h('div', null, h('b', { class: 'num' }, v), h('span', null, k.toUpperCase())))) : null,
      main ? h('div', { style: { fontSize: '13px', color: 'var(--ink-2)' } }, `${main.label}: ${main.text}`) : null),
    h('div', { class: 'card-actions' },
      h('button', { class: 'btn sm primary', type: 'button', onClick: () => hooks.open?.(ch) }, 'Open'),
      folderPicker(ch.folder || '', (p) => { moveTo([ch], p); renderRoster(); toast(p ? `Moved to ${p}` : 'Moved out of its folder'); }),
      h('button', { class: 'btn sm', type: 'button', onClick: () => exportExcel(ch, R) }, 'Excel'),
      h('button', { class: 'btn sm', type: 'button', onClick: () => exportJson(ch) }, 'JSON'),
      h('button', { class: 'btn sm', type: 'button', title: 'Add to the Battle Room', onClick: () => hooks.throwIn?.(ch) }, '⚔'),
      h('button', { class: 'btn sm', type: 'button', title: 'Duplicate', onClick: () => {
        const copy = JSON.parse(JSON.stringify(ch)); copy.rosterId = newId(); copy.identity = { ...copy.identity, codename: `${copy.identity?.codename || 'Unnamed'} (copy)` };
        upsert(copy); renderRoster(); toast('Copy added');
      } }, '⧉'),
      confirmDelete === ch.rosterId
        ? h('span', { class: 'btn-row' },
          h('button', { class: 'btn sm danger', type: 'button', onClick: () => { removeFromRoster(ch.rosterId); confirmDelete = null; renderRoster(); toast('Deleted'); } }, 'Delete for good'),
          h('button', { class: 'btn sm', type: 'button', onClick: () => { confirmDelete = null; renderRoster(); } }, 'Keep'))
        : h('button', { class: 'btn sm ghost danger', type: 'button', title: 'Delete', onClick: () => { confirmDelete = ch.rosterId; renderRoster(); } }, '🗑')));
  return el;
}

function row(ch) {
  let s; try { s = makeSheet(ch, R); } catch { s = null; }
  const sel = ui.selected.has(ch.rosterId);
  const el = h('tr', { class: sel ? 'selected' : '', draggable: 'true', onDragstart: (e) => { const ids = sel ? [...ui.selected] : [ch.rosterId]; e.dataTransfer.setData('text/dcugen-roster', JSON.stringify(ids)); e.dataTransfer.effectAllowed = 'move'; } },
    h('td', null, h('input', { type: 'checkbox', checked: sel, 'aria-label': 'Select', onChange: () => { if (sel) ui.selected.delete(ch.rosterId); else ui.selected.add(ch.rosterId); ui.selecting = true; renderRoster(); } })),
    h('td', null, h('button', { type: 'button', class: 'linkish', style: { fontWeight: 800 }, onClick: () => hooks.open?.(ch) }, ch.identity?.codename || 'Unnamed'), h('small', { style: { color: 'var(--ink-3)', marginLeft: '6px' } }, ch.identity?.realName || '')),
    h('td', { class: 'num' }, ch.pl), h('td', null, ch.alignment === 'villain' ? 'Villain' : 'Hero'), h('td', null, ch.archetype?.name || ''), h('td', null, ch.theme?.name || ''), h('td', null, ch.team || ''),
    h('td', { class: 'num' }, s ? `${s.d.defenses.Dodge}/${s.d.defenses.Parry}/${s.d.defenses.Toughness}/${s.d.defenses.Will}` : ''),
    h('td', null, folderPicker(ch.folder || '', (p) => { moveTo([ch], p); renderRoster(); }, { label: ch.folder ? leafOf(ch.folder) : 'Hub only' })),
    h('td', null, h('div', { class: 'btn-row', style: { gap: '4px' } }, h('button', { class: 'btn sm', type: 'button', onClick: () => exportExcel(ch, R) }, 'Excel'), h('button', { class: 'btn sm', type: 'button', title: 'Add to the Battle Room', onClick: () => hooks.throwIn?.(ch) }, '⚔'))));
  return el;
}

function dropTarget(el, path) {
  el.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/dcugen-roster')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drop-over'); } });
  el.addEventListener('dragleave', () => el.classList.remove('drop-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault(); el.classList.remove('drop-over');
    let ids = []; try { ids = JSON.parse(e.dataTransfer.getData('text/dcugen-roster') || '[]'); } catch { /* ignore */ }
    const chars = state.roster.filter((c) => ids.includes(c.rosterId));
    const n = moveTo(chars, path);
    ui.selected.clear(); ui.selecting = false;
    renderRoster();
    if (n) toast(`${n} moved to ${path || 'no folder'}`);
  });
  return el;
}

function folderTree() {
  const counts = (path) => state.roster.filter((c) => inFolder(c, path)).length;
  const all = allFolders();
  const node = (path, label, { depth = 0, color = null, meta = null } = {}) => {
    const children = path === null || path === '' ? [] : all.filter((p) => parentOf(p) === path);
    const collapsed = !!folders.collapsed[path];
    const active = ui.folder === path;
    const btn = h('div', { class: `rf-node ${active ? 'active' : ''}`, style: { '--d': depth, '--c': color || 'var(--ink-3)' } },
      children.length ? h('button', { type: 'button', class: 'rf-caret', 'aria-label': collapsed ? 'Expand' : 'Collapse', onClick: () => { folders.collapsed[path] = !collapsed; saveFolders(); renderRoster(); } }, collapsed ? '▸' : '▾') : h('span', { class: 'rf-caret' }),
      h('button', { type: 'button', class: 'rf-name', onClick: () => { ui.folder = path; saveView(); renderRoster(); } }, h('span', { class: 'rf-glyph' }, path === null ? '🌌' : path === '' ? '📄' : path.includes('/') ? '📁' : '🌍'), h('span', { class: 'rf-label' }, label), h('span', { class: 'count' }, counts(path))),
      path ? h('button', { type: 'button', class: 'rf-more', title: 'Rename, colour, delete, export', 'aria-label': `Folder options for ${label}`, onClick: (e) => { e.stopPropagation(); folderMenu(path, e.currentTarget); } }, '⋯') : null);
    if (path !== null) dropTarget(btn, path);
    return [btn, ...(collapsed ? [] : children.map((p) => node(p, leafOf(p), { depth: depth + 1, color: folderMeta(p)?.color || null, meta: folderMeta(p) })))];
  };
  const roots = all.filter((p) => !p.includes('/'));
  return h('aside', { class: 'rf-side', 'aria-label': 'Worlds' },
    h('div', { class: 'rf-head' }, h('b', null, 'Worlds'), h('button', { class: 'btn sm', type: 'button', onClick: () => newFolderDialog('') }, '+ World')),
    node(null, 'The Multiverse Hub'), node('', 'Not in a world'),
    roots.length ? roots.map((p) => node(p, leafOf(p), { color: folderMeta(p)?.color || null })) : h('p', { class: 'hint', style: { margin: '6px 0 0 8px' } }, 'No worlds yet. Make one for each setting or campaign (Earth-1, Earth-2, a homebrew city…), with folders inside for teams, villains, NPCs.'),
    h('p', { class: 'hint', style: { margin: '10px 0 0' } }, 'Drag a card onto a world to move it.'));
}

async function folderMenu(path, anchor) {
  document.querySelectorAll('.menu-list').forEach((m) => { m.hidden = true; });
  const list = h('div', { class: 'menu-list', role: 'menu' });
  const item = (label, hint, fn) => h('button', { type: 'button', role: 'menuitem', onClick: () => { list.remove(); fn(); } }, label, hint ? h('small', null, hint) : null);
  const members = state.roster.filter((c) => inFolder(c, path));
  list.append(
    item('Rename', null, async () => { const name = h('input', { type: 'text', value: leafOf(path) }); const ok = await openDialog({ title: 'Rename folder', body: h('label', { class: 'field' }, h('span', null, 'Name'), name), buttons: [{ label: 'Cancel', value: false }, { label: 'Rename', value: true, primary: true }] }); if (ok && name.value.trim()) { renameFolder(path, parentOf(path) ? `${parentOf(path)}/${name.value.trim()}` : name.value.trim()); renderRoster(); } }),
    item('Colour', null, async () => { const c = h('input', { type: 'color', value: folderMeta(path)?.color || '#4b5563' }); const ok = await openDialog({ title: 'Folder colour', body: c, buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }] }); if (ok) { ensureFolder(path); folderMeta(path).color = c.value; saveFolders(); renderRoster(); } }),
    item('New folder inside', null, () => newFolderDialog(path)),
    item('Export to Excel', `${members.length} character${members.length === 1 ? '' : 's'}`, () => exportRosterExcel(members, R, leafOf(path))),
    item('Export JSON', null, () => exportRosterJson(members)),
    item('Throw all in the Battle Room', null, () => { for (const c of members) hooks.throwIn?.(c); toast(`${members.length} thrown in`); }),
    item('Delete folder', 'Characters move to the parent folder', async () => { const ok = await openDialog({ title: `Delete folder "${leafOf(path)}"?`, body: h('p', { style: { margin: 0 } }, `The ${members.length} character${members.length === 1 ? '' : 's'} inside stay on the roster and move ${parentOf(path) ? `to ${parentOf(path)}` : 'out of any folder'}.`), buttons: [{ label: 'Keep', value: false }, { label: 'Delete folder', value: true, danger: true }] }); if (ok) { deleteFolder(path); renderRoster(); } }));
  // pinned to the page, so the scrolling sidebar cannot clip or cover it
  const r = anchor.getBoundingClientRect();
  const wrap = h('div', { class: 'menu rf-menu', style: { position: 'fixed', left: `${Math.min(r.left, window.innerWidth - 260)}px`, top: `${r.bottom + 4}px`, zIndex: 50 } }, list);
  document.body.append(wrap);
  const close = (e) => { if (!wrap.contains(e.target)) { wrap.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function bulkBar() {
  const n = ui.selected.size;
  if (!n && !ui.selecting) return null;
  const chars = state.roster.filter((c) => ui.selected.has(c.rosterId));
  const visible = state.roster.filter(matches);
  return h('div', { class: 'rf-bulk' },
    h('b', null, `${n} selected`),
    h('button', { class: 'btn sm', type: 'button', onClick: () => { for (const c of visible) ui.selected.add(c.rosterId); renderRoster(); } }, 'Select all shown'),
    h('button', { class: 'btn sm', type: 'button', onClick: () => { ui.selected.clear(); ui.selecting = false; renderRoster(); } }, 'Clear'),
    h('span', { class: 'spacer' }),
    folderPicker(null, (p) => { const k = moveTo(chars, p); ui.selected.clear(); ui.selecting = false; renderRoster(); toast(`${k} moved to ${p || 'no folder'}`); }, { label: n ? 'Move selected to…' : 'Move to…' }),
    h('button', { class: 'btn sm', type: 'button', disabled: !n, onClick: () => exportRosterExcel(chars, R) }, 'Excel'),
    h('button', { class: 'btn sm', type: 'button', disabled: !n, onClick: () => exportRosterJson(chars) }, 'JSON'),
    h('button', { class: 'btn sm', type: 'button', disabled: !n, onClick: () => { for (const c of chars) hooks.throwIn?.(c); toast(`${n} thrown in the Battle Room`); } }, '⚔ Battle Room'),
    h('button', { class: 'btn sm ghost danger', type: 'button', disabled: !n, onClick: async () => { const ok = await openDialog({ title: `Delete ${n} character${n === 1 ? '' : 's'}?`, body: h('p', { style: { margin: 0 } }, 'This cannot be undone (a backup can bring them back).'), buttons: [{ label: 'Keep', value: false }, { label: 'Delete', value: true, danger: true }] }); if (ok) { for (const c of chars) removeFromRoster(c.rosterId); ui.selected.clear(); ui.selecting = false; renderRoster(); toast('Deleted'); } } }, 'Delete'));
}

async function importDialog() {
  await importAndOpen({ open: false });
  renderRoster();
}

// ---- the page --------------------------------------------------------------------------------------------------------

export function renderRoster() {
  if (!root) return;
  clear(root);
  for (const id of ui.selected) if (!state.roster.some((c) => c.rosterId === id)) ui.selected.delete(id);
  if (ui.folder && !allFolders().includes(ui.folder)) ui.folder = null;
  const list = sorted(state.roster.filter(matches));
  const count = document.getElementById('roster-count');
  if (count) count.textContent = state.roster.length;
  const here = ui.folder === null ? 'The Multiverse Hub' : ui.folder === '' ? 'Not in a world' : ui.folder;

  root.append(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'Roster'), h('p', null, 'Characters you save live here, in this browser (and in the desktop app\'s data folder). Sort them into worlds (and folders inside worlds); The Multiverse Hub shows everyone. Select several at once. Export to Excel or JSON to keep a copy or send them to your group.')),
    h('span', { class: 'spacer' }),
    h('div', { class: 'btn-row' },
      paintButton(),
      backupMenu(),
      h('button', { class: 'btn', type: 'button', onClick: importDialog }, 'Import'),
      h('button', { class: 'btn', type: 'button', disabled: !list.length, title: `Everyone shown (${here})`, onClick: () => exportRosterExcel(list, R, ui.folder ? leafOf(ui.folder) : undefined) }, 'Export to Excel'),
      h('button', { class: 'btn', type: 'button', disabled: !list.length, onClick: () => exportRosterJson(list) }, 'Export JSON'))));

  if (!state.roster.length) {
    root.append(h('div', { class: 'empty' },
      h('h2', null, 'No one on the roster yet'),
      h('p', null, 'Roll a character on the Forge and press "Save to roster". Teams you roll can be saved in one go. You can also import share codes and .json files.'),
      h('div', { class: 'btn-row', style: { justifyContent: 'center', marginTop: '12px' } },
        h('button', { class: 'btn primary', type: 'button', onClick: () => hooks.goForge?.() }, 'Go to the Forge'),
        h('button', { class: 'btn', type: 'button', onClick: importDialog }, 'Import'))));
    return;
  }

  if (painting) root.append(h('p', { class: 'hint', id: 'paint-status', style: { margin: '0 0 8px' } }, paintStatus));
  const tools = h('div', { class: 'roster-tools' },
    h('input', { type: 'search', id: 'roster-search', placeholder: 'Search name, archetype, theme, team, faction, world', value: query, 'aria-label': 'Search roster',
      onInput: (e) => { query = e.target.value; renderRosterList(); } }),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter by side', style: { width: '240px' } },
      [['all', 'Everyone'], ['hero', 'Heroes'], ['villain', 'Villains']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(side === v), onClick: () => { side = v; renderRoster(); } }, t))),
    h('label', { class: 'wd-inline' }, 'Sort', h('select', { 'aria-label': 'Sort', onChange: (e) => { ui.sort = e.target.value; saveView(); renderRosterList(); } }, Object.entries(SORTS).map(([k, v]) => h('option', { value: k, selected: k === ui.sort }, v)))),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'View', style: { width: '150px' } },
      [['cards', 'Cards'], ['list', 'List']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(ui.view === v), onClick: () => { ui.view = v; saveView(); renderRosterList(); } }, t))),
    h('button', { class: 'btn sm', type: 'button', 'aria-pressed': String(ui.selecting), onClick: () => { ui.selecting = !ui.selecting; if (!ui.selecting) ui.selected.clear(); renderRoster(); } }, ui.selecting ? 'Done selecting' : '☑ Select'));
  const crumbs = h('div', { class: 'rf-crumbs' },
    h('button', { type: 'button', class: 'linkish', onClick: () => { ui.folder = null; saveView(); renderRoster(); } }, '🌌 The Multiverse Hub'),
    ...(ui.folder ? ui.folder.split('/').map((part, i, arr) => [h('span', { class: 'rf-sep' }, '›'), h('button', { type: 'button', class: 'linkish', onClick: () => { ui.folder = arr.slice(0, i + 1).join('/'); saveView(); renderRoster(); } }, part)]) : ui.folder === '' ? [h('span', { class: 'rf-sep' }, '›'), h('span', null, 'Not in a world')] : []),
    h('span', { class: 'hint', style: { marginLeft: '8px' } }, `${list.length} of ${state.roster.length}`));
  const listHost = h('div', { id: 'roster-list' });
  const main = h('div', { class: 'rf-main' }, crumbs, tools, listHost, bulkBar());
  root.append(h('div', { class: 'rf-layout' }, folderTree(), main));
  renderRosterList();
}

function renderRosterList() {
  const host = root.querySelector('#roster-list');
  if (!host) return;
  clear(host);
  const list = sorted(state.roster.filter(matches));
  if (!list.length) { host.append(h('p', { style: { color: 'var(--ink-2)' } }, ui.folder ? 'Nobody here yet. Drag characters here, use "Move to…" on a card, or pick this world when you save on the Forge.' : 'No characters match.')); return; }
  if (ui.view === 'list') {
    host.append(h('table', { class: 'skills rf-table' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Name'), h('th', null, 'PL'), h('th', null, 'Side'), h('th', null, 'Archetype'), h('th', null, 'Theme'), h('th', null, 'Team'), h('th', null, 'Dod/Par/Tou/Wil'), h('th', null, 'World'), h('th', null, ''))),
      h('tbody', null, list.map(row))));
    return;
  }
  // sub-folders of the current folder, as drop targets up top
  if (ui.folder !== '') {
    const subs = allFolders().filter((p) => (ui.folder === null ? !p.includes('/') : parentOf(p) === ui.folder));
    if (subs.length) host.append(h('div', { class: 'rf-subs' }, subs.map((p) => dropTarget(h('button', { type: 'button', class: 'rf-sub', style: { '--c': folderMeta(p)?.color || 'var(--ink-3)' }, onClick: () => { ui.folder = p; saveView(); renderRoster(); } }, p.includes('/') ? '📁 ' : '🌍 ', leafOf(p), h('span', { class: 'count' }, state.roster.filter((c) => inFolder(c, p)).length)), p))));
  }
  const teams = new Map();
  const solo = [];
  for (const ch of list) {
    if (ch.team && ui.sort !== 'folder') { if (!teams.has(ch.team)) teams.set(ch.team, []); teams.get(ch.team).push(ch); } else solo.push(ch);
  }
  for (const [team, members] of teams) {
    host.append(h('div', { class: 'group-title' }, team, h('span', { class: 'team-label' }, `${members.length} members`),
      h('button', { class: 'btn sm', type: 'button', onClick: () => exportRosterExcel(members, R, team) }, 'Team to Excel'),
      h('button', { class: 'btn sm', type: 'button', title: 'Select the whole team', onClick: () => { for (const c of members) ui.selected.add(c.rosterId); ui.selecting = true; renderRoster(); } }, 'Select team')));
    host.append(h('div', { class: 'cards' }, members.map(card)));
  }
  if (solo.length) {
    if (teams.size) host.append(h('div', { class: 'group-title' }, 'Solo'));
    host.append(h('div', { class: 'cards' }, solo.map(card)));
  }
}

let painting = null; // cancel function while a roster paint runs
let paintStatus = '';
function paintButton() {
  const waiting = state.roster.filter((c) => { const p = portraitOf(c); return !p.hidden && p.source === 'ai' && !p.live; }).length;
  if (painting) return h('button', { class: 'btn', type: 'button', title: paintStatus, onClick: () => { painting(); painting = null; renderRoster(); } }, `⏹ Stop painting (${paintStatus || 'working'})`);
  return h('button', { class: 'btn', type: 'button', disabled: !waiting, title: 'Fetch an AI painting for everyone who still has the built-in art, one at a time, and keep it on the character', onClick: () => {
    painting = paintRoster(() => state.roster, (rosterId, { image, live }) => {
      const cur = state.roster.find((x) => x.rosterId === rosterId);
      if (!cur) return;
      if (image) upsert(setPortrait(JSON.parse(JSON.stringify(cur)), { image, aiSaved: true }));
      else if (live) upsert(setPortrait(JSON.parse(JSON.stringify(cur)), { live: true }));
    }, (p) => {
      paintStatus = p.current ? `${p.done}/${p.total} · ${p.current}: ${p.status}` : p.status;
      if (p.status === 'finished' || p.status === 'stopped') { painting = null; toast(`Painting ${p.status}: ${p.done} of ${p.total}`); }
      const b = root?.querySelector('#paint-status'); if (b) b.textContent = paintStatus; else renderRoster();
    });
    renderRoster();
  } }, `🖼 Paint all portraits (${waiting})`);
}

function backupMenu() {
  const list = h('div', { class: 'menu-list', hidden: true, role: 'menu' });
  const btn = h('button', { class: 'btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onClick: (e) => { e.stopPropagation(); const open = list.hidden; document.querySelectorAll('.menu-list').forEach((m) => { m.hidden = true; }); list.hidden = !open; btn.setAttribute('aria-expanded', String(open)); } }, 'Backup ▾');
  for (const it of backupMenuItems()) list.append(h('button', { type: 'button', role: 'menuitem', onClick: () => { list.hidden = true; it.run(); } }, it.label, it.hint ? h('small', null, it.hint) : null));
  if (window.dcugenDesktop) list.append(h('button', { type: 'button', role: 'menuitem', onClick: () => { list.hidden = true; window.dcugenDesktop.openDataFolder(); } }, 'Open the data folder', h('small', null, 'Where the desktop app keeps everything')));
  return h('div', { class: 'menu' }, btn, list);
}

export { saveRoster };
