// The Forge: roll controls, the current character, and its actions.

import { h, clear, toast, copyText, openDialog, inkFor } from './dom.js';
import { state, emit, savePrefs, upsert } from './store.js';
import { renderFile } from './sheetview.js';
import { exportExcel, exportJson, exportText } from './exporters.js';
import { encodeCharacter, shareLink } from './share.js';
import { generateCharacter, rerollIdentity, generateTeam } from '../engine/generator.js';
import { randomSeed } from '../engine/rng.js';
import { statBlockText, sheet as makeSheet } from '../engine/render.js';
let R;
let root;
let fileHost;
let fresh = false;
let api = {};

export function initForge(rules, el, hooks) {
  R = rules;
  root = el;
  api = hooks;
  build();
}

function prefsToOptions(seed) {
  const p = state.prefs;
  return {
    seed,
    pl: p.plRandom ? null : p.pl,
    archetype: p.archetype || null,
    theme: p.theme || null,
    alignment: p.alignment || 'random',
    chaos: p.chaos,
    gender: p.gender,
  };
}

export function roll(seed = randomSeed(), { newTab = false } = {}) {
  try {
    const ch = generateCharacter(R, prefsToOptions(seed));
    setCurrent(ch, { fresh: true, newTab });
    pushHistory(ch);
  } catch (e) {
    toast(e.message);
  }
}

// ---- open characters as tabs ----------------------------------------------------------------
const TABS_KEY = 'dcugen.tabs.v1';
const MAX_TABS = 12;
if (!state.tabs) state.tabs = [];
if (state.active == null) state.active = 0;

function saveTabs() {
  try { localStorage.setItem(TABS_KEY, JSON.stringify({ tabs: state.tabs, active: state.active })); } catch { /* storage full or blocked */ }
}

/** Restore the open tabs from the last visit. Returns true if any were restored. */
export function restoreTabs() {
  try {
    const saved = JSON.parse(localStorage.getItem(TABS_KEY) || 'null');
    if (saved?.tabs?.length) {
      state.tabs = saved.tabs.slice(0, MAX_TABS);
      state.active = Math.min(saved.active || 0, state.tabs.length - 1);
      state.current = state.tabs[state.active];
      renderCurrent();
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

/**
 * Show a character. By default it replaces the active tab; newTab opens it in a new tab
 * (or switches to the tab already showing that saved character).
 */
export function setCurrent(ch, { fresh: isFresh = false, editing = false, newTab = false } = {}) {
  if (newTab || !state.tabs.length) {
    const existing = ch.rosterId ? state.tabs.findIndex((t) => t.rosterId === ch.rosterId) : -1;
    if (existing >= 0) {
      state.tabs[existing] = ch;
      state.active = existing;
    } else {
      if (state.tabs.length >= MAX_TABS) state.tabs.shift();
      state.tabs.push(ch);
      state.active = state.tabs.length - 1;
    }
  } else {
    state.tabs[state.active] = ch;
  }
  state.current = ch;
  state.editing = editing;
  fresh = isFresh;
  saveTabs();
  renderCurrent();
  emit('current');
}

function switchTab(i) {
  if (!state.tabs[i]) return;
  state.active = i;
  state.current = state.tabs[i];
  state.editing = false;
  saveTabs();
  renderCurrent();
  emit('current');
}

function closeTab(i) {
  state.tabs.splice(i, 1);
  if (!state.tabs.length) { state.active = 0; roll(); return; }
  if (i < state.active || state.active >= state.tabs.length) state.active -= 1;
  state.active = Math.max(0, Math.min(state.active, state.tabs.length - 1));
  state.current = state.tabs[state.active];
  state.editing = false;
  saveTabs();
  renderCurrent();
  emit('current');
}

function tabStrip() {
  return h('div', { class: 'char-tabs', role: 'tablist', 'aria-label': 'Open characters' },
    state.tabs.map((c, i) => h('div', { class: `char-tab ${i === state.active ? 'active' : ''}`, role: 'presentation', style: { '--c': c.theme?.color || '#888888' } },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === state.active), class: 'char-tab-btn', title: `${c.identity?.codename || 'Unnamed'} · PL ${c.pl}`, onClick: () => switchTab(i) },
        h('span', { class: 'swatch' }), h('span', { class: 'char-tab-name' }, c.identity?.codename || 'Unnamed'), h('span', { class: 'char-tab-pl num' }, c.pl)),
      h('button', { type: 'button', class: 'x', 'aria-label': `Close ${c.identity?.codename || 'tab'}`, onClick: (e) => { e.stopPropagation(); closeTab(i); } }, '✕'))),
    h('button', { type: 'button', class: 'char-tab-new', title: 'Roll a new character in a new tab', 'aria-label': 'New tab', onClick: () => roll(undefined, { newTab: true }) }, '+'));
}

function pushHistory(ch) {
  state.history = [ch, ...state.history.filter((x) => x.seed !== ch.seed)].slice(0, 12);
  renderHistory();
}

let historyEl;
function renderHistory() {
  if (!historyEl) return;
  clear(historyEl);
  for (const ch of state.history) {
    historyEl.append(h('button', {
      class: 'chip', type: 'button', title: `${ch.archetype?.name} · PL ${ch.pl} · seed ${ch.seed}`,
      onClick: () => setCurrent(ch),
    }, h('span', { class: 'swatch', style: { '--c': ch.theme?.color } }), ch.identity?.codename || 'Unnamed'));
  }
}

function build() {
  clear(root);
  const p = state.prefs;
  const archetypes = R.raw.archetypes.filter((a) => !a.hidden);
  const themes = R.raw.themes.slice().sort((a, b) => a.name.localeCompare(b.name));

  const plOut = h('span', { class: 'pl-readout num' }, p.plRandom ? 'Any' : p.pl);
  const plRange = h('input', { type: 'range', min: 1, max: 20, value: p.pl, id: 'pl', 'aria-label': 'Power level', disabled: p.plRandom,
    onInput: (e) => { p.pl = Number(e.target.value); plOut.textContent = p.pl; savePrefs(); } });
  const plAny = h('input', { type: 'checkbox', id: 'pl-any', checked: p.plRandom, onChange: (e) => {
    p.plRandom = e.target.checked; plRange.disabled = p.plRandom; plOut.textContent = p.plRandom ? 'Any' : p.pl; savePrefs();
  } });

  const select = (id, label, value, options, onSet) => h('label', { class: 'field' }, h('span', null, label),
    h('select', { id, onChange: (e) => { onSet(e.target.value); savePrefs(); } },
      options.map(([v, t]) => h('option', { value: v, selected: v === value }, t))));

  const segBtns = [['hero', 'Hero'], ['random', 'Either'], ['villain', 'Villain']].map(([v, t]) =>
    h('button', { type: 'button', 'aria-pressed': String(p.alignment === v), onClick: (e) => {
      p.alignment = v; savePrefs();
      for (const b of e.target.parentElement.children) b.setAttribute('aria-pressed', String(b === e.target));
    } }, t));

  const chaosLabel = h('span', { class: 'num' }, chaosWord(p.chaos));
  const seedIn = h('input', { type: 'text', id: 'seed', placeholder: 'Random every roll', 'aria-label': 'Seed', value: '' });

  historyEl = h('div', { class: 'history' });

  const rail = h('aside', { class: 'rail', 'aria-label': 'Roll options' },
    h('h2', null, 'Roll a hero'),
    h('div', { class: 'field' },
      h('span', null, 'Power level'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, plOut,
        h('label', { style: { marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px' } }, plAny, 'Surprise me')),
      plRange,
      h('div', { class: 'range-row' }, h('span', null, '1 street'), h('span', null, '10 super'), h('span', null, '20 cosmic'))),
    select('archetype', 'Archetype', p.archetype, [['', 'Any archetype'], ...archetypes.map((a) => [a.id, a.name])], (v) => { p.archetype = v; }),
    select('theme', 'Power theme', p.theme, [['', 'Any theme'], ...themes.map((t) => [t.id, t.name])], (v) => { p.theme = v; }),
    h('div', { class: 'field' }, h('span', null, 'Side'), h('div', { class: 'seg', role: 'group', 'aria-label': 'Hero or villain' }, segBtns)),
    select('gender', 'Gender', p.gender, [['random', 'Any'], ['Female', 'Female'], ['Male', 'Male'], ['Nonbinary', 'Nonbinary']], (v) => { p.gender = v; }),
    h('div', { class: 'field' },
      h('span', null, 'Randomness ', chaosLabel),
      h('input', { type: 'range', min: 0, max: 100, value: Math.round(p.chaos * 100), id: 'chaos', 'aria-label': 'Randomness',
        onInput: (e) => { p.chaos = Number(e.target.value) / 100; chaosLabel.textContent = chaosWord(p.chaos); savePrefs(); } }),
      h('div', { class: 'range-row' }, h('span', null, 'By the book'), h('span', null, 'Wild'))),
    h('div', { class: 'field' }, h('span', null, 'Seed'),
      h('div', { class: 'seed-row' }, seedIn,
        h('button', { class: 'btn', type: 'button', title: 'Fill in a random seed', 'aria-label': 'Random seed', onClick: () => { seedIn.value = randomSeed(); } }, '🎲'))),
    h('button', { class: 'btn primary big', type: 'button', id: 'roll', onClick: () => roll(seedIn.value.trim() || undefined) }, 'Roll a character'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onClick: surprise }, 'Surprise me'),
      h('button', { class: 'btn', type: 'button', onClick: rollTeam }, 'Roll a team'),
      h('button', { class: 'btn', type: 'button', id: 'build-scratch', onClick: buildFromScratch }, 'Build from scratch')),
    h('p', { class: 'hint' }, 'Press R to roll. Every rolled character is legal for its power level and spends exactly 15 points per PL. Build from scratch starts a blank sheet you fill in yourself.'),
    h('div', { class: 'field' }, h('span', null, 'Recent rolls'), historyEl));

  fileHost = h('div', { class: 'file-host', style: { minWidth: 0 } });
  root.append(h('div', { class: 'forge' }, rail, fileHost));
  renderHistory();
}

/** A blank, legal-to-edit character at the chosen PL, opened in edit mode. */
function buildFromScratch() {
  const pl = state.prefs.plRandom ? 10 : state.prefs.pl;
  const ch = {
    id: `c-custom-${Date.now().toString(36)}`,
    version: 1,
    pl,
    abilities: { Strength: 0, Stamina: 0, Agility: 0, Dexterity: 0, Fighting: 0, Intellect: 0, Awareness: 0, Presence: 0 },
    defenses: { Dodge: 0, Parry: 0, Fortitude: 0, Will: 0 },
    skills: [], advantages: [], powers: [], devices: [], equipment: [],
    archetype: { id: 'custom', name: 'Custom' },
    theme: { id: 'custom', name: 'Custom', color: '#4a5d7a' },
    alignment: state.prefs.alignment === 'villain' ? 'villain' : 'hero',
    identity: { codename: 'New Hero', realName: '', languages: ['English'] },
    origin: null, complications: [], notes: '',
    createdAt: new Date().toISOString(),
  };
  setCurrent(ch, { fresh: true, editing: true, newTab: true });
  toast(`Blank PL ${pl} character: ${pl * 15} points to spend. Use + and − to build, and "Add a power" for the Power Lab.`);
}

function chaosWord(c) {
  if (c < 0.15) return '· by the book';
  if (c < 0.45) return '· classic';
  if (c < 0.75) return '· spicy';
  return '· wild';
}

function surprise() {
  const p = state.prefs;
  const keep = { ...p };
  Object.assign(p, { plRandom: true, archetype: '', theme: '', alignment: 'random', chaos: Math.max(p.chaos, 0.6) });
  roll();
  Object.assign(p, keep);
}

async function rollTeam() {
  const sizeIn = h('input', { type: 'number', min: 2, max: 8, value: state.prefs.teamSize || 4, id: 'team-size' });
  const ok = await openDialog({
    title: 'Roll a team',
    body: [
      h('p', { style: { margin: 0 } }, 'Rolls a team with different archetypes at your chosen power level, theme and side.'),
      h('label', { class: 'field' }, h('span', null, 'Team size'), sizeIn),
    ],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Roll team', value: true, primary: true }],
  });
  if (!ok) return;
  const size = Math.max(2, Math.min(8, Number(sizeIn.value) || 4));
  state.prefs.teamSize = size; savePrefs();
  try {
    const team = generateTeam(R, { ...prefsToOptions(randomSeed()), archetype: state.prefs.archetype || null, size });
    team.members.forEach((m) => { m.team = team.name; pushHistory(m); setCurrent(m, { newTab: true }); });
    switchTab(state.tabs.indexOf(team.members[0]));
    const save = await openDialog({
      title: team.name,
      body: h('div', { class: 'tagwrap' }, team.members.map((m) => h('button', { class: 'chip', type: 'button', onClick: () => { const i = state.tabs.indexOf(m); if (i >= 0) switchTab(i); else setCurrent(m, { newTab: true }); } },
        h('span', { class: 'swatch', style: { '--c': m.theme?.color } }), `${m.identity.codename} · ${m.archetype.name}`))),
      buttons: [{ label: 'Close', value: false }, { label: 'Save all to roster', value: true, primary: true }],
    });
    if (save) {
      for (const m of team.members) upsert(m);
      toast(`${team.name} saved to your roster`);
    }
  } catch (e) {
    toast(e.message);
  }
}

function menu(label, items) {
  const list = h('div', { class: 'menu-list', hidden: true, role: 'menu' });
  const btn = h('button', { class: 'btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onClick: (e) => {
    e.stopPropagation();
    const open = list.hidden;
    document.querySelectorAll('.menu-list').forEach((m) => { m.hidden = true; });
    list.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  } }, label, ' ▾');
  for (const it of items) {
    list.append(h('button', { type: 'button', role: 'menuitem', onClick: () => { list.hidden = true; it.run(); } }, it.label, it.hint ? h('small', null, it.hint) : null));
  }
  return h('div', { class: 'menu' }, btn, list);
}

document.addEventListener('click', () => document.querySelectorAll('.menu-list').forEach((m) => { m.hidden = true; }));

export function renderCurrent() {
  if (!fileHost) return;
  clear(fileHost);
  const ch = state.current;
  if (!ch) return;
  fileHost.append(tabStrip());
  const inRoster = ch.rosterId && state.roster.some((x) => x.rosterId === ch.rosterId);
  const toolbar = h('div', { class: 'toolbar' },
    h('button', { class: 'btn primary', type: 'button', onClick: () => {
      const saved = upsert(ch); state.current = saved; state.tabs[state.active] = saved; saveTabs(); renderCurrent(); toast(inRoster ? 'Roster updated' : 'Saved to your roster');
    } }, inRoster ? 'Update in roster' : 'Save to roster'),
    h('button', { class: 'btn', type: 'button', 'aria-pressed': String(state.editing), onClick: () => { state.editing = !state.editing; renderCurrent(); } }, state.editing ? 'Done editing' : 'Edit'),
    h('button', { class: 'btn ghost', type: 'button', title: 'Keep the build, roll a new name and story', onClick: () => {
      const c = rerollIdentity(R, ch, randomSeed()); c.rosterId = ch.rosterId; setCurrent(c, { fresh: true });
    } }, 'New name'),
    h('button', { class: 'btn ghost', type: 'button', title: 'Keep the name and story, roll new powers and stats', onClick: () => rebuild(ch) }, 'New build'),
    h('span', { class: 'spacer' }),
    status(ch),
    h('button', { class: 'btn', type: 'button', onClick: async () => { const ok = await copyText(statBlockText(ch, R)); toast(ok ? 'Stat block copied' : 'Copy failed. Use Export > Text instead.'); } }, 'Copy stat block'),
    menu('Export', [
      { label: 'Excel character sheet (.xlsx)', hint: 'Your classic sheet, filled in, plus a full stat block tab', run: () => exportExcel(ch, R) },
      { label: 'Character file (.json)', hint: 'Re-import later, or share the file', run: () => exportJson(ch) },
      { label: 'Stat block (.txt)', hint: 'Book-style text', run: () => exportText(ch, R) },
      { label: 'Print or save as PDF', hint: 'Uses your browser\'s print dialog', run: () => window.print() },
    ]),
    h('button', { class: 'btn', type: 'button', onClick: () => share(ch) }, 'Share'));
  const { el } = renderFile(ch, R, {
    editing: state.editing,
    fresh,
    toolbar,
    onChange: (c) => { state.current = c; state.tabs[state.active] = c; saveTabs(); fresh = false; renderCurrent(); },
    onEditPower: (path) => api.editPower?.(path),
    onAddPower: () => api.addPower?.(),
  });
  fresh = false;
  fileHost.append(el);
}

function status(ch) {
  const s = makeSheet(ch, R);
  const errs = s.issues.filter((i) => i.severity === 'error');
  if (errs.length) return h('span', { class: 'status bad', title: errs.map((e) => e.message).join('\n') }, `✕ ${errs.length} rule issue${errs.length > 1 ? 's' : ''}`);
  if (s.cost.total < s.cost.budget) return h('span', { class: 'status warn' }, `Legal · ${s.cost.budget - s.cost.total} pp unspent`);
  return h('span', { class: 'status ok' }, `✓ Legal · ${s.cost.total}/${s.cost.budget} pp`);
}

function rebuild(ch) {
  try {
    const fresh2 = generateCharacter(R, {
      seed: randomSeed(), pl: ch.pl, archetype: ch.archetype?.id, theme: ch.theme?.id, alignment: ch.alignment, chaos: ch.options?.chaos ?? state.prefs.chaos,
    });
    for (const k of ['identity', 'origin', 'goal', 'personality', 'appearance', 'complications', 'notes', 'rosterId', 'team']) if (ch[k] !== undefined) fresh2[k] = ch[k];
    setCurrent(fresh2, { fresh: true });
    pushHistory(fresh2);
  } catch (e) {
    toast(e.message);
  }
}

async function share(ch) {
  let code;
  try { code = await encodeCharacter(ch); } catch (e) { toast(`Sharing needs a modern browser: ${e.message}`); return; }
  const link = shareLink(code);
  const codeBox = h('textarea', { readonly: true, id: 'share-code', style: { minHeight: '90px', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px' } }, code);
  const linkBox = h('input', { type: 'text', readonly: true, id: 'share-link', value: link });
  await openDialog({
    title: `Share ${ch.identity?.codename || 'character'}`,
    body: [
      h('p', { style: { margin: 0 } }, 'Send the share code to anyone with DCUGen. They paste it into Roster > Import. The link opens the character directly when the app is hosted or opened from the same file.'),
      h('label', { class: 'field' }, h('span', null, 'Share code'), codeBox),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(code)) ? 'Code copied' : 'Select the code and copy it') }, 'Copy code')),
      h('label', { class: 'field' }, h('span', null, 'Link'), linkBox),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(link)) ? 'Link copied' : 'Select the link and copy it') }, 'Copy link')),
      ch.seed ? h('p', { style: { margin: 0, color: 'var(--ink-3)', fontSize: '13px' } }, `Seed: ${ch.seed}. The same seed and options always roll this character${ch.rosterId ? ' (before any edits)' : ''}.`) : null,
    ],
  });
}

export { inkFor };
