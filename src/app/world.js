// The World tab: a wiki of the whole campaign. Every saved character is a page; everyone named in
// their lives is a page; teams, factions, cities and sessions are pages; and every page links to the
// others in both directions. Record what happened ("these two became enemies", "she joined the
// Court", "he died") and the world changes with it: ties start and end at a session, pages carry a
// status, the timeline shows when, and the graph can be wound back to any session.

import { h, clear, toast, copyText, download, openDialog, inkFor } from './dom.js';
import { state, upsert } from './store.js';
import { buildWorld, emptyWorld, ENTITY_TYPES, RELATIONS, RELATION_GROUPS, groupedConnections, entityTimeline, campaignTimeline, searchWorld, createEntity, updateEntity, deleteEntity, addLink, removeLink, layoutGraph, vaultMarkdown, recordBattle, slug, MOMENT_KINDS, MOMENT_GROUPS, momentKindsFor, momentSentence, recordMoment, removeMoment, updateMoment, linksAsOf, lastSession } from '../engine/world.js';
import { zip } from '../engine/xlsx.js';
import { sheet as makeSheet } from '../engine/render.js';
import { fromKeySync } from '../engine/keys.js';
import { portraitImg } from './portrait.js';
import { encodeWorld, decodeWorld, isWorldKey, isPaperKey, decodePaper, keySize } from './share.js';
import { newsstandPage, paperPage, editorPage, startPaper, importPaper, paperThumb } from './newspaper.js';

const KEY = 'dcugen.world.v1';
let R; let root; let hooks = {};
let saved;
let world;
const ui = { page: 'home', q: '', edit: false, graphTypes: new Set(Object.keys(ENTITY_TYPES)), graphGroups: new Set(RELATION_GROUPS), open: {}, showAll: {}, history: [], tlFilter: 'all', asOf: null, showPast: false, linkPreset: null };

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
  saved.entities = { ...saved.entities, ...(incoming.entities || {}) };
  saved.overrides = { ...saved.overrides, ...(incoming.overrides || {}) };
  for (const l of incoming.links || []) if (!saved.links.some((x) => x.id === l.id)) saved.links.push(l);
  for (const m of incoming.moments || []) if (!(saved.moments || []).some((x) => x.id === m.id)) (saved.moments = saved.moments || []).push(m);
  saved.linkEnds = { ...(saved.linkEnds || {}), ...(incoming.linkEnds || {}) };
  saved.hidden = [...new Set([...(saved.hidden || []), ...(incoming.hidden || [])])];
  saved.hiddenLinks = [...new Set([...(saved.hiddenLinks || []), ...(incoming.hiddenLinks || [])])];
  if (incoming.name && (!saved.name || saved.name === 'My World')) { saved.name = incoming.name; saved.tagline = incoming.tagline || saved.tagline; saved.description = incoming.description || saved.description; }
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

export function recordBattleInWorld(battle) {
  rebuild();
  const ev = recordBattle(saved, battle, world);
  save();
  return ev;
}

// ---- svg helper ------------------------------------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

// ---- navigation -----------------------------------------------------------------------------------------------------------

/** What the newsstand module needs from this one. */
const ctx = () => ({ R, world, saved, save, go, back, renderWorld, ui, hooks });

/** A front page from a key (Forge "Open a key", a #n= link, the Vault page). Returns true when it opened. */
export async function openPaperKey(text) {
  try { if (!saved) saved = load(); rebuild(); importPaper(ctx(), await decodePaper(text)); return true; } catch (e) { toast(e.message); return false; }
}

/** A front page that arrived as an object (the importer decoded the key). */
export function openPaperObject(paper) { if (!saved) saved = load(); rebuild(); importPaper(ctx(), paper); }

function go(page, { replace = false } = {}) {
  if (!replace && page !== ui.page) { ui.history.push(ui.page); if (ui.history.length > 40) ui.history.shift(); }
  ui.page = page; ui.edit = false; ui.linkPreset = null; renderWorld(); window.scrollTo({ top: 0 });
}
function back() { const prev = ui.history.pop(); if (prev != null) { ui.page = prev; ui.edit = false; ui.linkPreset = null; renderWorld(); } }
const typeMeta = (t) => ENTITY_TYPES[t] || { label: t, one: t, glyph: '✦', color: '#666' };
const whenText = (w) => (w?.session != null ? `S${w.session}` : w?.date || '');
const STATUS_TONE = { Dead: 'bad', Missing: 'warn', Captured: 'warn', Injured: 'warn', Retired: 'muted', 'In hiding': 'muted', Destroyed: 'bad', Disbanded: 'muted', 'Turned villain': 'bad', Reformed: 'good', Active: 'good', Alive: 'good' };
// A short status is a badge (Dead, Missing, Estranged); a long bio sentence is not.
const shortStatus = (e) => (e.status && e.status !== 'Active' && e.status !== 'Alive' && (STATUS_TONE[e.status] || e.status.length <= 14) ? e.status : null);
const statusBadge = (e, { big = false } = {}) => (shortStatus(e) ? h('span', { class: `wd-status ${STATUS_TONE[e.status] || ''} ${big ? 'big' : ''}` }, e.status) : null);

function pageLink(e, { chip = false, note = null, rel = null } = {}) {
  const color = e.color || typeMeta(e.type).color;
  return h('button', { type: 'button', class: chip ? 'wd-chip' : 'wd-link', style: { '--c': color, '--rc': rel ? (RELATIONS[rel]?.color || color) : color }, title: [typeMeta(e.type).one, e.status || null, e.summary ? String(e.summary).slice(0, 140) : ''].filter(Boolean).join(' · '), onClick: () => go(e.id) },
    h('span', { class: 'wd-glyph', 'aria-hidden': 'true' }, e.type === 'person' && e.character ? initialsOf(e.name) : typeMeta(e.type).glyph), h('span', { class: 'wd-link-name' }, e.name), statusBadge(e), note ? h('small', null, note) : null);
}
const initialsOf = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const findByName = (name, type = null) => { const n = String(name || '').trim().toLowerCase(); return [...world.entities.values()].find((x) => (!type || x.type === type) && (x.name.toLowerCase() === n || x.aliases?.some((a) => String(a).toLowerCase() === n))) || null; };

function sidebar() {
  const q = h('input', { type: 'search', id: 'wd-q', placeholder: 'Search the world…  ( / )', value: ui.q, 'aria-label': 'Search the world', onInput: (e) => { ui.q = e.target.value; drawResults(); }, onKeydown: (e) => { if (e.key === 'Enter') { const f = searchWorld(world, ui.q, { limit: 1 })[0]; if (f) go(f.id); } } });
  const results = h('div', { class: 'wd-results' });
  const drawResults = () => {
    clear(results);
    if (!ui.q.trim()) return;
    const found = searchWorld(world, ui.q, { limit: 14 });
    if (!found.length) { results.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing by that name. '), h('button', { type: 'button', class: 'linkish', onClick: () => newPageDialog('person', ui.q.trim()) }, `Make a page for "${ui.q.trim()}"`)); return; }
    for (const e of found) results.append(pageLink(e, { note: typeMeta(e.type).one }));
  };
  drawResults();
  const counts = Object.fromEntries(Object.keys(ENTITY_TYPES).map((t) => [t, [...world.entities.values()].filter((e) => e.type === t).length]));
  const navBtn = (id, label, glyph) => h('button', { type: 'button', class: `wd-nav ${ui.page === id ? 'active' : ''}`, onClick: () => go(id) }, h('span', { class: 'wd-glyph' }, glyph), label);
  const sections = Object.entries(ENTITY_TYPES).map(([t, meta]) => {
    const list = [...world.entities.values()].filter((e) => e.type === t).sort((a, b) => (b.character ? 1 : 0) - (a.character ? 1 : 0) || b.degree - a.degree || a.name.localeCompare(b.name));
    const open = ui.open[t] ?? (t === 'person');
    const showAll = ui.showAll[t];
    const shown = showAll ? list : list.slice(0, 12);
    return h('div', { class: 'wd-section' },
      h('button', { type: 'button', class: 'wd-section-head', 'aria-expanded': String(open), onClick: () => { ui.open[t] = !open; renderWorld(); } },
        h('span', { class: 'wd-caret' }, open ? '▾' : '▸'), h('span', { class: 'wd-glyph' }, meta.glyph), meta.label, h('span', { class: 'count' }, counts[t]),
        h('span', { class: 'wd-section-add', role: 'button', title: `New ${meta.one.toLowerCase()}`, onClick: (e) => { e.stopPropagation(); if (t === 'paper') startPaper(ctx(), { draft: true }); else newPageDialog(t); } }, '+')),
      open ? h('div', { class: 'wd-section-list' },
        shown.map((e) => h('button', { type: 'button', class: `wd-tree ${ui.page === e.id ? 'active' : ''} ${shortStatus(e) ? 'has-status' : ''}`, style: { '--c': e.color || meta.color }, title: e.status || '', onClick: () => go(e.id) }, h('span', { class: 'swatch' }), h('span', { class: 'wd-tree-name' }, e.name), e.character ? h('span', { class: 'wd-tree-pl num' }, `PL ${e.character.pl}`) : shortStatus(e) ? h('span', { class: 'wd-tree-pl' }, e.status) : null)),
        list.length > 12 ? h('button', { type: 'button', class: 'linkish', style: { fontSize: '12px', margin: '2px 0 0 22px' }, onClick: () => { ui.showAll[t] = !showAll; renderWorld(); } }, showAll ? 'Show fewer' : `Show all ${list.length}`) : null,
        !list.length ? h('p', { class: 'hint', style: { margin: '0 0 0 22px' } }, t === 'person' ? 'Save characters to the roster.' : t === 'paper' ? 'Draft one at the newsstand.' : `No ${meta.label.toLowerCase()} yet.`) : null) : null);
  });
  return h('aside', { class: 'wd-side', 'aria-label': 'World index' },
    h('div', { class: 'wd-side-top' },
      h('button', { type: 'button', class: 'wd-world-name', onClick: () => go('home'), title: 'Home' }, h('span', { class: 'wd-glyph' }, '🌐'), h('b', null, world.name || 'My World'))),
    h('div', { class: 'btn-row', style: { gap: '6px' } },
      h('button', { class: 'btn sm primary', type: 'button', title: 'Record something that happened: a new tie, a betrayal, a death, a move, a faction joined or left', onClick: () => momentDialog({}) }, '⚡ What happened'),
      h('button', { class: 'btn sm', type: 'button', onClick: () => newPageDialog() }, '+ Page'),
      h('button', { class: 'btn sm', type: 'button', title: 'Copy a key that holds this whole world and roster, to paste to your players', onClick: copyWorldKey }, '🔑 Share')),
    q, results,
    h('nav', { class: 'wd-navs' }, navBtn('home', 'Home', '⌂'), navBtn('timeline', 'Campaign timeline', '🕰'), navBtn('graph', 'Relationship graph', '◉'), navBtn('newsstand', 'Newsstand: front pages', '📰'), navBtn('vault', 'Vault: import / export', '🗄')),
    h('div', { class: 'wd-sections' }, sections));
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
  const editBtn = h('button', { class: 'btn sm', type: 'button', onClick: async () => {
    const name = h('input', { type: 'text', value: world.name || '' });
    const tag = h('input', { type: 'text', value: world.tagline || '' });
    const desc = h('textarea', { style: { minHeight: '100px' } }, world.description || '');
    const ok = await openDialog({ title: 'This world', body: [h('label', { class: 'field' }, h('span', null, 'Name'), name), h('label', { class: 'field' }, h('span', null, 'Tagline'), tag), h('label', { class: 'field' }, h('span', null, 'About'), desc)], buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }] });
    if (ok) { saved.name = name.value.trim() || 'My World'; saved.tagline = tag.value.trim(); saved.description = desc.value.trim(); save(); renderWorld(); }
  } }, 'Edit');
  const quick = (glyph, label, hint, fn, primary = false) => h('button', { type: 'button', class: `wd-quick ${primary ? 'primary' : ''}`, title: hint, onClick: fn }, h('span', { class: 'wd-quick-glyph' }, glyph), h('b', null, label), h('small', null, hint));
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero' },
      h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'World'), h('h1', null, world.name || 'My World'), h('p', { class: 'wd-tagline' }, world.tagline || ''), world.description ? h('p', null, world.description) : null, editBtn),
      h('div', { class: 'wd-counts' }, counts.map(({ t, meta, n }) => h('button', { type: 'button', class: 'wd-count', style: { '--c': meta.color }, onClick: () => { ui.open[t] = true; ui.showAll[t] = true; renderWorld(); } }, h('b', { class: 'num' }, n), h('span', null, meta.label))))),
    h('div', { class: 'wd-quicks' },
      quick('⚡', 'What happened', 'Two people became enemies, someone joined a faction, moved, died…', () => momentDialog({}), true),
      quick('🏛', 'New faction', 'A team, agency, gang, court or cult', () => newPageDialog('faction')),
      quick('📍', 'New location', 'A city, a base, a bar, a planet', () => newPageDialog('location')),
      quick('📅', 'New event', 'A battle, a wedding, a heist, a funeral', () => newPageDialog('event')),
      quick('🗝', 'New item', 'An artefact, a weapon, a vehicle, a MacGuffin', () => newPageDialog('item')),
      quick('🧑', 'New person', 'Anyone the roster does not know yet', () => newPageDialog('person')),
      quick('📰', 'Front page', 'Draft a newspaper from the campaign, or write one', () => go('newsstand'))),
    !ents.length ? h('div', { class: 'empty' }, h('h2', null, 'An empty world'), h('p', null, 'Save characters to your roster and they appear here with everyone in their lives: parents, mentors, rivals, enemies, their city and their team. Then record what happens to them with "What happened".')) : null,
    papers.length ? h('section', { class: 'wd-block' }, h('h2', null, 'On the newsstand', h('button', { class: 'linkish', type: 'button', style: { marginLeft: '10px', fontSize: '13px' }, onClick: () => go('newsstand') }, 'all front pages')), h('div', { class: 'np-stand small' }, papers.map((e) => h('div', { class: 'np-card' }, paperThumb(e.paper, () => go(e.id)), h('div', { class: 'np-card-text' }, h('b', null, e.paper.masthead), h('span', null, [e.paper.edition, e.paper.date].filter(Boolean).join(' · '))))))) : null,
    latest.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Latest in the campaign', h('button', { class: 'linkish', type: 'button', style: { marginLeft: '10px', fontSize: '13px' }, onClick: () => go('timeline') }, 'full timeline')), h('div', { class: 'wd-tl' }, latest.map(timelineItem))) : null,
    chars.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Heroes, villains and everyone saved'), h('div', { class: 'wd-cards' }, chars.map(personCard))) : null,
    factions.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Factions'), h('div', { class: 'wd-cards' }, factions.map(factionCard))) : null,
    connected.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Most connected'), h('div', { class: 'wd-chips' }, connected.map((e) => pageLink(e, { chip: true, note: `${e.degree} tie${e.degree === 1 ? '' : 's'}` })))) : null,
    h('p', { class: 'hint' }, 'Everything here is clickable. Pages for saved characters follow the roster: edit a character, roll a new bio, add factions or a journal session and the world updates. What you record here (pages, ties, what happened) lives in the vault and goes out with backups and lobby keys. Press / to search.'));
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
      e.summary ? h('p', null, String(e.summary).length > 160 ? `${String(e.summary).slice(0, 157)}…` : e.summary) : null,
      s ? h('div', { class: 'card-stats' }, [['Dodge', s.d.defenses.Dodge], ['Parry', s.d.defenses.Parry], ['Tough', s.d.defenses.Toughness], ['Will', s.d.defenses.Will]].map(([k, v]) => h('div', null, h('b', { class: 'num' }, v), h('span', null, k.toUpperCase())))) : null,
      h('div', { class: 'wd-card-links' }, e.connections.slice(0, 5).map((c) => pageLink(c.other, { chip: true, rel: c.rel, note: c.label.toLowerCase() })), e.connections.length > 5 ? h('span', { class: 'hint' }, `+${e.connections.length - 5} more`) : null)));
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

// ---- entity page ------------------------------------------------------------------------------------------------------------

function infobox(e) {
  const rows = Object.entries(e.fields || {}).filter(([, v]) => v != null && v !== '');
  const ch = e.character;
  let s = null;
  try { s = ch ? makeSheet(ch, R) : null; } catch { s = null; }
  return h('aside', { class: 'wd-infobox', style: { '--c': e.color || typeMeta(e.type).color } },
    h('div', { class: 'wd-infobox-head' }, h('span', { class: 'wd-glyph' }, typeMeta(e.type).glyph), typeMeta(e.type).one, statusBadge(e)),
    s ? h('div', { class: 'card-stats', style: { gridTemplateColumns: 'repeat(5, 1fr)', margin: '8px 0' } }, [['DOD', s.d.defenses.Dodge], ['PAR', s.d.defenses.Parry], ['TOU', s.d.defenses.Toughness], ['FOR', s.d.defenses.Fortitude], ['WIL', s.d.defenses.Will]].map(([k, v]) => h('div', null, h('b', { class: 'num' }, v), h('span', null, k)))) : null,
    rows.length ? h('dl', { class: 'wd-fields' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, String(v))])) : null,
    e.source === 'bio' && e.knownBy?.length ? h('div', { class: 'wd-known' }, h('div', { class: 'label' }, 'Known through'), e.knownBy.map((k) => h('div', { class: 'wd-known-row' }, h('button', { type: 'button', class: 'wd-link', onClick: () => go(k.id) }, k.name), h('small', null, ` · their ${(k.relation || k.role || 'contact').toLowerCase()}`)))) : null,
    e.tags?.length ? h('div', { class: 'wd-tags' }, e.tags.map((t) => h('span', { class: 'wd-tag' }, `#${t}`))) : null,
    h('div', { class: 'wd-source' }, e.source === 'roster' ? 'From your roster: edits on the Forge show here.' : e.source === 'open' ? 'Open on the Forge but not saved to the roster yet.' : e.source === 'bio' ? 'Named in someone\'s life story or journal.' : e.source === 'journal' ? 'A session from a campaign journal.' : e.source === 'auto' ? 'Built from the roster.' : 'Written by hand.'));
}

function egoGraph(e) {
  const nodes = [e, ...e.connections.map((c) => c.other)];
  const seen = new Set(nodes.map((n) => n.id));
  const edges = e.connections.map((c) => ({ from: e.id, to: c.other.id, rel: c.rel }));
  for (const n of e.connections.map((c) => c.other)) for (const c of n.connections || []) if (seen.has(c.other.id) && c.other.id !== e.id && !edges.some((x) => (x.from === n.id && x.to === c.other.id) || (x.from === c.other.id && x.to === n.id))) edges.push({ from: n.id, to: c.other.id, rel: c.rel, faint: true });
  if (nodes.length < 2) return null;
  const W = 520; const H = Math.max(260, Math.min(460, 120 + nodes.length * 18));
  const pos = layoutGraph(nodes.map((n) => ({ id: n.id })), edges, { width: W, height: H, iterations: 160, seed: nodes.length, center: e.id, margin: 70 });
  return h('div', { class: 'wd-graph-wrap' },
    svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wd-graph', role: 'img', 'aria-label': `${e.name} and their connections` },
      edges.map((ed) => { const a = pos.get(ed.from); const b = pos.get(ed.to); return svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: RELATIONS[ed.rel]?.color || '#999', 'stroke-width': ed.faint ? 1 : 2, 'stroke-opacity': ed.faint ? 0.35 : 0.8 }); }),
      nodes.map((n) => { const p = pos.get(n.id); const me = n.id === e.id; const color = n.color || typeMeta(n.type).color; return svg('g', { class: 'wd-node', transform: `translate(${p.x},${p.y})`, onClick: () => (me ? null : go(n.id)), style: me ? '' : 'cursor:pointer' },
        svg('title', null, `${n.name}${n.status ? ` (${n.status})` : ''}`),
        svg('circle', { r: me ? 20 : 13, fill: color, stroke: 'var(--surface)', 'stroke-width': 2, 'stroke-dasharray': n.status === 'Dead' ? '3 2' : null }),
        svg('text', { 'text-anchor': 'middle', dy: me ? 5 : 4, fill: inkFor(color), 'font-size': me ? 12 : 9, 'font-weight': 700 }, n.type === 'person' ? initialsOf(n.name) : typeMeta(n.type).glyph),
        svg('text', { 'text-anchor': 'middle', dy: me ? 34 : 26, fill: 'var(--ink)', 'font-size': 11, 'font-weight': me ? 800 : 600 }, n.name.length > 20 ? `${n.name.slice(0, 19)}…` : n.name)); })),
    h('div', { class: 'wd-legend' }, [...new Set(edges.map((x) => RELATIONS[x.rel]?.group).filter(Boolean))].map((g) => h('span', null, h('i', { style: { background: RELATIONS[Object.keys(RELATIONS).find((k) => RELATIONS[k].group === g)]?.color } }), g))));
}

function timelineRow(t, e) {
  const other = t.other ? world.entities.get(t.other) : null;
  return h('li', { class: `wd-tl-row ${t.kind}` },
    h('span', { class: 'wd-tl-when num' }, t.when || '·'),
    h('div', { class: 'wd-tl-body' },
      h('span', { class: 'bio-stage' }, [t.stage, t.date].filter(Boolean).join(' · ')),
      h('span', null, t.text),
      t.people?.length ? h('div', { class: 'wd-chips', style: { marginTop: '4px' } }, t.people.map((p) => { const pe = findByName(p.name, 'person'); return pe ? pageLink(pe, { chip: true, note: p.relation || null }) : h('span', { class: 'wd-chip' }, p.name); })) : null,
      t.points?.length ? h('ul', { class: 'wd-points' }, t.points.map((x) => h('li', null, h('b', null, x.type === 'award' ? `+${x.points} pp` : `${x.points > 0 ? `−${x.points}` : `+${-x.points}`} pp`), ' ', x.type === 'award' ? 'earned' : (x.changes || []).join('; ') || x.note))) : null,
      t.downtime ? h('div', { class: 'wd-downtime' }, h('b', null, 'Between adventures: '), t.downtime) : null,
      h('div', { class: 'wd-tl-tools' },
        t.by ? h('button', { type: 'button', class: 'linkish', onClick: () => go(t.by) }, 'open their page') : null,
        other ? h('button', { type: 'button', class: 'linkish', onClick: () => go(other.id) }, other.name) : null,
        t.eventId && world.entities.has(t.eventId) ? h('button', { type: 'button', class: 'linkish', onClick: () => go(t.eventId) }, 'event page') : null,
        t.momentId ? h('button', { type: 'button', class: 'linkish', onClick: () => editMomentDialog(t.momentId) }, 'edit') : null,
        t.momentId ? h('button', { type: 'button', class: 'linkish danger', onClick: () => undoMoment(t.momentId) }, 'undo') : null)));
}

// Quick ways to add a tie, by page type: [label, rel, type of a new page made from a typed name]
const QUICK_LINKS = {
  person: [['+ Friend', 'friend', 'person'], ['+ Ally', 'ally', 'person'], ['+ Enemy', 'enemy', 'person'], ['+ Rival', 'rival', 'person'], ['+ Love', 'love', 'person'], ['+ Family', 'family', 'person'], ['+ Mentor', 'mentor', 'person'], ['+ Faction', 'member', 'faction'], ['+ Lives in', 'livesIn', 'location'], ['+ Base', 'basedIn', 'location'], ['+ Owns', 'owns', 'item']],
  faction: [['+ Member', 'hasMember', 'person'], ['+ Leader', 'ledBy', 'person'], ['+ Founder', 'foundedBy', 'person'], ['+ Allied faction', 'allied', 'faction'], ['+ At war with', 'atWar', 'faction'], ['+ Enemy', 'enemy', 'person'], ['+ Headquarters', 'basedIn', 'location'], ['+ Owns', 'owns', 'item']],
  location: [['+ Lives here', 'homeOf', 'person'], ['+ Based here', 'baseOf', 'faction'], ['+ Works here', 'workplaceOf', 'person'], ['+ Inside', 'contains', 'location'], ['+ Part of', 'locatedIn', 'location'], ['+ Scene of', 'sceneOf', 'event'], ['+ Owner', 'ownedBy', 'person']],
  item: [['+ Owner', 'ownedBy', 'person'], ['+ Maker', 'createdBy', 'person'], ['+ Kept at', 'locatedIn', 'location'], ['+ Tied to', 'related', 'person']],
  event: [['+ Involved', 'involves', 'person'], ['+ Faction involved', 'involves', 'faction'], ['+ Where', 'happenedAt', 'location'], ['+ Item involved', 'involves', 'item']],
};

function addLinkForm(e) {
  const all = [...world.entities.values()].filter((x) => x.id !== e.id).sort((a, b) => a.name.localeCompare(b.name));
  const preset = ui.linkPreset || {};
  const target = h('input', { type: 'text', id: 'wd-link-target', list: 'wd-all', placeholder: 'Who or what (type to search, or a new name)', 'aria-label': 'Link to' });
  const rel = h('select', { 'aria-label': 'Relationship' }, RELATION_GROUPS.map((g) => h('optgroup', { label: g }, Object.entries(RELATIONS).filter(([, r]) => r.group === g).map(([k, r]) => h('option', { value: k, selected: k === preset.rel }, r.label)))));
  const newType = h('select', { 'aria-label': 'If new, make a', title: 'What kind of page a new name becomes' }, Object.entries(ENTITY_TYPES).map(([t, m]) => h('option', { value: t, selected: t === (preset.newType || 'person') }, `new ${m.one.toLowerCase()}`)));
  const since = h('input', { type: 'number', min: 0, placeholder: 'Since S#', title: 'Since which session (optional)', 'aria-label': 'Since session', style: { maxWidth: '92px' } });
  const note = h('input', { type: 'text', placeholder: 'Note (optional): why, how, since when', 'aria-label': 'Note' });
  const submit = () => {
    const name = target.value.trim();
    let other = all.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!other && name) { other = createEntity(saved, { type: newType.value, name }); toast(`Made a ${typeMeta(newType.value).one.toLowerCase()} page for ${name}`); }
    if (!other) { target.setCustomValidity('Pick someone, or type a new name'); target.reportValidity(); return; }
    addLink(saved, { from: e.id, to: other.id, rel: rel.value, note: note.value.trim(), since: since.value ? { session: Number(since.value) } : null });
    ui.linkPreset = null;
    save(); renderWorld();
    toast(`${other.name}: ${RELATIONS[rel.value].label.toLowerCase()} of ${e.name}`);
  };
  target.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
  const quick = (QUICK_LINKS[e.type] || []).map(([label, r, t]) => h('button', { type: 'button', class: `wd-quicklink ${preset.rel === r ? 'active' : ''}`, style: { '--rc': RELATIONS[r]?.color }, onClick: () => { ui.linkPreset = { rel: r, newType: t }; renderWorld(); setTimeout(() => root.querySelector('#wd-link-target')?.focus(), 0); } }, label));
  const el = h('div', { class: 'wd-addlink' },
    h('datalist', { id: 'wd-all' }, all.map((x) => h('option', { value: x.name }, typeMeta(x.type).one))),
    h('div', { class: 'label' }, 'Add a tie'),
    h('div', { class: 'wd-quicklinks' }, quick),
    h('div', { class: 'add-row' }, target, rel, newType, since, h('button', { class: 'btn primary', type: 'button', onClick: submit }, 'Link')),
    h('div', { class: 'add-row' }, note),
    h('p', { class: 'hint', style: { margin: '4px 0 0' } }, `Reads as "<name> is ${e.name}'s <relationship>". The other page gets the inverse. Prefer "⚡ What happened" when the tie starts in play: it also ends what it replaces and lands on the timeline.`));
  return el;
}

function membersTable(e) {
  const ROLE_OF = { ledBy: 'Leader', foundedBy: 'Founder', hasMember: 'Member', formerHasMember: 'Former member', employee: 'Employee', informant: 'Informant', ally: 'Ally', contact: 'Contact', enemy: 'Enemy', captive: 'Captive' };
  const RANK = { Founder: 0, Leader: 1, Member: 2, Employee: 3, Informant: 4, Ally: 5, Contact: 6, Captive: 7, Enemy: 8, 'Former member': 9 };
  const people = new Map();
  for (const c of [...e.connections, ...e.past]) {
    if (c.other.type !== 'person' || !ROLE_OF[c.rel]) continue;
    const cur = people.get(c.other.id) || { e: c.other, roles: [], since: null, until: null, note: '' };
    if (c.ended) { if (c.rel === 'hasMember' || c.rel === 'ledBy') { cur.until = c.until; if (!cur.roles.length) cur.roles.push('Former member'); } }
    else { cur.roles.push(ROLE_OF[c.rel]); if (c.since) cur.since = c.since; if (c.note) cur.note = c.note; }
    people.set(c.other.id, cur);
  }
  const rows = [...people.values()].map((p) => ({ ...p, roles: [...new Set(p.roles)].sort((a, b) => RANK[a] - RANK[b]) })).sort((a, b) => RANK[a.roles[0]] - RANK[b.roles[0]] || a.e.name.localeCompare(b.e.name));
  if (!rows.length) return null;
  return h('section', { class: 'sec' },
    h('h3', null, 'Members and people', h('span', { class: 'pts' }, `${rows.filter((r) => RANK[r.roles[0]] <= 2).length} in`)),
    h('table', { class: 'wd-members' }, h('thead', null, h('tr', null, h('th', null, 'Role'), h('th', null, 'Who'), h('th', null, 'Since'), h('th', null, 'Note'))),
      h('tbody', null, rows.map((r) => h('tr', { class: r.roles[0] === 'Former member' ? 'former' : '' }, h('td', null, r.roles.join(', ')), h('td', null, pageLink(r.e)), h('td', { class: 'num' }, r.until ? `until ${whenText(r.until)}` : whenText(r.since) || ''), h('td', { class: 'wd-note-cell' }, r.note))))));
}

function hereList(e) {
  const GROUPS = [['Lives here', 'homeOf'], ['Based here', 'baseOf'], ['Works here', 'workplaceOf'], ['Inside', 'contains'], ['Part of', 'locatedIn'], ['Happened here', 'sceneOf'], ['Owned by', 'ownedBy']];
  const blocks = GROUPS.map(([label, rel]) => { const items = e.connections.filter((c) => c.rel === rel); return items.length ? h('div', { class: 'wd-here' }, h('div', { class: 'label' }, label), h('div', { class: 'wd-chips' }, items.map((c) => pageLink(c.other, { chip: true, rel: c.rel, note: c.note || null })))) : null; }).filter(Boolean);
  return blocks.length ? h('section', { class: 'sec' }, h('h3', null, 'Who and what is here'), blocks) : null;
}

function glance(e) {
  const chip = (label, items, rel) => (items.length ? h('div', { class: 'wd-glance-row' }, h('span', { class: 'wd-glance-label' }, label), h('div', { class: 'wd-chips' }, items.map((c) => pageLink(c.other, { chip: true, rel: rel || c.rel, note: c.note && c.note.length < 40 ? c.note : null })))) : null);
  const by = (rels) => e.connections.filter((c) => rels.includes(c.rel));
  const rows = e.type === 'person' ? [
    chip('Factions', by(['member', 'leader', 'founder'])),
    chip('Home & base', by(['livesIn', 'basedIn', 'from', 'worksAt'])),
    chip('Closest', by(['love', 'spouse', 'partner', 'friend', 'teammate', 'ally']).slice(0, 8)),
    chip('Against', by(['enemy', 'nemesis', 'rival', 'betrayed', 'betrayedBy', 'atWar']).slice(0, 8)),
  ] : e.type === 'faction' ? [
    chip('Led by', by(['ledBy', 'foundedBy'])), chip('Headquarters', by(['basedIn'])), chip('Allies', by(['allied', 'ally'])), chip('Enemies', by(['atWar', 'enemy', 'nemesis'])),
  ] : e.type === 'location' ? [chip('Part of', by(['locatedIn'])), chip('Controlled by', by(['ownedBy', 'baseOf']))]
    : e.type === 'item' ? [chip('Owner', by(['ownedBy'])), chip('Made by', by(['createdBy'])), chip('Kept at', by(['locatedIn']))]
      : [chip('Where', by(['happenedAt'])), chip('Involved', by(['involves']))];
  const live = rows.filter(Boolean);
  return live.length ? h('div', { class: 'wd-glance' }, live) : null;
}

function entityPage(e) {
  const meta = typeMeta(e.type);
  const color = e.color || meta.color;
  const ch = e.character;
  const groups = groupedConnections(e);
  const past = groupedConnections(e, { past: true });
  const tl = entityTimeline(world, e);
  const canOpenAsCharacter = !ch && e.source === 'bio' && Object.values(e.keys || {}).some(Boolean);
  const openAsCharacter = () => {
    const key = Object.values(e.keys || {}).find(Boolean);
    try { const person = fromKeySync(R, key).character; hooks.open?.(person); toast(`Opened ${person.identity?.realName || e.name}. Save to roster to give them a full page.`); } catch (err) { toast(`Couldn't build ${e.name}: ${err.message}`); }
  };
  const actions = h('div', { class: 'toolbar wd-actions' },
    ui.history.length ? h('button', { class: 'btn', type: 'button', title: 'Back to the previous page', onClick: back }, '← Back') : null,
    h('button', { class: 'btn primary', type: 'button', title: 'Record something that happened to them', onClick: () => momentDialog({ a: e.id }) }, '⚡ What happened'),
    ch ? h('button', { class: 'btn', type: 'button', onClick: () => hooks.open?.(ch) }, 'Open on the Forge') : null,
    canOpenAsCharacter ? h('button', { class: 'btn', type: 'button', title: 'Rebuild this person as a full character from their key', onClick: openAsCharacter }, 'Open as a character') : null,
    ch ? h('button', { class: 'btn', type: 'button', onClick: () => hooks.throwIn?.(ch) }, '⚔ Battle Room') : null,
    h('button', { class: 'btn', type: 'button', 'aria-pressed': String(ui.edit), onClick: () => { ui.edit = !ui.edit; renderWorld(); } }, ui.edit ? 'Done editing' : '✎ Edit page'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn ghost', type: 'button', onClick: async () => toast((await copyText(vaultMarkdown(world)[Object.keys(vaultMarkdown(world)).find((k) => k.endsWith(`/${e.name.replace(/[\\/:*?"<>|#^[\]]/g, '')}.md`)) || ''] || '')) ? 'Page copied as Markdown' : 'Copy failed') }, 'Copy as Markdown'),
    h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => {
      const ok = await openDialog({ title: `Remove ${e.name}?`, body: h('p', { style: { margin: 0 } }, e.source === 'manual' ? 'This page and its links are deleted from the vault.' : 'This page is hidden from the world. The character or bio it came from is not touched.'), buttons: [{ label: 'Keep', value: false }, { label: 'Remove', value: true, danger: true }] });
      if (ok) { deleteEntity(saved, e.id); save(); go('home'); }
    } }, 'Remove'));

  const por = ch ? portraitImg(ch) : null;
  const head = h('header', { class: `wd-head ${e.status === 'Dead' || e.status === 'Destroyed' ? 'gone' : ''}`, style: { '--c': color, '--c-ink': inkFor(color) } },
    por ? h('div', { class: 'wd-head-glyph has-img' }, por, h('span', null, initialsOf(e.name))) : h('div', { class: 'wd-head-glyph' }, e.type === 'person' ? initialsOf(e.name) : meta.glyph),
    h('div', { class: 'wd-head-text' },
      h('div', { class: 'eyebrow' }, `${meta.one}${ch ? ` · PL ${ch.pl} ${ch.archetype?.name || ''}` : ''}${e.fields?.Side ? ` · ${e.fields.Side}` : ''}${e.fields?.Kind && e.type !== 'person' ? ` · ${e.fields.Kind}` : ''}`),
      h('h1', null, e.name, ' ', statusBadge(e, { big: true })),
      e.aliases?.length ? h('div', { class: 'wd-aliases' }, `Also: ${e.aliases.join(', ')}`) : null),
    h('div', { class: 'wd-head-stats' }, h('b', { class: 'num' }, e.degree), h('span', null, 'ties')));

  const connRow = (c) => h('li', { style: { '--rc': RELATIONS[c.rel]?.color || '#888' }, class: c.ended ? 'ended' : '' },
    h('span', { class: 'wd-rel' }, c.label),
    pageLink(c.other),
    c.since || c.until ? h('span', { class: 'wd-when num', title: c.until ? 'Ended' : 'Since' }, c.until ? `until ${whenText(c.until)}` : `since ${whenText(c.since)}`) : null,
    c.note ? h('span', { class: 'wd-note' }, c.note) : null,
    (c.source === 'manual' || ui.edit) && !c.ended ? h('button', { class: 'x', type: 'button', 'aria-label': 'Remove link', title: c.source === 'manual' ? 'Delete this link' : 'Hide this automatic link', onClick: () => { removeLink(saved, world, c.id); save(); renderWorld(); } }, '✕') : null);
  const connections = h('section', { class: 'sec' },
    h('h3', null, 'Ties', h('span', { class: 'pts' }, `${e.connections.length}${e.past.length ? ` · ${e.past.length} past` : ''}`)),
    groups.length ? groups.map((g) => h('div', { class: 'wd-group' },
      h('div', { class: 'wd-group-name', style: { '--rc': RELATIONS[g.items[0].rel]?.color } }, g.group),
      h('ul', { class: 'wd-conns' }, g.items.map(connRow)))) : h('p', { class: 'hint', style: { margin: 0 } }, 'No ties yet. Add one below, or record what happened.'),
    past.length ? h('details', { class: 'wd-past' }, h('summary', null, `Formerly (${e.past.length})`), past.map((g) => h('div', { class: 'wd-group' }, h('div', { class: 'wd-group-name', style: { '--rc': RELATIONS[g.items[0].rel]?.color } }, g.group), h('ul', { class: 'wd-conns' }, g.items.map(connRow))))) : null,
    addLinkForm(e));

  const timeline = tl.length ? h('section', { class: 'sec' }, h('h3', null, 'Timeline', h('span', { class: 'pts' }, ch ? 'life, then play' : 'as others tell it')), h('ol', { class: 'wd-tl-list' }, tl.map((t) => timelineRow(t, e)))) : null;
  const notes = (e.body || ui.edit) ? h('section', { class: 'sec' }, h('h3', null, 'Notes'), ui.edit ? null : h('div', { class: 'wd-body' }, ...String(e.body).split(/\n{2,}/).map((p) => h('p', null, p)))) : null;
  const summary = h('section', { class: 'sec' }, h('h3', null, e.type === 'event' ? 'What happened' : 'Summary'), e.summary ? h('p', { class: 'wd-summary' }, e.summary) : h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing written yet. ', h('button', { type: 'button', class: 'linkish', onClick: () => { ui.edit = true; renderWorld(); } }, 'Write something')));
  const journalEvent = e.type === 'event' && e.journal ? h('section', { class: 'sec' }, h('h3', null, 'From the journal'),
    h('dl', { class: 'bio-dl' }, e.journal.people?.length ? [h('dt', null, 'People'), h('dd', null, h('div', { class: 'wd-chips' }, e.journal.people.map((p) => { const pe = findByName(p.name, 'person'); return pe ? pageLink(pe, { chip: true, note: [p.relation, p.status].filter(Boolean).join(' · ') || null }) : h('span', { class: 'wd-chip' }, p.name); })))] : null,
      e.fields?.Points ? [h('dt', null, 'Points'), h('dd', null, e.fields.Points)] : null,
      e.journal.downtime ? [h('dt', null, 'Between adventures'), h('dd', null, e.journal.downtime)] : null)) : null;

  const editor = ui.edit ? editForm(e) : null;
  return h('div', { class: 'wd-page' }, head, actions, glance(e),
    h('div', { class: 'wd-body-grid' },
      h('div', { class: 'wd-main' }, editor, summary, journalEvent, e.type === 'faction' ? membersTable(e) : null, e.type === 'location' ? hereList(e) : null, connections, timeline, notes),
      h('div', { class: 'wd-aside' }, egoGraph(e), infobox(e))));
}

function editForm(e) {
  const manual = e.source === 'manual';
  const name = h('input', { type: 'text', value: e.name, disabled: !manual, 'aria-label': 'Name' });
  const type = h('select', { 'aria-label': 'Type' }, Object.entries(ENTITY_TYPES).filter(([t]) => t !== 'paper').map(([t, m]) => h('option', { value: t, selected: t === e.type }, m.one)));
  const summary = h('textarea', { style: { minHeight: '70px' }, 'aria-label': 'Summary' }, e.summary || '');
  const body = h('textarea', { style: { minHeight: '140px' }, 'aria-label': 'Notes', placeholder: 'Longer notes. Blank lines make paragraphs.' }, e.body || '');
  const tags = h('input', { type: 'text', value: (e.tags || []).join(', '), placeholder: 'tags, comma separated', 'aria-label': 'Tags' });
  const aliases = h('input', { type: 'text', value: (e.aliases || []).join(', '), placeholder: 'other names, comma separated', 'aria-label': 'Aliases' });
  const color = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(e.color || '') ? e.color : typeMeta(e.type).color, 'aria-label': 'Colour', style: { width: '48px', padding: '2px' } });
  const fieldRows = h('div', { class: 'wd-field-rows' });
  const fields = Object.entries(e.fields || {}).map(([k, v]) => ({ k, v: v == null ? '' : String(v) }));
  const presets = { faction: ['Kind', 'Motto', 'Leader', 'Headquarters', 'Goals', 'Size', 'Reputation', 'Status', 'Founded', 'Resources', 'Methods'], location: ['Kind', 'Region', 'Population', 'Notable for', 'Danger', 'Status', 'Ruled by', 'Atmosphere'], item: ['Owner', 'Powers', 'Origin', 'Value', 'Status', 'Last seen'], event: ['Date', 'Session', 'Kind', 'Outcome', 'Casualties'], person: ['Occupation', 'Age', 'Status', 'Base', 'Species', 'Goal', 'Secret', 'Voice'] };
  const drawFields = () => {
    clear(fieldRows);
    fields.forEach((f, i) => fieldRows.append(h('div', { class: 'wd-field-row' },
      h('input', { type: 'text', value: f.k, placeholder: 'Field', list: 'wd-field-presets', onInput: (ev) => { f.k = ev.target.value; } }),
      h('input', { type: 'text', value: f.v, placeholder: 'Value', onInput: (ev) => { f.v = ev.target.value; } }),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Remove field', onClick: () => { fields.splice(i, 1); drawFields(); } }, '✕'))));
    fieldRows.append(h('datalist', { id: 'wd-field-presets' }, (presets[type.value] || []).map((p) => h('option', { value: p }))));
    fieldRows.append(h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', type: 'button', onClick: () => { fields.push({ k: '', v: '' }); drawFields(); } }, '+ Field'), (presets[type.value] || []).filter((p) => !fields.some((f) => f.k === p)).slice(0, 6).map((p) => h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { fields.push({ k: p, v: '' }); drawFields(); } }, `+ ${p}`))));
  };
  drawFields();
  const saveIt = () => {
    const patch = { summary: summary.value.trim(), body: body.value.trim(), tags: tags.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean), aliases: aliases.value.split(',').map((x) => x.trim()).filter(Boolean), color: color.value, type: type.value, fields: Object.fromEntries(fields.filter((f) => f.k.trim()).map((f) => [f.k.trim(), f.v])) };
    if (manual) patch.name = name.value.trim() || e.name;
    updateEntity(saved, world, e.id, patch);
    save(); ui.edit = false; renderWorld(); toast('Page saved');
  };
  return h('section', { class: 'sec wd-edit' },
    h('h3', null, 'Edit this page'),
    h('div', { class: 'jr-row' }, h('label', { class: 'field', style: { flex: 2 } }, h('span', null, 'Name'), name), h('label', { class: 'field' }, h('span', null, 'Type'), type), h('label', { class: 'field' }, h('span', null, 'Colour'), color)),
    h('label', { class: 'field' }, h('span', null, 'Summary'), summary),
    h('div', { class: 'label' }, 'Fields (the infobox)'), fieldRows,
    h('div', { class: 'jr-row' }, h('label', { class: 'field', style: { flex: 1 } }, h('span', null, 'Tags'), tags), h('label', { class: 'field', style: { flex: 1 } }, h('span', null, 'Also known as'), aliases)),
    h('label', { class: 'field' }, h('span', null, 'Notes'), body),
    !manual ? h('p', { class: 'hint', style: { margin: 0 } }, 'This page comes from the roster or a bio, so the name follows the character. Everything else you write here is kept in the vault.') : null,
    h('div', { class: 'btn-row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn ghost', type: 'button', onClick: () => { ui.edit = false; renderWorld(); } }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onClick: saveIt }, 'Save page')));
}

async function newPageDialog(presetType = 'faction', presetName = '') {
  const type = h('select', { 'aria-label': 'Type' }, Object.entries(ENTITY_TYPES).filter(([t]) => t !== 'paper').map(([t, m]) => h('option', { value: t, selected: t === presetType }, `${m.glyph} ${m.one}`)));
  const name = h('input', { type: 'text', placeholder: 'Name', 'aria-label': 'Name', value: presetName });
  const kind = h('input', { type: 'text', list: 'wd-kind-presets', placeholder: 'Kind (optional): team, gang, city, bar, artefact…', 'aria-label': 'Kind' });
  const summary = h('textarea', { placeholder: 'A line or two', style: { minHeight: '70px' } });
  const KINDS = { faction: ['Team', 'Agency', 'Gang', 'Corporation', 'Cult', 'Court', 'Family', 'Guild', 'Government', 'Military', 'Rebels', 'Secret society', 'Syndicate'], location: ['City', 'District', 'Base', 'Bar', 'Building', 'Country', 'Planet', 'Dimension', 'Prison', 'Ruin', 'Ship', 'Wilderness'], item: ['Artefact', 'Weapon', 'Vehicle', 'Armour', 'Device', 'Document', 'Relic', 'Treasure'], event: ['Battle', 'Heist', 'Wedding', 'Funeral', 'Trial', 'Disaster', 'Festival', 'Discovery', 'Betrayal'], person: ['Civilian', 'Hero', 'Villain', 'Official', 'Criminal', 'Scientist', 'Reporter', 'Cop', 'Soldier'] };
  const list = h('datalist', { id: 'wd-kind-presets' });
  const refill = () => { clear(list); for (const k of KINDS[type.value] || []) list.append(h('option', { value: k })); };
  refill(); type.addEventListener('change', refill);
  const ok = await openDialog({ title: 'New page', body: [h('label', { class: 'field' }, h('span', null, 'Type'), type), h('label', { class: 'field' }, h('span', null, 'Name'), name), h('label', { class: 'field' }, h('span', null, 'Kind'), kind, list), h('label', { class: 'field' }, h('span', null, 'Summary'), summary), h('p', { class: 'hint', style: { margin: 0 } }, 'Factions, organisations, cities, bases, artefacts, battles, weddings, funerals: anything the campaign needs a page for. Add ties from the page itself, or record what happened.')], buttons: [{ label: 'Cancel', value: false }, { label: 'Create', value: true, primary: true }] });
  if (!ok || !name.value.trim()) return;
  const e = createEntity(saved, { type: type.value, name: name.value.trim(), summary: summary.value.trim(), fields: kind.value.trim() ? { Kind: kind.value.trim() } : {} });
  save(); go(e.id);
}

// ---- moments: what happened -------------------------------------------------------------------------------------------------

/** Keep a roster character's own faction list in step with a faction moment recorded in the World. */
function syncCharacterFactions(m) {
  const A = world.entities.get(m.a); const B = m.b ? world.entities.get(m.b) : null;
  if (!A?.character?.rosterId || !B || B.type !== 'faction') return;
  const roleOf = { joined: 'Member', founded: 'Founder', tookLeadership: 'Leader', left: 'Former member', expelled: 'Former member', steppedDown: 'Member' };
  const role = roleOf[m.kind];
  if (!role) return;
  const live = state.roster.find((x) => x.rosterId === A.character.rosterId);
  if (!live) return;
  const c = JSON.parse(JSON.stringify(live));
  c.factions = c.factions || [];
  const cur = c.factions.find((f) => f.name.toLowerCase() === B.name.toLowerCase());
  const since = m.session != null ? `session ${m.session}` : m.date || undefined;
  if (cur) {
    if (/Former/.test(role)) { if (!/Former/.test(cur.role || 'Member')) { cur.was = cur.role || 'Member'; cur.untilSession = m.session ?? undefined; cur.until = since; } cur.role = role; }
    else { cur.role = role; cur.since = cur.since || since; delete cur.was; delete cur.until; delete cur.untilSession; }
  }
  else c.factions.push({ name: B.name, role, kind: B.fields?.Kind || undefined, since });
  const savedCopy = upsert(c);
  // the Forge keeps its own copy of an open character: keep it in step
  for (const t of state.tabs || []) if (t.rosterId === savedCopy.rosterId) t.factions = JSON.parse(JSON.stringify(savedCopy.factions));
  if (state.current?.rosterId === savedCopy.rosterId) state.current.factions = JSON.parse(JSON.stringify(savedCopy.factions));
  hooks.changed?.(savedCopy);
}

async function momentDialog({ a = null, b = null, kind = null } = {}) {
  const all = [...world.entities.values()].sort((x, y) => x.name.localeCompare(y.name));
  const nameOf = (id) => world.entities.get(id)?.name || '';
  const subject = h('input', { type: 'text', list: 'wd-mo-all', placeholder: 'Who (or which faction, place, thing)', 'aria-label': 'Who', value: a ? nameOf(a) : '' });
  const other = h('input', { type: 'text', list: 'wd-mo-all', placeholder: 'With whom / what', 'aria-label': 'Other party', value: b ? nameOf(b) : '' });
  const kindSel = h('select', { 'aria-label': 'What happened', size: 1 });
  const otherType = h('select', { 'aria-label': 'If new, make a' }, Object.entries(ENTITY_TYPES).map(([t, m]) => h('option', { value: t }, `new ${m.one.toLowerCase()}`)));
  const subjectType = h('select', { 'aria-label': 'If new, make a' }, Object.entries(ENTITY_TYPES).map(([t, m]) => h('option', { value: t }, `new ${m.one.toLowerCase()}`)));
  const latest = lastSession(world);
  const session = h('input', { type: 'number', min: 0, value: latest || '', placeholder: 'S#', 'aria-label': 'Session', style: { maxWidth: '90px' } });
  const date = h('input', { type: 'date', 'aria-label': 'Date', style: { maxWidth: '170px' } });
  const note = h('input', { type: 'text', placeholder: 'Why, how, what it cost (optional)', 'aria-label': 'Note' });
  const preview = h('p', { class: 'wd-mo-preview' });
  const otherRow = h('div', { class: 'add-row', id: 'wd-mo-other' }, other, otherType);
  const resolve = (input) => findByName(input.value);
  const fillKinds = () => {
    const A = resolve(subject); const B = resolve(other);
    const ids = momentKindsFor(A ? A.type : (subject.value.trim() ? subjectType.value : null), B ? B.type : null);
    const prev = kindSel.value || kind;
    clear(kindSel);
    kindSel.append(h('option', { value: '' }, 'What happened…'));
    for (const g of MOMENT_GROUPS) {
      const items = ids.filter((id) => MOMENT_KINDS[id].group === g);
      if (items.length) kindSel.append(h('optgroup', { label: g }, items.map((id) => h('option', { value: id, selected: id === prev }, MOMENT_KINDS[id].label))));
    }
    if (prev && !ids.includes(prev)) kindSel.value = '';
    refresh();
  };
  const refresh = () => {
    const k = MOMENT_KINDS[kindSel.value];
    const needsB = !!k?.b; const mayB = !!(k?.b || k?.optB);
    otherRow.hidden = !mayB;
    other.placeholder = needsB ? (k.b.length === 1 ? `Which ${typeMeta(k.b[0]).one.toLowerCase()}` : 'With whom / what') : 'With whom / what (optional)';
    if (k && (k.b || k.optB)) { const t = (k.b || k.optB)[0]; otherType.value = t; }
    const A = resolve(subject); const B = resolve(other);
    const an = A?.name || subject.value.trim() || 'Someone'; const bn = B?.name || other.value.trim() || (needsB ? '…' : '');
    preview.textContent = k ? `${session.value ? `Session ${session.value}: ` : ''}${momentSentence(kindSel.value, an, bn || null, note.value.trim())}${note.value.trim() && kindSel.value !== 'note' ? ` ${note.value.trim()}` : ''}` : 'Pick what happened.';
    subjectType.hidden = !!A || !subject.value.trim();
    otherType.hidden = !!B || !other.value.trim();
  };
  subject.addEventListener('input', fillKinds); other.addEventListener('input', fillKinds); kindSel.addEventListener('change', refresh); session.addEventListener('input', refresh); note.addEventListener('input', refresh); subjectType.addEventListener('change', fillKinds);
  fillKinds();
  const ok = await openDialog({
    title: '⚡ What happened',
    body: [
      h('datalist', { id: 'wd-mo-all' }, all.map((x) => h('option', { value: x.name }, typeMeta(x.type).one))),
      h('div', { class: 'add-row' }, subject, subjectType),
      kindSel,
      otherRow,
      h('div', { class: 'add-row' }, h('label', { class: 'wd-inline' }, 'Session', session), h('label', { class: 'wd-inline' }, 'Date', date)),
      note,
      preview,
      h('p', { class: 'hint', style: { margin: 0 } }, 'This writes a line on both timelines, starts the new tie at that session, ends the tie it replaces (it stays on the pages as "formerly") and, for a fate, marks the page. Undo it from any timeline.'),
    ],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Record', value: true, primary: true }],
  });
  if (!ok) return;
  const k = MOMENT_KINDS[kindSel.value];
  if (!k) { toast('Pick what happened'); return momentDialog({ a, b, kind: kindSel.value }); }
  let A = resolve(subject);
  if (!A && subject.value.trim()) { const made = createEntity(saved, { type: subjectType.value, name: subject.value.trim() }); rebuild(); A = world.entities.get(made.id); }
  if (!A) { toast('Who did it happen to?'); return momentDialog({ a, b, kind: kindSel.value }); }
  let B = resolve(other);
  if (!B && other.value.trim() && (k.b || k.optB)) { const made = createEntity(saved, { type: otherType.value, name: other.value.trim() }); rebuild(); B = world.entities.get(made.id); }
  if (k.b && !B) { toast(`${k.label}: with whom?`); return momentDialog({ a: A.id, kind: kindSel.value }); }
  rebuild();
  const m = recordMoment(saved, world, { kind: kindSel.value, a: A.id, b: B?.id || null, session: session.value === '' ? null : Number(session.value), date: date.value || '', note: note.value.trim() });
  if (!m) { toast('That did not fit (wrong kind of page for this change).'); return; }
  save();
  syncCharacterFactions(m);
  rebuild();
  toast(`Recorded: ${m.text}`);
  if (ui.page === 'home' || ui.page === 'graph' || ui.page === 'vault') go(A.id); else renderWorld();
}

async function editMomentDialog(id) {
  const m = (saved.moments || []).find((x) => x.id === id);
  if (!m) return;
  const session = h('input', { type: 'number', min: 0, value: m.session ?? '', style: { maxWidth: '90px' } });
  const date = h('input', { type: 'date', value: m.date || '', style: { maxWidth: '170px' } });
  const note = h('input', { type: 'text', value: m.note || '', placeholder: 'Note' });
  const ok = await openDialog({ title: 'Edit this moment', body: [h('p', { style: { margin: 0 }, class: 'wd-mo-preview' }, world.moments.find((x) => x.id === id)?.text || ''), h('div', { class: 'add-row' }, h('label', { class: 'wd-inline' }, 'Session', session), h('label', { class: 'wd-inline' }, 'Date', date)), note], buttons: [{ label: 'Cancel', value: false }, { label: 'Undo this moment', value: 'undo', danger: true }, { label: 'Save', value: true, primary: true }] });
  if (ok === 'undo') return undoMoment(id);
  if (!ok) return;
  updateMoment(saved, id, { session: session.value, date: date.value, note: note.value.trim() });
  save(); renderWorld();
}

async function undoMoment(id) {
  const m = world.moments.find((x) => x.id === id);
  const ok = await openDialog({ title: 'Undo this moment?', body: h('p', { style: { margin: 0 } }, `"${m?.text || ''}" is removed from the timelines, the ties it made go, and the ties it ended come back.`), buttons: [{ label: 'Keep', value: false }, { label: 'Undo', value: true, danger: true }] });
  if (!ok) return;
  removeMoment(saved, id); save(); renderWorld(); toast('Undone');
}

// ---- campaign timeline & graph & vault -------------------------------------------------------------------------------------

function timelineItem(it) {
  if (it.kind === 'change') {
    const m = it.m;
    const A = world.entities.get(m.a); const B = m.b ? world.entities.get(m.b) : null;
    const k = MOMENT_KINDS[m.kind];
    return h('div', { class: 'wd-tl-ev change', style: { '--c': k?.group === 'Fate' ? '#8e1b1b' : k?.group === 'Factions' ? '#8a5cd6' : k?.group === 'Places' ? '#1a7f4b' : k?.group === 'Things' ? '#a8670b' : '#2f6fde' } },
      h('div', { class: 'wd-tl-ev-when' }, h('b', { class: 'num' }, m.session != null ? `S${m.session}` : '•'), h('span', null, m.date || '')),
      h('div', { class: 'wd-tl-ev-body' },
        h('div', { class: 'wd-tl-change' }, h('span', { class: 'wd-tl-kind' }, k?.group || 'Change'), h('span', { class: 'wd-tl-ev-text' }, m.text)),
        m.note ? h('p', null, m.note) : null,
        h('div', { class: 'wd-chips' }, A ? pageLink(A, { chip: true }) : null, B ? pageLink(B, { chip: true }) : null, h('button', { type: 'button', class: 'linkish', onClick: () => editMomentDialog(m.id) }, 'edit'), h('button', { type: 'button', class: 'linkish danger', onClick: () => undoMoment(m.id) }, 'undo'))));
  }
  const ev = it.ev;
  const people = ev.connections.filter((c) => c.other.type === 'person').map((c) => c.other);
  return h('div', { class: `wd-tl-ev ${it.kind}`, style: { '--c': ev.color || typeMeta(it.kind === 'paper' ? 'paper' : 'event').color } },
    h('div', { class: 'wd-tl-ev-when' }, h('b', { class: 'num' }, ev.session ? `S${ev.session}` : '•'), h('span', null, ev.date || ev.fields?.Date || '')),
    h('div', { class: 'wd-tl-ev-body' },
      h('div', { class: 'wd-tl-change' }, h('span', { class: 'wd-tl-kind' }, it.kind === 'session' ? 'Session' : it.kind === 'battle' ? 'Battle' : it.kind === 'paper' ? 'Front page' : ev.fields?.Kind || 'Event'), h('button', { type: 'button', class: 'wd-tl-ev-title', onClick: () => go(ev.id) }, ev.name)),
      ev.summary ? h('p', null, ev.summary) : null,
      people.length ? h('div', { class: 'wd-chips' }, people.map((p) => pageLink(p, { chip: true }))) : null,
      ev.fields?.Points ? h('div', { class: 'wd-points-line' }, ev.fields.Points) : null));
}

function timelinePage() {
  const FILTERS = [['all', 'Everything'], ['session', 'Sessions'], ['battle', 'Battles'], ['event', 'Events'], ['change', 'What changed'], ['paper', 'Front pages']];
  const items = campaignTimeline(world, { kinds: ui.tlFilter === 'all' ? null : [ui.tlFilter] });
  // group by session
  const groups = [];
  for (const it of items) {
    const key = it.session != null ? `S${it.session}` : it.date || 'undated';
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, session: it.session, date: it.date, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero small' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Campaign'), h('h1', null, 'Timeline'), h('p', { class: 'wd-tagline' }, 'Every session from every journal, every recorded battle and event, and every change you recorded: who turned on whom, who joined what, who fell. In order, by session.')),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onClick: () => momentDialog({}) }, '⚡ What happened'), h('button', { class: 'btn', type: 'button', onClick: () => newPageDialog('event') }, '+ Event'))),
    h('div', { class: 'wd-filter-row' }, FILTERS.map(([k, label]) => h('button', { type: 'button', class: `wd-pill ${ui.tlFilter === k ? 'active' : ''}`, onClick: () => { ui.tlFilter = k; renderWorld(); } }, label))),
    items.length ? h('div', { class: 'wd-tl-groups' }, groups.map((g) => h('section', { class: 'wd-tl-group' },
      h('h2', { class: 'wd-tl-session' }, g.session != null ? `Session ${g.session}` : g.date || 'Undated', h('span', { class: 'pts' }, `${g.items.length}`)),
      h('div', { class: 'wd-tl' }, g.items.map(timelineItem))))) : h('div', { class: 'empty' }, h('h2', null, 'Nothing has happened yet'), h('p', null, 'Add a session to a character\'s campaign journal (Bio page), record a Battle Room fight, add an event page, or record what happened with the ⚡ button.')));
}

function graphPage() {
  const last = lastSession(world);
  const asOf = ui.asOf == null || ui.asOf > last ? null : ui.asOf;
  const nodes = [...world.entities.values()].filter((e) => ui.graphTypes.has(e.type));
  const ids = new Set(nodes.map((n) => n.id));
  const base = asOf == null ? world.links.filter((l) => !l.until || ui.showPast) : linksAsOf(world, asOf);
  const edges = base.filter((l) => ids.has(l.from) && ids.has(l.to) && ui.graphGroups.has(RELATIONS[l.rel]?.group));
  const linked = new Set(edges.flatMap((l) => [l.from, l.to]));
  const shown = nodes.filter((n) => linked.has(n.id) || n.character);
  const W = 1100; const H = Math.max(520, Math.min(900, 300 + shown.length * 9));
  const pos = layoutGraph(shown.map((n) => ({ id: n.id })), edges, { width: W, height: H, iterations: 260, seed: shown.length * 7 + edges.length, margin: 80 });
  const typeToggle = (t) => h('label', { class: 'wd-toggle', style: { '--c': typeMeta(t).color } }, h('input', { type: 'checkbox', checked: ui.graphTypes.has(t), onChange: (e) => { if (e.target.checked) ui.graphTypes.add(t); else ui.graphTypes.delete(t); renderWorld(); } }), `${typeMeta(t).glyph} ${typeMeta(t).label}`);
  const groupToggle = (g) => h('label', { class: 'wd-toggle', style: { '--c': RELATIONS[Object.keys(RELATIONS).find((k) => RELATIONS[k].group === g)]?.color } }, h('input', { type: 'checkbox', checked: ui.graphGroups.has(g), onChange: (e) => { if (e.target.checked) ui.graphGroups.add(g); else ui.graphGroups.delete(g); renderWorld(); } }), g);
  const slider = last > 0 ? h('div', { class: 'wd-asof' },
    h('span', { class: 'label' }, 'As of'),
    h('input', { type: 'range', min: 0, max: last + 1, step: 1, value: asOf == null ? last + 1 : asOf, 'aria-label': 'As of session', onInput: (e) => { const v = Number(e.target.value); ui.asOf = v > last ? null : v; renderWorld(); } }),
    h('b', { class: 'num' }, asOf == null ? 'Now' : asOf === 0 ? 'Before play' : `Session ${asOf}`),
    asOf == null ? h('label', { class: 'wd-toggle', style: { '--c': '#9a8fb5' } }, h('input', { type: 'checkbox', checked: ui.showPast, onChange: (e) => { ui.showPast = e.target.checked; renderWorld(); } }), 'Show past ties (dashed)') : null) : null;
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero small' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Everyone'), h('h1', null, 'Relationship graph'), h('p', { class: 'wd-tagline' }, `${shown.length} pages, ${edges.length} ties${asOf != null ? ` as they stood at session ${asOf}` : ''}. Lines are coloured by the kind of tie; click a node to open its page. Wind the slider back to see the world before a betrayal, a death or a move.`))),
    h('div', { class: 'wd-filters' }, slider, h('div', { class: 'wd-filter-row' }, Object.keys(ENTITY_TYPES).map(typeToggle)), h('div', { class: 'wd-filter-row' }, RELATION_GROUPS.map(groupToggle))),
    shown.length ? h('div', { class: 'wd-graph-wrap big' },
      svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wd-graph', role: 'img', 'aria-label': 'Relationship graph' },
        edges.map((l) => { const a = pos.get(l.from); const b = pos.get(l.to); return svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: RELATIONS[l.rel]?.color || '#999', 'stroke-width': 1.6, 'stroke-opacity': l.until ? 0.35 : 0.7, 'stroke-dasharray': l.until ? '5 4' : null }, svg('title', null, `${world.entities.get(l.to).name} is ${world.entities.get(l.from).name}'s ${RELATIONS[l.rel]?.label.toLowerCase()}${l.since?.session != null ? ` since S${l.since.session}` : ''}${l.until ? ` (ended ${whenText(l.until)})` : ''}`)); }),
        shown.map((n) => { const p = pos.get(n.id); const color = n.color || typeMeta(n.type).color; const r = Math.min(22, 8 + Math.sqrt(n.degree) * 3 + (n.character ? 4 : 0)); return svg('g', { class: 'wd-node', transform: `translate(${p.x},${p.y})`, style: 'cursor:pointer', onClick: () => go(n.id) },
          svg('title', null, `${n.name} (${typeMeta(n.type).one}, ${n.degree} ties${n.status ? `, ${n.status}` : ''})`),
          svg('circle', { r, fill: color, stroke: 'var(--surface)', 'stroke-width': 2, 'stroke-dasharray': n.status === 'Dead' || n.status === 'Destroyed' || n.status === 'Disbanded' ? '3 2' : null }),
          svg('text', { 'text-anchor': 'middle', dy: 4, fill: inkFor(color), 'font-size': Math.max(8, r * 0.7), 'font-weight': 700 }, n.type === 'person' ? initialsOf(n.name) : typeMeta(n.type).glyph),
          svg('text', { 'text-anchor': 'middle', dy: r + 12, fill: 'var(--ink)', 'font-size': 10.5, 'font-weight': n.character ? 800 : 500 }, n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name)); }))) : h('div', { class: 'empty' }, h('h2', null, 'No one to draw yet'), h('p', null, 'Save characters to the roster; their families, mentors, rivals and enemies fill the graph.')));
}

async function copyWorldKey() {
  const k = await worldKey();
  toast((await copyText(k)) ? `World key copied (${keySize(k)}). Paste it to your players; they open it on the World's Vault page or the Forge's "Open a key" box.` : 'Copy failed: use "Save key as a file"');
}

function vaultPage() {
  const fileIn = h('input', { type: 'file', accept: '.json', hidden: true, onChange: async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const w = data.world || data;
      if (!w?.v) throw new Error('Not a DCUGen vault file');
      let n = 0;
      for (const [id, ent] of Object.entries(w.entities || {})) { saved.entities[id] = ent; n++; }
      for (const l of w.links || []) if (!saved.links.some((x) => x.id === l.id)) saved.links.push(l);
      for (const m of w.moments || []) if (!(saved.moments || []).some((x) => x.id === m.id)) (saved.moments = saved.moments || []).push(m);
      saved.linkEnds = { ...(saved.linkEnds || {}), ...(w.linkEnds || {}) };
      saved.overrides = { ...saved.overrides, ...(w.overrides || {}) };
      if (w.name && (!saved.name || saved.name === 'My World')) { saved.name = w.name; saved.tagline = w.tagline || saved.tagline; saved.description = w.description || saved.description; }
      let chars = 0;
      for (const ch of data.characters || []) { if (ch?.abilities && ch.pl != null) { const c = { ...ch }; delete c.savedAt; upsert(c); chars++; } }
      save(); renderWorld();
      toast(`Imported ${n} page${n === 1 ? '' : 's'}, ${(w.links || []).length} links, ${(w.moments || []).length} moments${chars ? ` and ${chars} characters` : ''}`);
    } catch (err) { toast(`Import failed: ${err.message}`); }
  } });
  const exportJson = () => {
    download(`${slug(world.name || 'world')}-vault.json`, JSON.stringify({ app: 'DCUGen', kind: 'vault', version: 1, world: saved, characters: state.roster }, null, 2), 'application/json');
    toast('Vault saved (world + roster)');
  };
  const exportMd = () => {
    const files = vaultMarkdown(world);
    const bytes = zip(files);
    download(`${slug(world.name || 'world')}-obsidian.zip`, new Blob([bytes], { type: 'application/zip' }));
    toast(`${Object.keys(files).length} Markdown pages zipped. Unzip into an Obsidian vault.`);
  };
  const manual = Object.keys(saved.entities).length;
  const moments = (saved.moments || []).length;
  const keyIn = h('textarea', { placeholder: 'Paste a world key (DCUW1…) or a front-page key (DCUN1…) from your GM or a player', 'aria-label': 'World key', style: { minHeight: '64px', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px' } });
  const openIt = async () => { if (isPaperKey(keyIn.value)) { if (await openPaperKey(keyIn.value)) keyIn.value = ''; return; } if (!isWorldKey(keyIn.value)) { toast('That is not a world key (they start with DCUW1.) or a front-page key (DCUN1.)'); return; } if (await openWorldKey(keyIn.value)) keyIn.value = ''; };
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero small' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Vault'), h('h1', null, 'Share, import and export'), h('p', { class: 'wd-tagline' }, 'The world lives in this browser (and in the desktop app\'s data folder). Share it as one key, save it to a file, or hand it to your players.'))),
    h('div', { class: 'gm' },
      h('section', { class: 'panel wd-share' }, h('h2', null, '🔑 World key'), h('p', { style: { margin: 0 } }, `One key holds the whole world: every hand-made page, tie and moment, and all ${state.roster.length} character${state.roster.length === 1 ? '' : 's'} on the roster (portrait paintings are left out and repaint on arrival). Paste it anywhere: chat, email, the "Open a key" box on the Forge.`),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onClick: copyWorldKey }, 'Copy world key'), h('button', { class: 'btn', type: 'button', onClick: async () => { const k = await worldKey(); download(`${slug(world.name || 'world')}-key.txt`, k, 'text/plain'); toast(`World key saved (${keySize(k)})`); } }, 'Save key as a file')),
        h('div', { class: 'label', style: { marginTop: '8px' } }, 'Open a world key'), keyIn, h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: openIt }, 'Open key'))),
      h('section', { class: 'panel' }, h('h2', null, 'Obsidian vault (Markdown)'), h('p', { style: { margin: 0 } }, 'One .md page per person, faction, location, event and item, with [[wikilinks]] between them, YAML front matter, infobox tables, current and former ties, and timelines. Unzip the folder into any Obsidian vault and the graph view lights up.'), h('button', { class: 'btn primary', type: 'button', onClick: exportMd }, `Download ${world.entities.size} pages as Markdown (.zip)`)),
      h('section', { class: 'panel' }, h('h2', null, 'DCUGen vault (.json)'), h('p', { style: { margin: 0 } }, `Everything: ${manual} hand-made page${manual === 1 ? '' : 's'}, ${saved.links.length} hand-made tie${saved.links.length === 1 ? '' : 's'}, ${moments} recorded moment${moments === 1 ? '' : 's'}, your edits to automatic pages, and the ${state.roster.length} character${state.roster.length === 1 ? '' : 's'} on your roster. Import merges into this world.`), h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onClick: exportJson }, 'Save vault'), h('button', { class: 'btn', type: 'button', onClick: () => fileIn.click() }, 'Import vault'), fileIn)),
      h('section', { class: 'panel' }, h('h2', null, 'Reset'), h('p', { style: { margin: 0 } }, 'Removes hand-made pages, ties, moments and edits. Roster characters and their bios stay, so their pages come straight back.'), h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => { const ok = await openDialog({ title: 'Reset the world?', body: h('p', { style: { margin: 0 } }, 'Hand-made pages, ties, moments and edits are deleted. Export the vault first if you want a copy.'), buttons: [{ label: 'Keep', value: false }, { label: 'Reset', value: true, danger: true }] }); if (ok) { saved = emptyWorld(); save(); go('home'); } } }, 'Reset the world'))));
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
  else if (ui.page === 'newsstand') page = newsstandPage(ctx());
  else if (ui.page === 'paper-edit') page = editorPage(ctx());
  else if (world.entities.has(ui.page)) { const e = world.entities.get(ui.page); page = e.type === 'paper' && e.paper ? paperPage(ctx(), e) : entityPage(e); }
  else { ui.page = 'home'; page = home(); }
  root.append(h('div', { class: 'wd-layout' }, sidebar(), h('main', { class: 'wd-content' }, page)));
}
