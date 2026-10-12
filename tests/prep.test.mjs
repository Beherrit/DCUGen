import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { prepSession } from '../src/engine/prep.js';
import { makeNemesis } from '../src/engine/nemesis.js';
import { checkLimits } from '../src/engine/limits.js';

const party = () => ['p1', 'p2', 'p3'].map((s) => ({ ...generateCharacter(R, { seed: s, pl: 10, alignment: 'hero' }), rosterId: `r-${s}` }));

test('a session from the party: villain from a bio, minions, four scenes that share the spotlight', () => {
  const heroes = party();
  const p = prepSession(R, { heroes, seed: 'night-1', n: 20, quiet: [heroes[2].identity.codename] });
  assert.equal(p.scenes.length, 4);
  assert.deepEqual(p.scenes.map((s) => s.kind), ['hook', 'investigation', 'action', 'climax']);
  assert.equal(p.scenes[0].spotlight, heroes[2].identity.codename, 'the quiet player gets the hook');
  assert.ok(p.villain.ch.foilOf, 'someone from a hero past');
  assert.ok(p.minions.count >= 6);
  assert.equal(typeof p.villain.odds, 'number');
  assert.ok(p.scenes[1].checks.every((c) => c.dc >= 20));
  assert.equal(typeof p.rumor, 'string');
});

test('a recurring villain with a scheme in progress comes first; the saved one is untouched', () => {
  const heroes = party();
  const nem = { ...makeNemesis(generateCharacter(R, { seed: 'nem', pl: 10, alignment: 'villain' }), { scheme: 'the Null Bomb' }), rosterId: 'r-nem' };
  const p = prepSession(R, { heroes, roster: [nem], seed: 'night-2', n: 20 });
  assert.equal(p.villain.base, nem);
  assert.match(p.villain.why, /Null Bomb/);
  if (p.villain.k) assert.equal(p.villain.ch.rosterId, undefined, 'tonight tuned copy is separate');
  assert.equal(nem.rosterId, 'r-nem');
});

test('same seed, same session', () => {
  const heroes = party();
  const a = prepSession(R, { heroes, seed: 'same', n: 10, tune: false });
  const b = prepSession(R, { heroes, seed: 'same', n: 10, tune: false });
  assert.deepEqual(a.scenes.map((s) => s.text), b.scenes.map((s) => s.text));
  assert.deepEqual(checkLimits(a.villain.ch, R).filter((i) => i.severity === 'error' && i.rule !== 'budget'), []);
});
