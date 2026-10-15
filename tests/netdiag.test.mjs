import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainJoinFailure, parseIceServers, formatIceServers, hasRelay, summarizeConnectionTest, reconnectDelay } from '../src/engine/netdiag.js';

test('join failures are explained by how far they got', () => {
  assert.match(explainJoinFailure({ stage: 'broker' }).title, /matchmaking/);
  assert.match(explainJoinFailure({ stage: 'reach' }).title, /couldn't connect/);
  assert.match(explainJoinFailure({ stage: 'hello' }).title, /let you in/);
  assert.match(explainJoinFailure({ stage: 'reach', error: 'peer-unavailable' }).title, /closed/);
  assert.match(explainJoinFailure({ error: 'network' }).title, /matchmaking/);
});

test('a direct-connection failure suggests a relay, or checking the one the table has', () => {
  assert.ok(explainJoinFailure({ stage: 'reach' }).tips.some((t) => /add a relay/.test(t)));
  assert.ok(explainJoinFailure({ stage: 'reach', relay: true }).tips.some((t) => /didn't answer/.test(t)));
});

test('relay servers parse from lines and print back the same', () => {
  const text = 'turn:relay.example.com:3478 alice s3cret\nstun:stun.example.com:3478\nnot a server\nturn:nologin.example.com';
  const list = parseIceServers(text);
  assert.deepEqual(list, [
    { urls: 'turn:relay.example.com:3478', username: 'alice', credential: 's3cret' },
    { urls: 'stun:stun.example.com:3478' },
  ]);
  assert.equal(formatIceServers(list), 'turn:relay.example.com:3478 alice s3cret\nstun:stun.example.com:3478');
  assert.equal(hasRelay(list), true);
  assert.equal(hasRelay([{ urls: 'stun:x' }]), false);
  assert.deepEqual(parseIceServers(''), []);
});

test('the connection test verdict follows what was found', () => {
  assert.equal(summarizeConnectionTest({ broker: false, types: ['host'] }).ok, false);
  const direct = summarizeConnectionTest({ broker: true, types: ['host', 'srflx'] });
  assert.equal(direct.ok, true);
  assert.equal(direct.rows.length, 2);
  const blocked = summarizeConnectionTest({ broker: true, types: ['host'], relayConfigured: true });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.rows[2].ok, false);
  assert.equal(summarizeConnectionTest({ broker: true, types: ['host', 'relay'], relayConfigured: true }).ok, true);
});

test('reconnects back off and level out', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(reconnectDelay), [1000, 2000, 4000, 8000, 15000, 15000]);
});
