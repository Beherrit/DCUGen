// Cloud-folder sync: merging another device's file never loses edits made here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; }
  setItem(k, v) { this.m.set(String(k), String(v)); }
  removeItem(k) { this.m.delete(String(k)); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
}
globalThis.Storage = MemoryStorage;
globalThis.localStorage = new MemoryStorage();
globalThis.addEventListener ??= () => {};

const { mergeFromRemote } = await import('../src/app/syncfile.js');
const STAMPS = 'dcugen.sync.stamps.v1';
const stamps = () => JSON.parse(localStorage.getItem(STAMPS) || '{}');
const tick = () => new Promise((r) => setTimeout(r, 5));

test('a key edited here after the other device saved it is kept; untouched keys take the newer copy', async () => {
  localStorage.clear();
  localStorage.setItem('dcugen.journal.v1', '"old journal"');
  localStorage.setItem('dcugen.gmscreen.v1', '"old notes"');
  await tick();
  const remoteTime = new Date().toISOString();
  await tick();
  localStorage.setItem('dcugen.gmscreen.v1', '"my newer notes"'); // edited here, after the remote save
  mergeFromRemote({ app: 'DCUGen', savedAt: remoteTime, data: { 'dcugen.journal.v1': '"their journal"', 'dcugen.gmscreen.v1': '"their notes"' }, stamps: { 'dcugen.journal.v1': remoteTime, 'dcugen.gmscreen.v1': remoteTime } });
  assert.equal(localStorage.getItem('dcugen.gmscreen.v1'), '"my newer notes"');
  assert.equal(localStorage.getItem('dcugen.journal.v1'), '"their journal"');
});

test('a newer edit on the other device wins, and a newer deletion there deletes here', async () => {
  localStorage.clear();
  localStorage.setItem('dcugen.battle.v1', '"mine"');
  localStorage.setItem('dcugen.handouts.v1', '"some"');
  await tick();
  const later = new Date(Date.now() + 1000).toISOString();
  mergeFromRemote({ app: 'DCUGen', savedAt: later, data: { 'dcugen.battle.v1': '"theirs"' }, stamps: { 'dcugen.battle.v1': later, 'dcugen.handouts.v1': later } });
  assert.equal(localStorage.getItem('dcugen.battle.v1'), '"theirs"');
  assert.equal(localStorage.getItem('dcugen.handouts.v1'), null);
  // merging doesn't count as an edit here
  assert.equal(stamps()['dcugen.battle.v1'], later);
});

test('an old deletion there does not remove what was written here since', async () => {
  localStorage.clear();
  const before = new Date(Date.now() - 60000).toISOString();
  localStorage.setItem('dcugen.mygear.v1', '"kept"');
  mergeFromRemote({ app: 'DCUGen', savedAt: before, data: {}, stamps: { 'dcugen.mygear.v1': before } });
  assert.equal(localStorage.getItem('dcugen.mygear.v1'), '"kept"');
});

test('re-saving an unchanged value does not make this device look newer', async () => {
  localStorage.clear();
  localStorage.setItem('dcugen.prefs.v1', '{"pl":10}');
  await new Promise((r) => setTimeout(r, 350));
  const first = stamps()['dcugen.prefs.v1'];
  assert.ok(first);
  localStorage.setItem('dcugen.prefs.v1', '{"pl":10}');
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(stamps()['dcugen.prefs.v1'], first);
});

test('characters merge one by one, and device-only keys never come in', async () => {
  localStorage.clear();
  const old = '2026-01-01T00:00:00.000Z'; const newer = '2026-02-01T00:00:00.000Z';
  localStorage.setItem('dcugen.roster.v1', JSON.stringify([{ rosterId: 'a', savedAt: newer, name: 'mine A' }, { rosterId: 'b', savedAt: old, name: 'mine B' }]));
  localStorage.setItem('dcugen.theme', 'dark');
  mergeFromRemote({ app: 'DCUGen', savedAt: newer, data: { 'dcugen.roster.v1': JSON.stringify([{ rosterId: 'a', savedAt: old, name: 'their A' }, { rosterId: 'b', savedAt: newer, name: 'their B' }, { rosterId: 'c', savedAt: old, name: 'their C' }]), 'dcugen.theme': 'light' }, stamps: {} });
  const roster = JSON.parse(localStorage.getItem('dcugen.roster.v1'));
  assert.deepEqual(roster.map((c) => c.name).sort(), ['mine A', 'their B', 'their C']);
  assert.equal(localStorage.getItem('dcugen.theme'), 'dark');
});
