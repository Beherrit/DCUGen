import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { catalogEntries } from '../src/engine/workshop.js';
import { catalogToCharacter } from '../src/engine/catalog.js';
import { portraitPrompt, portraitUrl, portraitOf, setPortrait } from '../src/engine/portrait.js';
import { allPowers } from '../src/engine/derive.js';
import { personKey, fromKeySync } from '../src/engine/keys.js';
import { checkLimits, isNpc } from '../src/engine/limits.js';

test('portrait prompts use the sheet and the bio, and the url is stable for a seed', () => {
  const ch = generateCharacter(R, { seed: 'por-1', pl: 10 });
  const prompt = portraitPrompt(ch);
  assert.ok(prompt.includes(ch.identity.codename));
  assert.ok(/comic book (superhero|supervillain) portrait/.test(prompt));
  assert.ok(prompt.includes('costume:'));
  assert.ok(!/undefined|null|NaN/.test(prompt));
  const a = portraitOf(ch);
  assert.ok(a.url.startsWith('https://image.pollinations.ai/prompt/'));
  assert.ok(a.url.includes('seed=1'));
  setPortrait(ch, { seed: 42 });
  assert.ok(portraitOf(ch).url.includes('seed=42'));
  setPortrait(ch, { prompt: 'a cat in a cape' });
  assert.equal(portraitOf(ch).prompt, 'a cat in a cape');
  assert.ok(portraitOf(ch).custom);
  setPortrait(ch, { prompt: '' });
  assert.ok(!portraitOf(ch).custom);
  assert.equal(portraitUrl('x y', { seed: 3 }), 'https://image.pollinations.ai/prompt/x%20y?width=512&height=640&seed=3&nologo=true&model=flux');
  const beast = catalogToCharacter(catalogEntries(R).find((e) => /dragon/i.test(e.name)));
  assert.ok(!/comic book superhero/.test(portraitPrompt(beast)));
});

test('random rolls never buy the same non-stacking effect twice', () => {
  const skip = new Set(['Enhanced Trait', 'Feature', 'Immunity', 'Senses', 'Movement', 'Damage', 'Affliction']);
  for (let i = 0; i < 150; i++) {
    const ch = generateCharacter(R, { seed: `nodup-${i}` });
    const seen = new Set();
    for (const { power: p } of allPowers(ch, { includeAlternates: false })) {
      if (skip.has(p.effect)) continue;
      assert.ok(!seen.has(p.effect), `${ch.seed}: ${p.effect} twice`);
      seen.add(p.effect);
    }
  }
});

test('people from a bio are supporting characters: no budget error, limits still checked', () => {
  let n = 0;
  for (let i = 0; i < 25; i++) {
    const ch = generateCharacter(R, { seed: `npc-${i}`, pl: 4 + (i % 8) });
    for (const p of ch.bio.people || []) {
      const c = fromKeySync(R, personKey(ch, p, 'person')).character;
      n++;
      assert.ok(checkLimits(c, R).every((x) => x.severity !== 'error'), `${p.name}: ${checkLimits(c, R).map((x) => x.message).join('; ')}`);
    }
  }
  assert.ok(n > 20);
  assert.ok(isNpc({ npc: true }) && isNpc({ minion: true }) && !isNpc({ pl: 10 }));
});
