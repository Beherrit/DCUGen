import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { rogueCandidates, makeRogue, heroProfile } from '../src/engine/rogues.js';
import { checkLimits } from '../src/engine/limits.js';
import { deriveAll } from '../src/engine/derive.js';

const hero = () => ({ ...generateCharacter(R, { seed: 'rg1', pl: 10, alignment: 'hero' }), rosterId: 'r-hero' });

test('candidates come from the bio, enemies and rivals first', () => {
  const h = hero();
  const c = rogueCandidates([h]);
  assert.ok(c.length >= 2);
  assert.ok(['enemy', 'rival'].includes(c[0].turn));
  assert.ok(c.every((x) => x.hero === h));
});

test('a rogue is a legal villain built as the hero foil, with the shared past', () => {
  const h = hero();
  const { person } = rogueCandidates([h])[0];
  const r = makeRogue(R, h, person);
  const v = r.ch;
  assert.equal(v.alignment, 'villain');
  assert.equal(v.identity.realName, person.name);
  assert.equal(v.foilOf.rosterId, 'r-hero');
  assert.match(v.notes, new RegExp(person.name));
  assert.ok(v.complications.some((x) => /Obsession/.test(x.type)));
  assert.deepEqual(checkLimits(v, R).filter((i) => i.severity === 'error'), []);
  const prof = heroProfile(h, R);
  const main = deriveAll(v, R).attacks.find((a) => a.name !== 'Unarmed');
  if (prof.weakest === 'Will' || prof.weakest === 'Fortitude') assert.match(main.resistance || '', new RegExp(prof.weakest));
  // made once: it drops off the list
  assert.ok(!rogueCandidates([h], [v]).some((x) => x.person.name === person.name));
});

test('reshaping the main attack drops modifiers that only fit the old effect', () => {
  for (let i = 0; i < 40; i++) {
    const h = { ...generateCharacter(R, { seed: `rgx${i}`, pl: 10, alignment: 'hero' }), rosterId: `r${i}` };
    const person = rogueCandidates([h], [])[0]?.person || { name: `Foe ${i}`, relation: 'enemy' };
    const { ch } = makeRogue(R, h, person);
    for (const p of ch.powers || []) {
      for (const m of p.extras || []) assert.ok(R.hasModifier('extra', m.name, p.effect), `${m.name} on ${p.effect}`);
      for (const m of p.flaws || []) assert.ok(R.hasModifier('flaw', m.name, p.effect), `${m.name} on ${p.effect}`);
    }
  }
});
