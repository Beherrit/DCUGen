// DCUGen Hero Forge: app entry point.

// First, so it catches anything that breaks from here on.
import { reportCrash } from './crash.js';
import { RULES } from '../engine/index.js';
import { state, onChange } from './store.js';
import { toast } from './dom.js';
import { initForge, roll, setCurrent, renderCurrent, restoreTabs, undo, redo, updateOpen } from './forge.js';
import { initRoster, renderRoster, openRosterKey } from './roster.js';
import { initLab, openInLab, renderLab } from './lab.js';
import { initGm, renderGm, addToInitiative } from './gm.js';
import { initWorkshop, renderWorkshop } from './workshop.js';
import { initRules, renderRules, enableRuleLinks, allRules, openRule } from './rules.js';
import { initBestiary, renderBestiary, creatureList, showCreature } from './bestiary.js';
import { initGarage, renderGarage } from './garage.js';
import { initBattle, renderBattle, throwIn } from './battle.js';
import { initWorld, renderWorld, openWorldPage, recordBattleInWorld, worldSaved, worldApply, openWorldKey, openPaperKey, openPaperObject, openHandoutKey, openHandoutObject, addWorldEvent, worldName, worldPages, openWorldPageById } from './world.js';
import { initGmScreen, renderGmScreen, receiveStatus, afterBattleRecorded, startSession, currentPlan } from './gmscreen.js';
import { plannedNumber, previouslyText, keepPlan, sessionPlayed, planNextSession } from './world-sessions.js';
import { statusOf, resolveHit, describeHit } from '../engine/gmboard.js';
import { receiveMapFromHost, onSharedMap, receiveMapAsset, serveMapAssets, receiveMapMove } from './battlemap.js';
import { initTable, renderTable, postRoll, joinFromLink, openPhoneTable } from './table.js';
import { setLobbyHandlers, lobbySendRoster, lobbySendRemove, lobby, lobbySend, onLobby } from './lobby.js';
import { snapshotAll, restoreAll } from './backup.js';
import { getAppButton, registerServiceWorker } from './getapp.js';
import { startSync, syncButton } from './syncfile.js';
import { setHouseRules } from '../engine/house.js';
import { state as st, upsert, removeFromRoster } from './store.js';
import { tableRoster, hostAcceptsEdit, hostAcceptsRemove, hostAcceptsClaim, shouldSendToTable } from '../engine/tabletrust.js';
import { initHelp, startTour, showWhatsNew } from './help.js';
import { initPalette } from './palette.js';
import { importDialog } from './importer.js';
import { initTurnBar, setTableInit, setParty, refreshTurnBar } from './turnbar.js';
import { endOfTurn } from '../engine/turns.js';
import { setImportHooks, enableDropImport, setImportRules, openAnything } from './importer.js';
const R = RULES;
const views = ['forge', 'roster', 'lab', 'bestiary', 'workshop', 'garage', 'battle', 'world', 'table', 'screen', 'gm', 'rules'];

/** Everything the jump-anywhere search (Ctrl+K) can open. */
function searchables() {
  const out = [];
  const go = (v) => () => showTab(v);
  for (const v of views) {
    const label = document.getElementById(`tab-${v}`)?.firstChild?.textContent?.trim() || v;
    out.push({ id: `tab:${v}`, kind: 'Go to', label, run: go(v), weight: 4 });
  }
  const world = (page) => () => { showTab('world'); openWorldPageById(page); };
  out.push(
    { id: 'do:roll', kind: 'Do', label: 'Roll a character', hint: 'R on the Forge', run: () => { showTab('forge'); roll(undefined, { newTab: true }); }, weight: 6 },
    { id: 'do:import', kind: 'Do', label: 'Import a character', hint: 'Excel, .json or a key', run: () => { showTab('forge'); importDialog(); } },
    { id: 'do:table', kind: 'Do', label: 'Open a table for phones', hint: 'QR code for your players', run: () => { showTab('table'); openPhoneTable(); } },
    { id: 'do:session', kind: 'Do', label: 'Plan the next session', hint: 'World > Sessions', run: () => { planNextSession(); world('sessions')(); } },
    { id: 'do:what', kind: 'Do', label: 'Record what happened', hint: 'In the World', run: world('home') },
    { id: 'do:sessions', kind: 'Go to', label: 'Sessions', hint: 'World', run: world('sessions') },
    { id: 'do:timeline', kind: 'Go to', label: 'Timeline', hint: 'World', run: world('timeline') },
    { id: 'do:graph', kind: 'Go to', label: 'Relationship graph', hint: 'World', run: world('graph') },
    { id: 'do:newsstand', kind: 'Go to', label: 'Newsstand', hint: 'World', run: world('newsstand') },
    { id: 'do:handouts', kind: 'Go to', label: 'Handouts', hint: 'World', run: world('handouts') },
    { id: 'do:tour-p', kind: 'Do', label: 'Player tour', run: () => startTour('player') },
    { id: 'do:tour-g', kind: 'Do', label: 'GM tour', run: () => startTour('gm') },
    { id: 'do:news', kind: 'Do', label: 'What\'s new', run: () => showWhatsNew() },
    { id: 'do:theme', kind: 'Do', label: 'Switch light or dark theme', run: () => document.getElementById('theme-toggle').click() },
  );
  const seen = new Set();
  for (const c of [...(state.tabs || []), ...state.roster]) {
    const key = c.rosterId || c.seed || c.identity?.codename;
    if (!c || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `ch:${key}`, kind: 'Character', label: c.identity?.codename || c.identity?.realName || 'Unnamed', hint: `PL ${c.pl}${c.folder ? ` · ${c.folder}` : ''}`, words: [c.identity?.realName, c.archetype, c.folder].filter(Boolean).join(' '), weight: 3, run: () => { setCurrent(c, { newTab: true }); showTab('forge'); } });
  }
  try {
    for (const p of worldPages()) {
      if (p.id.startsWith('char:')) continue; // the character itself is listed above
      out.push({ id: `page:${p.id}`, kind: 'Page', label: p.name, hint: p.one, words: p.aliases.join(' '), weight: 1, run: () => { showTab('world'); openWorldPageById(p.id); } });
    }
  } catch { /* the World isn't ready */ }
  for (const r of allRules()) out.push({ id: `rule:${r.cat}:${r.title}`, kind: 'Rule', label: r.title, hint: r.cat, run: () => openRule(r.title, r.cat) });
  for (const c of creatureList()) out.push({ id: `cr:${c.name}`, kind: 'Creature', label: c.name, hint: `PL ${c.pl} · ${c.category}`, words: c.category, weight: -2, run: () => { showTab('bestiary'); showCreature(c.name); } });
  return out;
}

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
  if (name === 'screen') renderGmScreen();
  if (name === 'rules') renderRules();
  try { localStorage.setItem('dcugen.tab', name); } catch { /* storage unavailable */ }
  // keep the chosen tab in view when the tab row scrolls (phones)
  try { document.getElementById(`tab-${name}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* old browser */ }
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
  const j = /[#&]join=(DCUP1\.[A-Za-z0-9_-]+)/.exec(location.hash);
  if (j) { history.replaceState(null, '', location.pathname + location.search); setTimeout(() => joinFromLink(j[1]), 300); return false; }
  const rk = /[#&]r=(DCUR1\.[A-Za-z0-9_-]+)/.exec(location.hash);
  if (rk) { history.replaceState(null, '', location.pathname + location.search); showTab('roster'); setTimeout(() => openRosterKey(rk[1]), 200); return false; }
  const wk = /[#&]w=(DCUW1\.[A-Za-z0-9_-]+)/.exec(location.hash);
  if (wk) { history.replaceState(null, '', location.pathname + location.search); showTab('world'); setTimeout(() => openWorldKey(wk[1]), 200); return false; }
  const hk = /[#&]h=(DCUH1\.[A-Za-z0-9_-]+)/.exec(location.hash);
  if (hk) { showTab('world'); const ok = await openHandoutKey(hk[1]); if (ok) history.replaceState(null, '', location.pathname + location.search); return ok; }
  const n = /[#&]n=(DCUN1\.[A-Za-z0-9_-]+)/.exec(location.hash);
  if (n) { showTab('world'); const ok = await openPaperKey(n[1]); if (ok) history.replaceState(null, '', location.pathname + location.search); return ok; }
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

// ---- lobby: the host shares the characters it marks for the table and its world; players claim ----------
// characters and send edits to their own. The host is the authority: see engine/tabletrust.js.
function wireLobby() {
  const me = () => lobby.id;
  let applying = 0; // changes that came from the table must not be echoed back to it
  const quiet = (fn) => (...a) => { applying++; try { return fn(...a); } finally { applying--; } };
  setLobbyHandlers({
    snapshot: () => ({ roster: tableRoster(st.roster), world: worldSaved(), feed: [] }),
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
        if (!hostAcceptsEdit(mine, from)) { toast(`${ch.identity?.codename || 'A character'}: a player's edit was refused (${mine?.lobbyOwner ? 'it belongs to someone else' : 'claim it with ✋ Mine first'})`); return null; }
        // A character a player brings is theirs.
        const who = lobby.members.find((m) => m.id === from)?.name || ch.lobbyOwnerName || 'a player';
        const kept = { ...ch, lobbyOwner: from, lobbyOwnerName: mine?.lobbyOwnerName || who, lobbyShared: true };
        upsert(kept); renderCurrent(); return kept;
      }
      if (from === me()) return null;
      upsert({ ...ch, lobbyShared: true }); renderCurrent(); return ch;
    }),
    removeRoster: quiet((id, from) => {
      const existing = st.roster.find((x) => x.rosterId === id);
      if (lobby.role === 'host' && !hostAcceptsRemove(existing, from)) return false;
      // A player drops a character the host stopped sharing: it was only ever a copy, so leave no tombstone.
      if (existing) removeFromRoster(id, { tombstone: lobby.role === 'host' });
      return true;
    }),
    // Only the host's world goes out to the table; a player's world never changes the GM's.
    applyWorld: quiet((saved) => { if (lobby.role !== 'host') worldApply(saved); }),
    claim: quiet((rosterId, from) => {
      const ch = st.roster.find((x) => x.rosterId === rosterId);
      if (!hostAcceptsClaim(ch, from)) return null;
      const who = lobby.members.find((m) => m.id === from)?.name || 'a player';
      const kept = upsert({ ...ch, lobbyOwner: from, lobbyOwnerName: who });
      postRoll({ who: 'Table', kind: 'chat', text: `${who} now plays ${ch.identity?.codename}.` });
      return kept;
    }),
    feed: (entry, from) => { if (from !== me()) postRoll(entry, { fromLobby: true }); },
    message: (msg) => {
      if (msg.t === 'status' && lobby.role === 'host') receiveStatus(msg.status, msg.fromName);
      if (msg.t === 'map' && lobby.role !== 'host') receiveMapFromHost(msg.map);
      if (msg.t === 'map-asset' && lobby.role !== 'host') receiveMapAsset(msg.id, msg.data);
      if (msg.t === 'map-assets' && lobby.role === 'host') serveMapAssets(msg.ids, msg.from);
      if (msg.t === 'map-move' && lobby.role === 'host') receiveMapMove(msg);
      if (msg.t === 'status-request' && lobby.role !== 'host') sendStatuses();
      if (msg.t === 'hit' && lobby.role !== 'host' && msg.rosterId) {
        let res = null;
        const ch = updateOpen(msg.rosterId, (c) => { res = resolveHit(c, msg.hit, R); c.play = res.play; });
        if (ch && res) {
          const e = postRoll({ who: ch.identity?.codename || 'Someone', text: `GM: ${describeHit(msg.hit)} → ${res.text}`, dice: res.dice[res.dice.length - 1] });
          toast(e.text);
        }
      }
      // The turn order and the party, from the GM.
      if (msg.t === 'init' && lobby.role !== 'host') setTableInit(msg.init);
      if (msg.t === 'party' && lobby.role !== 'host') setParty(msg.list);
      // The GM ended this character's turn: this app rolls its recovery checks, like a hit.
      if (msg.t === 'end-turn' && lobby.role !== 'host' && msg.rosterId) {
        let res = null;
        const ch = updateOpen(msg.rosterId, (c) => { res = endOfTurn(c, R); c.play = res.play; });
        if (ch && res?.changed) postRoll({ who: ch.identity?.codename || 'Someone', text: res.text, dice: res.dice[res.dice.length - 1] });
      }
      if (msg.t === 'hp' && lobby.role !== 'host' && msg.rosterId) {
        const ch = updateOpen(msg.rosterId, (c) => { c.play = { ...(c.play || {}), heroPoints: ((c.play?.heroPoints ?? 1) + (msg.n || 1)) }; });
        if (ch) toast(`⭐ The GM gives ${ch.identity?.codename || 'you'} a hero point${msg.why ? `: ${msg.why}` : ''}`);
      }
    },
  });
  // Players: tell the GM screen how their characters stand, whenever something changes.
  let statusTimer = null;
  function sendStatuses() {
    if (lobby.status !== 'on' || lobby.role === 'host') return;
    const seen = new Set();
    for (const t of st.tabs || []) {
      if (!t?.rosterId || seen.has(t.rosterId) || t.companionOf) continue;
      seen.add(t.rosterId);
      const s2 = statusOf(t, R);
      if (s2) lobbySend({ t: 'status', status: s2 });
    }
  }
  const soon = () => { clearTimeout(statusTimer); statusTimer = setTimeout(sendStatuses, 300); };
  onChange((what) => { if (what === 'current' || what === 'roster-upsert') { soon(); refreshTurnBar(); } });
  onLobby((event) => { if (event === 'status' && lobby.status === 'on') soon(); });
  // Any roster change goes to the table while connected.
  onChange((what) => {
    if (applying || lobby.status !== 'on') return;
    const who = { role: lobby.role, me: lobby.id };
    if (what === 'roster-upsert' && shouldSendToTable(st.lastUpsert, who)) lobbySendRoster(st.lastUpsert);
    if (what === 'roster-remove' && shouldSendToTable(st.lastRemovedChar, who)) lobbySendRemove(st.lastRemoved);
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
  // Send only what changed (and what was removed), not the whole store every few seconds.
  const changed = new Set();
  const removed = new Set();
  const proto = Storage.prototype;
  const set = proto.setItem; const remove = proto.removeItem;
  const ours = (store, k) => store === localStorage && String(k).startsWith('dcugen.');
  proto.setItem = function setItem(k, v) { set.call(this, k, v); if (ours(this, k)) { changed.add(String(k)); removed.delete(String(k)); } };
  proto.removeItem = function removeItem(k) { remove.call(this, k); if (ours(this, k)) { removed.add(String(k)); changed.delete(String(k)); } };
  const take = () => {
    const data = {};
    for (const k of changed) { const v = localStorage.getItem(k); if (v !== null) data[k] = v; }
    const change = { data, removed: [...removed] };
    changed.clear(); removed.clear();
    return change;
  };
  const flush = async () => {
    if (!changed.size && !removed.size) return;
    const change = take();
    try { await (d.vaultUpdate ? d.vaultUpdate(change) : d.vaultSave(change.data)); } catch { for (const k of Object.keys(change.data)) changed.add(k); for (const k of change.removed) removed.add(k); }
  };
  // Start from a complete copy on disk.
  try { await d.vaultSave(snapshotAll().data); } catch { /* retried with the next change */ }
  setInterval(flush, 4000);
  window.addEventListener('beforeunload', () => { flush(); });
  document.body.classList.add('desktop');
}

async function boot() {
  setHouseRules(st.prefs.house);
  initTheme();
  await desktopSync();
  const getApp = getAppButton();
  if (getApp) document.getElementById('theme-toggle').before(getApp);
  document.getElementById('theme-toggle').before(syncButton());
  initHelp({ showTab });
  initPalette(searchables);
  initTurnBar();
  startSync();
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
  initBattle(R, document.getElementById('view-battle'), { goBestiary: () => showTab('bestiary'), recordBattle: (b) => {
    const ev = recordBattleInWorld(b);
    const learned = afterBattleRecorded(b, ev);
    toast([`Recorded in the World: ${ev.name}`, ...learned].join(' · '));
  } });
  onSharedMap(() => renderCurrent());
  initGmScreen(R, document.getElementById('view-screen'), {
    open: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    throwIn: (ch, opts) => throwInBattle(ch, opts),
    invite: () => openPhoneTable(),
    addWorldEvent: (e) => addWorldEvent(e),
    campaign: () => worldName(),
    plannedNumber: () => plannedNumber(),
    previously: (n) => previouslyText(n),
    keepPlan: (plan) => keepPlan(plan),
    sessionPlayed: (n, recap) => sessionPlayed(n, recap),
  });
  initWorld(R, document.getElementById('view-world'), {
    open: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    throwIn: throwInBattle,
    changed: () => renderCurrent(),
    // The session planner: start a planned session on the GM Screen, use its prep, post to the table.
    startSession: ({ number, previously }) => { startSession({ number, previously }); showTab('screen'); toast(`Session ${number} started`); },
    gmPlan: () => currentPlan(),
    postToTable: (text) => postRoll({ who: 'GM', kind: 'chat', text }),
  });
  initForge(R, document.getElementById('view-forge'), {
    editPower: (path) => { openInLab(state.current, path); showTab('lab'); },
    addPower: () => { openInLab(state.current, null); showTab('lab'); },
    browseGear: () => showTab('garage'),
    throwIn: (ch) => throwInBattle(ch),
    goBattle: () => showTab('battle'),
    openWorld: (ch) => { openWorldPage(ch); showTab('world'); },
    openWorldKey: async (text) => { showTab('world'); await openWorldKey(text); },
    openRosterKey: async (text) => { showTab('roster'); await openRosterKey(text); },
    openPaperKey: async (text) => { showTab('world'); await openPaperKey(text); },
    openHandoutKey: async (text) => { showTab('world'); await openHandoutKey(text); },
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
  enableRuleLinks();
  initGarage(R, document.getElementById('view-garage'), { applyToCurrent: (ch) => setCurrent(ch) });
  initBestiary(R, document.getElementById('view-bestiary'), {
    openInForge: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    addToInitiative: (ch) => { addToInitiative(ch); toast(`${ch.identity?.codename || 'Creature'} joins the initiative (GM Tools)`); },
    throwIn: (ch, opts) => throwInBattle(ch, opts),
  });
  setImportRules(R);
  setImportHooks({
    openPaper: (paper) => { showTab('world'); openPaperObject(paper); },
    openHandout: (hd) => { showTab('world'); openHandoutObject(hd); },
    open: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    afterSave: () => renderRoster(),
  });
  enableDropImport();

  onChange((what) => {
    if (what === 'house') renderCurrent();
    if (what === 'roster') {
      document.getElementById('roster-count').textContent = state.roster.length;
      renderCurrent();
    }
  });
  document.getElementById('roster-count').textContent = state.roster.length;

  const restored = restoreTabs();
  registerServiceWorker();
  const loaded = await loadFromHash();
  // Only roll when asked: a first visit (or a reload with nothing open) shows the Roll button instead.
  if (!loaded && !restored) renderCurrent();

  let tab = 'forge';
  try { tab = localStorage.getItem('dcugen.tab') || 'forge'; } catch { /* ignore */ }
  showTab(loaded ? 'forge' : tab);

  document.addEventListener('keydown', (e) => {
    // Undo / redo on the Forge (not while typing in a field, where the browser's own undo applies).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.target.closest('input, textarea, select, [contenteditable]') && !document.getElementById('view-forge').hidden && !document.getElementById('dialog')?.open) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
    }
    if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'r' || e.key === 'R') {
      if (document.getElementById('view-forge').hidden) return;
      e.preventDefault();
      roll();
    }
  });
}

boot().catch(reportCrash);
