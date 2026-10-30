import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { hasFairAttack } from '../src/engine/genattack.js';
import { costBreakdown } from '../src/engine/costs.js';
import { checkLimits } from '../src/engine/limits.js';
import { attacks } from '../src/engine/derive.js';

const PER_ARCHETYPE = 200;
const PLS = [6, 8, 10, 10, 10, 12, 14];

function legalAndExact(c) {
  const errors = checkLimits(c, R).filter((i) => i.severity === 'error');
  assert.deepEqual(errors, [], `${c.identity.codename} (${c.seed}) is illegal`);
  assert.equal(costBreakdown(c, R).total, c.pl * 15, `${c.identity.codename} (${c.seed}) spends the wrong total`);
}

/** The ask: a non-Unarmed attack, or an Unarmed within 4 of the limits (damage rank near PL, bonus + rank near 2 x PL). */
function fairAttack(c) {
  const list = attacks(c, R);
  if (list.some((a) => a.name !== 'Unarmed')) return true;
  const u = list[0];
  return u.rank >= c.pl - 4 && u.rank + u.bonus >= 2 * c.pl - 4;
}

test(`${PER_ARCHETYPE} characters of every archetype have a real attack and are legal`, () => {
  for (const a of R.raw.archetypes) {
    for (let i = 0; i < PER_ARCHETYPE; i++) {
      const c = generateCharacter(R, { seed: `fair-${a.id}-${i}`, archetype: a.id, pl: PLS[i % PLS.length] });
      legalAndExact(c);
      assert.ok(fairAttack(c), `${a.id} ${c.seed} (PL ${c.pl}) has only a weak Unarmed: ${JSON.stringify(attacks(c, R).map((x) => [x.name, x.rank, x.bonus]))}`);
      assert.ok(hasFairAttack(c, R), `${a.id} ${c.seed} fails the generator's own check`);
    }
  }
});

test('martial artists and crime fighters at PL 10 each end with a weapon, a strike, or a strong Unarmed', () => {
  let strikes = 0;
  let weapons = 0;
  for (const id of ['martialartist', 'crimefighter']) {
    for (let i = 0; i < PER_ARCHETYPE; i++) {
      const c = generateCharacter(R, { seed: `sa-${id}-${i}`, archetype: id, pl: 10 });
      const best = attacks(c, R).map((a) => a.rank + (a.bonus ?? 0)).reduce((m, v) => Math.max(m, v), 0);
      assert.ok(fairAttack(c), `${id} ${c.seed}`);
      assert.ok(best >= 14, `${id} ${c.seed} best attack only reaches ${best}`);
      if (c.powers.some((p) => p.effect === 'Damage' && p.strengthBased && p.role === 'attack')) strikes++;
      if (c.equipment.some((e) => e.attack)) weapons++;
    }
  }
  assert.ok(strikes > 0, 'martial artists get Strength-based strikes');
  assert.ok(weapons > 0, 'crime fighters get weapons');
});

test('a built strike is named for the style and sits near the PL limit', () => {
  let seen = 0;
  for (let i = 0; i < PER_ARCHETYPE && seen < 5; i++) {
    const c = generateCharacter(R, { seed: `sa-martialartist-${i}`, archetype: 'martialartist', pl: 10 });
    const strike = c.powers.find((p) => p.effect === 'Damage' && p.strengthBased && p.role === 'attack' && /Strikes$/.test(p.name));
    if (!strike) continue;
    seen++;
    const a = attacks(c, R).find((x) => x.name === strike.name);
    assert.ok(a.rank >= 7 && a.rank + a.bonus <= 20, `${strike.name}: rank ${a.rank} bonus ${a.bonus}`);
    assert.equal(strike.attackSkill, 'Unarmed');
  }
  assert.ok(seen > 0, 'at least one martial artist needed a strike');
});

test('hasFairAttack rejects a weak lone Unarmed and accepts a strong one or any other attack', () => {
  const weak = generateCharacter(R, { seed: 'sa-crimefighter-0', archetype: 'crimefighter', pl: 10 });
  const bare = { ...weak, powers: [], devices: [], equipment: [], abilities: { ...weak.abilities, Strength: 2 } };
  assert.equal(hasFairAttack(bare, R), false);
  assert.equal(hasFairAttack({ ...bare, abilities: { ...bare.abilities, Strength: 12 } }, R), true);
  assert.equal(hasFairAttack({ ...bare, equipment: [{ name: 'Club', cost: 2, attack: { kind: 'close', rank: 2, strengthBased: true } }] }, R), true);
});

test('robots and androids always carry a built-in weapon', () => {
  for (const id of ['robot', 'android']) {
    for (let i = 0; i < 60; i++) {
      const c = generateCharacter(R, { seed: `built-in-${id}-${i}`, archetype: id, pl: 10 });
      assert.ok(attacks(c, R).some((a) => a.name !== 'Unarmed' && a.power), `${id} ${c.seed} has no power attack`);
    }
  }
});
