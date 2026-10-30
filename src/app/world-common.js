// What the World's pages share: the live world and its state (W, filled in by world.js), and the small
// pieces every page draws with (links to pages, status badges, the svg helper).

import { h } from './dom.js';
import { ENTITY_TYPES, RELATIONS } from '../engine/world.js';

/**
 * The World's live state and navigation, set up by world.js: world, saved (read and write), ui, hooks, R,
 * save(), rebuild(), renderWorld(), go(), back(), ctx(), and the key openers.
 */
export const W = {};

// ---- svg helper ------------------------------------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export const typeMeta = (t) => ENTITY_TYPES[t] || { label: t, one: t, glyph: '?', color: '#666' };
export const whenText = (w) => (w?.session != null ? `S${w.session}` : w?.date || '');
export const STATUS_TONE = { Dead: 'bad', Missing: 'warn', Captured: 'warn', Injured: 'warn', Retired: 'muted', 'In hiding': 'muted', Destroyed: 'bad', Disbanded: 'muted', 'Turned villain': 'bad', Reformed: 'good', Active: 'good', Alive: 'good' };
// A short status is a badge (Dead, Missing, Estranged); a long bio sentence is not.
export const shortStatus = (e) => (e.status && e.status !== 'Active' && e.status !== 'Alive' && (STATUS_TONE[e.status] || e.status.length <= 14) ? e.status : null);
export const statusBadge = (e, { big = false } = {}) => (shortStatus(e) ? h('span', { class: `wd-status ${STATUS_TONE[e.status] || ''} ${big ? 'big' : ''}` }, e.status) : null);

export function pageLink(e, { chip = false, note = null, rel = null } = {}) {
  const color = e.color || typeMeta(e.type).color;
  return h('button', { type: 'button', class: chip ? 'wd-chip' : 'wd-link', style: { '--c': color, '--rc': rel ? (RELATIONS[rel]?.color || color) : color }, title: [typeMeta(e.type).one, e.status || null, e.summary ? String(e.summary).slice(0, 140) : ''].filter(Boolean).join(' · '), onClick: () => W.go(e.id) },
    h('span', { class: 'wd-glyph', 'aria-hidden': 'true' }, e.type === 'person' && e.character ? initialsOf(e.name) : typeMeta(e.type).glyph), h('span', { class: 'wd-link-name' }, e.name), statusBadge(e), note ? h('small', null, note) : null);
}
export const initialsOf = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const findByName = (name, type = null) => { const n = String(name || '').trim().toLowerCase(); return [...W.world.entities.values()].find((x) => (!type || x.type === type) && (x.name.toLowerCase() === n || x.aliases?.some((a) => String(a).toLowerCase() === n))) || null; };

