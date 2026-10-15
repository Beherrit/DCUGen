// The table: players only see what the GM shares and only change what is theirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharedWithTable, tableRoster, hostAcceptsEdit, hostAcceptsRemove, hostAcceptsClaim, shouldSendToTable, memberIdFor } from '../src/engine/tabletrust.js';
import { memberIdFor as serverMemberIdFor, startLobbyServer, parseFrames, MAX_MESSAGE } from '../desktop/lobby-server.js';

const villain = { rosterId: 'v' };
const pregen = { rosterId: 'p', tableShared: true };
const anns = { rosterId: 'a', lobbyShared: true, lobbyOwner: 'u-ann' };

test('a joining player gets only shared characters, never the GM\'s private roster', () => {
  assert.deepEqual(tableRoster([villain, pregen, anns]).map((c) => c.rosterId), ['p', 'a']);
  assert.equal(sharedWithTable(villain), false);
});

test('the host only accepts edits and deletions from the owner', () => {
  assert.equal(hostAcceptsEdit(villain, 'u-bob'), false); // the GM's own character
  assert.equal(hostAcceptsEdit(pregen, 'u-bob'), false); // shared, not claimed
  assert.equal(hostAcceptsEdit(anns, 'u-bob'), false);
  assert.equal(hostAcceptsEdit(anns, 'u-ann'), true);
  assert.equal(hostAcceptsEdit(undefined, 'u-bob'), true); // a new character the player brings
  assert.equal(hostAcceptsRemove(villain, 'u-bob'), false);
  assert.equal(hostAcceptsRemove(pregen, 'u-bob'), false);
  assert.equal(hostAcceptsRemove(anns, 'u-ann'), true);
  assert.equal(hostAcceptsClaim(villain, 'u-bob'), false);
  assert.equal(hostAcceptsClaim(pregen, 'u-bob'), true);
  assert.equal(hostAcceptsClaim(anns, 'u-bob'), false);
});

test('a player deleting their copy of a GM character does not tell the table', () => {
  assert.equal(shouldSendToTable({ rosterId: 'x', lobbyShared: true }, { role: 'player', me: 'u-bob' }), false);
  assert.equal(shouldSendToTable(anns, { role: 'player', me: 'u-ann' }), true);
  assert.equal(shouldSendToTable({ rosterId: 'mine' }, { role: 'player', me: 'u-ann' }), true);
  assert.equal(shouldSendToTable(villain, { role: 'host', me: 'h' }), false);
  assert.equal(shouldSendToTable(pregen, { role: 'host', me: 'h' }), true);
});

test('member ids are stable, hide the secret, and match between the app and the desktop server', () => {
  const s = 'abcdefghijkmnpqrstuvwxyz';
  assert.equal(memberIdFor(s), memberIdFor(s));
  assert.notEqual(memberIdFor(s), memberIdFor(`${s}2`));
  assert.ok(!memberIdFor(s).includes(s));
  assert.equal(memberIdFor('short'), null);
  assert.equal(memberIdFor(s), serverMemberIdFor(s));
});

test('the lobby server refuses oversized frames and hosts without the host key', async () => {
  const header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(MAX_MESSAGE + 1), 2);
  assert.equal(parseFrames(header).tooBig, true);
  const server = await startLobbyServer({ port: 0 });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const welcome = await new Promise((resolve, reject) => {
      ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.t === 'welcome') resolve(m); });
      ws.addEventListener('open', () => ws.send(JSON.stringify({ t: 'hello', name: 'Sneaky', token: server.token, role: 'host', device: 'abcdefghijkmnpqrstuvwxyz' })));
      ws.addEventListener('error', reject);
    });
    assert.equal(welcome.role, 'player');
    assert.equal(welcome.id, memberIdFor('abcdefghijkmnpqrstuvwxyz'));
    ws.close();
  } finally { await server.close(); }
});
