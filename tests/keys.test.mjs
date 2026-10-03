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
