import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter, generateTeam, rerollIdentity } from '../src/engine/generator.js';
import { costBreakdown, powerCost } from '../src/engine/costs.js';
import { checkLimits } from '../src/engine/limits.js';
import { randomPower, costMath, availableModifiers } from '../src/engine/powersmith.js';

const strip = (c) => { const { createdAt, ...rest } = c; return rest; };

function assertLegalAndExact(c) {
  const cost = costBreakdown(c, R);
  const errors = checkLimits(c, R).filter((i) => i.severity === 'error');
  assert.deepEqual(errors, [], `${c.identity.codename} (${c.seed})`);
  assert.equal(cost.total, c.pl * 15, `${c.identity.codename} (${c.seed}) spends ${cost.total}`);
}

test('1500 random characters are all legal and spend exactly 15 x PL', () => {
  for (let i = 0; i < 1500; i++) assertLegalAndExact(generateCharacter(R, { seed: `prop-${i}`, chaos: (i % 11) / 10 }));
});

test('every archetype builds at every PL from 1 to 20', () => {
  for (const a of R.raw.archetypes) {
    for (let pl = 1; pl <= 20; pl++) assertLegalAndExact(generateCharacter(R, { seed: `${a.id}-${pl}`, archetype: a.id, pl }));
  }
});

test('every theme works with a compatible archetype', () => {
  for (const t of R.raw.themes) {
    for (let i = 0; i < 6; i++) {
      const c = generateCharacter(R, { seed: `${t.id}-${i}`, theme: t.id });
      assert.equal(c.theme.id, t.id);
      assertLegalAndExact(c);
    }
  }
});

test('constructs have no Stamina and are immune to Fortitude effects', () => {
  for (let i = 0; i < 40; i++) {
    const c = generateCharacter(R, { seed: `robot-${i}`, archetype: i % 2 ? 'robot' : 'android', pl: 8 + (i % 6) });
    assert.equal(c.abilities.Stamina, null);
    assert.ok(c.powers.some((p) => p.effect === 'Immunity' && p.rank === 30));
    if (c.archetype.id === 'robot') { assert.equal(c.abilities.Intellect, null); assert.equal(c.abilities.Presence, null); }
    assertLegalAndExact(c);
  }
});

test('the same seed and options give the same character', () => {
  const a = generateCharacter(R, { seed: 'repeat-me', pl: 10 });
  const b = generateCharacter(R, { seed: 'repeat-me', pl: 10 });
  assert.deepEqual(strip(a), strip(b));
});

test('rerolling the identity keeps the build', () => {
  const a = generateCharacter(R, { seed: 'keep-build' });
  const b = rerollIdentity(R, a, 'new-name');
  assert.deepEqual(b.powers, a.powers);
  assert.deepEqual(b.abilities, a.abilities);
  assert.notEqual(b.identity.realName + b.identity.codename, a.identity.realName + a.identity.codename);
});

test('teams have distinct archetypes and a name', () => {
  const team = generateTeam(R, { seed: 'team-1', size: 5, pl: 10 });
  assert.equal(team.members.length, 5);
  assert.equal(new Set(team.members.map((m) => m.archetype.id)).size, 5);
  assert.ok(team.name.length > 3);
});

test('random custom powers only use modifiers whose requirements they meet', () => {
  for (let i = 0; i < 400; i++) {
    const p = randomPower(R, { seed: i, pl: 10 });
    assert.ok(powerCost(p, R) >= 1);
    const math = costMath(p, R);
    assert.equal(math.total, powerCost(p, R));
    for (const kind of ['extra', 'flaw']) {
      for (const m of kind === 'extra' ? p.extras : p.flaws) {
        const without = { ...p, [kind === 'extra' ? 'extras' : 'flaws']: (kind === 'extra' ? p.extras : p.flaws).filter((x) => x !== m) };
        const allowed = availableModifiers(without, R, kind).map((x) => x.name);
        assert.ok(allowed.includes(m.name) || m.name === 'Area', `${p.name}: ${m.name} not allowed on ${p.effect}`);
      }
    }
  }
});
