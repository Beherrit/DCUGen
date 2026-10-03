// Lobby client: joins a table hosted by a DCUGen desktop app over a WebSocket, using a lobby key.
//
// The host is the authority: it sends a snapshot (its roster and world) to everyone who joins,
// accepts character edits from the player who claimed that character, and rebroadcasts rolls,
// chat and changes to the whole table. Works the same in the desktop app and in a browser copy of
// the app (a browser page served over https cannot open ws:// links, so players on the web use
// the desktop app or a local copy of DCUGen.html).
//
// Key: DCUL1.<base64url JSON { n: name, a: [host addresses], p: port, k: token }>

const KEY_PREFIX = 'DCUL1.';
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))));

export function makeLobbyKey({ name, addresses, port, token }) {
  return KEY_PREFIX + b64(JSON.stringify({ n: name, a: addresses, p: port, k: token }));
}
export function parseLobbyKey(key) {
  const k = String(key || '').trim();
  const m = /DCUL1\.([A-Za-z0-9_-]+)/.exec(k);
  if (!m) throw new Error('That is not a lobby key. Keys start with "DCUL1."');
  const o = JSON.parse(unb64(m[1]));
  if (!o.a?.length || !o.p || !o.k) throw new Error('That lobby key is incomplete.');
  return { name: o.n || 'Lobby', addresses: o.a, port: o.p, token: o.k };
}
export function isLobbyKey(text) { return /^DCUL1\./.test(String(text || '').trim()); }

const listeners = new Set();
export function onLobby(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(event, data) { for (const fn of listeners) { try { fn(event, data); } catch { /* listener error */ } } }

export const lobby = {
  status: 'off',       // off | connecting | on | error
  role: null,          // host | player
  name: '',            // this user's display name
  key: null,
  info: null,          // parsed key
  members: [],         // [{ id, name, role }]
  id: null,
  error: null,
  ws: null,
  hostGone: false,
};

let handlers = {};
/** The app wires these: snapshot(), applyRoster(ch, from), removeRoster(id), applyWorld(saved), feed(entry), claim(rosterId, member) */
export function setLobbyHandlers(h) { handlers = { ...handlers, ...h }; }

function send(msg) {
  if (lobby.ws && lobby.ws.readyState === 1) lobby.ws.send(JSON.stringify(msg));
}

/** Connect to a lobby. role: 'player' (default) or 'host' (the desktop app that runs the server). */
export function joinLobby(key, { name, role = 'player', address = null } = {}) {
  const info = parseLobbyKey(key);
  leaveLobby({ silent: true });
  lobby.status = 'connecting'; lobby.role = role; lobby.name = name || (role === 'host' ? 'Host' : 'Player'); lobby.key = key; lobby.info = info; lobby.error = null; lobby.hostGone = false;
  const addr = address || info.addresses[0];
  const url = /^wss?:\/\//.test(addr) ? addr : `ws://${addr}:${info.port}`;
  let ws;
  try { ws = new WebSocket(url); } catch (e) { lobby.status = 'error'; lobby.error = e.message; emit('status'); return; }
  lobby.ws = ws;
  ws.onopen = () => { send({ t: 'hello', name: lobby.name, token: info.token, role }); };
  ws.onclose = () => { if (lobby.ws === ws) { lobby.status = lobby.error ? 'error' : 'off'; lobby.ws = null; emit('status'); } };
  ws.onerror = () => { lobby.error = `Could not reach ${url}. Is the host's app open, and are you on the same network (or is the port forwarded)?`; lobby.status = 'error'; emit('status'); };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handle(msg);
  };
  emit('status');
}

export function leaveLobby({ silent = false } = {}) {
  if (lobby.ws) { try { lobby.ws.close(); } catch { /* ignore */ } }
  lobby.ws = null; lobby.status = 'off'; lobby.role = null; lobby.members = []; lobby.id = null; lobby.info = null; lobby.key = null;
  if (!silent) emit('status');
}

function handle(msg) {
  switch (msg.t) {
    case 'welcome':
      lobby.id = msg.id; lobby.status = 'on'; lobby.members = msg.members || []; emit('status');
      if (lobby.role === 'host') { const snap = handlers.snapshot?.(); if (snap) send({ t: 'snapshot', ...snap }); }
      break;
    case 'members': lobby.members = msg.members || []; emit('members'); break;
    case 'refused': lobby.error = msg.reason || 'The host refused the connection.'; lobby.status = 'error'; emit('status'); break;
    case 'host-gone': lobby.hostGone = true; emit('status'); break;
    case 'joined':
      // a player arrived: the host sends them the snapshot
      if (lobby.role === 'host') { const snap = handlers.snapshot?.(); if (snap) send({ t: 'snapshot', ...snap, to: msg.id }); }
      emit('members');
      break;
    case 'snapshot':
      if (lobby.role !== 'host') handlers.applySnapshot?.(msg);
      break;
    case 'roster': {
      // host: accept and rebroadcast; player: apply
      if (lobby.role === 'host') { const ok = handlers.applyRoster?.(msg.ch, msg.from); if (ok) send({ t: 'roster', ch: ok }); }
      else handlers.applyRoster?.(msg.ch, msg.from);
      break;
    }
    case 'roster-remove':
      if (lobby.role === 'host') { if (handlers.removeRoster?.(msg.id, msg.from)) send({ t: 'roster-remove', id: msg.id }); }
      else handlers.removeRoster?.(msg.id, msg.from);
      break;
    case 'world':
      if (lobby.role === 'host') { handlers.applyWorld?.(msg.saved, msg.from); send({ t: 'world', saved: handlers.worldSnapshot?.() || msg.saved }); }
      else handlers.applyWorld?.(msg.saved, msg.from);
      break;
    case 'claim':
      if (lobby.role === 'host') { const ch = handlers.claim?.(msg.rosterId, msg.from); if (ch) send({ t: 'roster', ch }); }
      break;
    case 'feed':
      handlers.feed?.(msg.entry, msg.from);
      if (lobby.role === 'host') send({ t: 'feed', entry: msg.entry });
      break;
    default: break;
  }
}

// ---- things the app sends -------------------------------------------------------------------------------

export function lobbySendRoster(ch) { if (lobby.status === 'on') send({ t: 'roster', ch }); }
export function lobbySendRemove(id) { if (lobby.status === 'on') send({ t: 'roster-remove', id }); }
export function lobbySendWorld(saved) { if (lobby.status === 'on') send({ t: 'world', saved }); }
export function lobbySendFeed(entry) { if (lobby.status === 'on') send({ t: 'feed', entry }); }
export function lobbyClaim(rosterId) { if (lobby.status === 'on') send({ t: 'claim', rosterId }); }
export function lobbyConnected() { return lobby.status === 'on'; }
