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
import { decodeCharacter } from './share.js';
import { setImportHooks, enableDropImport } from './importer.js';
const R = RULES;
const views = ['forge', 'roster', 'lab', 'bestiary', 'workshop', 'garage', 'gm', 'rules'];

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
  const m = /[#&]c=(DCU1\.[A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return false;
  try {
    const ch = await decodeCharacter(m[1]);
    setCurrent(ch, { newTab: true });
    toast(`Loaded ${ch.identity?.codename || 'shared character'}`);
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch (e) {
    toast(`That share link didn't work: ${e.message}`);
    return false;
  }
}

async function boot() {
  initTheme();
  for (const v of views) {
    document.getElementById(`tab-${v}`).addEventListener('click', () => showTab(v));
  }
  document.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); showTab(el.dataset.tab); }));

  const applyToCurrent = (ch) => { setCurrent(ch, { editing: true }); };
  initForge(R, document.getElementById('view-forge'), {
    editPower: (path) => { openInLab(state.current, path); showTab('lab'); },
    addPower: () => { openInLab(state.current, null); showTab('lab'); },
    browseGear: () => showTab('garage'),
  });
  initRoster(R, document.getElementById('view-roster'), {
    open: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    goForge: () => showTab('forge'),
  });
  initLab(R, document.getElementById('view-lab'), { applyToCurrent });
  initGm(R, document.getElementById('view-gm'));
  initWorkshop(R, document.getElementById('view-workshop'), {
    openInForge: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    addToInitiative: (ch) => addToInitiative(ch),
    applyToCurrent: (ch) => { setCurrent(ch); },
  });
  initRules(R, document.getElementById('view-rules'));
  initGarage(R, document.getElementById('view-garage'), { applyToCurrent: (ch) => setCurrent(ch) });
  initBestiary(R, document.getElementById('view-bestiary'), {
    openInForge: (ch) => { setCurrent(ch, { newTab: true }); showTab('forge'); },
    addToInitiative: (ch) => { addToInitiative(ch); toast(`${ch.identity?.codename || 'Creature'} joins the initiative (GM Tools)`); },
  });
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
