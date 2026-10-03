// Bestiary: every creature, monster, alien, robot and person in the catalog, browsable by realm,
// with full stat sheets, templates and quick actions for the table.

import { h, clear, toast, copyText, inkFor } from './dom.js';
import { upsert } from './store.js';
import { renderFile } from './sheetview.js';
import { exportExcel, exportJson } from './exporters.js';
import { catalogEntries, creatureVariant, CREATURE_TEMPLATES } from '../engine/workshop.js';
import { catalogToCharacter } from '../engine/catalog.js';
import { deriveAll } from '../engine/derive.js';
import { statBlockText } from '../engine/render.js';
import { makeRng, randomSeed } from '../engine/rng.js';

let R;
let root;
let hooks = {};

export const REALMS = [
  { id: 'Fantasy', glyph: '🐉', color: '#7a3fb8', blurb: 'Dragons, giants, fey, elementals and dungeon horrors' },
  { id: 'Horror & Undead', glyph: '💀', color: '#5b6470', blurb: 'The dead that walk, demons, and things from beyond' },
  { id: 'Myth & Legend', glyph: '🏛', color: '#b8862b', blurb: 'Beasts and spirits from the world\'s myths and cryptids' },
  { id: 'Aliens & Cosmic', glyph: '👽', color: '#1f8f8a', blurb: 'Alien species, star-beasts and cosmic entities' },
  { id: 'Robots & Constructs', glyph: '🤖', color: '#3a6fb0', blurb: 'Robots, mechs, clockwork and golems' },
  { id: 'Kaiju', glyph: '🦖', color: '#c2410c', blurb: 'City-wrecking giant monsters' },
  { id: 'Animals', glyph: '🐾', color: '#3f7d3a', blurb: 'Everyday and wild animals, dinosaurs and swarms' },
  { id: 'People', glyph: '🧑', color: '#8a5a44', blurb: 'Civilians, cops, soldiers, thugs, agents and cultists' },
];
const realmInfo = (id) => REALMS.find((r) => r.id === id) || { id: id || 'Other', glyph: '✦', color: '#666666', blurb: '' };

export function realmOf(e) {
  if (e.realm) return e.realm;
  if (e.file === 'animals') return 'Animals';
  if (e.file === 'minions') return e.kind === 'construct' ? 'Robots & Constructs' : 'People';
  return 'Fantasy';
}

const f = { realm: '', category: '', q: '', minPl: 0, maxPl: 30, mooks: 'all', sort: 'pl' };
let selected = null; // { entry, template, ch }

function loadPrefs() {
  try { Object.assign(f, JSON.parse(localStorage.getItem('dcugen.bestiary') || '{}')); } catch { /* ignore */ }
}
function savePrefs() {
  try { localStorage.setItem('dcugen.bestiary', JSON.stringify(f)); } catch { /* ignore */ }
}

export function initBestiary(rules, el, h2 = {}) {
  R = rules;
  root = el;
  hooks = h2;
  loadPrefs();
}

function all() {
  return catalogEntries(R).map((e) => ({ ...e, realm: realmOf(e) }));
}

function filtered(list) {
  const term = f.q.trim().toLowerCase();
  return list.filter((e) => (!f.realm || e.realm === f.realm)
    && (!f.category || e.category === f.category)
    && e.pl >= f.minPl && e.pl <= f.maxPl
    && (f.mooks === 'all' || (f.mooks === 'mooks' ? e.minion : !e.minion))
    && (!term || [e.name, e.category, e.summary, e.habitat, ...(e.tags || [])].join(' ').toLowerCase().includes(term)))
    .sort((a, b) => (f.sort === 'name' ? a.name.localeCompare(b.name) : a.pl - b.pl || a.name.localeCompare(b.name)));
}

/** Build the playable character for an entry, with its field notes carried onto the sheet. */
function toCharacter(entry, template = 'none') {
  const ch = template === 'none' ? asWritten(entry) : creatureVariant(R, entry, template, { seed: randomSeed() });
  if (entry.weakness && !(ch.complications || []).some((c) => c.type === 'Weakness')) ch.complications = [...(ch.complications || []), { type: 'Weakness', text: entry.weakness }];
  if (entry.tactics && !ch.notes) ch.notes = `Tactics: ${entry.tactics}${entry.habitat ? ` Found: ${entry.habitat}.` : ''}`;
  ch.alignment = ch.alignment || 'villain';
  ch.theme = { name: entry.category, color: realmInfo(entry.realm).color };
  return ch;
}

function asWritten(entry) {
  try { return creatureVariant(R, entry, 'none', { seed: entry.id }); } catch { return catalogToCharacter(entry); }
}

function quickStats(e) {
  let d;
  try { d = deriveAll(catalogToCharacter(e), R); } catch { return null; }
  const t = d.defenses;
  return h('div', { class: 'bst-stats' },
    [['DOD', t.Dodge], ['PAR', t.Parry], ['TOU', t.Toughness], ['WILL', t.Will]].map(([k, v]) => h('div', null, h('b', { class: 'num' }, v ?? '—'), h('span', null, k))));
}

function mainPowers(e) {
  return (e.powers || []).filter((p) => !/Growth|Immunity/.test(p.effect) || p.role === 'attack').slice(0, 3).map((p) => p.name).join(' · ');
}

function card(e) {
  const r = realmInfo(e.realm);
  const isSel = selected?.entry.id === e.id;
  return h('button', { type: 'button', class: `bst-card ${isSel ? 'sel' : ''}`, style: { '--rc': r.color, '--rc-ink': inkFor(r.color) }, 'aria-pressed': String(isSel), onClick: () => select(e) },
    h('div', { class: 'bst-card-top' },
      h('span', { class: 'bst-glyph', 'aria-hidden': 'true' }, r.glyph),
      h('span', { class: 'bst-cat' }, e.category),
      h('span', { class: 'bst-pl num' }, `PL ${e.pl}`)),
    h('div', { class: 'bst-name' }, e.name),
    h('div', { class: 'bst-meta' }, [e.size, e.minion ? 'Minion' : null, e.kind === 'construct' ? 'Construct' : null].filter(Boolean).join(' · ')),
    e.summary ? h('p', { class: 'bst-sum' }, e.summary) : null,
    quickStats(e),
    mainPowers(e) ? h('div', { class: 'bst-pow' }, mainPowers(e)) : null);
}

function select(entry, template = 'none') {
  try {
    selected = { entry, template, ch: toCharacter(entry, template) };
  } catch (err) {
    toast(`Couldn't build ${entry.name}: ${err.message}`);
    return;
  }
  renderBestiary();
  requestAnimationFrame(() => document.getElementById('bst-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function detail() {
  if (!selected) {
    return h('div', { class: 'bst-empty' }, h('p', null, 'Pick a creature to see its full stat sheet, tactics and weakness, or roll a random one from your filters.'));
  }
  const { entry, ch, template } = selected;
  const r = realmInfo(entry.realm);
  const notes = h('section', { class: 'bst-notes', style: { '--rc': r.color } },
    h('div', { class: 'bst-notes-head' }, h('span', { 'aria-hidden': 'true' }, r.glyph), h('b', null, `${entry.realm} · ${entry.category}`)),
    entry.summary ? h('p', null, entry.summary) : null,
    h('dl', null,
      entry.tactics ? [h('dt', null, 'Tactics'), h('dd', null, entry.tactics)] : null,
      entry.habitat ? [h('dt', null, 'Found'), h('dd', null, entry.habitat)] : null,
      entry.weakness ? [h('dt', null, 'Weakness'), h('dd', null, entry.weakness)] : null,
      (entry.tags || []).length ? [h('dt', null, 'Tags'), h('dd', null, entry.tags.join(', '))] : null),
    entry.source && entry.source !== 'DCUGen' ? h('div', { class: 'rule-src' }, entry.source) : null);
  const tpl = h('select', { id: 'bst-template', 'aria-label': 'Template', onChange: (e) => select(entry, e.target.value) },
    Object.entries(CREATURE_TEMPLATES).map(([k, v]) => h('option', { value: k, selected: k === template }, v.label)));
  const toolbar = h('div', { class: 'toolbar' },
    h('button', { class: 'btn primary', type: 'button', onClick: () => hooks.addToInitiative?.(ch) }, 'Add to initiative'),
    h('button', { class: 'btn', type: 'button', onClick: () => hooks.openInForge?.(JSON.parse(JSON.stringify(ch))) }, 'Open in Forge'),
    h('button', { class: 'btn', type: 'button', onClick: () => { upsert(ch); toast(`${ch.identity?.codename} saved to your roster`); } }, 'Save to roster'),
    h('label', { class: 'bst-tpl' }, h('span', null, 'Template'), tpl),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(statBlockText(ch, R))) ? 'Stat block copied' : 'Copy failed') }, 'Copy stat block'),
    h('button', { class: 'btn', type: 'button', onClick: () => exportExcel(ch, R) }, 'Excel'),
    h('button', { class: 'btn', type: 'button', onClick: () => exportJson(ch) }, 'JSON'));
  const { el } = renderFile(ch, R, { toolbar });
  return h('div', { id: 'bst-detail', class: 'bst-detail' }, notes, el);
}

function rollRandom(list, n = 1) {
  if (!list.length) { toast('Nothing matches those filters.'); return; }
  const rng = makeRng(randomSeed());
  if (n === 1) { select(rng.pick(list)); return; }
  const picks = rng.sample(list, Math.min(n, list.length));
  for (const e of picks) hooks.addToInitiative?.(toCharacter(e));
  toast(`Encounter: ${picks.map((e) => e.name).join(', ')} added to initiative (GM Tools)`);
}

export function renderBestiary() {
  if (!root) return;
  clear(root);
  const list = all();
  const counts = Object.fromEntries(REALMS.map((r) => [r.id, list.filter((e) => e.realm === r.id).length]));
  const inRealm = list.filter((e) => !f.realm || e.realm === f.realm);
  const cats = [...new Set(inRealm.map((e) => e.category))].sort();
  if (f.category && !cats.includes(f.category)) f.category = '';

  root.append(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'Bestiary'),
      h('p', null, `${list.length} stat blocks built on the DC Adventures rules: every one follows the power level limits. Open any of them as a full sheet, add a template, or throw a random pack into initiative.`))));

  const realmBar = h('div', { class: 'bst-realms', role: 'group', 'aria-label': 'Realm' },
    h('button', { type: 'button', class: 'bst-realm', 'aria-pressed': String(!f.realm), style: { '--rc': '#444' }, onClick: () => { f.realm = ''; savePrefs(); renderBestiary(); } },
      h('span', { class: 'bst-glyph' }, '✦'), h('span', null, 'All'), h('span', { class: 'count' }, list.length)),
    REALMS.filter((r) => counts[r.id]).map((r) => h('button', { type: 'button', class: 'bst-realm', title: r.blurb, 'aria-pressed': String(f.realm === r.id), style: { '--rc': r.color, '--rc-ink': inkFor(r.color) },
      onClick: () => { f.realm = f.realm === r.id ? '' : r.id; f.category = ''; savePrefs(); renderBestiary(); } },
    h('span', { class: 'bst-glyph', 'aria-hidden': 'true' }, r.glyph), h('span', null, r.id), h('span', { class: 'count' }, counts[r.id]))));

  const grid = h('div', { class: 'bst-grid' });
  const drawGrid = () => {
    clear(grid);
    const items = filtered(list);
    if (!items.length) { grid.append(h('p', { class: 'hint' }, 'Nothing matches. Widen the power levels or clear the search.')); return; }
    for (const e of items.slice(0, 240)) grid.append(card(e));
    if (items.length > 240) grid.append(h('p', { class: 'hint' }, `Showing 240 of ${items.length}. Narrow the search to see the rest.`));
  };
  const num = (id, key, label) => h('label', { class: 'field bst-num' }, h('span', null, label),
    h('input', { type: 'number', id, min: 0, max: 30, value: f[key], onChange: (e) => { f[key] = Math.max(0, Math.min(30, Number(e.target.value) || 0)); savePrefs(); drawGrid(); } }));
  const filters = h('div', { class: 'bst-filters' },
    h('input', { type: 'search', id: 'bst-q', placeholder: 'Search: dragon, fire, swamp, telepath...', value: f.q, 'aria-label': 'Search the bestiary', onInput: (e) => { f.q = e.target.value; savePrefs(); drawGrid(); } }),
    h('label', { class: 'field' }, h('span', null, 'Category'),
      h('select', { id: 'bst-cat', onChange: (e) => { f.category = e.target.value; savePrefs(); drawGrid(); } },
        h('option', { value: '' }, 'All categories'), cats.map((c) => h('option', { value: c, selected: c === f.category }, c)))),
    num('bst-min', 'minPl', 'Min PL'), num('bst-max', 'maxPl', 'Max PL'),
    h('label', { class: 'field' }, h('span', null, 'Show'),
      h('select', { id: 'bst-mooks', onChange: (e) => { f.mooks = e.target.value; savePrefs(); drawGrid(); } },
        [['all', 'Everyone'], ['bosses', 'Not minions'], ['mooks', 'Minions only']].map(([v, t]) => h('option', { value: v, selected: v === f.mooks }, t)))),
    h('label', { class: 'field' }, h('span', null, 'Sort'),
      h('select', { id: 'bst-sort', onChange: (e) => { f.sort = e.target.value; savePrefs(); drawGrid(); } },
        [['pl', 'Power level'], ['name', 'Name']].map(([v, t]) => h('option', { value: v, selected: v === f.sort }, t)))),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', type: 'button', onClick: () => rollRandom(filtered(list)) }, '🎲 Random creature'),
      h('button', { class: 'btn', type: 'button', title: 'Add 3 random creatures from these filters to the initiative order', onClick: () => rollRandom(filtered(list), 3) }, 'Random encounter (3)')));

  drawGrid();
  root.append(realmBar, filters, h('div', { class: 'bst-layout' }, h('div', { class: 'bst-list' }, grid), detail()));
}
