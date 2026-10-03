// The World tab: a wiki of the whole campaign. Every saved character is a page; everyone named in
// their lives is a page; teams, cities and sessions are pages; and every page links to the others
// in both directions. Add factions, locations, items and events by hand, draw the relationship
// graph, read the campaign timeline, and export it all as a Markdown vault for Obsidian.

import { h, clear, toast, copyText, download, openDialog, inkFor } from './dom.js';
import { state, upsert } from './store.js';
import { buildWorld, emptyWorld, ENTITY_TYPES, RELATIONS, RELATION_GROUPS, groupedConnections, entityTimeline, campaignTimeline, searchWorld, createEntity, updateEntity, deleteEntity, addLink, removeLink, layoutGraph, vaultMarkdown, recordBattle, slug } from '../engine/world.js';
import { zip } from '../engine/xlsx.js';
import { sheet as makeSheet } from '../engine/render.js';
import { fromKeySync } from '../engine/keys.js';
import { portraitOf } from '../engine/portrait.js';

const KEY = 'dcugen.world.v1';
let R; let root; let hooks = {};
let saved;
let world;
let ui = { page: 'home', q: '', edit: false, graphTypes: new Set(Object.keys(ENTITY_TYPES)), graphGroups: new Set(RELATION_GROUPS), open: {}, showAll: {} };

function load() {
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw?.v) return { ...emptyWorld(), ...raw }; } catch { /* ignore */ }
  return emptyWorld();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* full */ } }
function rebuild() { world = buildWorld(saved, state.roster, R, { openTabs: state.tabs || [] }); for (const id of saved.hiddenLinks || []) world.links = world.links.filter((l) => l.id !== id); return world; }

export function initWorld(rules, el, h2 = {}) {
  R = rules; root = el; hooks = h2;
  saved = load();
}

/** Jump to a character's page (from the Forge). */
export function openWorldPage(ch) {
  rebuild();
  const id = `char:${ch.rosterId || ch.seed || slug(ch.identity?.codename || ch.identity?.realName || 'x')}`;
  ui.page = world.entities.has(id) ? id : 'home';
  ui.edit = false;
  if (!world.entities.has(id)) toast('Save the character to the roster to give them a page in the World.');
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

function go(page) { ui.page = page; ui.edit = false; renderWorld(); window.scrollTo({ top: 0 }); }
const typeMeta = (t) => ENTITY_TYPES[t] || { label: t, one: t, glyph: '✦', color: '#666' };

function pageLink(e, { chip = false, note = null, rel = null } = {}) {
  const color = e.color || typeMeta(e.type).color;
  return h('button', { type: 'button', class: chip ? 'wd-chip' : 'wd-link', style: { '--c': color, '--rc': rel ? (RELATIONS[rel]?.color || color) : color }, title: [typeMeta(e.type).one, e.summary ? String(e.summary).slice(0, 140) : ''].filter(Boolean).join(' · '), onClick: () => go(e.id) },
    h('span', { class: 'wd-glyph', 'aria-hidden': 'true' }, e.type === 'person' && e.character ? initialsOf(e.name) : typeMeta(e.type).glyph), h('span', { class: 'wd-link-name' }, e.name), note ? h('small', null, note) : null);
}
const initialsOf = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function sidebar() {
  const q = h('input', { type: 'search', id: 'wd-q', placeholder: 'Search the world…', value: ui.q, 'aria-label': 'Search the world', onInput: (e) => { ui.q = e.target.value; drawResults(); } });
  const results = h('div', { class: 'wd-results' });
  const drawResults = () => {
    clear(results);
    if (!ui.q.trim()) return;
    const found = searchWorld(world, ui.q, { limit: 14 });
    if (!found.length) { results.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing by that name. Make a page for it below.')); return; }
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
        h('span', { class: 'wd-caret' }, open ? '▾' : '▸'), h('span', { class: 'wd-glyph' }, meta.glyph), meta.label, h('span', { class: 'count' }, counts[t])),
      open ? h('div', { class: 'wd-section-list' },
        shown.map((e) => h('button', { type: 'button', class: `wd-tree ${ui.page === e.id ? 'active' : ''}`, style: { '--c': e.color || meta.color }, onClick: () => go(e.id) }, h('span', { class: 'swatch' }), h('span', { class: 'wd-tree-name' }, e.name), e.character ? h('span', { class: 'wd-tree-pl num' }, `PL ${e.character.pl}`) : null)),
        list.length > 12 ? h('button', { type: 'button', class: 'linkish', style: { fontSize: '12px', margin: '2px 0 0 22px' }, onClick: () => { ui.showAll[t] = !showAll; renderWorld(); } }, showAll ? 'Show fewer' : `Show all ${list.length}`) : null,
        !list.length ? h('p', { class: 'hint', style: { margin: '0 0 0 22px' } }, t === 'person' ? 'Save characters to the roster.' : `No ${meta.label.toLowerCase()} yet.`) : null) : null);
  });
  return h('aside', { class: 'wd-side', 'aria-label': 'World index' },
    h('div', { class: 'wd-side-top' },
      h('button', { type: 'button', class: 'wd-world-name', onClick: () => go('home'), title: 'Home' }, h('span', { class: 'wd-glyph' }, '🌐'), h('b', null, world.name || 'My World')),
      h('button', { class: 'btn sm primary', type: 'button', onClick: newPageDialog }, '+ Page')),
    q, results,
    h('nav', { class: 'wd-navs' }, navBtn('home', 'Home', '⌂'), navBtn('timeline', 'Campaign timeline', '🕰'), navBtn('graph', 'Relationship graph', '◉'), navBtn('vault', 'Vault: import / export', '🗄')),
    h('div', { class: 'wd-sections' }, sections));
}

// ---- home ------------------------------------------------------------------------------------------------------------

function home() {
  const ents = [...world.entities.values()];
  const counts = Object.entries(ENTITY_TYPES).map(([t, meta]) => ({ t, meta, n: ents.filter((e) => e.type === t).length }));
  const chars = ents.filter((e) => e.character).sort((a, b) => b.degree - a.degree);
  const connected = ents.filter((e) => !e.character && e.degree > 0).sort((a, b) => b.degree - a.degree).slice(0, 12);
  const sessions = campaignTimeline(world).slice(-6).reverse();
  const editBtn = h('button', { class: 'btn sm', type: 'button', onClick: async () => {
    const name = h('input', { type: 'text', value: world.name || '' });
    const tag = h('input', { type: 'text', value: world.tagline || '' });
    const desc = h('textarea', { style: { minHeight: '100px' } }, world.description || '');
    const ok = await openDialog({ title: 'This world', body: [h('label', { class: 'field' }, h('span', null, 'Name'), name), h('label', { class: 'field' }, h('span', null, 'Tagline'), tag), h('label', { class: 'field' }, h('span', null, 'About'), desc)], buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }] });
    if (ok) { saved.name = name.value.trim() || 'My World'; saved.tagline = tag.value.trim(); saved.description = desc.value.trim(); save(); renderWorld(); }
  } }, 'Edit');
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero' },
      h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'World'), h('h1', null, world.name || 'My World'), h('p', { class: 'wd-tagline' }, world.tagline || ''), world.description ? h('p', null, world.description) : null, editBtn),
      h('div', { class: 'wd-counts' }, counts.map(({ t, meta, n }) => h('button', { type: 'button', class: 'wd-count', style: { '--c': meta.color }, onClick: () => { ui.open[t] = true; ui.showAll[t] = true; renderWorld(); } }, h('b', { class: 'num' }, n), h('span', null, meta.label))))),
    !ents.length ? h('div', { class: 'empty' }, h('h2', null, 'An empty world'), h('p', null, 'Save characters to your roster and they appear here with everyone in their lives: parents, mentors, rivals, enemies, their city and their team. Add factions, places, items and events with "+ Page".')) : null,
    chars.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Heroes, villains and everyone saved'), h('div', { class: 'wd-cards' }, chars.map(personCard))) : null,
    connected.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Most connected'), h('div', { class: 'wd-chips' }, connected.map((e) => pageLink(e, { chip: true, note: `${e.degree} link${e.degree === 1 ? '' : 's'}` })))) : null,
    sessions.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Latest in the campaign', h('button', { class: 'linkish', type: 'button', style: { marginLeft: '10px', fontSize: '13px' }, onClick: () => go('timeline') }, 'full timeline')), h('div', { class: 'wd-tl' }, sessions.map(timelineEvent))) : null,
    h('p', { class: 'hint' }, 'Everything here is clickable. Pages for saved characters follow the roster: edit a character, roll a new bio or add a journal session and the world updates. Pages you write by hand live in the vault (export it from the sidebar).'));
}

function personCard(e) {
  const ch = e.character;
  let s = null;
  try { s = ch ? makeSheet(ch, R) : null; } catch { s = null; }
  const color = e.color || typeMeta(e.type).color;
  return h('article', { class: 'wd-card', style: { '--c': color, '--c-ink': inkFor(color) } },
    h('button', { type: 'button', class: 'wd-card-head', onClick: () => go(e.id) }, h('span', { class: 'wd-card-name' }, e.name), h('span', { class: 'wd-card-sub' }, [e.aliases[0], ch ? `PL ${ch.pl}` : null, e.fields?.Side].filter(Boolean).join(' · '))),
    h('div', { class: 'wd-card-body' },
      e.summary ? h('p', null, String(e.summary).length > 160 ? `${String(e.summary).slice(0, 157)}…` : e.summary) : null,
      s ? h('div', { class: 'card-stats' }, [['Dodge', s.d.defenses.Dodge], ['Parry', s.d.defenses.Parry], ['Tough', s.d.defenses.Toughness], ['Will', s.d.defenses.Will]].map(([k, v]) => h('div', null, h('b', { class: 'num' }, v), h('span', null, k.toUpperCase())))) : null,
      h('div', { class: 'wd-card-links' }, e.connections.slice(0, 5).map((c) => pageLink(c.other, { chip: true, rel: c.rel, note: c.label.toLowerCase() })), e.connections.length > 5 ? h('span', { class: 'hint' }, `+${e.connections.length - 5} more`) : null)));
}

// ---- entity page ------------------------------------------------------------------------------------------------------------

function infobox(e) {
  const rows = Object.entries(e.fields || {}).filter(([, v]) => v != null && v !== '');
  const ch = e.character;
  let s = null;
  try { s = ch ? makeSheet(ch, R) : null; } catch { s = null; }
  return h('aside', { class: 'wd-infobox', style: { '--c': e.color || typeMeta(e.type).color } },
    h('div', { class: 'wd-infobox-head' }, h('span', { class: 'wd-glyph' }, typeMeta(e.type).glyph), typeMeta(e.type).one),
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
  // second ring: links between neighbours
  for (const n of e.connections.map((c) => c.other)) for (const c of n.connections || []) if (seen.has(c.other.id) && c.other.id !== e.id && !edges.some((x) => (x.from === n.id && x.to === c.other.id) || (x.from === c.other.id && x.to === n.id))) edges.push({ from: n.id, to: c.other.id, rel: c.rel, faint: true });
  if (nodes.length < 2) return null;
  const W = 520; const H = Math.max(260, Math.min(460, 120 + nodes.length * 18));
  const pos = layoutGraph(nodes.map((n) => ({ id: n.id })), edges, { width: W, height: H, iterations: 160, seed: nodes.length, center: e.id, margin: 70 });
  return h('div', { class: 'wd-graph-wrap' },
    svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wd-graph', role: 'img', 'aria-label': `${e.name} and their connections` },
      edges.map((ed) => { const a = pos.get(ed.from); const b = pos.get(ed.to); return svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: RELATIONS[ed.rel]?.color || '#999', 'stroke-width': ed.faint ? 1 : 2, 'stroke-opacity': ed.faint ? 0.35 : 0.8 }); }),
      nodes.map((n) => { const p = pos.get(n.id); const me = n.id === e.id; const color = n.color || typeMeta(n.type).color; return svg('g', { class: 'wd-node', transform: `translate(${p.x},${p.y})`, onClick: () => (me ? null : go(n.id)), style: me ? '' : 'cursor:pointer' },
        svg('circle', { r: me ? 20 : 13, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }),
        svg('text', { 'text-anchor': 'middle', dy: me ? 5 : 4, fill: inkFor(color), 'font-size': me ? 12 : 9, 'font-weight': 700 }, n.type === 'person' ? initialsOf(n.name) : typeMeta(n.type).glyph),
        svg('text', { 'text-anchor': 'middle', dy: me ? 34 : 26, fill: 'var(--ink)', 'font-size': 11, 'font-weight': me ? 800 : 600 }, n.name.length > 20 ? `${n.name.slice(0, 19)}…` : n.name)); })),
    h('div', { class: 'wd-legend' }, [...new Set(edges.map((x) => RELATIONS[x.rel]?.group).filter(Boolean))].map((g) => h('span', null, h('i', { style: { background: RELATIONS[Object.keys(RELATIONS).find((k) => RELATIONS[k].group === g)]?.color } }), g))));
}

function timelineRow(t) {
  return h('li', { class: `wd-tl-row ${t.kind}` },
    h('span', { class: 'wd-tl-when num' }, t.when || '·'),
    h('div', { class: 'wd-tl-body' },
      h('span', { class: 'bio-stage' }, [t.stage, t.date].filter(Boolean).join(' · ')),
      h('span', null, t.text),
      t.people?.length ? h('div', { class: 'wd-chips', style: { marginTop: '4px' } }, t.people.map((p) => { const pe = [...world.entities.values()].find((x) => x.type === 'person' && x.name.toLowerCase() === p.name.toLowerCase()); return pe ? pageLink(pe, { chip: true, note: p.relation || null }) : h('span', { class: 'wd-chip' }, p.name); })) : null,
      t.points?.length ? h('ul', { class: 'wd-points' }, t.points.map((x) => h('li', null, h('b', null, x.type === 'award' ? `+${x.points} pp` : `${x.points > 0 ? `−${x.points}` : `+${-x.points}`} pp`), ' ', x.type === 'award' ? 'earned' : (x.changes || []).join('; ') || x.note))) : null,
      t.downtime ? h('div', { class: 'wd-downtime' }, h('b', null, 'Between adventures: '), t.downtime) : null,
      t.by ? h('button', { type: 'button', class: 'linkish', style: { fontSize: '12px' }, onClick: () => go(t.by) }, 'open their page') : null,
      t.eventId && world.entities.has(t.eventId) ? h('button', { type: 'button', class: 'linkish', style: { fontSize: '12px', marginLeft: '8px' }, onClick: () => go(t.eventId) }, 'event page') : null));
}

function addLinkForm(e) {
  const all = [...world.entities.values()].filter((x) => x.id !== e.id).sort((a, b) => a.name.localeCompare(b.name));
  const target = h('input', { type: 'text', list: 'wd-all', placeholder: 'Who or what (type to search)', 'aria-label': 'Link to' });
  const rel = h('select', { 'aria-label': 'Relationship' }, RELATION_GROUPS.map((g) => h('optgroup', { label: g }, Object.entries(RELATIONS).filter(([, r]) => r.group === g).map(([k, r]) => h('option', { value: k }, r.label)))));
  const note = h('input', { type: 'text', placeholder: 'Note (optional): since when, why, how it ended', 'aria-label': 'Note' });
  const submit = () => {
    const name = target.value.trim();
    let other = all.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!other && name) { other = createEntity(saved, { type: 'person', name }); toast(`Made a page for ${name}`); }
    if (!other) { target.setCustomValidity('Pick someone, or type a new name'); target.reportValidity(); return; }
    addLink(saved, { from: e.id, to: other.id, rel: rel.value, note: note.value.trim() });
    save(); renderWorld();
    toast(`${other.name}: ${RELATIONS[rel.value].label.toLowerCase()} of ${e.name}`);
  };
  return h('div', { class: 'wd-addlink' },
    h('datalist', { id: 'wd-all' }, all.map((x) => h('option', { value: x.name }, typeMeta(x.type).one))),
    h('div', { class: 'label' }, 'Add a connection'),
    h('div', { class: 'add-row' }, target, rel, note, h('button', { class: 'btn', type: 'button', onClick: submit }, 'Link')),
    h('p', { class: 'hint', style: { margin: '4px 0 0' } }, `Reads as "<name> is ${e.name}'s <relationship>". The other page gets the inverse automatically. A name that doesn't exist yet becomes a new person page.`));
}

function entityPage(e) {
  const meta = typeMeta(e.type);
  const color = e.color || meta.color;
  const ch = e.character;
  const groups = groupedConnections(e);
  const tl = entityTimeline(world, e);
  const canOpenAsCharacter = !ch && e.source === 'bio' && Object.values(e.keys || {}).some(Boolean);
  const openAsCharacter = () => {
    const key = Object.values(e.keys || {}).find(Boolean);
    try { const person = fromKeySync(R, key).character; hooks.open?.(person); toast(`Opened ${person.identity?.realName || e.name}. Save to roster to give them a full page.`); } catch (err) { toast(`Couldn't build ${e.name}: ${err.message}`); }
  };
  const actions = h('div', { class: 'toolbar wd-actions' },
    ch ? h('button', { class: 'btn primary', type: 'button', onClick: () => hooks.open?.(ch) }, 'Open on the Forge') : null,
    canOpenAsCharacter ? h('button', { class: 'btn primary', type: 'button', title: 'Rebuild this person as a full character from their key', onClick: openAsCharacter }, 'Open as a character') : null,
    ch ? h('button', { class: 'btn', type: 'button', onClick: () => hooks.throwIn?.(ch) }, '⚔ Throw in Battle Room') : null,
    h('button', { class: 'btn', type: 'button', 'aria-pressed': String(ui.edit), onClick: () => { ui.edit = !ui.edit; renderWorld(); } }, ui.edit ? 'Done editing' : 'Edit page'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(vaultMarkdown(world)[Object.keys(vaultMarkdown(world)).find((k) => k.endsWith(`/${e.name.replace(/[\\/:*?"<>|#^[\]]/g, '')}.md`)) || ''] || '')) ? 'Page copied as Markdown' : 'Copy failed') }, 'Copy as Markdown'),
    h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => {
      const ok = await openDialog({ title: `Remove ${e.name}?`, body: h('p', { style: { margin: 0 } }, e.source === 'manual' ? 'This page and its links are deleted from the vault.' : 'This page is hidden from the world. The character or bio it came from is not touched.'), buttons: [{ label: 'Keep', value: false }, { label: 'Remove', value: true, danger: true }] });
      if (ok) { deleteEntity(saved, e.id); save(); go('home'); }
    } }, 'Remove'));

  const por = ch && !ch.portrait?.hidden ? portraitOf(ch) : null;
  const head = h('header', { class: 'wd-head', style: { '--c': color, '--c-ink': inkFor(color) } },
    por ? h('div', { class: 'wd-head-glyph has-img' }, h('img', { src: por.url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onError: (ev) => { ev.target.remove(); } }), h('span', null, initialsOf(e.name))) : h('div', { class: 'wd-head-glyph' }, e.type === 'person' ? initialsOf(e.name) : meta.glyph),
    h('div', { class: 'wd-head-text' },
      h('div', { class: 'eyebrow' }, `${meta.one}${ch ? ` · PL ${ch.pl} ${ch.archetype?.name || ''}` : ''}${e.fields?.Side ? ` · ${e.fields.Side}` : ''}`),
      h('h1', null, e.name),
      e.aliases?.length ? h('div', { class: 'wd-aliases' }, `Also: ${e.aliases.join(', ')}`) : null),
    h('div', { class: 'wd-head-stats' }, h('b', { class: 'num' }, e.degree), h('span', null, 'connections')));

  const connections = h('section', { class: 'sec' },
    h('h3', null, 'Connections', h('span', { class: 'pts' }, `${e.connections.length}`)),
    groups.length ? groups.map((g) => h('div', { class: 'wd-group' },
      h('div', { class: 'wd-group-name', style: { '--rc': RELATIONS[g.items[0].rel]?.color } }, g.group),
      h('ul', { class: 'wd-conns' }, g.items.map((c) => h('li', { style: { '--rc': RELATIONS[c.rel]?.color || '#888' } },
        h('span', { class: 'wd-rel' }, c.label),
        pageLink(c.other),
        c.note ? h('span', { class: 'wd-note' }, c.note) : null,
        c.source === 'manual' || ui.edit ? h('button', { class: 'x', type: 'button', 'aria-label': 'Remove link', title: c.source === 'manual' ? 'Delete this link' : 'Hide this automatic link', onClick: () => { removeLink(saved, world, c.id); save(); renderWorld(); } }, '✕') : null))))) : h('p', { class: 'hint', style: { margin: 0 } }, 'No connections yet. Add one below.'),
    addLinkForm(e));

  const timeline = tl.length ? h('section', { class: 'sec' }, h('h3', null, 'Timeline', h('span', { class: 'pts' }, ch ? 'life, then play' : 'as others tell it')), h('ol', { class: 'wd-tl-list' }, tl.map(timelineRow))) : null;
  const notes = (e.body || ui.edit) ? h('section', { class: 'sec' }, h('h3', null, 'Notes'), ui.edit ? null : h('div', { class: 'wd-body' }, ...String(e.body).split(/\n{2,}/).map((p) => h('p', null, p)))) : null;
  const summary = h('section', { class: 'sec' }, h('h3', null, e.type === 'event' ? 'What happened' : 'Summary'), e.summary ? h('p', { class: 'wd-summary' }, e.summary) : h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing written yet.'));
  const journalEvent = e.type === 'event' && e.journal ? h('section', { class: 'sec' }, h('h3', null, 'From the journal'),
    h('dl', { class: 'bio-dl' }, e.journal.people?.length ? [h('dt', null, 'People'), h('dd', null, h('div', { class: 'wd-chips' }, e.journal.people.map((p) => { const pe = [...world.entities.values()].find((x) => x.type === 'person' && x.name.toLowerCase() === p.name.toLowerCase()); return pe ? pageLink(pe, { chip: true, note: [p.relation, p.status].filter(Boolean).join(' · ') || null }) : h('span', { class: 'wd-chip' }, p.name); })))] : null,
      e.fields?.Points ? [h('dt', null, 'Points'), h('dd', null, e.fields.Points)] : null,
      e.journal.downtime ? [h('dt', null, 'Between adventures'), h('dd', null, e.journal.downtime)] : null)) : null;

  const editor = ui.edit ? editForm(e) : null;
  return h('div', { class: 'wd-page' }, head, actions,
    h('div', { class: 'wd-body-grid' },
      h('div', { class: 'wd-main' }, editor, summary, journalEvent, connections, timeline, notes),
      h('div', { class: 'wd-aside' }, egoGraph(e), infobox(e))));
}

function editForm(e) {
  const manual = e.source === 'manual';
  const name = h('input', { type: 'text', value: e.name, disabled: !manual, 'aria-label': 'Name' });
  const type = h('select', { 'aria-label': 'Type' }, Object.entries(ENTITY_TYPES).map(([t, m]) => h('option', { value: t, selected: t === e.type }, m.one)));
  const summary = h('textarea', { style: { minHeight: '70px' }, 'aria-label': 'Summary' }, e.summary || '');
  const body = h('textarea', { style: { minHeight: '140px' }, 'aria-label': 'Notes', placeholder: 'Longer notes. Blank lines make paragraphs.' }, e.body || '');
  const tags = h('input', { type: 'text', value: (e.tags || []).join(', '), placeholder: 'tags, comma separated', 'aria-label': 'Tags' });
  const aliases = h('input', { type: 'text', value: (e.aliases || []).join(', '), placeholder: 'other names, comma separated', 'aria-label': 'Aliases' });
  const color = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(e.color || '') ? e.color : typeMeta(e.type).color, 'aria-label': 'Colour', style: { width: '48px', padding: '2px' } });
  const fieldRows = h('div', { class: 'wd-field-rows' });
  const fields = Object.entries(e.fields || {}).map(([k, v]) => ({ k, v: v == null ? '' : String(v) }));
  const presets = { faction: ['Motto', 'Leader', 'Headquarters', 'Goals', 'Size', 'Reputation'], location: ['Kind', 'Region', 'Population', 'Notable for', 'Danger'], item: ['Owner', 'Powers', 'Origin', 'Value'], event: ['Date', 'Session', 'Kind', 'Outcome'], person: ['Occupation', 'Age', 'Status', 'Base'] };
  const drawFields = () => {
    clear(fieldRows);
    fields.forEach((f, i) => fieldRows.append(h('div', { class: 'wd-field-row' },
      h('input', { type: 'text', value: f.k, placeholder: 'Field', list: 'wd-field-presets', onInput: (ev) => { f.k = ev.target.value; } }),
      h('input', { type: 'text', value: f.v, placeholder: 'Value', onInput: (ev) => { f.v = ev.target.value; } }),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Remove field', onClick: () => { fields.splice(i, 1); drawFields(); } }, '✕'))));
    fieldRows.append(h('datalist', { id: 'wd-field-presets' }, (presets[type.value] || []).map((p) => h('option', { value: p }))));
    fieldRows.append(h('button', { class: 'btn sm', type: 'button', onClick: () => { fields.push({ k: '', v: '' }); drawFields(); } }, '+ Field'));
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

async function newPageDialog(presetType = 'faction') {
  const type = h('select', { 'aria-label': 'Type' }, Object.entries(ENTITY_TYPES).map(([t, m]) => h('option', { value: t, selected: t === presetType }, `${m.glyph} ${m.one}`)));
  const name = h('input', { type: 'text', placeholder: 'Name', 'aria-label': 'Name' });
  const summary = h('textarea', { placeholder: 'A line or two', style: { minHeight: '70px' } });
  const ok = await openDialog({ title: 'New page', body: [h('label', { class: 'field' }, h('span', null, 'Type'), type), h('label', { class: 'field' }, h('span', null, 'Name'), name), h('label', { class: 'field' }, h('span', null, 'Summary'), summary), h('p', { class: 'hint', style: { margin: 0 } }, 'Factions, organisations, cities, bases, artefacts, battles, weddings, funerals: anything the campaign needs a page for.')], buttons: [{ label: 'Cancel', value: false }, { label: 'Create', value: true, primary: true }] });
  if (!ok || !name.value.trim()) return;
  const e = createEntity(saved, { type: type.value, name: name.value.trim(), summary: summary.value.trim() });
  save(); go(e.id); ui.edit = true; renderWorld();
}

// ---- campaign timeline & graph & vault -------------------------------------------------------------------------------------

function timelineEvent(ev) {
  const people = ev.connections.filter((c) => c.other.type === 'person').map((c) => c.other);
  return h('div', { class: 'wd-tl-ev', style: { '--c': ev.color || typeMeta('event').color } },
    h('div', { class: 'wd-tl-ev-when' }, h('b', { class: 'num' }, ev.session ? `S${ev.session}` : '•'), h('span', null, ev.date || '')),
    h('div', { class: 'wd-tl-ev-body' },
      h('button', { type: 'button', class: 'wd-tl-ev-title', onClick: () => go(ev.id) }, ev.name),
      ev.summary ? h('p', null, ev.summary) : null,
      people.length ? h('div', { class: 'wd-chips' }, people.map((p) => pageLink(p, { chip: true }))) : null,
      ev.fields?.Points ? h('div', { class: 'wd-points-line' }, ev.fields.Points) : null));
}

function timelinePage() {
  const evs = campaignTimeline(world);
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero small' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Campaign'), h('h1', null, 'Timeline'), h('p', { class: 'wd-tagline' }, 'Every session from every journal, every recorded battle and every event page, in order. Click anyone to see what it did to them.')),
      h('button', { class: 'btn', type: 'button', onClick: () => newPageDialog('event') }, '+ Event')),
    evs.length ? h('div', { class: 'wd-tl' }, evs.map(timelineEvent)) : h('div', { class: 'empty' }, h('h2', null, 'Nothing has happened yet'), h('p', null, 'Add a session to a character\'s campaign journal (Bio page), record a Battle Room fight, or add an event page.')));
}

function graphPage() {
  const nodes = [...world.entities.values()].filter((e) => ui.graphTypes.has(e.type));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = world.links.filter((l) => ids.has(l.from) && ids.has(l.to) && ui.graphGroups.has(RELATIONS[l.rel]?.group));
  const linked = new Set(edges.flatMap((l) => [l.from, l.to]));
  const shown = nodes.filter((n) => linked.has(n.id) || n.character);
  const W = 1100; const H = Math.max(520, Math.min(900, 300 + shown.length * 9));
  const pos = layoutGraph(shown.map((n) => ({ id: n.id })), edges, { width: W, height: H, iterations: 260, seed: shown.length * 7 + edges.length, margin: 80 });
  const typeToggle = (t) => h('label', { class: 'wd-toggle', style: { '--c': typeMeta(t).color } }, h('input', { type: 'checkbox', checked: ui.graphTypes.has(t), onChange: (e) => { if (e.target.checked) ui.graphTypes.add(t); else ui.graphTypes.delete(t); renderWorld(); } }), `${typeMeta(t).glyph} ${typeMeta(t).label}`);
  const groupToggle = (g) => h('label', { class: 'wd-toggle', style: { '--c': RELATIONS[Object.keys(RELATIONS).find((k) => RELATIONS[k].group === g)]?.color } }, h('input', { type: 'checkbox', checked: ui.graphGroups.has(g), onChange: (e) => { if (e.target.checked) ui.graphGroups.add(g); else ui.graphGroups.delete(g); renderWorld(); } }), g);
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero small' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Everyone'), h('h1', null, 'Relationship graph'), h('p', { class: 'wd-tagline' }, `${shown.length} pages, ${edges.length} connections. Lines are coloured by the kind of tie; click a node to open its page.`))),
    h('div', { class: 'wd-filters' }, h('div', { class: 'wd-filter-row' }, Object.keys(ENTITY_TYPES).map(typeToggle)), h('div', { class: 'wd-filter-row' }, RELATION_GROUPS.map(groupToggle))),
    shown.length ? h('div', { class: 'wd-graph-wrap big' },
      svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wd-graph', role: 'img', 'aria-label': 'Relationship graph' },
        edges.map((l) => { const a = pos.get(l.from); const b = pos.get(l.to); return svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: RELATIONS[l.rel]?.color || '#999', 'stroke-width': 1.6, 'stroke-opacity': 0.7 }, svg('title', null, `${world.entities.get(l.to).name} is ${world.entities.get(l.from).name}'s ${RELATIONS[l.rel]?.label.toLowerCase()}`)); }),
        shown.map((n) => { const p = pos.get(n.id); const color = n.color || typeMeta(n.type).color; const r = Math.min(22, 8 + Math.sqrt(n.degree) * 3 + (n.character ? 4 : 0)); return svg('g', { class: 'wd-node', transform: `translate(${p.x},${p.y})`, style: 'cursor:pointer', onClick: () => go(n.id) },
          svg('title', null, `${n.name} (${typeMeta(n.type).one}, ${n.degree} connections)`),
          svg('circle', { r, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }),
          svg('text', { 'text-anchor': 'middle', dy: 4, fill: inkFor(color), 'font-size': Math.max(8, r * 0.7), 'font-weight': 700 }, n.type === 'person' ? initialsOf(n.name) : typeMeta(n.type).glyph),
          svg('text', { 'text-anchor': 'middle', dy: r + 12, fill: 'var(--ink)', 'font-size': 10.5, 'font-weight': n.character ? 800 : 500 }, n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name)); }))) : h('div', { class: 'empty' }, h('h2', null, 'No one to draw yet'), h('p', null, 'Save characters to the roster; their families, mentors, rivals and enemies fill the graph.')));
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
      saved.overrides = { ...saved.overrides, ...(w.overrides || {}) };
      if (w.name && (!saved.name || saved.name === 'My World')) { saved.name = w.name; saved.tagline = w.tagline || saved.tagline; saved.description = w.description || saved.description; }
      let chars = 0;
      for (const ch of data.characters || []) { if (ch?.abilities && ch.pl != null) { const c = { ...ch }; delete c.savedAt; upsert(c); chars++; } }
      save(); renderWorld();
      toast(`Imported ${n} page${n === 1 ? '' : 's'}, ${(w.links || []).length} links${chars ? ` and ${chars} characters` : ''}`);
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
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero small' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Vault'), h('h1', null, 'Import and export'), h('p', { class: 'wd-tagline' }, 'The world lives in this browser. Save it to a file to keep it, move it, or hand it to your players.'))),
    h('div', { class: 'gm' },
      h('section', { class: 'panel' }, h('h2', null, 'Obsidian vault (Markdown)'), h('p', { style: { margin: 0 } }, 'One .md page per person, faction, location, event and item, with [[wikilinks]] between them, YAML front matter, infobox tables and timelines. Unzip the folder into any Obsidian vault and the graph view lights up.'), h('button', { class: 'btn primary', type: 'button', onClick: exportMd }, `Download ${world.entities.size} pages as Markdown (.zip)`)),
      h('section', { class: 'panel' }, h('h2', null, 'DCUGen vault (.json)'), h('p', { style: { margin: 0 } }, `Everything: ${manual} hand-made page${manual === 1 ? '' : 's'}, ${saved.links.length} hand-made link${saved.links.length === 1 ? '' : 's'}, your edits to automatic pages, and the ${state.roster.length} character${state.roster.length === 1 ? '' : 's'} on your roster. Import merges into this world.`), h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onClick: exportJson }, 'Save vault'), h('button', { class: 'btn', type: 'button', onClick: () => fileIn.click() }, 'Import vault'), fileIn)),
      h('section', { class: 'panel' }, h('h2', null, 'Reset'), h('p', { style: { margin: 0 } }, 'Removes hand-made pages, links and edits. Roster characters and their bios stay, so their pages come straight back.'), h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => { const ok = await openDialog({ title: 'Reset the world?', body: h('p', { style: { margin: 0 } }, 'Hand-made pages, links and edits are deleted. Export the vault first if you want a copy.'), buttons: [{ label: 'Keep', value: false }, { label: 'Reset', value: true, danger: true }] }); if (ok) { saved = emptyWorld(); save(); go('home'); } } }, 'Reset the world'))));
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
  else if (world.entities.has(ui.page)) page = entityPage(world.entities.get(ui.page));
  else { ui.page = 'home'; page = home(); }
  root.append(h('div', { class: 'wd-layout' }, sidebar(), h('main', { class: 'wd-content' }, page)));
}
