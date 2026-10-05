import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { characterKey, fromKeySync, personKey, isKey, DATA_VERSION } from '../src/engine/keys.js';

test('a rolled character key rebuilds the same character, bio included', () => {
  for (let i = 0; i < 20; i++) {
    const ch = generateCharacter(R, { seed: `key-${i}`, pl: i % 3 ? null : 8, gender: i % 2 ? 'Female' : 'random', chaos: (i % 5) / 5 });
    const key = characterKey(R, ch);
    assert.ok(isKey(key), key);
    assert.ok(key.endsWith(DATA_VERSION));
    const { character, versionMatch } = fromKeySync(R, key);
    assert.ok(versionMatch);
    assert.equal(JSON.stringify(character.powers), JSON.stringify(ch.powers));
    assert.equal(character.bio.summary, ch.bio.summary);
  }
});

test('edited characters have no short key', () => {
  const ch = generateCharacter(R, { seed: 'key-edit' });
  ch.abilities.Fighting += 1;
  assert.equal(characterKey(R, ch), null);
});

test('people in a bio open as the same full character every time, and link back', () => {
  const ch = generateCharacter(R, { seed: 'key-family', pl: 10 });
  const own = characterKey(R, ch);
  const people = [
    ...(ch.bio.family?.parents || []).map((p) => [p, 'parent']),
    ...(ch.bio.family?.siblings || []).map((p) => [p, 'sibling']),
    ...(ch.bio.people || []).map((p) => [p, 'person']),
  ];
  assert.ok(people.length > 0);
  for (const [p, kind] of people) {
    const key = personKey(ch, p, kind);
    const a = fromKeySync(R, key).character;
    const b = fromKeySync(R, key).character;
    assert.equal(a.identity.realName, p.name);
    assert.equal(JSON.stringify(a.bio.summary), JSON.stringify(b.bio.summary));
    assert.equal(a.bio.people[0].name, ch.identity.realName);
    assert.equal(a.bio.people[0].key, own);
    assert.equal(characterKey(R, a), a.personKey);
    if (kind === 'parent') assert.ok(a.identity.age > ch.identity.age);
  }
});

test('an edited or played character gets a key that carries its edits on top of the seed', async () => {
  const { keyFor, fromKey } = await import('../src/engine/keys.js');
  const ch = generateCharacter(R, { seed: 'key-edits', pl: 10 });
  assert.equal((await keyFor(R, ch)).kind, 'exact');
  ch.abilities.Fighting += 1;
  ch.notes = 'Hates Mondays.';
  ch.advantages.push({ name: 'Feature', rank: 1, param: 'A hidden pocket in every costume' });
  ch.journal = { entries: [{ id: 1, title: 'Session 1', text: 'They met the Iron Court and lost badly.' }] };
  ch.portrait = { seed: 3, image: `data:image/png;base64,${'A'.repeat(4000)}`, aiSaved: true };
  ch.rosterId = 'r-1'; ch.savedAt = '2026-01-01';
  assert.equal(characterKey(R, ch), null, 'no short key once edited');
  const found = await keyFor(R, ch);
  assert.equal(found.kind, 'edits');
  assert.ok(isKey(found.key) && found.key.startsWith('DCUE1.DCUK1.'), found.key);
  assert.ok(found.key.length < 1000, `seed + edits stays short: ${found.key.length}`);
  const { character: back, edited, versionMatch } = await fromKey(R, found.key);
  assert.ok(edited && versionMatch);
  assert.equal(back.abilities.Fighting, ch.abilities.Fighting);
  assert.equal(back.notes, 'Hates Mondays.');
  assert.equal(back.advantages.at(-1).param, 'A hidden pocket in every costume');
  assert.equal(back.journal.entries.length, 1);
  assert.equal(back.bio.summary, ch.bio.summary);
  assert.equal(back.portrait.image, undefined, 'pictures stay home');
  assert.equal(back.portrait.seed, 3);
  assert.equal(back.rosterId, undefined);
  assert.equal((await fromKey(R, found.key)).character.seed, 'key-edits', 'the seed travels so the copy can be re-keyed');
  assert.equal((await keyFor(R, back)).key, found.key, 'the rebuilt copy keys the same');
  // people from a bio key the same way once edited
  const p = ch.bio.people[0];
  const person = fromKeySync(R, personKey(ch, p, 'person')).character;
  person.identity.occupation = 'Retired';
  const pk = await keyFor(R, person);
  assert.ok(pk.key.startsWith('DCUE1.DCUP1.'));
  assert.equal((await fromKey(R, pk.key)).character.identity.occupation, 'Retired');
  // exact keys still open through fromKey
  assert.equal((await fromKey(R, characterKey(R, generateCharacter(R, { seed: 'key-edits' })))).edited, false);
});

test('a character with no seed has no key at all (the share code carries it)', async () => {
  const { keyFor } = await import('../src/engine/keys.js');
  assert.equal(await keyFor(R, { pl: 10, abilities: {}, defenses: {}, skills: [], advantages: [], powers: [] }), null);
});
