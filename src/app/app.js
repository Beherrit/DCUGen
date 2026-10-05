// DCUGen Hero Forge: app entry point.

import { RULES } from '../engine/index.js';
import { state, onChange } from './store.js';
import { toast } from './dom.js';
import { initForge, roll, setCurrent, renderCurrent, restoreTabs } from './forge.js';
import { initRoster, renderRoster } from './roster.js';
import { initLab, openInLab, renderLab } from './lab.js';
import { initGm, renderGm, addToInitiative } from './gm.js';
import { initWorkshop, renderWorkshop } from './workshop.js';
import { initRules, renderRules } from './rules.js';
import { initBestiary, renderBestiary } from './bestiary.js';
import { initGarage, renderGarage } from './garage.js';
import { initBattle, renderBattle, throwIn } from './battle.js';
import { initWorld, renderWorld, openWorldPage, recordBattleInWorld, worldSaved, worldApply, openWorldKey } from './world.js';
import { initTable, renderTable, postRoll } from './table.js';
import { setLobbyHandlers, lobbySendRoster, lobbySendRemove, lobby } from './lobby.js';
import { snapshotAll, restoreAll } from './backup.js';
import { getAppButton } from './getapp.js';
import { state as st, upsert, removeFromRoster } from './store.js';
import { decodeCharacter } from './share.js';
import { setImportHooks, enableDropImport, setImportRules, openAnything } from './importer.js';
const R = RULES;
const views = ['forge', 'roster', 'lab', 'bestiary', 'workshop', 'garage', 'battle', 'world', 'table', 'gm', 'rules'];

function showTab(name) {
  if (!views.includes(name)) name = 'forge';
  for (const v of views) {
    document.getElementById(`view-${v}`).hidden = v !== name;
    const tab = document.getElementById(`tab-${v}`);
    tab.setAttribute('aria-selected', String(v === name));
  }
  if (name === 'roster') renderRoster();
  if (name === 'gm') renderGm();
  if (name === 'lab') renderLab();
  if (name === 'workshop') renderWorkshop();
  if (name === 'bestiary') renderBestiary();
  if (name === 'garage') renderGarage();
  if (name === 'battle') renderBattle();
  if (name === 'world') renderWorld();
  if (name === 'table') renderTable();
  if (name === 'rules') renderRules();
  try { localStorage.setItem('dcugen.tab', name); } catch { /* storage unavailable */ }
  window.scrollTo({ top: 0 });
}

function initTheme() {
  const rootEl = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem('dcugen.theme'); } catch { /* ignore */ }
  if (saved) rootEl.setAttribute('data-theme', saved);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = rootEl.getAttribute('data-theme') === 'dark'
      || (!rootEl.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    rootEl.setAttribute('data-theme', next);
    try { localStorage.setItem('dcugen.theme', next); } catch { /* ignore */ }
  });
}

async function loadFromHash() {
  const m = /[#&]c=(DCU1\.[A-Za-z0-9_-]+)/.exec(location.hash) || /[#&]k=(DCU[KPE]1\.[A-Za-z0-9%._~-]+)/.exec(location.hash);
  if (!m) return false;
  try {
    const ch = await openAnything(m[1]);
    setCurrent(ch, { newTab: true });
    toast(`Loaded ${ch.identity?.codename || 'shared character'}`);
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch (e) {
    toast(`That share link didn't work: ${e.message}`);
    return false;
  }
}

// ---- lobby: the host shares its roster and world; players claim characters and send edits ------------
function wireLobby() {
  const me = () => lobby.id;
  let applying = 0; // changes that came from the table must not be echoed back to it
  const quiet = (fn) => (...a) => { applying++; try { return fn(...a); } finally { applying--; } };
  setLobbyHandlers({
    snapshot: () => ({ roster: st.roster, world: worldSaved(), feed: [] }),
    worldSnapshot: () => worldSaved(),
    applySnapshot: quiet((msg) => {
      let n = 0;
      for (const ch of msg.roster || []) { const copy = { ...ch, lobbyShared: true }; upsert(copy); n++; }
      if (msg.world) worldApply(msg.world);
      toast(`Joined ${lobby.info?.name || 'the table'}: ${n} shared character${n === 1 ? '' : 's'}`);
      renderRoster();
    }),
    applyRoster: quiet((ch, from) => {
      if (!ch?.rosterId) return null;
      if (lobby.role === 'host') {
        const mine = st.roster.find((x) => x.rosterId === ch.rosterId);
        if (mine && mine.lobbyOwner && mine.lobbyOwner !== from) { toast(`${ch.identity?.codename}: edit refused, that character belongs to someone else`); return null; }
        const kept = { ...ch, lobbyOwner: mine?.lobbyOwner || ch.lobbyOwner || null, lobbyShared: true };
        upsert(kept); renderCurrent(); return kept;
      }
      if (from === me()) return null;
      upsert({ ...ch, lobbyShared: true }); renderCurrent(); return ch;
    }),
    removeRoster: quiet((id, from) => { if (lobby.role === 'host' && st.roster.find((x) => x.rosterId === id)?.lobbyOwner && st.roster.find((x) => x.rosterId === id).lobbyOwner !== from) return false; removeFromRoster(id); return true; }),
    applyWorld: quiet((saved) => { worldApply(saved); }),
    claim: quiet((rosterId, from) => {
      const ch = st.roster.find((x) => x.rosterId === rosterId);
      if (!ch) return null;
      if (ch.lobbyOwner && ch.lobbyOwner !== from) return null;
      const who = lobby.members.find((m) => m.id === from)?.name || 'a player';
      const kept = upsert({ ...ch, lobbyOwner: from, lobbyOwnerName: who });
      postRoll({ who: 'Table', kind: 'chat', text: `${who} now plays ${ch.identity?.codename}.` });
      return kept;
    }),
    feed: (entry, from) => { if (from !== me()) postRoll(entry, { fromLobby: true }); },
  });
  // Any roster change goes to the table while connected.
  onChange((what) => {
    if (applying || lobby.status !== 'on') return;
    if (what === 'roster-upsert') lobbySendRoster(st.lastUpsert);
    if (what === 'roster-remove') lobbySendRemove(st.lastRemoved);
  });
}

// ---- desktop app: mirror everything to the vault on disk ---------------------------------------------------
async function desktopSync() {
  const d = window.dcugenDesktop;
  if (!d) return;
  try {
    const vault = await d.vaultLoad();
    const haveLocal = (() => { try { return !!localStorage.getItem('dcugen.roster.v1'); } catch { return false; } })();
    if (!haveLocal && vault && Object.keys(vault).length) { restoreAll({ app: 'DCUGen', data: vault }, { mode: 'replace' }); location.reload(); return; }
  } catch { /* no vault yet */ }
  let dirty = false;
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { orig.call(this, k, v); if (String(k).startsWith('dcugen.')) dirty = true; };
  const flush = async () => { if (!dirty) return; dirty = false; try { await d.vaultSave(snapshotAll().data); } catch { dirty = true; } };
  setInterval(flush, 4000);
  window.addEventListener('beforeunload', () => { if (dirty) d.vaultSave(snapshotAll().data); });
  document.body.classList.add('desktop');
}

async function boot() {
  initTheme();
  await desktopSync();
  const getApp = getAppButton();
  if (getApp) document.getElementById('theme-toggle').before(getApp);
  for (const v of views) {
    document.getElementById(`tab-${v}`).addEventListener('click', () => showTab(v));
  }
  document.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); showTab(el.dataset.tab); }));

  const applyToCurrent = (ch) => { setCurrent(ch, { editing: true }); };
  const throwInBattle = (ch, opts) => {
    const r = throwIn(ch, opts);
    toast(`${r.count > 1 ? `${r.count} × ` : ''}${r.names[0] || 'Fighter'} join${r.count > 1 ? '' : 's'} team ${r.team} in the Battle Room`);
    return r;
  };
  initBattle(R, document.getElementById('view-battle'), { goBestiary: () => showTab('bestiary'), recordBattle: (b) => { const ev = recordBattleInWorld(b); toast(`Recorded in the World: ${ev.name}`); } });
  initWorld(R, document.getElementById('view-world'), {
    open: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    throwIn: throwInBattle,
    changed: () => renderCurrent(),
  });
  initForge(R, document.getElementById('view-forge'), {
    editPower: (path) => { openInLab(state.current, path); showTab('lab'); },
    addPower: () => { openInLab(state.current, null); showTab('lab'); },
    browseGear: () => showTab('garage'),
    throwIn: (ch) => throwInBattle(ch),
    goBattle: () => showTab('battle'),
    openWorld: (ch) => { openWorldPage(ch); showTab('world'); },
    openWorldKey: async (text) => { showTab('world'); await openWorldKey(text); },
  });
  initRoster(R, document.getElementById('view-roster'), {
    open: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    goForge: () => showTab('forge'),
    throwIn: (ch) => throwInBattle(ch),
  });
  initLab(R, document.getElementById('view-lab'), { applyToCurrent });
  initGm(R, document.getElementById('view-gm'));
  initWorkshop(R, document.getElementById('view-workshop'), {
    openInForge: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    addToInitiative: (ch) => addToInitiative(ch),
    applyToCurrent: (ch) => { setCurrent(ch); },
    throwIn: (ch, opts) => throwInBattle(ch, opts),
  });
  initTable(R, document.getElementById('view-table'), { open: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); } });
  wireLobby();
  initRules(R, document.getElementById('view-rules'));
  initGarage(R, document.getElementById('view-garage'), { applyToCurrent: (ch) => setCurrent(ch) });
  initBestiary(R, document.getElementById('view-bestiary'), {
    openInForge: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    addToInitiative: (ch) => { addToInitiative(ch); toast(`${ch.identity?.codename || 'Creature'} joins the initiative (GM Tools)`); },
    throwIn: (ch, opts) => throwInBattle(ch, opts),
  });
  setImportRules(R);
  setImportHooks({
    open: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    afterSave: () => renderRoster(),
  });
  enableDropImport();

  onChange((what) => {
    if (what === 'roster') {
      document.getElementById('roster-count').textContent = state.roster.length;
      renderCurrent();
    }
  });
  document.getElementById('roster-count').textContent = state.roster.length;

  const restored = restoreTabs();
  const loaded = await loadFromHash();
  if (!loaded && !restored) roll();

  let tab = 'forge';
  try { tab = localStorage.getItem('dcugen.tab') || 'forge'; } catch { /* ignore */ }
  showTab(loaded ? 'forge' : tab);

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'r' || e.key === 'R') {
      if (document.getElementById('view-forge').hidden) return;
      e.preventDefault();
      roll();
    }
  });
}

boot();
