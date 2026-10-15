// The World tab: a wiki of the whole campaign. Every saved character is a page; everyone named in
// their lives is a page; teams, factions, cities and sessions are pages; and every page links to the
// others in both directions. Record what happened ("these two became enemies", "she joined the
// Court", "he died") and the world changes with it: ties start and end at a session, pages carry a
// status, the timeline shows when, and the graph can be wound back to any session.

import { h, clear, toast, openDialog, inkFor, menu } from './dom.js';
import { state, upsert } from './store.js';
import { buildWorld, emptyWorld, ENTITY_TYPES, RELATION_GROUPS, campaignTimeline, searchWorld, createEntity, addLink, mergeWorldSaved, recordBattle, slug } from '../engine/world.js';
import { sheet as makeSheet } from '../engine/render.js';
import { portraitImg } from './portrait.js';
import { encodeWorld, decodeWorld, decodePaper, decodeHandout } from './share.js';
import { newsstandPage, paperPage, editorPage, startPaper, importPaper, paperThumb } from './newspaper.js';
import { handoutsPage, handoutPage, handoutEditorPage, newHandoutDialog, importHandout } from './handouts.js';
import { boardPage } from './board.js';
import { W, typeMeta, shortStatus, pageLink } from './world-common.js';
import { entityPage, newPageDialog } from './world-page.js';
import { momentDialog } from './world-moments.js';
import { timelinePage, graphPage, vaultPage, timelineItem } from './world-views.js';
import { sessionsPage } from './world-sessions.js';

const KEY = 'dcugen.world.v1';
let R; let root; let hooks = {};
let saved;
let world;
const ui = { page: 'home', q: '', edit: false, index: null, graphZoom: 1, addTie: false, graphTypes: new Set(Object.keys(ENTITY_TYPES)), graphGroups: new Set(RELATION_GROUPS), open: {}, showAll: {}, history: [], tlFilter: 'all', asOf: null, showPast: false, linkPreset: null };

function load() {
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw?.v) return { ...emptyWorld(), ...raw }; } catch { /* ignore */ }
  return emptyWorld();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* full */ } }
function rebuild() { world = buildWorld(saved, state.roster, R, { openTabs: state.tabs || [] }); return world; }

export function initWorld(rules, el, h2 = {}) {
  R = rules; root = el; hooks = h2;
  saved = load();
  document.addEventListener('keydown', (e) => {
    if (!root || root.hidden || e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    const q = root.querySelector('#wd-q'); if (q) { e.preventDefault(); q.focus(); q.select(); }
  });
}

/** Jump to a character's page (from the Forge). */
export function openWorldPage(ch) {
  rebuild();
  const id = `char:${ch.rosterId || ch.seed || slug(ch.identity?.codename || ch.identity?.realName || 'x')}`;
  ui.page = world.entities.has(id) ? id : 'home';
  ui.edit = false;
  if (!world.entities.has(id)) toast('Save the character to the roster to give them a page in the World.');
}

/** The hand-made part of the world (what the vault keeps), for sharing. */
export function worldSaved() { if (!saved) saved = load(); return saved; }
/** Merge a shared world in (pages, links, moments, overrides; the name if ours is the default). */
export function worldApply(incoming) {
  if (!saved) saved = load();
  if (!incoming?.v) return;
  saved = mergeWorldSaved(saved, incoming);
  save();
  if (root && !root.hidden) renderWorld();
}

/** The whole world as one key: pages, ties, moments, and the roster. */
export async function worldKey() {
  if (!saved) saved = load();
  return encodeWorld(saved, state.roster, { name: saved.name });
}

/** Open a world key someone sent: asks whether to merge into this world or replace it. */
export async function openWorldKey(text) {
  let data;
  try { data = await decodeWorld(text); } catch (e) { toast(e.message); return false; }
  const w = data.world || {};
  const pages = Object.keys(w.entities || {}).length; const links = (w.links || []).length; const moments = (w.moments || []).length; const chars = (data.characters || []).length;
  const mode = h('select', null,
    h('option', { value: 'merge' }, 'Merge: keep what is here, add and update from the key'),
    h('option', { value: 'replace' }, 'Replace my world with theirs (my own pages and ties go; characters are merged)'));
  const ok = await openDialog({
    title: `Open "${data.name || 'World'}"`,
    body: [h('p', { style: { margin: 0 } }, `${pages} hand-made page${pages === 1 ? '' : 's'}, ${links} tie${links === 1 ? '' : 's'}, ${moments} moment${moments === 1 ? '' : 's'} and ${chars} character${chars === 1 ? '' : 's'}${data.madeAt ? `, made ${data.madeAt.slice(0, 10)}` : ''}.`), h('label', { class: 'field' }, h('span', null, 'How'), mode)],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Open', value: true, primary: true }],
  });
  if (!ok) return false;
  if (!saved) saved = load();
  if (mode.value === 'replace') { saved = { ...emptyWorld(), ...w }; save(); }
  else worldApply({ ...w, v: w.v || 1 });
  let n = 0;
  for (const ch of data.characters || []) { if (ch?.abilities && ch.pl != null) { upsert(ch); n++; } }
  save();
  ui.page = 'home'; ui.history = [];
  if (root && !root.hidden) renderWorld();
  toast(`Opened ${data.name || 'the world'}: ${pages} pages, ${n} characters`);
  return true;
}

/** Add an event page to the World (a scheme hint, a session recap), tied to the people it names. */
export function addWorldEvent({ name, summary = '', tags = [], fields = {}, people = [] }) {
  rebuild();
  const ev = createEntity(saved, { type: 'event', name, summary, tags, fields: { Date: new Date().toISOString().slice(0, 10), ...fields } });
  for (const who of people) {
    const e = [...world.entities.values()].find((x) => x.type === 'person' && x.name.toLowerCase() === String(who).toLowerCase());
    if (e) addLink(saved, { from: e.id, to: ev.id, rel: 'involved', note: fields.Kind || '' });
  }
  save();
  return ev;
}

/** Every page, for the jump-anywhere search: [{ id, name, type, aliases }]. */
export function worldPages() {
  if (!saved) saved = load();
  rebuild();
  return [...world.entities.values()].map((e) => ({ id: e.id, name: e.name, type: e.type, aliases: e.aliases || [], one: typeMeta(e.type).one }));
}

/** Open a World page (or one of the World's own pages: 'sessions', 'timeline'…) by id. */
export function openWorldPageById(id) { ui.history = []; ui.page = id; ui.edit = false; if (root && !root.hidden) renderWorld(); }

/** The World's name (the campaign). */
export function worldName() { return saved?.name && saved.name !== 'My World' ? saved.name : 'Our Campaign'; }

export function recordBattleInWorld(battle) {
  rebuild();
  const ev = recordBattle(saved, battle, world);
  save();
  return ev;
}

// The pages in world-*.js reach this module's state through W.
Object.defineProperties(W, {
  world: { get: () => world },
  saved: { get: () => saved, set: (v) => { saved = v; } },
  ui: { get: () => ui },
  hooks: { get: () => hooks },
  R: { get: () => R },
  root: { get: () => root },
});
Object.assign(W, { save, rebuild, renderWorld, go: (...a) => go(...a), back: (...a) => back(...a), ctx: () => ctx(), worldKey, openWorldKey, openPaperKey, openHandoutKey });

// ---- navigation -----------------------------------------------------------------------------------------------------------

/** What the newsstand module needs from this one. */
const ctx = () => ({ R, world, saved, save, go, back, renderWorld, ui, hooks });

/** A front page from a key (Forge "Open a key", a #n= link, the Vault page). Returns true when it opened. */
export async function openPaperKey(text) {
  try { if (!saved) saved = load(); rebuild(); importPaper(ctx(), await decodePaper(text)); return true; } catch (e) { toast(e.message); return false; }
}

/** A handout from a key (Forge "Open a key", a #h= link, the Vault page). */
export async function openHandoutKey(text) {
  try { if (!saved) saved = load(); rebuild(); importHandout(ctx(), await decodeHandout(text)); return true; } catch (e) { toast(e.message); return false; }
}
export function openHandoutObject(hd) { if (!saved) saved = load(); rebuild(); importHandout(ctx(), hd); }

/** A front page that arrived as an object (the importer decoded the key). */
export function openPaperObject(paper) { if (!saved) saved = load(); rebuild(); importPaper(ctx(), paper); }

function go(page, { replace = false } = {}) {
  if (!replace && page !== ui.page) { ui.history.push(ui.page); if (ui.history.length > 40) ui.history.shift(); }
  ui.page = page; ui.edit = false; ui.linkPreset = null; ui.addTie = false; ui.q = ''; renderWorld(); window.scrollTo({ top: 0 });
}
function back() { const prev = ui.history.pop(); if (prev != null) { ui.page = prev; ui.edit = false; ui.linkPreset = null; renderWorld(); } }
// The World's own bar: where you are, the pages that aren't people or places, search, and the two things you
// do most (record what happened, make a page). Everything else lives one click down.
const TABS = [['home', 'Home', '⌂'], ['sessions', 'Sessions', '🗓'], ['timeline', 'Timeline', '🕰'], ['graph', 'Graph', '◉'], ['board', 'Board', '📌'], ['newsstand', 'Newsstand', '📰'], ['handouts', 'Handouts', '🗂'], ['vault', 'Share & export', '🗄']];
const TAB_OF = { 'paper-edit': 'newsstand', 'handout-edit': 'handouts' };

function newMenu() {
  return menu('＋ New', [
    ...Object.entries(ENTITY_TYPES).filter(([t]) => t !== 'paper' && t !== 'handout').map(([t, m]) => ({ label: `${m.glyph} ${m.one}`, hint: NEW_HINTS[t] || '', run: () => newPageDialog(t) })),
    { label: '📰 Front page', hint: 'Draft a newspaper from the campaign, or write one', run: () => startPaper(ctx(), { draft: true }) },
    { label: '📜 Handout', hint: 'A wanted poster, case file, letter, texts or report', run: () => newHandoutDialog(ctx()) },
  ], { cls: 'btn sm' });
}
const NEW_HINTS = { person: 'Anyone the roster does not know yet', faction: 'A team, agency, gang, court or cult', location: 'A city, a base, a bar, a planet', event: 'A battle, a wedding, a heist, a funeral', item: 'An artefact, a weapon, a vehicle, a MacGuffin' };

function topbar() {
  const results = h('div', { class: 'wd-results', role: 'listbox', hidden: !ui.q.trim() });
  const drawResults = () => {
    clear(results);
    results.hidden = !ui.q.trim();
    if (results.hidden) return;
    const found = searchWorld(world, ui.q, { limit: 12 });
    if (!found.length) { results.append(h('p', { class: 'hint', style: { margin: '4px 6px' } }, 'Nothing by that name. '), h('button', { type: 'button', class: 'linkish', style: { margin: '0 6px 6px' }, onClick: () => newPageDialog('person', ui.q.trim()) }, `Make a page for "${ui.q.trim()}"`)); return; }
    for (const e of found) results.append(h('div', { class: 'wd-result' }, pageLink(e, { note: typeMeta(e.type).one })));
  };
  const q = h('input', { type: 'search', id: 'wd-q', placeholder: 'Search pages…  ( / )', value: ui.q, 'aria-label': 'Search the world', autocomplete: 'off',
    onInput: (e) => { ui.q = e.target.value; drawResults(); },
    onKeydown: (e) => { if (e.key === 'Enter') { const f = searchWorld(world, ui.q, { limit: 1 })[0]; if (f) { ui.q = ''; go(f.id); } } if (e.key === 'Escape') { ui.q = ''; e.target.value = ''; drawResults(); } } });
  drawResults();
  const active = TAB_OF[ui.page] || ui.page;
  return h('div', { class: 'wd-topbar' },
    h('div', { class: 'wd-topbar-row' },
      h('button', { type: 'button', class: 'wd-world-name', onClick: () => go('home'), title: 'The world\'s home page' }, h('span', { class: 'wd-glyph' }, '🌐'), h('b', null, world.name || 'My World')),
      h('div', { class: 'wd-search' }, q, results),
      h('div', { class: 'wd-topbar-actions' },
        h('button', { class: 'btn sm primary', type: 'button', title: 'Record something that happened: a new tie, a betrayal, a death, a move, a faction joined or left', onClick: () => momentDialog({}) }, '⚡ What happened'),
        newMenu())),
    h('nav', { class: 'wd-tabs', 'aria-label': 'World pages' }, TABS.map(([id, label, glyph]) => h('button', { type: 'button', class: `wd-tab ${active === id ? 'active' : ''}`, 'aria-current': active === id ? 'page' : null, onClick: () => go(id) }, h('span', { class: 'wd-glyph', 'aria-hidden': 'true' }, glyph), label))));
}

/** Every page, by kind. On a phone it starts folded, so the page you opened comes first. */
function indexPanel() {
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 1000px)').matches;
  const open = ui.index ?? !narrow;
  const total = world.entities.size;
  const sections = Object.entries(ENTITY_TYPES).map(([t, meta]) => {
    const list = [...world.entities.values()].filter((e) => e.type === t).sort((a, b) => (b.character ? 1 : 0) - (a.character ? 1 : 0) || b.degree - a.degree || a.name.localeCompare(b.name));
    if (!list.length && (t === 'paper' || t === 'handout')) return null;
    const sOpen = ui.open[t] ?? (t === 'person' || t === 'faction');
    const showAll = ui.showAll[t];
    const shown = showAll ? list : list.slice(0, 12);
    return h('div', { class: 'wd-section' },
      h('div', { class: 'wd-section-head-row' },
        h('button', { type: 'button', class: 'wd-section-head', 'aria-expanded': String(sOpen), onClick: () => { ui.open[t] = !sOpen; renderWorld(); } },
          h('span', { class: 'wd-caret' }, sOpen ? '▾' : '▸'), h('span', { class: 'wd-glyph' }, meta.glyph), meta.label, h('span', { class: 'count' }, list.length)),
        h('button', { type: 'button', class: 'wd-section-add', title: `New ${meta.one.toLowerCase()}`, 'aria-label': `New ${meta.one.toLowerCase()}`, onClick: () => { if (t === 'paper') startPaper(ctx(), { draft: true }); else if (t === 'handout') newHandoutDialog(ctx()); else newPageDialog(t); } }, '+')),
      sOpen ? h('div', { class: 'wd-section-list' },
        shown.map((e) => h('button', { type: 'button', class: `wd-tree ${ui.page === e.id ? 'active' : ''}`, style: { '--c': e.color || meta.color }, title: e.status || '', onClick: () => go(e.id) }, h('span', { class: 'swatch' }), h('span', { class: 'wd-tree-name' }, e.name), e.character ? h('span', { class: 'wd-tree-pl num' }, `PL ${e.character.pl}`) : shortStatus(e) ? h('span', { class: 'wd-tree-pl' }, e.status) : null)),
        list.length > 12 ? h('button', { type: 'button', class: 'linkish wd-more', onClick: () => { ui.showAll[t] = !showAll; renderWorld(); } }, showAll ? 'Show fewer' : `Show all ${list.length}`) : null,
        !list.length ? h('p', { class: 'hint wd-none' }, t === 'person' ? 'Save characters to the roster.' : `None yet: + makes one.`) : null) : null);
  }).filter(Boolean);
  const el = h('details', { class: 'wd-side', open, 'aria-label': 'All pages' },
    h('summary', { class: 'wd-side-summary' }, h('span', null, 'All pages'), h('span', { class: 'count' }, total)),
    h('div', { class: 'wd-sections' }, sections));
  el.addEventListener('toggle', () => { ui.index = el.open; });
  return el;
}

// ---- home ------------------------------------------------------------------------------------------------------------

function home() {
  const ents = [...world.entities.values()];
  const counts = Object.entries(ENTITY_TYPES).map(([t, meta]) => ({ t, meta, n: ents.filter((e) => e.type === t).length }));
  const chars = ents.filter((e) => e.character).sort((a, b) => b.degree - a.degree);
  const factions = ents.filter((e) => e.type === 'faction').sort((a, b) => b.degree - a.degree).slice(0, 8);
  const connected = ents.filter((e) => !e.character && e.type !== 'faction' && e.degree > 0).sort((a, b) => b.degree - a.degree).slice(0, 12);
  const latest = campaignTimeline(world).slice(-6).reverse();
  const papers = ents.filter((e) => e.type === 'paper' && e.paper).sort((a, b) => String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || ''))).slice(0, 3);
  const latestBlock = latest.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Latest in the campaign', h('button', { class: 'linkish', type: 'button', style: { marginLeft: '10px', fontSize: '13px' }, onClick: () => go('timeline') }, 'full timeline')), h('div', { class: 'wd-tl' }, latest.map(timelineItem))) : null;
  const editBtn = h('button', { class: 'btn sm wd-hero-edit', type: 'button', onClick: async () => {
    const name = h('input', { type: 'text', value: world.name || '' });
    const tag = h('input', { type: 'text', value: world.tagline || '' });
    const desc = h('textarea', { style: { minHeight: '100px' } }, world.description || '');
    const ok = await openDialog({ title: 'This world', body: [h('label', { class: 'field' }, h('span', null, 'Name'), name), h('label', { class: 'field' }, h('span', null, 'Tagline'), tag), h('label', { class: 'field' }, h('span', null, 'About'), desc)], buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }] });
    if (ok) { saved.name = name.value.trim() || 'My World'; saved.tagline = tag.value.trim(); saved.description = desc.value.trim(); save(); renderWorld(); }
  } }, 'Edit');
  const quick = (glyph, label, hint, fn, primary = false) => h('button', { type: 'button', class: `wd-quick ${primary ? 'primary' : ''}`, title: hint, onClick: fn }, h('span', { class: 'wd-quick-glyph' }, glyph), h('b', null, label), h('small', null, hint));
  // Until something has been written by hand, show where to start; after that the bar above has it all.
  const fresh = !Object.keys(saved.entities).length && !(saved.moments || []).length && !saved.links.length;
  const shownCounts = counts.filter(({ n }) => n > 0);
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero' },
      h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'World'), h('h1', null, world.name || 'My World'), h('p', { class: 'wd-tagline' }, world.tagline || ''), world.description ? h('p', null, world.description) : null,
        shownCounts.length ? h('div', { class: 'wd-counts' }, shownCounts.map(({ t, meta, n }) => h('button', { type: 'button', class: 'wd-count', style: { '--c': meta.color }, title: `Show all ${meta.label.toLowerCase()} in the list of pages`, onClick: () => { ui.index = true; ui.open[t] = true; ui.showAll[t] = true; renderWorld(); } }, h('b', { class: 'num' }, n), h('span', null, meta.label)))) : null),
      editBtn),
    fresh && ents.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Start here'),
      h('div', { class: 'wd-quicks' },
        quick('⚡', 'What happened', 'Two people became enemies, someone joined a faction, moved, died…', () => momentDialog({}), true),
        quick('🏛', 'New faction', 'A team, agency, gang, court or cult', () => newPageDialog('faction')),
        quick('📍', 'New location', 'A city, a base, a bar, a planet', () => newPageDialog('location')),
        quick('📌', 'Evidence board', 'Pin people, string the ties, stick the theories', () => go('board')))) : null,
    !ents.length ? h('div', { class: 'empty' }, h('h2', null, 'An empty world'), h('p', null, 'Save characters to your roster and they appear here with everyone in their lives: parents, mentors, rivals, enemies, their city and their team. Then record what happens to them with "What happened".')) : null,
    latestBlock,
    papers.length ? h('section', { class: 'wd-block' }, h('h2', null, 'On the newsstand', h('button', { class: 'linkish', type: 'button', style: { marginLeft: '10px', fontSize: '13px' }, onClick: () => go('newsstand') }, 'all front pages')), h('div', { class: 'np-stand small' }, papers.map((e) => h('div', { class: 'np-card' }, paperThumb(e.paper, () => go(e.id)), h('div', { class: 'np-card-text' }, h('b', null, e.paper.masthead), h('span', null, [e.paper.edition, e.paper.date].filter(Boolean).join(' · '))))))) : null,
    chars.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Heroes, villains and everyone saved', h('span', { class: 'pts' }, chars.length)), h('div', { class: 'wd-cards' }, (ui.showAll.homeChars ? chars : chars.slice(0, 9)).map(personCard)),
      chars.length > 9 ? h('button', { type: 'button', class: 'btn sm ghost', style: { justifySelf: 'start' }, onClick: () => { ui.showAll.homeChars = !ui.showAll.homeChars; renderWorld(); } }, ui.showAll.homeChars ? 'Show fewer' : `Show all ${chars.length}`) : null) : null,
    factions.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Factions'), h('div', { class: 'wd-cards' }, factions.map(factionCard))) : null,
    connected.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Most connected'), h('div', { class: 'wd-chips' }, connected.map((e) => pageLink(e, { chip: true, note: `${e.degree} tie${e.degree === 1 ? '' : 's'}` })))) : null,
    h('p', { class: 'hint' }, 'Pages for saved characters follow the roster: edit a character, roll a new bio, add factions or a journal session and the world updates. What you record here (pages, ties, what happened) is kept with your data and goes out with backups, sync and world keys. Press / to search.'));
}

function personCard(e) {
  const ch = e.character;
  let s = null;
  try { s = ch ? makeSheet(ch, R) : null; } catch { s = null; }
  const color = e.color || typeMeta(e.type).color;
  const img = ch ? portraitImg(ch) : null;
  return h('article', { class: 'wd-card', style: { '--c': color, '--c-ink': inkFor(color) } },
    h('button', { type: 'button', class: `wd-card-head ${img ? 'has-img' : ''}`, onClick: () => go(e.id) }, img ? h('span', { class: 'wd-card-img' }, img) : null, h('span', { class: 'wd-card-titles' }, h('span', { class: 'wd-card-name' }, e.name), h('span', { class: 'wd-card-sub' }, [e.aliases[0], ch ? `PL ${ch.pl}` : null, e.fields?.Side, shortStatus(e)].filter(Boolean).join(' · ')))),
    h('div', { class: 'wd-card-body' },
      e.summary ? h('p', null, String(e.summary).length > 120 ? `${String(e.summary).slice(0, 117)}…` : e.summary) : null,
      s ? h('div', { class: 'card-stats' }, [['Dodge', s.d.defenses.Dodge], ['Parry', s.d.defenses.Parry], ['Tough', s.d.defenses.Toughness], ['Will', s.d.defenses.Will]].map(([k, v]) => h('div', null, h('b', { class: 'num' }, v), h('span', null, k.toUpperCase())))) : null,
      h('div', { class: 'wd-card-links' }, e.connections.slice(0, 3).map((c) => pageLink(c.other, { chip: true, rel: c.rel, note: c.label.toLowerCase() })), e.connections.length > 3 ? h('button', { type: 'button', class: 'linkish', style: { fontSize: '12.5px' }, onClick: () => go(e.id) }, `+${e.connections.length - 3} more`) : null)));
}

function factionCard(e) {
  const color = e.color || typeMeta(e.type).color;
  const members = e.connections.filter((c) => ['hasMember', 'ledBy', 'foundedBy'].includes(c.rel));
  const leaders = e.connections.filter((c) => c.rel === 'ledBy').map((c) => c.other);
  const foes = e.connections.filter((c) => ['enemy', 'atWar', 'nemesis'].includes(c.rel)).map((c) => c.other);
  return h('article', { class: 'wd-card', style: { '--c': color, '--c-ink': inkFor(color) } },
    h('button', { type: 'button', class: 'wd-card-head', onClick: () => go(e.id) }, h('span', { class: 'wd-card-titles' }, h('span', { class: 'wd-card-name' }, e.name), h('span', { class: 'wd-card-sub' }, [e.fields?.Kind, `${[...new Set(members.map((m) => m.other.id))].length} member${members.length === 1 ? '' : 's'}`, e.status].filter(Boolean).join(' · ')))),
    h('div', { class: 'wd-card-body' },
      e.summary ? h('p', null, String(e.summary).length > 140 ? `${String(e.summary).slice(0, 137)}…` : e.summary) : null,
      leaders.length ? h('div', { class: 'wd-card-links' }, h('small', { class: 'hint' }, 'Led by'), leaders.map((l) => pageLink(l, { chip: true }))) : null,
      foes.length ? h('div', { class: 'wd-card-links' }, h('small', { class: 'hint' }, 'Against'), foes.slice(0, 4).map((l) => pageLink(l, { chip: true, rel: 'enemy' }))) : null));
}

// ---- render ----------------------------------------------------------------------------------------------------------------

export function renderWorld() {
  if (!root) return;
  rebuild();
  clear(root);
  let page;
  if (ui.page === 'home') page = home();
  else if (ui.page === 'timeline') page = timelinePage();
  else if (ui.page === 'graph') page = graphPage();
  else if (ui.page === 'vault') page = vaultPage();
  else if (ui.page === 'sessions') page = sessionsPage();
  else if (ui.page === 'newsstand') page = newsstandPage(ctx());
  else if (ui.page === 'paper-edit') page = editorPage(ctx());
  else if (ui.page === 'handouts') page = handoutsPage(ctx());
  else if (ui.page === 'handout-edit') page = handoutEditorPage(ctx());
  else if (ui.page === 'board') page = boardPage(ctx());
  else if (world.entities.has(ui.page)) { const e = world.entities.get(ui.page); page = e.type === 'paper' && e.paper ? paperPage(ctx(), e) : e.type === 'handout' && e.handout ? handoutPage(ctx(), e) : entityPage(e); }
  else { ui.page = 'home'; page = home(); }
  root.append(h('div', { class: 'wd-shell' }, topbar(), h('div', { class: 'wd-layout' }, indexPanel(), h('main', { class: 'wd-content' }, page))));
}
