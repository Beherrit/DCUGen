// The Forge: roll controls, the current character, and its actions.

import { h, clear, toast, copyText, openDialog, inkFor, menu } from './dom.js';
import { state, emit, savePrefs, upsert } from './store.js';
import { renderFile } from './sheetview.js';
import { exportExcel, exportJson, exportText, exportDossierExcel } from './exporters.js';
import { dossierEntries } from '../engine/dossier.js';
import { encodeCharacter, shareLink, keySize } from './share.js';
import { renderBio } from './bio.js';
import { characterKey, keyFor, personKey, fromKeySync } from '../engine/keys.js';
import { openAnything, importDialog } from './importer.js';
import { generateCharacter, rerollIdentity, generateTeam } from '../engine/generator.js';
import { randomSeed } from '../engine/rng.js';
import { statBlockText, sheet as makeSheet } from '../engine/render.js';
import { recordChanges } from '../engine/advancement.js';
import { rollMenu } from './dice.js';
import { lobby } from './lobby.js';
import { claimCharacter, setTableShared } from './table.js';
import { worldSelect } from './roster.js';
import { hasForms, activeForm, addForm, switchForm, renameForm, removeForm, MAX_FORMS } from '../engine/forms.js';
import { companionsOf } from '../engine/companions.js';
import { addVersion, versionsOf, removeVersion, restoreVersion, historyKey, moveHistory } from './history.js';
import { renderPlay } from './play.js';
import { openRangeCalculator } from './rangecalc.js';
import { F } from './forge-common.js';
import { saveTabs, putActive, canUndo, canRedo, undo, redo, setCurrent, switchTab, tabStrip, restoreTabs, updateOpen } from './forge-tabs.js';
import { companionsSection, addCompanionDialog, companionBanner } from './forge-companions.js';
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

export function roll(seed = randomSeed(), { newTab = false, archetype = null, theme = null } = {}) {
  try {
    const opts = prefsToOptions(seed);
    if (archetype) opts.archetype = archetype;
    if (theme) opts.theme = theme;
    const ch = generateCharacter(R, opts);
    setCurrent(ch, { fresh: true, newTab });
    pushHistory(ch);
  } catch (e) {
    toast(e.message);
  }
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
  // Homebrew archetypes are hidden from random rolls but listed here (engine/homebrew.js).
  const archetypes = R.raw.archetypes.filter((a) => !a.hidden || a.homebrew);
  const themes = R.raw.themes.slice().sort((a, b) => a.name.localeCompare(b.name));
  const mark = (x) => (x.homebrew ? `${x.name} ✦` : x.name);

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

  // On phones the rail folds into one bar once a character is open, so the sheet comes first.
  const optsBtn = h('button', { class: 'btn', type: 'button', id: 'rail-toggle', 'aria-expanded': 'false', onClick: () => {
    const f = root.querySelector('.forge');
    const open = !f.classList.contains('rail-open');
    f.classList.toggle('rail-open', open);
    optsBtn.setAttribute('aria-expanded', String(open));
    optsBtn.lastChild.textContent = open ? ' ▴' : ' ▾';
  } }, 'Options', h('span', null, ' ▾'));
  const quick = h('div', { class: 'rail-quick' },
    h('button', { class: 'btn primary', type: 'button', onClick: () => roll(seedIn.value.trim() || undefined) }, '🎲 Roll a character'),
    optsBtn);
  const rail = h('aside', { class: 'rail', 'aria-label': 'Roll options' },
    quick,
    h('h2', null, 'Roll a hero'),
    h('div', { class: 'field' },
      h('span', null, 'Power level'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, plOut,
        h('label', { style: { marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px' } }, plAny, 'Surprise me')),
      plRange,
      h('div', { class: 'range-row' }, h('span', null, '1 street'), h('span', null, '10 super'), h('span', null, '20 cosmic'))),
    select('archetype', 'Archetype', p.archetype, [['', 'Any archetype'], ...archetypes.map((a) => [a.id, mark(a)])], (v) => { p.archetype = v; }),
    select('theme', 'Power theme', p.theme, [['', 'Any theme'], ...themes.map((t) => [t.id, mark(t)])], (v) => { p.theme = v; }),
    h('div', { class: 'field' }, h('span', null, 'Side'), h('div', { class: 'seg', role: 'group', 'aria-label': 'Hero or villain' }, segBtns)),
    // The rest of the roll options are folded away: most rolls only need the ones above.
    (() => {
      const more = h('details', { class: 'rail-more', id: 'rail-more', open: !!p.railMore },
        h('summary', null, 'More roll options', h('small', null, ' gender, randomness, seed')),
        select('gender', 'Gender', p.gender, [['random', 'Any'], ['Female', 'Female'], ['Male', 'Male'], ['Nonbinary', 'Nonbinary']], (v) => { p.gender = v; }),
        h('div', { class: 'field' },
          h('span', null, 'Randomness ', chaosLabel),
          h('input', { type: 'range', min: 0, max: 100, value: Math.round(p.chaos * 100), id: 'chaos', 'aria-label': 'Randomness',
            onInput: (e) => { p.chaos = Number(e.target.value) / 100; chaosLabel.textContent = chaosWord(p.chaos); savePrefs(); } }),
          h('div', { class: 'range-row' }, h('span', null, 'By the book'), h('span', null, 'Wild'))),
        h('div', { class: 'field' }, h('span', null, 'Seed (the same seed rolls the same character)'),
          h('div', { class: 'seed-row' }, seedIn,
            h('button', { class: 'btn', type: 'button', title: 'Fill in a random seed', 'aria-label': 'Random seed', onClick: () => { seedIn.value = randomSeed(); } }, '🎲'))));
      more.addEventListener('toggle', () => { p.railMore = more.open; savePrefs(); });
      return more;
    })(),
    h('button', { class: 'btn primary big', type: 'button', id: 'roll', onClick: () => roll(seedIn.value.trim() || undefined) }, 'Roll a character'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onClick: surprise }, 'Surprise me'),
      h('button', { class: 'btn', type: 'button', onClick: rollTeam }, 'Roll a team'),
      h('button', { class: 'btn', type: 'button', id: 'build-scratch', onClick: buildFromScratch }, 'Build from scratch')),
    h('div', { class: 'rail-divider', role: 'separator' }),
    (() => {
      const keyIn = h('input', { type: 'text', id: 'open-key', placeholder: 'Paste a key or link: character, roster, world, front page, handout', 'aria-label': 'Character key, share code or world key', autocomplete: 'off' });
      const go = async () => {
        const v = keyIn.value.trim();
        if (!v) return;
        if (/DCUW1\./.test(v)) { keyIn.value = ''; api.openWorldKey?.(v); return; }
        if (/DCUR1\./.test(v)) { keyIn.value = ''; api.openRosterKey?.(v); return; }
        if (/DCUN1\./.test(v)) { keyIn.value = ''; api.openPaperKey?.(v); return; }
        if (/DCUH1\./.test(v)) { keyIn.value = ''; api.openHandoutKey?.(v); return; }
        try {
          const ch = await openAnything(v);
          if (!ch) { keyIn.value = ''; return; }
          setCurrent(ch, { newTab: true, fresh: true });
          keyIn.value = '';
          toast(`Opened ${ch.identity?.codename || 'character'}`);
        } catch (e) { toast(e.message); }
      };
      keyIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      return h('div', { class: 'field' }, h('span', null, 'Open what someone sent you'), h('div', { class: 'seed-row' }, keyIn, h('button', { class: 'btn', type: 'button', onClick: go }, 'Open')),
        h('button', { class: 'linkish import-link', type: 'button', id: 'forge-import', title: 'Open a character your GM or another player sent you', onClick: () => importDialog() }, '⇪ or import a file (.xlsx, .json)'));
    })(),
    h('p', { class: 'hint' }, 'Press R to roll. Every roll is legal for its power level and spends exactly 15 points per PL.'),
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
    let world = state.prefs.saveWorld || '';
    const save = await openDialog({
      title: team.name,
      body: [
        h('div', { class: 'tagwrap' }, team.members.map((m) => h('button', { class: 'chip', type: 'button', onClick: () => { const i = state.tabs.indexOf(m); if (i >= 0) switchTab(i); else setCurrent(m, { newTab: true }); } },
          h('span', { class: 'swatch', style: { '--c': m.theme?.color } }), `${m.identity.codename} · ${m.archetype.name}`))),
        h('label', { class: 'field', style: { marginTop: '10px' } }, h('span', null, 'Save to world'),
          worldSelect(world, (w) => { world = w; state.prefs.saveWorld = w; savePrefs(); }, { id: 'team-world' })),
      ],
      buttons: [{ label: 'Close', value: false }, { label: 'Save all to roster', value: true, primary: true }],
    });
    if (save) {
      for (const m of team.members) {
        if (world) m.folder = world; else delete m.folder;
        const saved = upsert(m);
        const i = state.tabs.indexOf(m);
        if (i >= 0) state.tabs[i] = saved;
        if (state.current === m) state.current = saved;
      }
      saveTabs(); renderCurrent();
      toast(`${team.name} saved to ${world || 'The Multiverse Hub'}`);
    }
  } catch (e) {
    toast(e.message);
  }
}


/**
 * Every edit (+/−, a typed field, a bio change) rebuilds the whole case file. Clearing the page would
 * let the browser clamp the scroll to the top and drop the focused +/− button, so note both first and
 * put them back once the new file is in place.
 */
function rememberView() {
  const a = document.activeElement;
  const inside = a && a !== document.body && fileHost.contains(a);
  return {
    x: window.scrollX, y: window.scrollY,
    focus: inside ? { tag: a.tagName, id: a.id || '', label: a.getAttribute('aria-label') || '', text: a.tagName === 'BUTTON' ? a.textContent : '' } : null,
  };
}

function restoreView(v) {
  if (!v) return;
  window.scrollTo(v.x, v.y);
  const f = v.focus;
  if (!f) return;
  let el = null;
  if (f.id) el = document.getElementById(f.id);
  if (!el && f.label) el = fileHost.querySelector(`${f.tag.toLowerCase()}[aria-label="${CSS.escape(f.label)}"]`);
  if (!el && f.text) el = [...fileHost.querySelectorAll('button')].find((b) => b.textContent === f.text) || null;
  if (el && !el.disabled) el.focus({ preventScroll: true });
}

export function renderCurrent() {
  if (!fileHost) return;
  const view = rememberView();
  clear(fileHost);
  const ch = state.current;
  root.querySelector('.forge')?.classList.toggle('has-char', !!ch);
  if (!ch) { drawEmpty(); return; }
  try { drawCurrent(ch); } finally { restoreView(view); }
}

/** Nothing open: characters are only rolled when you ask for one. */
function drawEmpty() {
  const card = (glyph, title, text, run, { primary = false, id = null } = {}) => h('button', { type: 'button', class: `start-card ${primary ? 'primary' : ''}`, id, onClick: run },
    h('span', { class: 'start-glyph', 'aria-hidden': 'true' }, glyph), h('b', null, title), h('small', null, text));
  fileHost.append(h('div', { class: 'forge-empty start-here' },
    h('h2', null, 'No character open'),
    h('p', { class: 'hint' }, 'What would you like to do?'),
    h('div', { class: 'start-cards' },
      card('🎲', 'Roll a character', 'A complete, legal hero in one click. Pick a power level or theme on the left first if you like.', () => roll(), { primary: true }),
      card('✎', 'Build from scratch', 'A blank sheet you fill in yourself, with the costs and limits checked as you go.', buildFromScratch, { id: 'start-scratch' }),
      card('📂', 'Open one of yours', state.roster.length ? `Your roster has ${state.roster.length} character${state.roster.length === 1 ? '' : 's'}.` : 'Characters you save show up on the Roster.', () => api.goTab?.('roster')),
      card('⚔', 'Run a fight', 'Put anyone against anyone in the Battle Room and watch it play out.', () => api.goTab?.('battle')),
      card('📱', 'Join a table', 'Your GM sent a link or a QR code? Join from here.', () => api.goTab?.('table')),
      card('🗓', 'Run a campaign (GM)', 'Plan sessions, run the GM Screen, keep the World.', () => api.goTab?.('screen')))));
}

// ---- saving to a world -------------------------------------------------------------------------------
const inRosterNow = (ch) => !!ch.rosterId && state.roster.some((x) => x.rosterId === ch.rosterId);
/** The world this character saves to: its own once chosen or saved, otherwise the last one picked. */
function worldOf(ch) {
  if (ch.folder !== undefined) return ch.folder || '';
  return inRosterNow(ch) ? '' : (state.prefs.saveWorld || '');
}

function saveCurrent(ch) {
  const was = inRosterNow(ch);
  const world = worldOf(ch);
  const copy = { ...ch };
  if (world) copy.folder = world; else delete copy.folder;
  const before = historyKey(copy);
  const saved = upsert(copy);
  moveHistory(before, historyKey(saved));
  addVersion(saved, was ? 'Updated in the roster' : 'Saved to the roster', R);
  putActive(saved); saveTabs(); renderCurrent();
  toast(`${was ? 'Updated' : 'Saved'} in ${world || 'The Multiverse Hub'}`);
}

function pickWorld(ch, world) {
  state.prefs.saveWorld = world; savePrefs();
  const c = { ...ch, folder: world };
  if (inRosterNow(ch)) {
    if (!world) delete c.folder;
    const saved = upsert(c);
    putActive(saved);
    toast(`Moved to ${world || 'The Multiverse Hub only'}`);
  } else {
    putActive(c);
  }
  saveTabs(); renderCurrent();
}

/** The end of the sheet: which world to save to, and the save button. */
function saveBar(ch) {
  const inRoster = inRosterNow(ch);
  const world = worldOf(ch);
  return h('div', { class: 'save-bar no-print' },
    h('label', { class: 'field' }, h('span', null, '🌍 Save to world'), worldSelect(world, (w) => pickWorld(ch, w), { id: 'save-world' })),
    h('button', { class: 'btn primary', type: 'button', id: 'save-bottom', onClick: () => saveCurrent(ch) }, inRoster ? 'Update in roster' : 'Save to roster'),
    h('p', { class: 'hint' }, world
      ? `Saves to ${world}. Everyone also shows up in The Multiverse Hub on the Roster.`
      : 'Saves to The Multiverse Hub, the list of everyone you make. Pick a world to file them in one, or make a new world.'));
}

/** Replace the open character with a changed copy (unsaved, like any edit). */
function commit(c) {
  putActive(c); saveTabs(); fresh = false; renderCurrent(); emit('current');
}

/**
 * Alternate forms: numbered tabs for up to 8 builds of the same character. Each is a whole build (its
 * own PL, traits, powers, codename, picture); the person, bio and journal are shared.
 */
function formStrip(ch) {
  if (!hasForms(ch)) return null;
  const cur = activeForm(ch);
  const rename = async (i) => {
    const input = h('input', { type: 'text', value: ch.forms[i].name, 'aria-label': 'Form name' });
    const ok = await openDialog({ title: 'Name this form', body: [h('label', { class: 'field' }, h('span', null, 'Name'), input), h('p', { class: 'hint', style: { margin: 0 } }, 'E.g. Civilian, Armored, Wolf, Hybrid. The codename shown on the sheet is set per form in Edit mode.')], buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }] });
    if (ok) commit(renameForm(state.current, i, input.value));
  };
  const add = async () => {
    const ok = await openDialog({
      title: 'Add a form',
      body: h('p', { style: { margin: 0 } }, `Start the new form as a copy of ${ch.forms[cur].name} and change what's different, or from a blank build at PL ${ch.pl}.`),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Blank build', value: 'blank' }, { label: `Copy ${ch.forms[cur].name}`, value: 'copy', primary: true }],
    });
    if (!ok) return;
    try {
      const c = addForm(state.current, { copy: ok === 'copy' });
      commit(switchForm(c, c.forms.length - 1));
      toast(`${c.forms[c.forms.length - 1].name} added. Edit it like any character; the others keep their own builds.`);
    } catch (e) { toast(e.message); }
  };
  return h('div', { class: 'form-strip no-print', role: 'tablist', 'aria-label': 'Alternate forms' },
    h('span', { class: 'form-strip-label' }, '🎭 Forms'),
    ch.forms.map((f, i) => h('span', { class: `form-tab ${i === cur ? 'active' : ''}` },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === cur), class: 'form-tab-btn', title: i === cur ? 'This form is showing. Click again to rename it.' : `Switch to ${f.name}`, onClick: () => (i === cur ? rename(i) : commit(switchForm(state.current, i))) },
        h('b', { class: 'num' }, i + 1), ' ', f.name),
      i !== cur ? h('button', { type: 'button', class: 'x', 'aria-label': `Remove ${f.name}`, title: `Remove ${f.name}`, onClick: async () => {
        const ok = await openDialog({ title: `Remove ${f.name}?`, body: h('p', { style: { margin: 0 } }, 'Its whole build goes. The other forms and the character stay.'), buttons: [{ label: 'Keep', value: false }, { label: 'Remove', value: true, danger: true }] });
        if (ok) commit(removeForm(state.current, i));
      } }, '✕') : null)),
    ch.forms.length < MAX_FORMS ? h('button', { type: 'button', class: 'form-add', onClick: add, title: `Add a form (up to ${MAX_FORMS})` }, '+ Form') : null);
}

function printDossier(ch) {
  document.getElementById('print-dossier')?.remove();
  const host = h('div', { id: 'print-dossier' });
  for (const e of dossierEntries(ch, R)) {
    host.append(h('section', { class: 'dossier-page' },
      h('div', { class: 'dossier-title' }, h('b', null, e.title), e.note ? h('span', null, ` · ${e.note}`) : null),
      renderFile(e.ch, R, { editing: false }).el));
  }
  if (ch.bio) host.append(h('section', { class: 'dossier-page' }, h('div', { class: 'dossier-title' }, h('b', null, 'Bio')), renderBio(ch, R, { change: () => {}, onOpenPerson: () => {} })));
  document.body.append(host);
  document.body.classList.add('printing-dossier');
  const done = () => { document.body.classList.remove('printing-dossier'); host.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 300); // let portraits load
}

async function historyDialog() {
  const ch = state.current;
  if (!ch) return;
  const label = h('input', { type: 'text', id: 'version-label', placeholder: 'e.g. Before the respec, Session 4' });
  const list = h('div', { class: 'versions' });
  const draw = () => {
    list.replaceChildren();
    const vs = versionsOf(ch);
    if (!vs.length) { list.append(h('p', { class: 'hint', style: { margin: 0 } }, 'No versions yet. One is kept every time you save to the roster, or save one here.')); return; }
    for (const v of vs) {
      list.append(h('div', { class: 'version-row' },
        h('div', { class: 'version-what' }, h('b', null, v.label), h('small', null, `${new Date(v.at).toLocaleString()} · ${v.ch.identity?.codename || 'Unnamed'} · PL ${v.ch.pl}${v.pp != null ? ` · ${v.pp} pp` : ''}`)),
        h('button', { class: 'btn sm', type: 'button', onClick: () => { putActive(restoreVersion(state.current, v)); saveTabs(); fresh = false; renderCurrent(); emit('current'); document.getElementById('dialog')?.close(); toast(`Restored "${v.label}". Ctrl+Z puts it back.`); } }, 'Restore'),
        h('button', { class: 'x', type: 'button', 'aria-label': `Delete version ${v.label}`, onClick: () => { removeVersion(ch, v.id); draw(); } }, '✕')));
    }
  };
  draw();
  await openDialog({
    title: `History of ${ch.identity?.codename || 'this character'}`,
    body: [
      h('div', { class: 'seed-row' }, label, h('button', { class: 'btn', type: 'button', onClick: () => { addVersion(state.current, label.value.trim() || 'Saved by hand', R); label.value = ''; draw(); toast('Version saved'); } }, 'Save this version')),
      h('p', { class: 'hint', style: { margin: '6px 0 10px' } }, 'Versions stay in this browser (and go with sync and backups). Restoring replaces what\'s on the Forge; Ctrl+Z undoes it.'),
      list,
    ],
  });
}

function drawCurrent(ch) {
  fileHost.append(tabStrip());
  const banner = companionBanner(ch);
  if (banner) fileHost.append(banner);
  const forms = formStrip(ch);
  if (forms) fileHost.append(forms);
  const addFormsFlow = async () => {
      const ok = await openDialog({
        title: 'Alternate forms',
        body: [h('p', { style: { margin: 0 } }, 'Give this character up to 8 forms: civilian and costumed, armor on and off, a shapeshifter\'s shapes. Each form is a whole build of its own (power level, abilities, powers, gear, codename, picture), checked on its own. The person, bio, journal and roster entry are shared.'),
          h('p', { class: 'hint', style: { margin: '8px 0 0' } }, 'The book builds a single power-based change as the Alternate Form effect (DCA 88: a package of effects bought with Activation) or as an array. Use forms when the builds are different enough to need their own sheets.')],
        buttons: [{ label: 'Cancel', value: null }, { label: 'Blank second form', value: 'blank' }, { label: 'Copy this build as Form 2', value: 'copy', primary: true }],
      });
      if (!ok) return;
      const c = addForm(ch, { copy: ok === 'copy' });
      commit(switchForm(c, 1));
      toast('Form 2 added. Switch between forms with the numbered tabs above the sheet.');
    };
  const inRoster = ch.rosterId && state.roster.some((x) => x.rosterId === ch.rosterId);
  const toolbar = h('div', { class: 'toolbar' },
    h('button', { class: 'btn primary', type: 'button', title: `Saves to ${worldOf(ch) || 'The Multiverse Hub'} (change it at the bottom of the sheet)`, onClick: () => saveCurrent(ch) }, inRoster ? 'Update in roster' : 'Save to roster'),
    h('button', { class: 'btn', type: 'button', 'aria-pressed': String(state.editing), onClick: () => toggleEditing() }, state.editing ? 'Done editing' : 'Edit'),
    menu('More', [
      { label: '📏 Range', id: 'range-btn', hint: 'How far your powers reach, distances, travel, throwing', run: () => openRangeCalculator(ch, R) },
      { label: 'Copy stat block', hint: 'Book-style text, ready to paste', run: async () => { const ok = await copyText(statBlockText(ch, R)); toast(ok ? 'Stat block copied' : 'Copy failed. Use Export > Text instead.'); } },
      { label: '🔑 Share / Key', hint: 'A short key or link anyone can open', run: () => share(ch) },
      { label: '🌐 World page', hint: 'This character in the World wiki', run: () => api.openWorld?.(ch) },
      { label: 'New name', hint: 'Keep the build, roll a new name and story', run: () => { const c = rerollIdentity(R, ch, randomSeed()); c.rosterId = ch.rosterId; setCurrent(c, { fresh: true }); } },
      { label: 'New build', hint: 'Keep the name and story, roll new powers and stats', run: () => rebuild(ch) },
      ch.companionOf ? null : { label: '🐾 Add a companion', id: 'toolbar-companion', hint: 'A sidekick, minion or animal with a full sheet', run: () => addCompanionDialog(ch) },
      hasForms(ch) ? null : { label: '🎭 Alternate forms', id: 'add-forms', hint: 'Up to 8 builds of the same person', run: addFormsFlow },
    ]),
    h('span', { class: 'undo-group' },
      h('button', { class: 'btn ghost icon', type: 'button', id: 'undo', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', disabled: !canUndo(), onClick: undo }, '↶'),
      h('button', { class: 'btn ghost icon', type: 'button', id: 'redo', title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', disabled: !canRedo(), onClick: redo }, '↷'),
      h('button', { class: 'btn ghost', type: 'button', id: 'history', title: 'Saved versions of this character', onClick: () => historyDialog() }, '🕘 History')),
    rollMenu(ch, R),
    lobby.status === 'on' && lobby.role !== 'host' && ch.rosterId && ch.lobbyShared && !ch.lobbyOwner ? h('button', { class: 'btn ghost', type: 'button', title: 'Tell the table this character is yours', onClick: () => claimCharacter(ch) }, '✋ Mine') : null,
    lobby.status === 'on' && lobby.role === 'host' && ch.rosterId && !ch.lobbyOwner ? h('button', { class: `btn ghost${ch.tableShared ? ' on' : ''}`, type: 'button', 'aria-pressed': String(!!ch.tableShared), title: ch.tableShared ? 'Players can see this character. Click to stop sharing it.' : 'Let the players see this character (to claim, or as an ally or a known villain)', onClick: () => { ch.tableShared = !ch.tableShared; setTableShared(ch, ch.tableShared); renderCurrent(); } }, ch.tableShared ? '✓ Shared with table' : '📤 Share with table') : null,
    ch.lobbyOwner ? h('span', { class: 'chip', title: 'Claimed at the table' }, `${ch.lobbyOwner === lobby.id ? 'Yours' : `Played by ${ch.lobbyOwnerName || 'a player'}`}`) : null,
    h('span', { class: 'spacer' }),
    status(ch),
    h('button', { class: 'btn', type: 'button', title: 'Throw this character into the Battle Room', onClick: () => api.throwIn?.(ch) }, '⚔ Battle Room'),
    menu('Export', [
      { label: 'Excel character sheet (.xlsx)', hint: 'Your classic sheet, filled in. DCUGen can import it back, too', run: () => exportExcel(ch, R) },
      { label: 'Character file (.json)', hint: 'Small file to send to your GM or players; they Import it', run: () => exportJson(ch) },
      { label: 'Stat block (.txt)', hint: hasForms(ch) || companionsOf(ch).length ? 'Book-style text, every form and companion' : 'Book-style text', run: () => exportText(ch, R) },
      ...(hasForms(ch) || companionsOf(ch).length ? [{ label: 'Excel workbook: every form and companion', hint: 'A summary page plus a sheet for each', run: () => exportDossierExcel(ch, R) }] : []),
      { label: 'Print or save as PDF', hint: 'This sheet, from your browser\'s print dialog', run: () => window.print() },
      { label: 'Print the full dossier', hint: 'Every form and companion, each on its own pages, plus the bio', run: () => printDossier(ch) },
    ]));

  const onChange = (c) => { putActive(c); saveTabs(); fresh = false; renderCurrent(); };
  fileHost.append(viewSwitch(ch));
  root.querySelector('.forge')?.classList.toggle('playing', sheetView === 'play');
  if (sheetView === 'play') {
    fileHost.append(h('div', { class: 'toolbar play-toolbar' }, toolbar.querySelector('#undo')?.parentElement || null));
    fileHost.append(renderPlay(ch, R, {
      change: (fn) => { const c = JSON.parse(JSON.stringify(ch)); fn(c); onChange(c); },
      openCompanion: (i) => { const comp = companionsOf(ch)[i]; if (comp) setCurrent({ ...JSON.parse(JSON.stringify(comp)), companionOf: { ownerId: ch.id, ownerName: ch.identity?.codename || 'their hero', index: i } }, { newTab: true }); },
    }));
    fresh = false;
    return;
  }
  if (sheetView === 'bio') {
    fileHost.append(renderBio(ch, R, { toolbar, change: (fn) => { const c = JSON.parse(JSON.stringify(ch)); fn(c); onChange(c); }, onOpenPerson: (p, kind) => openPerson(ch, p, kind) }));
    fileHost.append(saveBar(ch));
    fresh = false;
    return;
  }
  const { el } = renderFile(ch, R, {
    editing: state.editing,
    fresh,
    toolbar,
    onChange,
    onEditPower: (path) => api.editPower?.(path),
    onAddPower: () => api.addPower?.(),
    onBrowseGear: () => api.browseGear?.(),
    onSpend: () => { state.editing = true; renderCurrent(); toast('Edit mode: buy what you want, then press Done editing to log it'); },
  });
  fresh = false;
  fileHost.append(el);
  if (!ch.companionOf) fileHost.append(companionsSection(ch));
  fileHost.append(saveBar(ch));
}

/** Open someone from a bio as a full character in a new tab (rebuilt the same way for everyone). */
async function openPerson(ch, p, kind) {
  try {
    characterKey(R, ch); // so the person can link back to this character
    // Already open in a tab (e.g. the character this person came from)? Go there.
    const open = state.tabs.findIndex((t) => t.identity?.realName === p.name && t !== ch);
    if (open >= 0) { switchTab(open); return; }
    if (!p.key && ch.personKey && ch.bio?.people?.[0] === p) {
      toast(`${p.name} was edited after this person was made, so there's no key to rebuild them. Open them from your roster.`);
      return;
    }
    let person;
    if (p.key) person = (await openAnything(p.key));
    else person = fromKeySync(R, personKey(ch, p, kind)).character;
    setCurrent(person, { newTab: true, fresh: true });
    toast(`Opened ${person.identity?.realName || p.name}`);
  } catch (e) {
    toast(`Couldn't open ${p.name}: ${e.message}`);
  }
}

// Character sheet or Bio page, remembered between visits.
let sheetView = (() => { try { return localStorage.getItem('dcugen.sheetview') || 'sheet'; } catch { return 'sheet'; } })();

function viewSwitch(ch) {
  const set = (v) => { sheetView = v; try { localStorage.setItem('dcugen.sheetview', v); } catch { /* ignore */ } renderCurrent(); };
  return h('div', { class: 'view-switch no-print', role: 'group', 'aria-label': 'Show' },
    h('button', { type: 'button', 'aria-pressed': String(sheetView !== 'bio' && sheetView !== 'play'), onClick: () => set('sheet') }, 'Character sheet'),
    h('button', { type: 'button', 'aria-pressed': String(sheetView === 'bio'), onClick: () => set('bio') }, ch.bio ? 'Bio' : 'Bio (roll one)'),
    h('button', { type: 'button', id: 'view-play', 'aria-pressed': String(sheetView === 'play'), title: 'At the table: damage, conditions, hero points, quick rolls', onClick: () => set('play') }, '▶ Play'));
}

/** Leaving edit mode records any spending in the advancement log (when it's switched on). */
function toggleEditing() {
  if (state.editing && state.current?.advancement) {
    const c = JSON.parse(JSON.stringify(state.current));
    const before = c.advancement.log.length;
    recordChanges(c, R);
    if (c.advancement.log.length !== before) {
      putActive(c); saveTabs();
      const e = c.advancement.log[c.advancement.log.length - 1];
      toast(e.points > 0 ? `Logged: ${e.points} point${e.points === 1 ? '' : 's'} spent` : e.points < 0 ? `Logged: ${-e.points} points back` : 'Logged the change');
    }
  }
  state.editing = !state.editing;
  renderCurrent();
}

function status(ch) {
  const s = makeSheet(ch, R);
  const errs = s.issues.filter((i) => i.severity === 'error');
  if (errs.length) return h('span', { class: 'status bad', title: errs.map((e) => e.message).join('\n') }, `✕ ${errs.length} rule issue${errs.length > 1 ? 's' : ''}`);
  if (ch.pl === 0 && !ch.advancement) return h('span', { class: 'status ok', title: 'PL 0 is for ordinary people: up to 14 points, no limits to check' }, `✓ Ordinary person · ${s.cost.total} pp`);
  if (s.cost.total > s.cost.budget) return h('span', { class: 'status ok', title: 'A supporting character: built as a stat block, so points over PL x 15 are allowed (DCA 194)' }, `✓ Legal · ${s.cost.total} pp (supporting character)`);
  if (s.cost.total < s.cost.budget) return ch.advancement
    ? h('span', { class: 'status ok', title: 'Points from the GM you haven\'t spent yet. They stay saved until you spend them.' }, `✓ Legal · ${s.cost.budget - s.cost.total} pp saved`)
    : h('span', { class: 'status warn' }, `Legal · ${s.cost.budget - s.cost.total} pp unspent`);
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
  let found = null;
  try { found = await keyFor(R, ch); } catch { found = null; }
  const key = found?.key || null;
  const keyLink = key ? `${link.replace(/#.*$/, '')}#k=${key}` : null;
  const why = () => {
    if (!found) return 'This character has no seed to rebuild from (built by hand, imported from a sheet, or a creature from the catalog), so its key is the share code below. "Open a key" takes that too.';
    if (found.kind === 'exact') return "This short key rebuilds this exact character, bio and all, in anyone's DCUGen. Paste it into 'Open a key' on the Forge. Keys work while the app's tables stay the same; for a copy that never changes, send the share code below.";
    const played = (ch.journal?.entries?.length || 0) > 0 || (ch.advancement?.log?.length || 0) > 0;
    return `This character ${played ? 'has been played and edited' : 'has been edited'} since it was rolled${ch.options ? ', or was rolled with an older version of the tables' : ''}, so its key is the seed plus everything that changed (${keySize(key)}). It still rebuilds this exact character, bio, journal and all, in anyone's DCUGen: paste it into 'Open a key' on the Forge.`;
  };
  await openDialog({
    title: `Share ${ch.identity?.codename || 'character'}`,
    body: [
      h('div', { class: 'key-box' },
        h('div', { class: 'label' }, found?.kind === 'edits' ? '🔑 Character key · seed + edits' : '🔑 Character key'),
        key ? h('code', { id: 'share-key', class: found.kind === 'edits' ? 'key-long' : '' }, key) : null,
        h('p', { class: 'hint', style: { margin: '4px 0 0' } }, why()),
        key ? h('div', { class: 'btn-row', style: { marginTop: '6px' } },
          h('button', { class: 'btn primary', type: 'button', onClick: async () => toast((await copyText(key)) ? 'Key copied' : 'Select the key and copy it') }, 'Copy key'),
          h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(keyLink)) ? 'Key link copied' : 'Copy failed') }, 'Copy key link')) : null),
      h('p', { style: { margin: 0 } }, 'The share code carries the whole character, edits included. They paste it into Import or "Open a key". The link opens it directly.'),
      h('label', { class: 'field' }, h('span', null, 'Share code'), codeBox),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(code)) ? 'Code copied' : 'Select the code and copy it') }, 'Copy code')),
      h('label', { class: 'field' }, h('span', null, 'Link'), linkBox),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(link)) ? 'Link copied' : 'Select the link and copy it') }, 'Copy link')),
      ch.seed ? h('p', { style: { margin: 0, color: 'var(--ink-3)', fontSize: '13px' } }, `Seed: ${ch.seed}. The same seed and options always roll this character${ch.rosterId ? ' (before any edits)' : ''}.`) : null,
    ],
  });
}

export { inkFor };

/** Rebuild the roll options after homebrew packs change (new archetypes and themes in the lists). */
export function refreshForgeLists() {
  const p = state.prefs;
  if (p.archetype && !R.raw.archetypes.some((a) => a.id === p.archetype)) p.archetype = '';
  if (p.theme && !R.raw.themes.some((t) => t.id === p.theme)) p.theme = '';
  build();
  renderCurrent();
}
// app.js opens characters, restores tabs and undoes through the Forge.
export { setCurrent, restoreTabs, undo, redo, updateOpen };

// The pieces in other files reach this module through F.
Object.defineProperties(F, {
  R: { get: () => R, set: (v) => { R = v; } },
  api: { get: () => api, set: (v) => { api = v; } },
  fresh: { get: () => fresh, set: (v) => { fresh = v; } },
});
Object.assign(F, { commit: (...a) => commit(...a), renderCurrent: (...a) => renderCurrent(...a), roll: (...a) => roll(...a) });
