import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES as R } from '../src/engine/index.js';
import { companionBudget, asCompanion, blankCompanion, suggestedPl } from '../src/engine/companions.js';
import { catalogToCharacter } from '../src/engine/catalog.js';
import { generateCharacter } from '../src/engine/generator.js';
import { costBreakdown } from '../src/engine/costs.js';
import { keyFor, fromKey } from '../src/engine/keys.js';

const load = () => JSON.parse(fs.readFileSync(new URL('./fixtures/shadowshot.json', import.meta.url)));

test('a sidekick is paid for by the Sidekick advantage: 5 power points per rank', () => {
  const owner = load();
  const kid = asCompanion(generateCharacter(R, { seed: 'kid', pl: 1 }), 'sidekick');
  kid.identity.codename = 'Spark';
  let b = companionBudget(owner, kid, R);
  assert.equal(b.ok, false);
  assert.match(b.message, /needs the Sidekick advantage/);
  owner.advantages.push({ name: 'Sidekick', rank: 2, param: 'Spark' });
  b = companionBudget(owner, kid, R);
  assert.equal(b.budget, 10);
  assert.equal(b.cost, costBreakdown(kid, R).total);
  assert.equal(b.ok, b.cost <= 10);
  owner.advantages.find((a) => a.name === 'Sidekick').rank = 10;
  assert.equal(companionBudget(owner, kid, R).ok, true);
});

test('a minion is 15 per rank and uses the minion rules; an animal companion has no budget', () => {
  const owner = load();
  const goon = asCompanion(blankCompanion(3, 'Goon'), 'minion');
  assert.equal(goon.minion, true);
  owner.advantages.push({ name: 'Minion', rank: 3, param: 'Goon' });
  assert.equal(companionBudget(owner, goon, R).budget, 45);
  const wolf = asCompanion(catalogToCharacter(Object.values(R.raw.catalog).flat().find((e) => /wolf/i.test(e.name))), 'companion');
  const b = companionBudget(owner, wolf, R);
  assert.equal(b.budget, null);
  assert.equal(b.ok, true);
});

test('companions never carry roster bookkeeping or their own companions', () => {
  const c = asCompanion({ ...blankCompanion(2), rosterId: 'r1', folder: 'Earth-2', companions: [{}] }, 'sidekick');
  assert.equal(c.rosterId, undefined);
  assert.equal(c.folder, undefined);
  assert.equal(c.companions, undefined);
  assert.ok(c.id);
  assert.equal(suggestedPl({ pl: 10 }, 'sidekick', 9), 3);
});

test('companions travel with the character key', async () => {
  const ch = generateCharacter(R, { seed: 'with-pet', pl: 8 });
  ch.companions = [asCompanion(blankCompanion(2, 'Ace'), 'companion')];
  const found = await keyFor(R, ch);
  const back = (await fromKey(R, found.key)).character;
  assert.equal(back.companions.length, 1);
  assert.equal(back.companions[0].identity.codename, 'Ace');
});

test('a sidekick must have fewer power points than the hero (DCA 78)', () => {
  const owner = { pl: 10, abilities: { Strength: 2 }, defenses: {}, skills: [], advantages: [{ name: 'Sidekick', rank: 40, param: 'Twin' }], powers: [], devices: [], equipment: [], identity: { codename: 'Hero' } };
  const twin = asCompanion({ ...blankCompanion(10, 'Twin'), abilities: { Strength: 30 } }, 'sidekick');
  const b = companionBudget(owner, twin, R);
  assert.equal(b.ok, false);
  assert.match(b.message, /must be less than Hero's/);
});

test('minions cannot have minions, and a rolled minion gives them up (DCA 77)', () => {
  const owner = load();
  owner.advantages.push({ name: 'Minion', rank: 6, param: 'Boss' });
  const boss = { ...blankCompanion(5, 'Boss'), advantages: [{ name: 'Minion', rank: 1 }], powers: [{ name: 'Call Rats', effect: 'Summon', rank: 2, extras: [], flaws: [] }] };
  const b = companionBudget(owner, { ...boss, companionKind: 'minion', identity: { codename: 'Boss' } }, R);
  assert.equal(b.ok, false);
  assert.match(b.message, /Minions can't have minions/);
  const made = asCompanion(boss, 'minion');
  assert.deepEqual(made.advantages, []);
  assert.deepEqual(made.powers, []);
  assert.equal(companionBudget(owner, made, R).problems.length, 0);
});

test('a summoned creature is paid for by a Summon power: 15 points per rank (DCA 118)', () => {
  const owner = { ...load(), pl: 10 };
  const rat = asCompanion(blankCompanion(2, 'Giant Rat'), 'summon');
  assert.equal(rat.minion, true);
  let b = companionBudget(owner, rat, R);
  assert.equal(b.ok, false);
  assert.match(b.message, /needs a Summon power/);
  owner.powers = [...(owner.powers || []), { name: 'Rat King', effect: 'Summon', rank: 2, detail: 'summons a giant rat', extras: [], flaws: [] }];
  b = companionBudget(owner, rat, R);
  assert.equal(b.budget, 30);
  assert.equal(b.power.name, 'Rat King');
  assert.equal(suggestedPl(owner, 'summon'), 2);
  rat.abilities.Strength = 20;
  assert.equal(companionBudget(owner, rat, R).ok, false);
});

test('a follower over the series power level is flagged', () => {
  const owner = load();
  owner.advantages.push({ name: 'Minion', rank: 20, param: 'Big' });
  const big = asCompanion(blankCompanion(owner.pl + 2, 'Big'), 'minion');
  assert.match(companionBudget(owner, big, R).message, /over the series power level/);
});
