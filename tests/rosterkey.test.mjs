import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRoster, decodeRoster, isRosterKey } from '../src/app/share.js';

const ch = (name, extra = {}) => ({ id: name, rosterId: `r-${name}`, pl: 10, abilities: { Strength: 1 }, identity: { codename: name }, folder: 'Earth-2/Heroes', savedAt: 'x', lobbyShared: true, ...extra });

test('a roster key carries the characters and their folders, and comes back the same', async () => {
  const key = await encodeRoster([ch('A'), ch('B')], { name: 'Earth-2', folders: [{ path: 'Earth-2', color: '#f00' }] });
  assert.ok(isRosterKey(key));
  const data = await decodeRoster(`see https://example.com/#r=${key} thanks`);
  assert.equal(data.name, 'Earth-2');
  assert.deepEqual(data.characters.map((c) => c.identity.codename), ['A', 'B']);
  assert.equal(data.characters[0].folder, 'Earth-2/Heroes');
  assert.equal(data.characters[0].savedAt, undefined);
  assert.equal(data.characters[0].lobbyShared, undefined);
  assert.equal(data.folders[0].color, '#f00');
});

test('painted portraits stay home; uploaded pictures only when asked', async () => {
  const painted = ch('P', { portrait: { image: 'data:image/png;base64,AAAA', aiSaved: true, source: 'ai' } });
  const uploaded = ch('U', { portrait: { image: 'data:image/png;base64,BBBB', source: 'upload' } });
  const lean = await decodeRoster(await encodeRoster([painted, uploaded]));
  assert.equal(lean.characters[0].portrait.image, undefined);
  assert.equal(lean.characters[1].portrait.image, undefined);
  assert.equal(lean.characters[1].portrait.source, 'builtin');
  const full = await decodeRoster(await encodeRoster([painted, uploaded], { pictures: true }));
  assert.equal(full.characters[0].portrait.image, undefined);
  assert.equal(full.characters[1].portrait.image, 'data:image/png;base64,BBBB');
});

test('anything else is refused with a clear message', async () => {
  await assert.rejects(() => decodeRoster('DCUW1.abc'), /roster key/);
});
