import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { costBreakdown } from '../src/engine/costs.js';
import { checkLimits } from '../src/engine/limits.js';
import { characterKey, rollKey } from '../src/engine/keys.js';
import { emptyPack, makeTheme, makeArchetype, creatureFromCharacter, validatePack, applyPacks, clearPacks, usesHomebrew } from '../src/engine/homebrew.js';

const legal = (c) => {
  assert.deepEqual(checkLimits(c, R).filter((i) => i.severity === 'error'), [], `${c.identity.codename} (${c.seed})`);
  assert.equal(costBreakdown(c, R).total, c.pl * 15);
};

function samplePack() {
  const pack = emptyPack('Ravensport');
  pack.themes.push(makeTheme(R, pack, { base: 'fire', name: 'Hellfire', color: '#7a1fa2', descriptors: 'hellfire, brimstone', words: 'Brimstone, Hellion', adjectives: 'Infernal', powers: { 0: { names: 'Hellfire Blast, Brimstone Bolt' } } }));
  pack.archetypes.push(makeArchetype(R, pack, { base: 'paragon', name: 'Fallen Angel', blurb: 'Wings, a burning sword and a grudge.', abilities: { Presence: '3..6' }, themes: { [pack.themes[0].id]: 5, light: 2 } }));
  return pack;
}

test('themes and archetypes made from built-in ones', () => {
  const pack = samplePack();
  const [t] = pack.themes; const [a] = pack.archetypes;
  assert.match(t.id, /^hb-ravensport-hellfire$/);
  assert.equal(t.base, 'fire');
  assert.deepEqual(t.codename.words, ['Brimstone', 'Hellion']);
  assert.deepEqual(t.powers[0].names, ['Hellfire Blast', 'Brimstone Bolt']);
  assert.equal(a.abilities.Presence, '3..6');
  assert.equal(a.themes[t.id], 5);
  assert.throws(() => makeTheme(R, pack, { base: 'fire', name: '' }), /name/);
  assert.throws(() => makeTheme(R, pack, { base: 'nope', name: 'X' }), /No theme/);
  assert.throws(() => makeTheme(R, pack, { base: 'fire', name: 'No attacks', powers: Object.fromEntries(R.raw.themes.find((x) => x.id === 'fire').powers.map((p, i) => [i, { off: p.role === 'attack' }])) }), /attack/);
});

test('characters rolled with a homebrew theme and archetype are legal and spend exactly 15 x PL', () => {
  const pack = samplePack();
  applyPacks(R, [pack]);
  try {
    for (let pl = 4; pl <= 14; pl += 2) {
      for (let i = 0; i < 4; i++) {
        const c = generateCharacter(R, { seed: `hb-${pl}-${i}`, pl, archetype: pack.archetypes[0].id });
        legal(c);
        const t = generateCharacter(R, { seed: `hbt-${pl}-${i}`, pl, theme: pack.themes[0].id });
        legal(t);
        assert.equal(t.theme.id, pack.themes[0].id);
        assert.ok(usesHomebrew(R, t));
        assert.equal(characterKey(R, t), null, 'a homebrew character shares as a full code');
      }
    }
  } finally { clearPacks(R); }
});

test('random rolls and seed keys are the same with or without packs', () => {
  const before = Array.from({ length: 30 }, (_, i) => generateCharacter(R, { seed: `same-${i}`, chaos: 1 }));
  applyPacks(R, [samplePack()]);
  try {
    const after = Array.from({ length: 30 }, (_, i) => generateCharacter(R, { seed: `same-${i}`, chaos: 1 }));
    for (let i = 0; i < 30; i++) {
      assert.equal(after[i].identity.codename, before[i].identity.codename);
      assert.equal(after[i].theme.id, before[i].theme.id);
      assert.ok(!usesHomebrew(R, after[i]));
      assert.equal(rollKey(after[i]), rollKey(before[i]));
    }
  } finally { clearPacks(R); }
});

test('packs load, switch off and come out cleanly; creatures join the catalog', () => {
  const pack = samplePack();
  const hero = generateCharacter(R, { seed: 'bruiser', pl: 8 });
  pack.creatures.push(creatureFromCharacter(pack, hero, { name: 'Sewer Brute', category: 'Mutants', tactics: 'Charges', weakness: 'Light' }));
  const nThemes = R.raw.themes.length; const nArch = R.raw.archetypes.length;
  assert.deepEqual(applyPacks(R, [pack]), { themes: 1, archetypes: 1, creatures: 1 });
  assert.equal(R.raw.themes.length, nThemes + 1);
  assert.equal(R.raw.archetypes.at(-1).hidden, true, 'not in random archetype picks');
  assert.equal(R.raw.catalog.homebrew[0].name, 'Sewer Brute');
  applyPacks(R, [pack]);
  assert.equal(R.raw.themes.length, nThemes + 1, 'loading again does not double up');
  applyPacks(R, [{ ...pack, enabled: false }]);
  assert.equal(R.raw.themes.length, nThemes);
  assert.equal(R.raw.archetypes.length, nArch);
  assert.equal(R.raw.catalog.homebrew, undefined);
});

test('a pack file is checked before it loads', () => {
  assert.equal(validatePack(null).ok, false);
  assert.equal(validatePack({ name: 'x' }).ok, false);
  const good = validatePack(JSON.parse(JSON.stringify(samplePack())));
  assert.equal(good.ok, true);
  assert.deepEqual(good.errors, []);
  const broken = validatePack({ kind: 'dcugen-pack', name: 'B', themes: [{ id: 'x' }], archetypes: 'no', creatures: [{ id: 'c', name: 'C', pl: 3, abilities: {} }] });
  assert.equal(broken.pack.themes.length, 0);
  assert.equal(broken.pack.creatures[0].id, 'hb-c', 'ids are kept apart from the book\'s');
  assert.match(broken.errors[0], /Theme 1/);
});
