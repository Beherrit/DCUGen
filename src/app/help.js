// Help in the top bar: a guided tour for players and one for GMs (offered on the first visit), What's new
// after an update, and the version.

import { h, clear, menu, openDialog, toast } from './dom.js';
import { APP_VERSION, CHANGELOG } from '../generated/rulesdata.js';

const TOUR_KEY = 'dcugen.tour.v1';
const SEEN_KEY = 'dcugen.whatsnew.v1';

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

/**
 * Each step points at something on screen: `tab` opens that section first, `sel` is what to light up (the
 * card sits in the middle of the screen when it isn't there, e.g. a control folded away on a phone).
 */
export const TOURS = {
  player: {
    title: 'Player tour',
    steps: [
      { tab: 'forge', sel: '#tab-forge', title: 'The Forge', text: 'Your character sheet lives here. Everything you make is legal for its power level, and the sheet checks your edits as you go.' },
      { tab: 'forge', sel: '#roll', title: 'Roll a character', text: 'One click makes a complete hero. Pick a power level, archetype and theme on the left first if you like, or press R anywhere on the Forge.' },
      { tab: 'forge', sel: '#build-scratch', title: 'Or build your own', text: 'Build from scratch starts a blank sheet. Use Edit on any sheet to change traits with + and −, and the Power Lab for custom powers.' },
      { tab: 'forge', sel: '#open-key', title: 'Open what your GM sent', text: 'Paste a key or link here, or use Import for an Excel sheet or a .json file.' },
      { tab: 'roster', sel: '#tab-roster', title: 'Your roster', text: 'Save to roster keeps a character in this browser. Folders, worlds and a backup are here too.' },
      { tab: 'table', sel: '#tab-table', title: 'Join the table', text: 'When your GM hosts a game, join here or scan their QR code with your phone. Claim your character with ✋ Mine, and your sheet, rolls and conditions show up on the GM\'s screen.' },
      { tab: 'rules', sel: '#tab-rules', title: 'Rules', text: 'Every effect, advantage, condition and skill, searchable. You can take this tour again from the ? menu.' },
    ],
  },
  gm: {
    title: 'GM tour',
    steps: [
      { tab: 'forge', sel: '#tab-forge', title: 'Make anyone fast', text: 'Roll heroes, villains or a whole team on the Forge. Seeds make a roll repeatable, so you can share a villain by its seed.' },
      { tab: 'bestiary', sel: '#tab-bestiary', title: 'Bestiary', text: 'Hundreds of ready stat blocks, each legal for its PL, with tactics and a weakness. Throw any of them straight into a fight.' },
      { tab: 'table', sel: '#tab-table', title: 'Host a table', text: 'Host a game and your players join from their phones with a QR code. You choose which characters they can see and claim.' },
      { tab: 'screen', sel: '#tab-screen', title: 'GM Screen', text: 'Initiative with conditions, everyone\'s status at a glance, hero points to hand out, a balance check and session prep.' },
      { tab: 'battle', sel: '#tab-battle', title: 'Battle Room', text: 'Run fights with the real resistance checks, a battle map, and a fight comic when it\'s over.' },
      { tab: 'world', sel: '#tab-world', title: 'World', text: 'Your campaign wiki: people, places, factions, a timeline, the newspapers, handouts and the session planner.' },
      { tab: 'gm', sel: '#tab-gm', title: 'GM Tools', text: 'Quick generators and tables for when the players go somewhere you didn\'t plan. You can take this tour again from the ? menu.' },
    ],
  },
};

let showTabHook = () => {};
let hooks = {};
let running = null;

function place(card, spot, dim, target) {
  const pad = 6;
  const r = target?.getBoundingClientRect();
  const visible = r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  if (!visible) {
    spot.hidden = true;
    dim.style.clipPath = '';
    card.classList.add('center');
    card.style.left = ''; card.style.top = '';
    return;
  }
  spot.hidden = false;
  card.classList.remove('center');
  const x = r.left - pad; const y = r.top - pad; const w = r.width + pad * 2; const hh = r.height + pad * 2;
  Object.assign(spot.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px` });
  // Dim everything but the hole around the target.
  dim.style.clipPath = `path(evenodd, 'M0 0H${innerWidth}V${innerHeight}H0Z M${x} ${y}h${w}v${hh}h${-w}Z')`;
  const cw = card.offsetWidth; const ch = card.offsetHeight;
  const below = r.bottom + pad + 12;
  const top = below + ch <= innerHeight - 8 ? below : Math.max(8, r.top - pad - 12 - ch);
  const left = Math.min(Math.max(8, r.left + r.width / 2 - cw / 2), innerWidth - cw - 8);
  card.style.left = `${left}px`; card.style.top = `${top}px`;
}

/** Run a tour ('player' or 'gm'). */
export function startTour(kind) {
  const tour = TOURS[kind];
  if (!tour) return;
  stopTour();
  const layer = h('div', { class: 'tour', role: 'dialog', 'aria-modal': 'true', 'aria-label': tour.title });
  const dim = h('div', { class: 'tour-dim', 'aria-hidden': 'true' });
  const spot = h('div', { class: 'tour-spot', 'aria-hidden': 'true' });
  const card = h('div', { class: 'tour-card' });
  layer.append(dim, spot, card);
  document.body.append(layer);
  let i = 0;
  let target = null;
  const reposition = () => place(card, spot, dim, target);
  const draw = () => {
    const step = tour.steps[i];
    if (step.tab) showTabHook(step.tab);
    target = document.querySelector(step.sel);
    try { target?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* old browser */ }
    clear(card);
    const last = i === tour.steps.length - 1;
    card.append(
      h('div', { class: 'tour-count' }, `${tour.title} · ${i + 1} of ${tour.steps.length}`),
      h('h3', null, step.title),
      h('p', null, step.text),
      h('div', { class: 'tour-foot' },
        h('button', { class: 'btn ghost', type: 'button', onClick: () => finish() }, last ? 'Close' : 'Skip tour'),
        h('span', { class: 'spacer' }),
        i > 0 ? h('button', { class: 'btn', type: 'button', onClick: () => { i--; draw(); } }, 'Back') : null,
        h('button', { class: 'btn primary', type: 'button', id: 'tour-next', onClick: () => { if (last) finish(); else { i++; draw(); } } }, last ? 'Done' : 'Next')));
    requestAnimationFrame(reposition);
    card.querySelector('#tour-next')?.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(); }
    if (e.key === 'ArrowRight' && i < tour.steps.length - 1) { i++; draw(); }
    if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); }
  };
  const finish = () => { put(TOUR_KEY, 'done'); stopTour(); };
  addEventListener('resize', reposition);
  addEventListener('scroll', reposition, true);
  document.addEventListener('keydown', onKey, true);
  running = () => {
    removeEventListener('resize', reposition);
    removeEventListener('scroll', reposition, true);
    document.removeEventListener('keydown', onKey, true);
    layer.remove();
  };
  draw();
}

export function stopTour() {
  if (running) { const r = running; running = null; r(); }
}

/** First visit: ask whether to show the player or the GM tour. */
async function offerTour() {
  const pick = await openDialog({
    title: 'Welcome to DCUGen',
    body: [
      h('p', { style: { margin: 0 } }, 'A character generator and GM toolkit for the DC Adventures RPG. Want a quick look around?'),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Seven short steps. You can take either tour later from the ? menu at the top.'),
    ],
    buttons: [{ label: 'No thanks', value: 'skip' }, { label: 'I\'m a GM', value: 'gm' }, { label: 'I\'m a player', value: 'player', primary: true }],
  });
  put(TOUR_KEY, 'done');
  // A player sees the player sections; the GM sections are a click away (top bar), and a GM sees everything.
  if (pick === 'player' || pick === 'gm') { hooks.setMode?.(pick); startTour(pick); }
}

// ---- What's new ----------------------------------------------------------------------------------------
const latestId = () => CHANGELOG[0]?.id || '';

export function whatsNewBody() {
  if (!CHANGELOG.length) return h('p', null, 'No release notes yet.');
  return h('div', { class: 'whatsnew' }, CHANGELOG.map((c, n) => h('section', { class: n === 0 ? 'latest' : null },
    h('h3', null, c.title, h('small', null, ` · ${c.date}`)),
    h('ul', null, c.items.map((it) => h('li', null, it))))));
}

async function versionText() {
  try { if (window.dcugenDesktop?.version) return `DCUGen ${await window.dcugenDesktop.version()} (desktop app)`; } catch { /* web */ }
  return `DCUGen ${APP_VERSION}`;
}

export async function showWhatsNew() {
  put(SEEN_KEY, latestId());
  document.querySelector('.help-menu')?.classList.remove('has-news');
  await openDialog({ title: 'What\'s new', body: [h('p', { class: 'hint', style: { margin: 0 } }, await versionText()), whatsNewBody()] });
}

/** The ? menu in the top bar, and the first-visit welcome. `showTab` opens a section by name. */
export function initHelp({ showTab, setMode }) {
  showTabHook = showTab;
  hooks = { setMode };
  const m = menu('?', [
    { label: '🧭 Player tour', hint: 'Make a character and join a table', run: () => startTour('player') },
    { label: '🧭 GM tour', hint: 'Bestiary, GM Screen, Battle Room, World', run: () => startTour('gm') },
    { label: '✨ What\'s new', id: 'whats-new', hint: 'What changed in recent updates', run: () => showWhatsNew() },
    { label: 'Rules', hint: 'Effects, advantages, conditions, skills', run: () => showTab('rules') },
  ], { cls: 'icon-btn help-btn' });
  m.classList.add('help-menu');
  m.querySelector('button').setAttribute('aria-label', 'Help, tours and what\'s new');
  m.querySelector('button').title = 'Help, tours and what\'s new';
  const footer = h('div', { class: 'help-version' }, '');
  versionText().then((t) => { footer.textContent = t; });
  m.querySelector('.menu-list').append(footer);
  document.getElementById('theme-toggle').before(m);

  const seen = get(SEEN_KEY);
  // Someone who used DCUGen before the tour existed has a saved tab; they get the What's new dot, not the welcome.
  const returning = !!get('dcugen.tab') || !!seen;
  // Arriving by a share or join link: that comes first; the tour waits for the next visit.
  const byLink = /[#&](join|r|w|h|n|c|k)=/.test(location.hash);
  if (!returning && !byLink && get(TOUR_KEY) === null) {
    // A brand-new visitor gets the welcome, not a list of changes they never saw the "before" of.
    put(SEEN_KEY, latestId());
    setTimeout(() => { if (!document.getElementById('dialog')?.open) offerTour(); }, 400);
  } else if (seen !== latestId()) {
    m.classList.add('has-news');
    if (seen) setTimeout(() => toast('DCUGen was updated. See what\'s new in the ? menu.'), 1200);
  }
}
