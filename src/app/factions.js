// Factions on a character: the teams, gangs, agencies, courts and cults they belong to (or used to),
// kept on the character itself so they travel with the sheet, the exports and the World.

import { h } from './dom.js';
import { FACTION_ROLES } from '../engine/world.js';

export const FACTION_KINDS = ['Team', 'Agency', 'Gang', 'Corporation', 'Cult', 'Court', 'Family', 'Guild', 'Government', 'Military', 'Rebels', 'School', 'Secret society', 'Syndicate', 'Other'];
const ROLES = Object.keys(FACTION_ROLES);

/** Names of factions already in the world (for the picker), from the saved vault and the roster. */
function knownFactions(roster) {
  const names = new Set();
  try { const w = JSON.parse(localStorage.getItem('dcugen.world.v1') || 'null'); for (const e of Object.values(w?.entities || {})) if (e.type === 'faction') names.add(e.name); } catch { /* none */ }
  for (const c of roster || []) { if (c.team) names.add(c.team); for (const f of c.factions || []) names.add(f.name); }
  return [...names].sort();
}

let adding = false;

/** change(fn) clones, applies, saves. Omit for read-only. */
export function factionsSection(ch, { change, roster = [] } = {}) {
  const list = ch.factions || [];
  if (!list.length && !change) return null;
  const known = knownFactions(roster).filter((n) => !list.some((f) => f.name === n));
  const row = (f, i) => h('li', { class: `fx-row ${/^Former/.test(f.role || '') ? 'former' : ''}` },
    h('span', { class: 'fx-role' }, f.role || 'Member'),
    h('span', { class: 'fx-name' }, f.name, f.kind ? h('small', null, ` · ${f.kind.toLowerCase()}`) : null),
    f.since ? h('span', { class: 'fx-since' }, `since ${f.since}`) : null,
    f.was ? h('span', { class: 'fx-since' }, `was ${f.was.toLowerCase()}${f.until ? ` until ${f.until}` : ''}`) : null,
    f.note ? h('span', { class: 'fx-note' }, f.note) : null,
    change ? h('span', { class: 'fx-tools no-print' },
      h('select', { 'aria-label': 'Role', value: f.role, onChange: (e) => change((c) => { c.factions[i].role = e.target.value; }) }, ROLES.map((r) => h('option', { value: r, selected: r === (f.role || 'Member') }, r))),
      h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${f.name}`, onClick: () => change((c) => { c.factions.splice(i, 1); }) }, '✕')) : null);
  const form = () => {
    const name = h('input', { type: 'text', list: 'fx-known', placeholder: 'Faction name', 'aria-label': 'Faction name', id: 'fx-name' });
    const role = h('select', { 'aria-label': 'Role' }, ROLES.map((r) => h('option', { value: r }, r)));
    const kind = h('select', { 'aria-label': 'Kind' }, h('option', { value: '' }, 'Kind…'), FACTION_KINDS.map((k) => h('option', { value: k }, k)));
    const since = h('input', { type: 'text', placeholder: 'Since (e.g. age 19, session 3)', 'aria-label': 'Since', style: { maxWidth: '190px' } });
    const note = h('input', { type: 'text', placeholder: 'Note (optional)', 'aria-label': 'Note' });
    const add = () => {
      const n = name.value.trim();
      if (!n) { name.focus(); return; }
      adding = false;
      change((c) => { c.factions = [...(c.factions || []), { name: n, role: role.value, kind: kind.value || undefined, since: since.value.trim() || undefined, note: note.value.trim() || undefined }]; });
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    return h('div', { class: 'fx-form no-print' },
      h('datalist', { id: 'fx-known' }, known.map((n) => h('option', { value: n }))),
      h('div', { class: 'add-row' }, name, role, kind, since),
      h('div', { class: 'add-row' }, note, h('button', { class: 'btn primary', type: 'button', onClick: add }, 'Add'), h('button', { class: 'btn ghost', type: 'button', onClick: () => { adding = false; change((c) => c); } }, 'Cancel')));
  };
  const el = h('section', { class: 'sec fx' },
    h('h3', null, 'Factions', change && !adding ? h('span', { class: 'pts no-print' }, h('button', { class: 'linkish', type: 'button', onClick: () => { adding = true; change((c) => c); } }, '+ Add')) : null),
    list.length ? h('ul', { class: 'fx-list' }, list.map(row)) : h('p', { class: 'hint', style: { margin: 0 } }, 'No factions yet: the team, the agency, the gang or the cult they belong to, or used to. Each gets a page in the World with its members, allies and enemies.'),
    adding && change ? form() : null);
  if (adding && change) setTimeout(() => el.querySelector('#fx-name')?.focus(), 0);
  return el;
}

/** One line per faction for text and spreadsheet exports. */
export function factionsText(ch) {
  return (ch.factions || []).map((f) => `${f.name}: ${f.role || 'Member'}${f.kind ? ` (${f.kind})` : ''}${f.since ? `, since ${f.since}` : ''}${f.note ? `. ${f.note}` : ''}`);
}
