// Lobby client: joins a table hosted by a DCUGen desktop app over a WebSocket, using a lobby key.
//
// The host is the authority: it sends a snapshot (its roster and world) to everyone who joins,
// accepts character edits from the player who claimed that character, and rebroadcasts rolls,
// chat and changes to the whole table. Works the same in the desktop app and in a browser copy of
// the app (a browser page served over https cannot open ws:// links, so players on the web use
// the desktop app or a local copy of DCUGen.html).
//
// Key: DCUL1.<base64url JSON { n: name, a: [host addresses], p: port, k: token }>
//
// Phone tables (no desktop app): the GM's own browser tab is the hub. Players connect to it directly,
// browser to browser (WebRTC through PeerJS; a free public PeerJS server only introduces them, and a
// table can point at its own PeerJS server instead). The GM's tab runs the same relay as the desktop
// server, so everything else works the same. Key: DCUP1.<base64url JSON { n: name, i: host peer id, k: token, s: server }>

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
export function isLobbyKey(text) { return /^DCU[LP]1\./.test(String(text || '').trim()); }
const PEER_PREFIX = 'DCUP1.';
export const isPeerKey = (text) => /DCUP1\.[A-Za-z0-9_-]+/.test(String(text || ''));
export function parsePeerKey(key) {
  const m = /DCUP1\.([A-Za-z0-9_-]+)/.exec(String(key || ''));
  if (!m) throw new Error('That is not a table link.');
  const o = JSON.parse(unb64(m[1]));
  if (!o.i || !o.k) throw new Error('That table link is incomplete.');
  return { name: o.n || 'Table', hostId: o.i, token: o.k, server: o.s || null };
}
/** The link players open (or scan) to join a phone table. */
export function joinLink(key) {
  const base = /^https?:/.test(location.protocol) ? `${location.origin}${location.pathname}` : 'https://forgedcugen.vercel.app/';
  return `${base}#join=${key}`;
}

/** Which PeerJS server introduces the browsers: the free public one, or a table's own (Settings in the Table tab). */
export function peerServer() {
  try { const s = JSON.parse(localStorage.getItem('dcugen.peer.server') || 'null'); if (s?.host) return s; } catch { /* ignore */ }
  return null;
}
function peerOptions(server) {
  const s = server || peerServer();
  return s ? { host: s.host, port: s.port || (s.secure === false ? 80 : 443), path: s.path || '/', secure: s.secure !== false, debug: 0 } : { debug: 0 };
}
let transport = null; // { send(msg), close() } for the current connection, whatever it runs on

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
  if (transport) { transport.send(msg); return; }
  if (lobby.ws && lobby.ws.readyState === 1) lobby.ws.send(JSON.stringify(msg));
}

/** Connect to a lobby. role: 'player' (default) or 'host' (the desktop app that runs the server). */
export function joinLobby(key, { name, role = 'player', address = null } = {}) {
  if (isPeerKey(key)) { joinPeerTable(key, { name }); return; }
  const info = parseLobbyKey(key);
  leaveLobby({ silent: true });
  lobby.status = 'connecting'; lobby.role = role; lobby.name = name || (role === 'host' ? 'Host' : 'Player'); lobby.key = key; lobby.info = info; lobby.error = null; lobby.hostGone = false;
  // Try each address the host listed (real network first, virtual adapters later) until one answers.
  const candidates = address ? [address] : [...info.addresses].sort((a, b) => virtualScore(a) - virtualScore(b));
  const tried = [];
  const attempt = (i) => {
    if (i >= candidates.length) { lobby.status = 'error'; lobby.error = `Could not reach the host at ${tried.join(', ')}. Is the host's app open, and are you on the same network (or is the port forwarded)?`; lobby.ws = null; emit('status'); return; }
    const addr = candidates[i];
    const url = /^wss?:\/\//.test(addr) ? addr : `ws://${addr}:${info.port}`;
    tried.push(addr);
    let ws;
    try { ws = new WebSocket(url); } catch { attempt(i + 1); return; }
    lobby.ws = ws;
    let opened = false;
    const timer = setTimeout(() => { if (!opened) { try { ws.close(); } catch { /* ignore */ } } }, 6000);
    ws.onopen = () => { opened = true; clearTimeout(timer); send({ t: 'hello', name: lobby.name, token: info.token, role }); };
    ws.onclose = () => { clearTimeout(timer); if (lobby.ws !== ws) return; if (!opened) { attempt(i + 1); return; } lobby.status = lobby.error ? 'error' : 'off'; lobby.ws = null; emit('status'); };
    ws.onerror = () => { /* onclose follows and moves to the next address */ };
    ws.onmessage = (ev) => { let msg; try { msg = JSON.parse(ev.data); } catch { return; } handle(msg); };
    emit('status');
  };
  attempt(0);
}

/** Addresses that are usually virtual adapters (WSL, Hyper-V, VPNs, Docker) go last. */
function virtualScore(addr) {
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr)) return 2;
  if (/^(10\.|169\.254\.)/.test(addr)) return 1;
  if (/^192\.168\./.test(addr)) return 0;
  return 1;
}

export function leaveLobby({ silent = false } = {}) {
  if (transport) { try { transport.close(); } catch { /* ignore */ } transport = null; }
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
    default:
      // Anything else (the GM screen's status, hit and hero point messages) goes to the app.
      handlers.message?.(msg);
      break;
  }
}

// ---- things the app sends -------------------------------------------------------------------------------

export function lobbySendRoster(ch) { if (lobby.status === 'on') send({ t: 'roster', ch }); }
export function lobbySendRemove(id) { if (lobby.status === 'on') send({ t: 'roster-remove', id }); }
export function lobbySendWorld(saved) { if (lobby.status === 'on') send({ t: 'world', saved }); }
export function lobbySendFeed(entry) { if (lobby.status === 'on') send({ t: 'feed', entry }); }
export function lobbyClaim(rosterId) { if (lobby.status === 'on') send({ t: 'claim', rosterId }); }
export function lobbyConnected() { return lobby.status === 'on'; }
/** Send any message: from a player it goes to the host; from the host to everyone (or msg.to). */
export function lobbySend(msg) { if (lobby.status === 'on') send(msg); }

// ---- phone tables: browser to browser -------------------------------------------------------------------

const rid = (n = 8) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
function needPeer() {
  const P = window.peerjs?.Peer;
  if (!P) throw new Error('Phone tables need a newer browser (WebRTC).');
  return P;
}
function peerError(err) {
  const t = String(err?.type || '');
  if (t === 'peer-unavailable') return 'The table isn\'t open any more (or the link is old). Ask the GM for a new link.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Couldn\'t reach the matchmaking server. Check your internet connection.';
  if (t === 'browser-incompatible') return 'This browser can\'t do browser-to-browser connections.';
  return err?.message || 'The connection failed.';
}

/**
 * Open a table in this browser tab: it becomes the hub players connect to. Resolves to
 * { key, link } once the matchmaking server has given it an address.
 */
export function hostPeerTable({ name, tableName } = {}) {
  const Peer = needPeer();
  leaveLobby({ silent: true });
  const token = rid(10);
  const server = peerServer();
  const peer = new Peer(`dcugen-${rid(12)}`, peerOptions(server));
  const clients = new Map(); // conn -> { id, name, role, conn, hello }
  let n = 0;
  lobby.status = 'connecting'; lobby.role = 'host'; lobby.name = name || 'GM'; lobby.error = null; lobby.hostGone = false; lobby.mode = 'phone';
  emit('status');
  const members = () => [{ id: 'h', name: lobby.name, role: 'host' }, ...[...clients.values()].filter((c) => c.hello).map((c) => ({ id: c.id, name: c.name, role: 'player' }))];
  const toClient = (c, m) => { try { if (c.conn.open) c.conn.send(JSON.stringify(m)); } catch { /* gone */ } };
  const broadcastMembers = () => { const list = members(); for (const c of clients.values()) if (c.hello) toClient(c, { t: 'members', members: list }); handle({ t: 'members', members: list }); };
  // what a player sends: the hello, then everything goes to this tab (the host)
  const fromPlayer = (c, msg) => {
    if (!c.hello) {
      if (msg.t !== 'hello' || msg.token !== token) { toClient(c, { t: 'refused', reason: 'Wrong table link.' }); setTimeout(() => c.conn.close(), 200); return; }
      c.hello = true; c.name = String(msg.name || 'Player').slice(0, 40);
      toClient(c, { t: 'welcome', id: c.id, role: 'player', members: members(), lobby: tableName || lobby.name });
      handle({ t: 'joined', id: c.id, name: c.name });
      broadcastMembers();
      return;
    }
    handle({ ...msg, from: c.id, fromName: c.name });
  };
  // what this tab sends: to one player (msg.to) or everyone
  transport = {
    send(msg) {
      const out = { ...msg, from: 'h', fromName: lobby.name };
      const to = msg.to;
      delete out.to;
      for (const c of clients.values()) if (c.hello && (!to || c.id === to)) toClient(c, out);
    },
    close() { try { peer.destroy(); } catch { /* ignore */ } },
  };
  return new Promise((resolve, reject) => {
    peer.on('open', (id) => {
      const key = PEER_PREFIX + b64(JSON.stringify({ n: tableName || `${lobby.name}'s table`, i: id, k: token, ...(server ? { s: server } : {}) }));
      lobby.key = key; lobby.info = { name: tableName || `${lobby.name}'s table` };
      lobby.status = 'on'; lobby.id = 'h'; lobby.members = members();
      emit('status');
      const snap = handlers.snapshot?.(); if (snap) transport.send({ t: 'snapshot', ...snap });
      resolve({ key, link: joinLink(key) });
    });
    peer.on('connection', (conn) => {
      const c = { id: `p${++n}`, name: 'Player', conn, hello: false };
      clients.set(conn, c);
      conn.on('data', (d) => { let m; try { m = typeof d === 'string' ? JSON.parse(d) : d; } catch { return; } fromPlayer(c, m); });
      conn.on('close', () => { clients.delete(conn); if (c.hello) broadcastMembers(); });
      conn.on('error', () => { clients.delete(conn); });
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
    peer.on('error', (err) => {
      if (err?.type === 'peer-unavailable') return;
      lobby.error = peerError(err);
      if (lobby.status !== 'on') { lobby.status = 'error'; emit('status'); reject(new Error(lobby.error)); }
    });
  });
}

/** Join a phone table from its link or key. */
export function joinPeerTable(key, { name } = {}) {
  const Peer = needPeer();
  const info = parsePeerKey(key);
  leaveLobby({ silent: true });
  lobby.status = 'connecting'; lobby.role = 'player'; lobby.name = name || 'Player'; lobby.key = key; lobby.info = { name: info.name }; lobby.error = null; lobby.hostGone = false; lobby.mode = 'phone';
  emit('status');
  const peer = new Peer(undefined, peerOptions(info.server));
  let conn = null;
  const fail = (msg) => { lobby.status = 'error'; lobby.error = msg; transport = null; emit('status'); try { peer.destroy(); } catch { /* ignore */ } };
  const timer = setTimeout(() => { if (lobby.status === 'connecting') fail('The table didn\'t answer. Is the GM\'s page still open?'); }, 15000);
  peer.on('open', () => {
    conn = peer.connect(info.hostId, { reliable: true, serialization: 'json' });
    conn.on('open', () => {
      transport = { send: (m) => { try { conn.send(JSON.stringify(m)); } catch { /* closed */ } }, close: () => { try { peer.destroy(); } catch { /* ignore */ } } };
      transport.send({ t: 'hello', name: lobby.name, token: info.token, role: 'player' });
    });
    conn.on('data', (d) => { let m; try { m = typeof d === 'string' ? JSON.parse(d) : d; } catch { return; } if (m.t === 'welcome') clearTimeout(timer); handle(m); });
    conn.on('close', () => { if (lobby.status === 'on') { lobby.hostGone = true; lobby.status = 'off'; transport = null; emit('status'); } });
  });
  peer.on('error', (err) => { clearTimeout(timer); fail(peerError(err)); });
}

/** A QR code for a link, as an SVG string (or null if the encoder isn't there). */
export function qrSvg(text, cell = 5) {
  const q = window.qrcode;
  if (!q) return null;
  const code = q(0, 'M');
  code.addData(text);
  code.make();
  return code.createSvgTag({ cellSize: cell, margin: 3, scalable: true });
}
