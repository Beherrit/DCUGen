// The Battle Room's left rail: quick starts, picking fighters for a side, and the arena options (copies, extra
// teams, enclosed space, ambush, team tactics). The page itself is in battle.js, which passes in what these need.

import { sortChars, sortSelect, sortPref } from './sorting.js';
import { h, clear, toast } from './dom.js';
import { state } from './store.js';
import { catalogEntries } from '../engine/workshop.js';
import { catalogToCharacter } from '../engine/catalog.js';
import { placeAll } from '../engine/battle.js';
import { tacticPanel } from './battle-tactics.js';

const TEAMS = ['A', 'B', 'C', 'D'];

// cx is what battle.js hands over: { battle, R, ui, hooks, throwIn, save, render, sidePower, teamColor }.

/** One-click set-ups: the roster, a foe, a squad, an even match. */
export function quickStarts(cx) {
  const { battle, R, throwIn, sidePower } = cx;
  const all = catalogEntries(R);
  const heroes = state.roster.filter((c) => c.alignment !== 'villain' && !c.minion);
  const villains = state.roster.filter((c) => c.alignment === 'villain');
  const foe = (team, { minion = false, near = null } = {}) => {
    const pl = near ?? (Math.round(battle.combatants.filter((c) => c.team !== team).reduce((s, c) => s + c.pl, 0) / Math.max(1, battle.combatants.filter((c) => c.team !== team).length)) || 8);
    const pool = all.filter((e) => Math.abs(e.pl - pl) <= 2 && !!e.minion === minion);
    const e = pool[Math.floor(Math.random() * pool.length)] || all[Math.floor(Math.random() * all.length)];
    const ch = catalogToCharacter(e); ch.alignment = 'villain';
    return { ch, name: e.name };
  };
  const evenUp = () => {
    const p = sidePower();
    const a = p.A?.w || 0; const b = p.B?.w || 0;
    if (!a && !b) { toast('Add fighters first'); return; }
    const weak = a <= b ? 'A' : 'B';
    const gap = Math.abs(a - b);
    if (gap < 3) { toast('The sides are already close'); return; }
    let added = 0; let left = gap;
    while (left > 2 && added < 6) { const f = foe(weak, { near: Math.min(left, Math.max(4, Math.round(p[weak]?.avg || p[weak === 'A' ? 'B' : 'A']?.avg || 8))) }); throwIn(f.ch, { team: weak, name: f.name }); left -= f.ch.pl; added++; }
    toast(`Evened up: ${added} more on team ${weak}`);
  };
  const btn = (label, hint, fn, disabled = false) => h('button', { type: 'button', class: 'btn sm', title: hint, disabled, onClick: () => { try { fn(); } catch (e) { toast(e.message); } } }, label);
  return [
    btn(`My heroes → A${heroes.length ? ` (${heroes.length})` : ''}`, 'Everyone on the roster who is not a villain', () => { for (const c of heroes) throwIn(c, { team: 'A' }); toast(`${heroes.length} heroes on team A`); }, !heroes.length),
    btn(`My villains → B${villains.length ? ` (${villains.length})` : ''}`, 'Every villain on the roster', () => { for (const c of villains) throwIn(c, { team: 'B' }); toast(`${villains.length} villains on team B`); }, !villains.length),
    btn('🎲 Random foe → B', 'A creature or villain from the Bestiary near side A\'s power level', () => { const f = foe('B'); throwIn(f.ch, { team: 'B', name: f.name }); toast(`${f.name} steps in on team B`); }),
    btn('👥 Squad of 5 minions → B', 'Five of the same minion from the Bestiary', () => { const f = foe('B', { minion: true }); throwIn(f.ch, { team: 'B', copies: 5, name: f.name }); toast(`5 × ${f.name} on team B`); }),
    btn('⚖ Even it up', 'Adds Bestiary fighters to the weaker team until the power levels are close', evenUp, battle.combatants.length < 1),
  ];
}

/** The ambush choice: one side catches the other off guard. */
function ambushPicker(cx) {
  const { battle, save, render } = cx;
  const teams = rowTeams(cx);
  const opts = [h('option', { value: '' }, 'No ambush'), ...teams.map((t) => h('option', { value: t, selected: battle.options.ambush === t }, `Team ${t} ambushes`))];
  return h('label', { class: 'bt-copies', title: 'One side catches the other off guard: a surprise round where only the ambushers act and the surprised are vulnerable until they act' }, 'Ambush ',
    h('select', { id: 'bt-ambush', 'aria-label': 'Ambush', onChange: (e) => { battle.options.ambush = e.target.value || null; save(); render(); } }, ...opts));
}

/** The team letters to offer on each row: A and B, and C and D once a fight uses more sides (or asks for them). */
function rowTeams({ battle, ui }) {
  const used = new Set(battle.combatants.map((c) => c.team));
  return TEAMS.filter((t, i) => i < 2 || used.has(t) || ui.moreTeams);
}

/** A pickable fighter: its name and PL, and a button per team to throw it straight onto that side. */
function pickRow(cx, { name, meta, color, onAdd }) {
  return h('div', { class: 'bt-pick', style: { '--c': color || '#888' } },
    h('span', { class: 'swatch' }), h('span', { class: 'bt-pick-text' }, h('span', { class: 'bt-pick-name', title: name }, name), h('span', { class: 'bt-pick-meta' }, meta)),
    h('span', { class: 'bt-pick-to' }, rowTeams(cx).map((t) => h('button', { type: 'button', class: 'bt-side', style: { '--t': cx.teamColor(t) }, title: `Add ${name} to team ${t}`, 'aria-label': `Add ${name} to team ${t}`, onClick: () => onAdd(t) }, t))));
}

export function addPanel(cx) {
  const { battle, R, ui, hooks, throwIn, save, render } = cx;
  const copies = h('input', { type: 'number', id: 'bt-copies', min: 1, max: 20, value: ui.copies || 1, 'aria-label': 'How many copies', title: 'Copies (for squads of minions)', style: { maxWidth: '64px' }, onChange: (e) => { ui.copies = Number(e.target.value) || 1; } });
  const add = (ch, name, team) => {
    const r = throwIn(ch, { team, copies: Number(copies.value) || 1, name });
    toast(`${r.count > 1 ? `${r.count} × ` : ''}${name || ch.identity?.codename} join${r.count > 1 ? '' : 's'} team ${r.team}`);
  };
  // open tabs and roster
  const mine = [];
  for (const t of state.tabs || []) mine.push({ ch: t, from: 'tab' });
  for (const c of state.roster) if (!mine.some((m) => m.ch.rosterId && m.ch.rosterId === c.rosterId)) mine.push({ ch: c, from: 'roster' });
  const mineQ = h('input', { type: 'search', id: 'bt-mine-q', placeholder: 'Find a character…', value: ui.mineQ || '', 'aria-label': 'Find one of your characters' });
  const mineList = h('div', { class: 'bt-pick-list', id: 'bt-mine' });
  const drawMine = () => {
    clear(mineList);
    ui.mineQ = mineQ.value;
    const term = mineQ.value.trim().toLowerCase();
    const shown = sortChars(mine.filter(({ ch }) => !term || `${ch.identity?.codename || ''} ${ch.identity?.realName || ''}`.toLowerCase().includes(term)), sortPref('battle-mine'), (m) => m.ch);
    if (!mine.length) { mineList.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Roll or open characters on the Forge, or save some to the roster, and they show up here.')); return; }
    for (const { ch, from } of shown.slice(0, 80)) mineList.append(pickRow(cx, { name: ch.identity?.codename || 'Unnamed', meta: `PL ${ch.pl} · ${ch.alignment === 'villain' ? 'villain' : 'hero'}${from === 'tab' ? ' · open' : ''}`, color: ch.theme?.color, onAdd: (t) => add(ch, null, t) }));
    if (!shown.length) mineList.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing matches.'));
  };
  mineQ.addEventListener('input', drawMine);
  drawMine();
  // bestiary quick search
  const all = catalogEntries(R);
  const q = h('input', { type: 'search', id: 'bt-beast-q', placeholder: 'Bestiary: dragon, thug, wolf, robot…', value: ui.bestiaryQ, 'aria-label': 'Search the bestiary' });
  const beastList = h('div', { class: 'bt-pick-list', id: 'bt-beasts' });
  const drawBeasts = () => {
    clear(beastList);
    const term = q.value.trim().toLowerCase();
    ui.bestiaryQ = q.value;
    const found = sortChars(all.filter((e) => !term || `${e.name} ${e.category} ${e.realm || ''} ${(e.tags || []).join(' ')}`.toLowerCase().includes(term)), sortPref('battle-beasts', 'plAsc')).slice(0, term ? 60 : 30);
    for (const e of found) beastList.append(pickRow(cx, { name: e.name, meta: `PL ${e.pl} · ${e.category}${e.minion ? ' · minion' : ''}`, color: e.minion ? '#8a5a44' : '#7a3fb8', onAdd: (t) => {
      let ch;
      try { ch = catalogToCharacter(e); } catch (err) { toast(err.message); return; }
      ch.alignment = 'villain';
      add(ch, e.name, t);
    } }));
    if (!found.length) beastList.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing matches.'));
  };
  q.addEventListener('input', drawBeasts);
  drawBeasts();
  return h('aside', { class: 'rail bt-rail', 'aria-label': 'Add fighters' },
    h('h2', null, 'Pick the fighters'),
    h('p', { class: 'hint', style: { margin: 0 } }, 'Press a team letter on a row to put them on that side.'),
    h('div', { class: 'label' }, 'Quick starts'),
    h('div', { class: 'bt-quicks' }, quickStarts(cx)),
    h('div', { class: 'bt-list-head' }, h('span', { class: 'label' }, 'Your characters'), sortSelect('battle-mine', drawMine, { id: 'bt-mine-sort' })),
    mineQ, mineList,
    h('div', { class: 'bt-list-head' }, h('span', { class: 'label' }, 'Bestiary'), sortSelect('battle-beasts', drawBeasts, { fallback: 'plAsc', modes: ['name', 'plAsc', 'plDesc'], id: 'bt-beast-sort' })),
    q, beastList,
    h('div', { class: 'add-row', style: { alignItems: 'center' } },
      h('label', { class: 'bt-copies', title: 'Add several of the same (a squad of minions)' }, 'Copies ×', copies),
      h('label', { class: 'bt-copies' }, h('input', { type: 'checkbox', checked: !!ui.moreTeams, onChange: (e) => { ui.moreTeams = e.target.checked; render(); } }), ' Teams C and D'),
      h('label', { class: 'bt-copies', title: 'A room or corridor: two zones, everyone within one move, ranged fighters have nowhere to run' }, h('input', { type: 'checkbox', id: 'bt-enclosed', checked: !!battle.options.enclosed, onChange: (e) => { battle.options.enclosed = e.target.checked; placeAll(battle); save(); render(); } }), ' Enclosed space'),
      ambushPicker(cx)),
    tacticPanel(cx, rowTeams(cx)),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', type: 'button', onClick: () => hooks.goBestiary?.() }, 'Open the Bestiary')));
}
