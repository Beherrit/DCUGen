// Roster: saved characters, teams, import/export.

import { h, clear, toast, openDialog, inkFor } from './dom.js';
import { state, saveRoster, upsert, removeFromRoster, newId } from './store.js';
import { exportExcel, exportJson, exportRosterExcel, exportRosterJson, readCharactersFile } from './exporters.js';
import { decodeCharacter } from './share.js';
import { sheet as makeSheet } from '../engine/render.js';
let R;
let root;
let hooks = {};
let query = '';
let side = 'all';
let confirmDelete = null;

export function initRoster(rules, el, h2) {
  R = rules;
  root = el;
  hooks = h2;
  renderRoster();
}

function matches(ch) {
  if (side !== 'all' && (ch.alignment || 'hero') !== side) return false;
  if (!query) return true;
  const hay = [ch.identity?.codename, ch.identity?.realName, ch.archetype?.name, ch.theme?.name, ch.team, ch.identity?.base].join(' ').toLowerCase();
  return hay.includes(query.toLowerCase());
}

function card(ch) {
  let s;
  try { s = makeSheet(ch, R); } catch { s = null; }
  const color = ch.theme?.color || '#555';
  const legal = s ? s.legal : false;
  const main = s?.offense.find((o) => o.attack && o.attack.name !== 'Unarmed');
  const el = h('article', { class: 'card' },
    h('div', { class: 'card-head', style: { '--hero': color, '--hero-ink': inkFor(color) } },
      h('div', { class: 'cn' }, ch.identity?.codename || 'Unnamed'),
      h('div', { class: 'rn' }, [ch.identity?.realName, `PL ${ch.pl}`, ch.alignment === 'villain' ? 'Villain' : 'Hero'].filter(Boolean).join(' · '))),
    h('div', { class: 'card-body' },
      h('div', { class: 'tagwrap' },
        ch.archetype?.name && h('span', { class: 'chip' }, ch.archetype.name),
        ch.theme?.name && h('span', { class: 'chip' }, ch.theme.name),
        h('span', { class: `status ${legal ? 'ok' : 'bad'}` }, legal ? `✓ ${s.cost.total}/${s.cost.budget}` : 'Check rules')),
      s ? h('div', { class: 'card-stats' },
        [['Dodge', s.d.defenses.Dodge], ['Parry', s.d.defenses.Parry], ['Tough', s.d.defenses.Toughness], ['Will', s.d.defenses.Will]].map(([k, v]) =>
          h('div', null, h('b', { class: 'num' }, v), h('span', null, k.toUpperCase())))) : null,
      main ? h('div', { style: { fontSize: '13px', color: 'var(--ink-2)' } }, `${main.label}: ${main.text}`) : null),
    h('div', { class: 'card-actions' },
      h('button', { class: 'btn sm primary', type: 'button', onClick: () => hooks.open?.(ch) }, 'Open'),
      h('button', { class: 'btn sm', type: 'button', onClick: () => exportExcel(ch, R) }, 'Excel'),
      h('button', { class: 'btn sm', type: 'button', onClick: () => exportJson(ch) }, 'JSON'),
      h('button', { class: 'btn sm', type: 'button', onClick: () => {
        const copy = JSON.parse(JSON.stringify(ch)); copy.rosterId = newId(); copy.identity = { ...copy.identity, codename: `${copy.identity?.codename || 'Unnamed'} (copy)` };
        upsert(copy); renderRoster(); toast('Copy added');
      } }, 'Duplicate'),
      confirmDelete === ch.rosterId
        ? h('span', { class: 'btn-row' },
          h('button', { class: 'btn sm danger', type: 'button', onClick: () => { removeFromRoster(ch.rosterId); confirmDelete = null; renderRoster(); toast('Deleted'); } }, 'Delete for good'),
          h('button', { class: 'btn sm', type: 'button', onClick: () => { confirmDelete = null; renderRoster(); } }, 'Keep'))
        : h('button', { class: 'btn sm ghost danger', type: 'button', onClick: () => { confirmDelete = ch.rosterId; renderRoster(); } }, 'Delete')));
  return el;
}

async function importDialog() {
  const area = h('textarea', { id: 'import-code', placeholder: 'Paste a share code (DCU1....), a share link, or character JSON' });
  const file = h('input', { type: 'file', id: 'import-file', accept: '.json,application/json', multiple: true });
  const res = await openDialog({
    title: 'Import characters',
    body: [
      h('label', { class: 'field' }, h('span', null, 'Share code or link'), area),
      h('label', { class: 'field' }, h('span', null, 'Or character / roster files (.json)'), file),
    ],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Import', value: true, primary: true }],
  });
  if (!res) return;
  let added = 0;
  try {
    if (area.value.trim()) { upsert(await decodeCharacter(area.value)); added++; }
    for (const f of file.files || []) for (const ch of await readCharactersFile(f)) { const c = { ...ch }; delete c.rosterId; upsert(c); added++; }
    toast(added ? `Imported ${added} character${added === 1 ? '' : 's'}` : 'Nothing to import');
  } catch (e) {
    toast(`Import failed: ${e.message}`);
  }
  renderRoster();
}

export function renderRoster() {
  if (!root) return;
  clear(root);
  const list = state.roster.filter(matches);
  const count = document.getElementById('roster-count');
  if (count) count.textContent = state.roster.length;

  root.append(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'Roster'), h('p', null, 'Characters you save live here, in this browser. Export them to Excel or JSON to keep a copy or move them to another computer.')),
    h('span', { class: 'spacer' }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onClick: importDialog }, 'Import'),
      h('button', { class: 'btn', type: 'button', disabled: !list.length, onClick: () => exportRosterExcel(list, R) }, 'Export to Excel'),
      h('button', { class: 'btn', type: 'button', disabled: !list.length, onClick: () => exportRosterJson(list) }, 'Export JSON'))));

  if (!state.roster.length) {
    root.append(h('div', { class: 'empty' },
      h('h2', null, 'No one on the roster yet'),
      h('p', null, 'Roll a character on the Forge and press "Save to roster". Teams you roll can be saved in one go. You can also import share codes and .json files.'),
      h('div', { class: 'btn-row', style: { justifyContent: 'center', marginTop: '12px' } },
        h('button', { class: 'btn primary', type: 'button', onClick: () => hooks.goForge?.() }, 'Go to the Forge'),
        h('button', { class: 'btn', type: 'button', onClick: importDialog }, 'Import'))));
    return;
  }

  root.append(h('div', { class: 'roster-tools' },
    h('input', { type: 'search', id: 'roster-search', placeholder: 'Search name, archetype, theme, team', value: query, 'aria-label': 'Search roster',
      onInput: (e) => { query = e.target.value; renderRosterList(); } }),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter by side', style: { width: '260px' } },
      [['all', 'Everyone'], ['hero', 'Heroes'], ['villain', 'Villains']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(side === v), onClick: () => { side = v; renderRoster(); } }, t)))));
  const listHost = h('div', { id: 'roster-list' });
  root.append(listHost);
  renderRosterList();
}

function renderRosterList() {
  const host = root.querySelector('#roster-list');
  if (!host) return;
  clear(host);
  const list = state.roster.filter(matches);
  const teams = new Map();
  const solo = [];
  for (const ch of list) {
    if (ch.team) { if (!teams.has(ch.team)) teams.set(ch.team, []); teams.get(ch.team).push(ch); } else solo.push(ch);
  }
  if (!list.length) host.append(h('p', { style: { color: 'var(--ink-2)' } }, 'No characters match.'));
  for (const [team, members] of teams) {
    host.append(h('div', { class: 'group-title' }, team, h('span', { class: 'team-label' }, `${members.length} members`),
      h('button', { class: 'btn sm', type: 'button', onClick: () => exportRosterExcel(members, R, team) }, 'Team to Excel')));
    host.append(h('div', { class: 'cards' }, members.map(card)));
  }
  if (solo.length) {
    if (teams.size) host.append(h('div', { class: 'group-title' }, 'Solo'));
    host.append(h('div', { class: 'cards' }, solo.map(card)));
  }
}

export { saveRoster };
