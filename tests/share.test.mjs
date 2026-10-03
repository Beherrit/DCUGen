import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWorld, decodeWorld, isWorldKey, encodeCharacter, decodeCharacter } from '../src/app/share.js';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { emptyWorld, createEntity, addLink, buildWorld, recordMoment } from '../src/engine/world.js';

test('a world key carries pages, ties, moments and the roster, and drops portrait paintings', async () => {
  const a = generateCharacter(R, { seed: 'share-a', pl: 10 }); a.rosterId = 'r-a'; a.portrait = { seed: 5, image: 'data:image/jpeg;base64,AAAA', aiSaved: true };
  const saved = emptyWorld(); saved.name = 'Ravensport';
  const court = createEntity(saved, { type: 'faction', name: 'The Iron Court' });
  addLink(saved, { from: 'char:r-a', to: court.id, rel: 'member' });
  const w = buildWorld(saved, [a], R);
  recordMoment(saved, w, { kind: 'left', a: 'char:r-a', b: court.id, session: 2 });
  const key = await encodeWorld(saved, [a]);
  assert.ok(key.startsWith('DCUW1.') && isWorldKey(`please open ${key} thanks`));
  const back = await decodeWorld(`please open ${key} thanks`);
  assert.equal(back.name, 'Ravensport');
  assert.equal(Object.keys(back.world.entities).length, 1);
  assert.equal(back.world.moments.length, 1);
  assert.equal(back.characters.length, 1);
  assert.equal(back.characters[0].rosterId, 'r-a');
  assert.equal(back.characters[0].portrait.image, undefined, 'the painting stays home');
  assert.equal(back.characters[0].portrait.seed, 5);
  await assert.rejects(decodeWorld('DCUK1.notaworld'), /world key/);
  // character share codes still round-trip
  const code = await encodeCharacter(a);
  assert.equal((await decodeCharacter(code)).identity.codename, a.identity.codename);
});
