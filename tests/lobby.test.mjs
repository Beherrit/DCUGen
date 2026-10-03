import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startLobbyServer } from '../desktop/lobby-server.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(port, hello) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox = [];
    const waiters = [];
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (waiters.length) waiters.shift()(m); else inbox.push(m); });
    ws.addEventListener('open', () => { ws.send(JSON.stringify({ t: 'hello', ...hello })); resolve({ ws, next: () => (inbox.length ? Promise.resolve(inbox.shift()) : new Promise((r) => waiters.push(r))), send: (m) => ws.send(JSON.stringify(m)) }); });
    ws.addEventListener('error', () => reject(new Error('connect failed')));
  });
}

test('the lobby relay: host joins, players join, host snapshots them, rolls flow host-wards and back', async () => {
  const server = await startLobbyServer({ port: 0, name: 'Test table' });
  try {
    const host = await connect(server.port, { name: 'GM', token: server.token, role: 'host' });
    const w1 = await host.next();
    assert.equal(w1.t, 'welcome'); assert.equal(w1.role, 'host');
    await host.next(); // members
    const player = await connect(server.port, { name: 'Ann', token: server.token, role: 'player' });
    const w2 = await player.next();
    assert.equal(w2.t, 'welcome'); assert.equal(w2.role, 'player');
    const joined = await host.next();
    assert.equal(joined.t, 'joined'); assert.equal(joined.name, 'Ann');
    await host.next(); await player.next(); // members
    // host sends a snapshot to the newcomer only
    host.send({ t: 'snapshot', roster: [{ rosterId: 'r1' }], to: joined.id });
    const snap = await player.next();
    assert.equal(snap.t, 'snapshot'); assert.equal(snap.roster[0].rosterId, 'r1'); assert.equal(snap.to, undefined);
    // a player's roll goes to the host, who rebroadcasts
    player.send({ t: 'feed', entry: { id: 'f1', text: 'Ann rolls 17' } });
    const relayed = await host.next();
    assert.equal(relayed.t, 'feed'); assert.equal(relayed.from, joined.id); assert.equal(relayed.fromName, 'Ann');
    host.send({ t: 'feed', entry: relayed.entry });
    const back = await player.next();
    assert.equal(back.entry.id, 'f1');
    assert.equal(server.members().length, 2);
    // wrong token is refused
    const bad = await connect(server.port, { name: 'X', token: 'nope' });
    const r = await bad.next();
    assert.equal(r.t, 'refused');
    // host leaves: players are told
    host.ws.close();
    const gone = await player.next();
    assert.ok(gone.t === 'host-gone' || gone.t === 'members');
    player.ws.close();
    await wait(50);
  } finally {
    await server.close();
  }
});

test('lobby keys round-trip', async () => {
  const { makeLobbyKey, parseLobbyKey, isLobbyKey } = await import('../src/app/lobby.js');
  const key = makeLobbyKey({ name: 'Friday night', addresses: ['192.168.1.20', '10.0.0.5'], port: 7777, token: 'abc_-123' });
  assert.ok(isLobbyKey(key));
  const p = parseLobbyKey(` ${key} `);
  assert.deepEqual(p, { name: 'Friday night', addresses: ['192.168.1.20', '10.0.0.5'], port: 7777, token: 'abc_-123' });
  assert.throws(() => parseLobbyKey('DCU1.xyz'));
});
