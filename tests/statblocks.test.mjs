// The engine must reproduce the point costs printed in DC Adventures Heroes & Villains Vol. 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES as R } from '../src/engine/index.js';
import { costBreakdown, powerCost } from '../src/engine/costs.js';

const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/hv1_statblocks.json', import.meta.url), 'utf8'));
const P = (effect, rank, more = {}) => ({ name: more.name || effect, effect, rank, extras: [], flaws: [], ...more });

for (const c of fixtures) {
  test(`${c.name}: abilities, skills and advantages match the printed totals`, () => {
    const ch = {
      pl: c.pl,
      abilities: c.abilities_purchased,
      defenses: {},
      skills: c.skills.map((s) => ({ name: s.name, spec: s.spec, ranks: s.ranks })),
      advantages: c.advantages.filter((a) => !a.granted_by_power).map((a) => ({ name: a.name, rank: a.rank || 1, param: a.param })),
      powers: [],
    };
    const cost = costBreakdown(ch, R);
    assert.equal(cost.abilities, c.totals_printed.abilities, 'abilities');
    assert.equal(cost.skills, c.totals_printed.skills, 'skills');
    assert.equal(cost.advantages, c.totals_printed.advantages, 'advantages');
  });
}

test('Abra Kadabra: Technological Magic array costs 56 + 5 Alternate Effects = 61', () => {
  const mindOverMatter = P('Move Object', 11, {
    range: 'Perception',
    extras: [{ name: 'Damaging' }, { name: 'Area', option: 'Perception' }, { name: 'Precise' }],
    alternates: [
      P('Affliction', 11, { name: 'Hypno-Ray', range: 'Perception', extras: [{ name: 'Area', option: 'Cone' }, { name: 'Cumulative' }, { name: 'Reversible' }] }),
      P('Affliction', 11, { name: 'Nanotech Transformation', range: 'Perception', extras: [{ name: 'Progressive' }, { name: 'Reversible' }] }),
      P('Teleport', 11, { name: 'Disappearing Act', extras: [{ name: 'Accurate' }, { name: 'Easy' }, { name: 'Extended' }, { name: 'Increased Mass' }] }),
      P('Feature', 1, { name: 'Transmutation (abbreviated)' }),
      P('Feature', 1, { name: 'Teleport Ray (abbreviated)' }),
    ],
  });
  assert.equal(powerCost({ ...mindOverMatter, alternates: [] }, R), 56);
  assert.equal(powerCost(mindOverMatter.alternates[0], R), 56); // AE may cost up to the primary
  assert.equal(powerCost(mindOverMatter, R), 61);
  assert.equal(61, fixtures.find((x) => x.name === 'Abra Kadabra').totals_printed.powers);
});

test('Captain Marvel: powers total 110', () => {
  const powers = [
    P('Enhanced Trait', 7, { name: 'Wisdom of Solomon', option: 'Awareness', linked: [P('Enhanced Trait', 4, { option: 'Jack-of-all-trades' })] }),
    P('Enhanced Trait', 4, { name: 'Strength of Hercules', option: 'Strength', flaws: [{ name: 'Limited', detail: 'to lifting' }] }),
    // Stamina of Atlas: Protection 4, Impervious Toughness 19, Immunity 10 (printed 33)
    P('Protection', 4, { name: 'Stamina of Atlas', linked: [P('Feature', 19, { name: 'Impervious Toughness 19' }), P('Immunity', 10)] }),
    // Courage of Achilles: Enhanced Fighting 4, Enhanced Will 5, Impervious Will 10 (printed 23)
    P('Enhanced Trait', 4, { name: 'Courage of Achilles', option: 'Fighting', linked: [P('Enhanced Trait', 5, { option: 'Will' }), P('Feature', 10, { name: 'Impervious Will 10' })] }),
    P('Flight', 15, { name: 'Speed of Mercury', alternates: [
      P('Movement', 1, { name: 'Dimensional Travel' }),
      P('Quickness', 15, { linked: [P('Speed', 15)] }),
    ] }),
  ];
  assert.deepEqual(powers.map((p) => powerCost(p, R)), [18, 4, 33, 23, 32]);
  assert.equal(powers.reduce((s, p) => s + powerCost(p, R), 0), fixtures.find((x) => x.name === 'Captain Marvel').totals_printed.powers);
});

test('The Flash: powers total 119', () => {
  const powers = [
    P('Immunity', 1, { name: 'Frictionless Aura' }),
    P('Movement', 1, { name: 'Run On Water', flaws: [{ name: 'Limited', detail: 'while moving' }] }),
    P('Movement', 2, { name: 'Run Up Walls', flaws: [{ name: 'Limited', detail: 'while moving' }] }),
    P('Enhanced Trait', 12, { name: 'Super-Speed', option: 'Dodge', linked: [
      P('Enhanced Trait', 12, { option: 'Parry' }),
      P('Enhanced Trait', 27, { option: 'Improved Initiative' }), // 27 advantage ranks
      P('Quickness', 20), P('Speed', 20),
    ] }),
    P('Move Object', 10, { name: 'Air Control', range: 'Close', extras: [{ name: 'Area', option: 'Cone' }], alternates: [
      P('Feature', 1, { name: 'Air Cushion' }),
      P('Affliction', 5, { name: 'Vacuum', extras: [{ name: 'Area', option: 'Burst' }, { name: 'Cumulative' }, { name: 'Concentration' }] }),
      P('Insubstantial', 4, { name: 'Vibration' }),
      P('Move Object', 10, { name: 'Whirlwind', range: 'Close', extras: [{ name: 'Area', option: 'Burst' }] }),
    ] }),
  ];
  assert.equal(powerCost(powers[3], R), 91);
  assert.equal(powerCost({ ...powers[4], alternates: [] }, R), 20);
  assert.equal(powerCost(powers[4].alternates[1], R), 20);
  assert.equal(powers.reduce((s, p) => s + powerCost(p, R), 0), 119);
});

test('Green Arrow: bow array is 10 + 5 Alternate Effects', () => {
  const bow = P('Damage', 5, { name: 'Standard Arrow', range: 'Ranged', alternates: [
    P('Movement', 1, { name: 'Cable Arrow' }),
    P('Affliction', 5, { name: 'Flare Arrow', range: 'Ranged' }),
    P('Affliction', 3, { name: 'Knockout Gas Arrow', range: 'Ranged', extras: [{ name: 'Area', option: 'Burst' }] }),
    P('Affliction', 3, { name: 'Net Arrow', range: 'Ranged' }),
    P('Affliction', 3, { name: 'Stun Arrow', range: 'Ranged' }),
  ] });
  assert.equal(powerCost(bow, R), 15);
});
