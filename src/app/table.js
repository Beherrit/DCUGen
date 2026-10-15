// The Table: the shared feed of rolls and chat, the lobby (host or join), and who is at the table.
// Everyone's rolls from the "Roll" menus land here; when a lobby is connected they go to the whole
// group and the group's rolls come back.

import { h, clear, toast, copyText, openDialog } from './dom.js';
import { state, upsert } from './store.js';
import { lobby, onLobby, joinLobby, leaveLobby, lobbySendFeed, lobbyClaim, lobbySendRemove, makeLobbyKey, isLobbyKey, hostPeerTable, joinLink, qrSvg, isPeerKey, peerServer } from './lobby.js';

/** Open a table for phones in this tab, and show the QR code and link for players. Shared with the GM screen. */
export async function openPhoneTable() {
  if (lobby.status === 'on' && lobby.role === 'host' && lobby.mode === 'phone') return showInvite();
  if (!tableName() || tableName() === 'Player') {
    const n = h('input', { type: 'text', value: myName, placeholder: 'e.g. GM Sam', 'aria-label': 'Your name' });
    const ok = await openDialog({ title: 'Your name at the table', body: h('label', { class: 'field' }, h('span', null, 'Name'), n), buttons: [{ label: 'Cancel', value: false }, { label: 'Open the table', value: true, primary: true }] });
    if (!ok) return null;
    setTableName(n.value || 'GM');
  }
  try {
    toast('Opening the table…');
    await hostPeerTable({ name: tableName() });
    renderTable();
    return showInvite();
  } catch (e) { toast(`Couldn't open the table: ${e.message}`); return null; }
}

/** The invite: a QR code to scan and a link to send. */
export async function showInvite() {
  if (!lobby.key) return null;
  const link = joinLink(lobby.key);
  const qr = qrSvg(link, 6);
  const v = await openDialog({
    title: '📱 Players: scan to join',
    body: [
      qr ? h('div', { class: 'qr', html: qr }) : null,
      h('p', { style: { margin: '6px 0' } }, 'Players scan this with their phone camera (or open the link) and they\'re at your table, no install. Keep this page open while you play: it is the table.'),
      h('div', { class: 'key-box' }, h('div', { class: 'label' }, 'Link'), h('code', { class: 'key-long' }, link)),
      h('p', { class: 'hint', style: { margin: '6px 0 0' } }, peerServer() ? `Connecting through your own server (${peerServer().host}).` : 'A free public PeerJS server introduces the devices; after that they talk to each other directly.'),
    ],
    buttons: [{ label: 'Copy link', value: 'copy', primary: true }, { label: 'Close', value: null }],
  });
  if (v === 'copy') toast((await copyText(link)) ? 'Link copied: send it to your players' : 'Select the link and copy it');
  return link;
}

/** Someone opened a join link: ask their name and join. */
export async function joinFromLink(key) {
  const n = h('input', { type: 'text', value: myName, placeholder: 'Your name', 'aria-label': 'Your name' });
  const ok = await openDialog({ title: 'Join the table', body: [h('p', { style: { margin: '0 0 8px' } }, 'You\'re joining a DCUGen table. Your GM sees your character live and can send you hits, hero points and the map.'), h('label', { class: 'field' }, h('span', null, 'Your name'), n)], buttons: [{ label: 'Not now', value: false }, { label: 'Join', value: true, primary: true }] });
  if (!ok) return false;
  setTableName(n.value || 'Player');
  joinLobby(key, { name: tableName() });
  toast('Joining… then open your character on the Forge (and save it to your roster).');
  return true;
}

const FEED_KEY = 'dcugen.table.v1';
const NAME_KEY = 'dcugen.table.name';
let R; let root; let hooks = {};
let feed = [];
let myName = '';
const MAX_FEED = 400;

function load() {
  try { feed = JSON.parse(localStorage.getItem(FEED_KEY) || '[]'); } catch { feed = []; }
  try { myName = localStorage.getItem(NAME_KEY) || ''; } catch { myName = ''; }
}
function saveFeed() { try { localStorage.setItem(FEED_KEY, JSON.stringify(feed.slice(-MAX_FEED))); } catch { /* full */ } }
export function tableName() { return myName || 'Player'; }
export function setTableName(n) { myName = String(n || '').trim().slice(0, 40); try { localStorage.setItem(NAME_KEY, myName); } catch { /* ignore */ } }

const newId = () => `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Add an entry to the feed (and to the lobby). entry: { who, text, kind?, dice? } */
export function postRoll(entry, { fromLobby = false } = {}) {
  const e = { id: entry.id || newId(), t: entry.t || new Date().toISOString(), kind: entry.kind || (entry.dice ? 'roll' : 'chat'), by: entry.by || tableName(), ...entry };
  if (feed.some((x) => x.id === e.id)) return e;
  feed.push(e);
  if (feed.length > MAX_FEED) feed = feed.slice(-MAX_FEED);
  saveFeed();
  if (!fromLobby) lobbySendFeed(e);
  if (feedHost) drawFeed();
  bumpBadge();
  return e;
}

export function feedEntries() { return feed; }
export function clearFeed() { feed = []; saveFeed(); if (feedHost) drawFeed(); }

let unread = 0;
function bumpBadge() {
  if (!root || !root.hidden) { unread = 0; } else unread++;
  const b = document.getElementById('table-count');
  if (b) { b.textContent = unread ? String(unread) : (lobby.status === 'on' ? String(lobby.members.length) : ''); b.hidden = !b.textContent; }
}

export function initTable(rules, el, h2 = {}) {
  R = rules; root = el; hooks = h2;
  load();
  onLobby(() => { if (root && !root.hidden) renderTable(); bumpBadge(); });
}

// ---- feed ------------------------------------------------------------------------------------------------
let feedHost;
function feedRow(e) {
  const when = e.t ? new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const dice = e.dice;
  return h('div', { class: `tb-row ${e.kind} ${dice?.roll === 20 ? 'nat20' : dice?.roll === 1 ? 'nat1' : ''} ${dice?.deg != null ? (dice.deg > 0 ? 'ok' : 'fail') : ''}` },
    h('span', { class: 'tb-when num' }, when),
    h('span', { class: 'tb-by' }, e.by || e.who || ''),
    h('span', { class: 'tb-text' }, e.kind === 'chat' ? e.text : e.text),
    dice ? h('span', { class: 'tb-die num', title: `${dice.label}: ${dice.roll} ${dice.mod >= 0 ? '+' : ''}${dice.mod ?? 0}` }, dice.roll) : null);
}
function drawFeed() {
  clear(feedHost);
  if (!feed.length) { feedHost.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing yet. Use "Roll" on any character sheet, or the quick roller below.')); return; }
  for (const e of feed.slice(-200)) feedHost.append(feedRow(e));
  feedHost.scrollTop = feedHost.scrollHeight;
}

// ---- lobby panel ------------------------------------------------------------------------------------------------
function lobbyPanel() {
  const desktop = window.dcugenDesktop;
  const nameIn = h('input', { type: 'text', id: 'tb-name', value: myName, placeholder: 'Your name at the table', 'aria-label': 'Your name', onChange: (e) => setTableName(e.target.value) });
  const keyIn = h('input', { type: 'text', id: 'tb-key', placeholder: 'Paste the table link or key', 'aria-label': 'Table link or key' });
  const join = () => {
    const k = (/(DCU[LP]1\.[A-Za-z0-9_-]+)/.exec(keyIn.value) || [])[1] || keyIn.value.trim();
    if (!isLobbyKey(k)) { toast('That is not a lobby key'); return; }
    setTableName(nameIn.value);
    try { joinLobby(k, { name: tableName() }); toast('Connecting…'); } catch (e) { toast(e.message); }
  };
  const host = async () => {
    setTableName(nameIn.value);
    try {
      const info = await desktop.lobbyStart({ name: `${tableName()}'s table` });
      const key = makeLobbyKey({ name: info.name, addresses: info.addresses, port: info.port, token: info.token });
      joinLobby(key, { name: tableName(), role: 'host', address: '127.0.0.1', hostToken: info.hostToken });
      const v = await openDialog({ title: 'Your table is open', body: [h('p', { style: { margin: 0 } }, 'Send this key to your players. They paste it into "Join a table" in their DCUGen app. Everyone on your network can join; for players elsewhere, forward the port on your router (or run a tunnel) and give them the key.'), h('div', { class: 'key-box' }, h('div', { class: 'label' }, 'Lobby key'), h('code', null, key)), h('p', { class: 'hint', style: { margin: 0 } }, `Port ${info.port} · addresses ${info.addresses.join(', ')}`)], buttons: [{ label: 'Copy key', value: 'copy', primary: true }, { label: 'Close', value: null }] });
      if (v === 'copy') toast((await copyText(key)) ? 'Key copied' : 'Select the key and copy it');
    } catch (e) { toast(`Couldn't host: ${e.message}`); }
  };
  const stopHost = async () => { leaveLobby(); try { await desktop?.lobbyStop?.(); } catch { /* ignore */ } renderTable(); };
  const status = lobby.status;
  const members = lobby.members;
  return h('section', { class: 'panel tb-lobby' },
    h('h2', null, 'Lobby'),
    status === 'on' ? [
      h('div', { class: 'tb-status on' }, h('b', null, lobby.role === 'host' ? 'Hosting' : 'Joined'), ` ${lobby.info?.name || ''}${lobby.hostGone ? ' · the host left' : ''}`),
      lobby.role === 'host' && lobby.mode === 'phone' ? h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onClick: showInvite }, '📱 Show the QR code')) : null,
      lobby.role === 'host' && lobby.mode !== 'phone' ? h('div', { class: 'key-box' }, h('div', { class: 'label' }, 'Lobby key: send it to your players'), h('code', null, lobby.key), h('div', { class: 'btn-row', style: { marginTop: '6px' } }, h('button', { class: 'btn sm primary', type: 'button', onClick: async () => toast((await copyText(lobby.key)) ? 'Key copied' : 'Copy failed') }, 'Copy key'))) : null,
      lobby.role === 'host' ? sharePicker() : null,
      h('div', { class: 'label' }, `At the table (${members.length})`),
      h('ul', { class: 'tb-members' }, members.map((m) => h('li', null, h('span', { class: `tb-dot ${m.role}` }), m.name, m.role === 'host' ? h('small', null, ' · host') : null, m.id === lobby.id ? h('small', null, ' · you') : null))),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: lobby.role === 'host' ? stopHost : () => { leaveLobby(); renderTable(); } }, lobby.role === 'host' ? 'Close the table' : 'Leave')),
    ] : [
      status === 'connecting' ? h('div', { class: 'tb-status' }, 'Connecting…') : null,
      status === 'error' ? h('div', { class: 'tb-status bad' }, lobby.error || 'Connection failed') : null,
      h('label', { class: 'field' }, h('span', null, 'Your name'), nameIn),
      h('div', { class: 'tb-host' }, h('button', { class: 'btn primary', type: 'button', id: 'tb-phone', onClick: async () => { setTableName(nameIn.value); await openPhoneTable(); renderTable(); } }, '📱 Open a table for phones'), h('p', { class: 'hint', style: { margin: '4px 0 0' } }, 'Players scan a QR code and join from any phone or browser, no install. This page is the table: keep it open while you play.')),
      desktop ? h('div', { class: 'tb-host' }, h('button', { class: 'btn', type: 'button', onClick: host }, '⌂ Host on this computer (local network)'), h('p', { class: 'hint', style: { margin: '4px 0 0' } }, 'The desktop app\'s own server: for players on your network using the desktop app. Your world and the characters you share are sent to them; players claim their own characters and roll for them.')) : null,
      h('details', { class: 'tb-server' }, h('summary', null, 'Use your own PeerJS server'), (() => {
        const cur = peerServer();
        const inp = h('input', { type: 'text', placeholder: 'host[:port][/path], e.g. peer.example.com/myapp', value: cur ? `${cur.host}${cur.port ? `:${cur.port}` : ''}${cur.path && cur.path !== '/' ? cur.path : ''}` : '', 'aria-label': 'PeerJS server' });
        return h('div', null, h('p', { class: 'hint' }, 'Optional. Leave empty to use the free public server. Everyone at the table uses the GM\'s choice (it travels in the link).'),
          h('div', { class: 'add-row' }, inp, h('button', { class: 'btn sm', type: 'button', onClick: () => {
            const m = /^(?:https?:\/\/)?([^:/]+)(?::(\d+))?(\/.*)?$/.exec(inp.value.trim());
            try { if (!inp.value.trim()) localStorage.removeItem('dcugen.peer.server'); else if (m) localStorage.setItem('dcugen.peer.server', JSON.stringify({ host: m[1], port: m[2] ? Number(m[2]) : undefined, path: m[3] || '/', secure: !/^http:/.test(inp.value) && m[1] !== 'localhost' })); toast('Saved'); } catch { toast('Couldn\'t save'); }
          } }, 'Save')));
      })()),
      h('div', { class: 'label', style: { marginTop: '6px' } }, 'Join a table'),
      h('div', { class: 'add-row', style: { marginTop: 0 } }, keyIn, h('button', { class: 'btn', type: 'button', onClick: join }, 'Join')),
    ]);
}

// ---- quick roller ---------------------------------------------------------------------------------------------------
function quickRoller() {
  const mod = h('input', { type: 'number', value: 0, 'aria-label': 'Modifier', style: { maxWidth: '80px' } });
  const dc = h('input', { type: 'number', placeholder: 'DC (optional)', 'aria-label': 'DC', style: { maxWidth: '120px' } });
  const label = h('input', { type: 'text', placeholder: 'What for (e.g. Stealth)', 'aria-label': 'Label' });
  const roll = () => {
    const r = 1 + Math.floor(Math.random() * 20);
    const m = Number(mod.value) || 0;
    const d = dc.value === '' ? null : Number(dc.value);
    const total = r + m;
    let deg = null;
    if (d != null) { deg = total >= d ? 1 + Math.floor((total - d) / 5) : -(1 + Math.floor((d - total - 1) / 5)); if (r === 20) deg = deg > 0 ? deg + 1 : 1; }
    postRoll({ who: tableName(), text: `${tableName()} rolls ${label.value.trim() || 'd20'}: d20 ${r} ${m >= 0 ? '+' : ''}${m} = ${total}${d != null ? ` vs DC ${d} — ${deg > 0 ? `${deg} degree${deg > 1 ? 's' : ''} of success` : `${-deg} degree${deg < -1 ? 's' : ''} of failure`}` : ''}`, dice: { label: label.value.trim() || 'd20', roll: r, mod: m, total, dc: d, deg } });
  };
  const chat = h('input', { type: 'text', placeholder: 'Say something to the table…', 'aria-label': 'Chat', onKeydown: (e) => { if (e.key === 'Enter') { say(); } } });
  const say = () => { const t = chat.value.trim(); if (!t) return; postRoll({ who: tableName(), kind: 'chat', text: t }); chat.value = ''; };
  const chars = [...(state.tabs || []), ...state.roster.filter((c) => !(state.tabs || []).some((t) => t.rosterId && t.rosterId === c.rosterId))];
  return h('div', { class: 'tb-tools' },
    h('div', { class: 'add-row', style: { marginTop: 0 } }, label, mod, dc, h('button', { class: 'btn primary', type: 'button', onClick: roll }, '🎲 Roll d20')),
    h('div', { class: 'add-row', style: { marginTop: '6px' } }, chat, h('button', { class: 'btn', type: 'button', onClick: say }, 'Say')),
    chars.length ? h('div', { class: 'tb-chars' }, h('span', { class: 'label' }, 'Roll for'), chars.slice(0, 12).map((c) => h('button', { class: 'chip', type: 'button', style: { '--c': c.theme?.color }, onClick: () => hooks.open?.(c) }, h('span', { class: 'swatch' }), c.identity?.codename || 'Unnamed'))) : null);
}

export function renderTable() {
  if (!root) return;
  clear(root);
  unread = 0; bumpBadge();
  feedHost = h('div', { class: 'tb-feed', 'aria-live': 'polite' });
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'The Table'), h('p', null, 'Every roll from every "Roll" menu lands here, with the dice shown. Open a table for phones and your players scan the QR code or tap the link: no app, no install. They see your world and the characters you share, claim their own characters, roll for them, and everyone sees it.'))));
  root.append(h('div', { class: 'tb-layout' },
    h('section', { class: 'panel tb-main' },
      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, h('h2', null, 'Rolls & chat'), h('span', { class: 'hint' }, `${feed.length} entries`), h('span', { style: { flex: 1 } }), h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { clearFeed(); } }, 'Clear')),
      feedHost, quickRoller()),
    lobbyPanel()));
  drawFeed();
}

/** Host: share a character with the table, or stop sharing it (players drop their copy). */
export function setTableShared(ch, on) {
  if (!ch?.rosterId || ch.lobbyOwner) return ch;
  const kept = upsert({ ...ch, tableShared: !!on });
  if (!on && lobby.status === 'on' && lobby.role === 'host') lobbySendRemove(ch.rosterId);
  return kept;
}

/** Host: pick which of your characters the players see. Players' own characters are always there. */
function sharePicker() {
  const mine = state.roster.filter((c) => !c.lobbyOwner && !c.companionOf);
  const players = state.roster.filter((c) => c.lobbyOwner);
  const n = mine.filter((c) => c.tableShared).length;
  return h('details', { class: 'tb-share', open: !n && mine.length > 0 },
    h('summary', null, `Characters shared with the table (${n + players.length})`),
    h('p', { class: 'hint', style: { margin: '4px 0 6px' } }, 'Players only see what you tick here (pre-made heroes for them to claim, allies, a villain they have met), plus their own characters. Everything else in your roster stays private.'),
    mine.length ? h('ul', { class: 'tb-share-list' }, mine.map((c) => h('li', null, h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: !!c.tableShared, onChange: (e) => { setTableShared(c, e.target.checked); renderTable(); } }),
      ` ${c.identity?.codename || c.identity?.realName || 'Unnamed'}`, c.alignment === 'villain' ? h('small', null, ' · villain') : null)))) : h('p', { class: 'hint' }, 'Your roster is empty.'),
    players.length ? h('p', { class: 'hint', style: { margin: '6px 0 0' } }, `Players' characters: ${players.map((c) => `${c.identity?.codename || 'Unnamed'} (${c.lobbyOwnerName || 'a player'})`).join(', ')}.`) : null);
}

/** For the lobby: which of my characters are claimed, and claim one. */
export function claimCharacter(ch) {
  if (!ch.rosterId) { toast('Save the character to the roster first'); return; }
  lobbyClaim(ch.rosterId);
  toast(`Asked the host to make ${ch.identity?.codename} yours`);
}
