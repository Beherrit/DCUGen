// A small WebSocket relay for DCUGen lobbies. No dependencies: plain Node http + the WebSocket
// framing from RFC 6455. The desktop app runs it when you host a table; players connect with the
// lobby key. The host's own app connects too and is the authority; this server only relays:
//   host -> everyone else (or one player, when the message carries "to")
//   player -> the host (the host rebroadcasts what it accepts)
// It also keeps the member list and tells everyone when it changes.

import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
// Limits, so nobody on the network can make the host's app run out of memory.
export const MAX_MESSAGE = 32 * 1024 * 1024; // a big battle map picture fits; more is refused
const MAX_BUFFER = MAX_MESSAGE + 64 * 1024;
const MAX_CLIENTS = 64;
const HELLO_TIMEOUT = 10000; // a connection that hasn't given the lobby key by then is dropped

// The same public id as src/engine/tabletrust.js memberIdFor: a hash of the player's private device secret,
// so a player keeps their characters across reconnects. Kept in step by tests/lobby.test.mjs.
function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36).padStart(7, '0');
}
export function memberIdFor(secret) {
  const s = String(secret || '');
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(s)) return null;
  return `u${fnv1a(s, 2166136261)}${fnv1a(s, 0x9e3779b9)}`;
}

function frame(data, opcode = 1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, payload]);
}

/** Parse complete frames from a buffer; returns { frames: [{opcode, payload}], rest, tooBig }. */
export function parseFrames(buf) {
  const frames = [];
  let off = 0;
  while (off + 2 <= buf.length) {
    const b0 = buf[off]; const b1 = buf[off + 1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = off + 2;
    if (len === 126) { if (p + 2 > buf.length) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (p + 8 > buf.length) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    if (len > MAX_MESSAGE) return { frames, rest: Buffer.alloc(0), tooBig: true };
    let mask = null;
    if (masked) { if (p + 4 > buf.length) break; mask = buf.subarray(p, p + 4); p += 4; }
    if (p + len > buf.length) break;
    const payload = Buffer.from(buf.subarray(p, p + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    frames.push({ opcode, payload, fin });
    off = p + len;
  }
  return { frames, rest: buf.subarray(off), tooBig: false };
}

function sameToken(a, b) {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  return out.length ? out : ['127.0.0.1'];
}

/**
 * Start the relay. Returns { port, token, hostToken, addresses, close(), members() }.
 * opts: { port = 0 (any free), token, hostToken, name, onChange(members) }
 * token is the lobby key players get; only a hello that also carries hostToken (kept by the app that
 * started the server) can be the host, so a player can't take over the table.
 */
export function startLobbyServer({ port = 0, token = crypto.randomBytes(9).toString('base64url'), hostToken = crypto.randomBytes(12).toString('base64url'), name = 'DCUGen table', onChange = null } = {}) {
  const clients = new Map(); // socket -> { id, name, role, buf, open }
  let nextId = 1;
  const members = () => [...clients.values()].filter((c) => c.open).map((c) => ({ id: c.id, name: c.name, role: c.role }));
  const sendTo = (c, msg) => { if (c.open) { try { c.socket.write(frame(JSON.stringify(msg))); } catch { /* gone */ } } };
  const host = () => [...clients.values()].find((c) => c.open && c.role === 'host');
  const broadcastMembers = () => { const list = members(); for (const c of clients.values()) sendTo(c, { t: 'members', members: list }); onChange?.(list); };

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ app: 'DCUGen', lobby: name, members: members().length }));
  });
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || !/websocket/i.test(req.headers.upgrade || '') || clients.size >= MAX_CLIENTS) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const c = { id: `m${nextId++}`, name: '', role: 'player', buf: Buffer.alloc(0), open: false, socket, hello: false };
    clients.set(socket, c);
    const helloTimer = setTimeout(() => { if (!c.hello) drop(); }, HELLO_TIMEOUT);
    const drop = () => {
      clearTimeout(helloTimer);
      const was = c.open;
      c.open = false;
      clients.delete(socket);
      try { socket.destroy(); } catch { /* ignore */ }
      if (was) {
        if (c.role === 'host') for (const o of clients.values()) sendTo(o, { t: 'host-gone' });
        broadcastMembers();
      }
    };
    socket.on('data', (chunk) => {
      if (c.buf.length + chunk.length > MAX_BUFFER) { drop(); return; }
      c.buf = c.buf.length ? Buffer.concat([c.buf, chunk]) : chunk;
      const { frames, rest, tooBig } = parseFrames(c.buf);
      if (tooBig) { drop(); return; }
      c.buf = rest;
      for (const f of frames) {
        if (f.opcode === 8) { drop(); return; }
        if (f.opcode === 9) { try { socket.write(frame(f.payload, 10)); } catch { /* ignore */ } continue; }
        if (f.opcode !== 1) continue;
        let msg;
        try { msg = JSON.parse(f.payload.toString('utf8')); } catch { continue; }
        handle(c, msg);
      }
    });
    socket.on('error', drop);
    socket.on('close', drop);
  });

  function handle(c, msg) {
    if (!c.hello) {
      if (msg.t !== 'hello' || !sameToken(msg.token, token)) { sendTo({ ...c, open: true }, { t: 'refused', reason: 'Wrong lobby key.' }); try { c.socket.end(); } catch { /* ignore */ } clients.delete(c.socket); return; }
      c.hello = true; c.open = true; c.name = String(msg.name || 'Player').slice(0, 40); c.role = msg.role === 'host' && !host() && sameToken(msg.hostToken, hostToken) ? 'host' : 'player';
      const stable = memberIdFor(msg.device);
      if (stable && ![...clients.values()].some((o) => o !== c && o.open && o.id === stable)) c.id = stable;
      sendTo(c, { t: 'welcome', id: c.id, role: c.role, members: members(), lobby: name });
      const h = host();
      if (h && h !== c) sendTo(h, { t: 'joined', id: c.id, name: c.name });
      broadcastMembers();
      return;
    }
    const out = { ...msg, from: c.id, fromName: c.name };
    if (c.role === 'host') {
      const to = msg.to ? [...clients.values()].find((o) => o.id === msg.to) : null;
      delete out.to;
      if (to) sendTo(to, out);
      else for (const o of clients.values()) if (o !== c) sendTo(o, out);
    } else {
      const h = host();
      if (h) sendTo(h, out);
      else sendTo(c, { t: 'host-gone' });
    }
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '0.0.0.0', () => {
      const actual = server.address().port;
      resolve({
        port: actual, token, hostToken, name, addresses: lanAddresses(), members,
        close: () => new Promise((r) => { for (const c of clients.values()) { try { c.socket.destroy(); } catch { /* ignore */ } } clients.clear(); server.close(() => r()); }),
      });
    });
  });
}
