// The turn bar: at a table, everyone sees whose turn it is and who's next, along the bottom of the screen on
// any tab. When it's one of your characters, it says so (and buzzes a phone) with what their conditions allow.
// Players can open the party: how their teammates stand.

import { h, clear, toast } from './dom.js';
import { state } from './store.js';
import { lobby, onLobby } from './lobby.js';
import { playState } from '../engine/play.js';
import { turnReminder } from '../engine/turns.js';

let bar = null;
let init = null;   // initView() from the GM, or null
let party = [];    // partyEntry() for each teammate
let openParty = false;
let lastNudge = '';

/** Characters this device plays: the ones open in its tabs (those are what it reports to the GM). */
function mine() {
  const keys = new Set();
  for (const t of state.tabs || []) if (t?.rosterId && !t.companionOf) keys.add(t.rosterId);
  return keys;
}
const charOf = (key) => (state.tabs || []).find((t) => t?.rosterId === key) || state.roster.find((c) => c.rosterId === key) || null;

export function setTableInit(view) {
  init = view || null;
  const now = init?.now;
  const nudgeKey = now ? `${init.round}:${init.turn}:${now.key}` : '';
  if (now && mine().has(now.key) && nudgeKey !== lastNudge && lobby.role !== 'host') {
    lastNudge = nudgeKey;
    toast(`Your turn: ${now.name}`);
    try { navigator.vibrate?.([120, 60, 120]); } catch { /* no vibration */ }
  }
  draw();
}

export function setParty(list) { party = Array.isArray(list) ? list : []; draw(); }

function chip(p) {
  return h('span', { class: `tbar-mate ${p.out ? 'out' : ''}`, style: { '--c': p.color || '#888' }, title: p.player ? `Played by ${p.player}` : 'Run by the GM' },
    h('span', { class: 'swatch' }), h('b', null, p.name),
    h('small', { class: 'num' }, `${p.heroPoints} hero pts${p.bruises ? `, ${p.bruises} bruise${p.bruises === 1 ? '' : 's'}` : ''}`),
    p.conditions.length ? h('small', { class: 'tbar-conds' }, p.conditions.join(', ')) : h('small', { class: 'hint' }, 'fine'));
}

function draw() {
  if (!bar) return;
  const at = lobby.status === 'on';
  const show = at && (init || (lobby.role !== 'host' && party.length));
  bar.hidden = !show;
  document.body.classList.toggle('has-tbar', !!show);
  if (!show) return;
  clear(bar);
  const now = init?.now;
  const myTurn = now && mine().has(now.key) && lobby.role !== 'host';
  bar.classList.toggle('mine', !!myTurn);
  let remind = null;
  if (myTurn) { const ch = charOf(now.key); if (ch) remind = turnReminder(playState(ch)); }
  bar.append(
    h('div', { class: 'tbar-row' },
      init ? [
        h('span', { class: 'chip' }, `Round ${init.round}`),
        h('span', { class: 'tbar-now' }, myTurn ? h('b', null, `Your turn: ${now.name}`) : [h('small', null, 'Now '), h('b', null, now?.name || '…')]),
        init.next ? h('span', { class: 'tbar-next' }, h('small', null, 'Next '), init.next.name) : null,
      ] : h('span', { class: 'tbar-now' }, h('small', null, 'At the table')),
      h('span', { class: 'spacer' }),
      lobby.role !== 'host' && party.length ? h('button', { class: 'btn sm ghost', type: 'button', id: 'tbar-party', 'aria-expanded': String(openParty), onClick: () => { openParty = !openParty; draw(); } }, openParty ? 'Hide party' : 'Party') : null,
      init ? h('button', { class: 'btn sm ghost', type: 'button', title: 'The whole turn order', 'aria-label': 'Turn order', onClick: () => toast(init.order.map((o, i) => `${i === init.turn ? 'Now: ' : ''}${o.name}`).join(' · ')) }, 'Turn order') : null),
    remind && (remind.lines.length || remind.tip || !remind.canAct) ? h('div', { class: 'tbar-remind' },
      !remind.canAct ? h('div', null, h('b', null, 'You can\'t act this turn.')) : null,
      remind.lines.map((l) => { const [c, ...rest] = l.split(': '); return h('div', null, h('button', { type: 'button', class: 'rule-link', 'data-rule': c, 'data-rule-cat': 'Conditions' }, c), `: ${rest.join(': ')}`); }),
      remind.tip ? h('div', { class: 'hint' }, remind.tip) : null) : null,
    openParty && party.length ? h('div', { class: 'tbar-party' }, party.map(chip)) : null);
}

export function initTurnBar() {
  bar = h('div', { class: 'tbar no-print', id: 'turnbar', role: 'status', 'aria-live': 'polite', hidden: true });
  document.getElementById('app').append(bar);
  // Keep the toast and the end of the page clear of the bar, however tall it gets.
  try { new ResizeObserver(() => document.body.style.setProperty('--tbar-h', `${bar.hidden ? 0 : bar.offsetHeight}px`)).observe(bar); } catch { /* old browser: the CSS fallback */ }
  // Off the table: nothing to show.
  onLobby((event) => { if (event === 'status' && lobby.status !== 'on') { init = null; party = []; } draw(); });
}

/** Redraw after this device's own character changed (its reminder follows its conditions). */
export function refreshTurnBar() { draw(); }
