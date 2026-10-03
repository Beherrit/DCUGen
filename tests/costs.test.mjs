import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { indexRules } from '../src/engine/rules.js';
import { effectCost, powerCost, deviceCost, costBreakdown } from '../src/engine/costs.js';

const P = (effect, rank, more = {}) => ({ name: effect, effect, rank, ...more });

test('book example: 2/rank effect, +1 extra, -2 flaw, 8 ranks, +2 flat extra, -1 flat flaw = 9 points', () => {
  // Synthetic rules mirroring the worked example in the Modifiers chapter.
  const SR = indexRules({
    effects: [{ name: 'Test', cost: 2, range: 'Personal' }],
    modifiers: {
      extras: [
        { name: 'PlusOne', cost_type: 'per_rank', value: 1 },
        { name: 'FlatTwo', cost_type: 'flat', value: 2 },
      ],
      flaws: [
        { name: 'MinusTwo', cost_type: 'per_rank', value: 2 },
        { name: 'FlatOne', cost_type: 'flat', value: 1 },
      ],
    },
  });
  const p = P('Test', 8, { extras: [{ name: 'PlusOne' }], flaws: [{ name: 'MinusTwo' }] });
  assert.equal(effectCost(p, SR).total, 8);
  p.extras.push({ name: 'FlatTwo' });
  p.flaws.push({ name: 'FlatOne' });
  assert.equal(effectCost(p, SR).total, 9);
});

test('fractional costs: 0 per rank buys 2 ranks per point, -1 buys 3 per point', () => {
  const limited = P('Damage', 6, { flaws: [{ name: 'Limited' }] });
  assert.equal(effectCost(limited, R).perRank, 0);
  assert.equal(effectCost(limited, R).total, 3);
  const twice = P('Damage', 6, { flaws: [{ name: 'Limited' }, { name: 'Unreliable' }] });
  assert.equal(effectCost(twice, R).total, 2);
  assert.equal(effectCost(P('Damage', 7, { flaws: [{ name: 'Limited' }] }), R).total, 4); // rounds up
});

test('range changes: Close Damage made Ranged or Perception', () => {
  assert.equal(powerCost(P('Damage', 10), R), 10);
  assert.equal(powerCost(P('Damage', 10, { range: 'Ranged' }), R), 20);
  assert.equal(powerCost(P('Damage', 10, { range: 'Perception' }), R), 30);
  assert.equal(powerCost(P('Blast', 10), R), 20);
  // Ranged effect reduced to Close is -1 per rank
  assert.equal(powerCost(P('Nullify', 8, { range: 'Close' }), R), 4);
});

test('extras: Area, Accurate (flat per rank), Multiattack', () => {
  assert.equal(powerCost(P('Damage', 8, { range: 'Ranged', extras: [{ name: 'Area', option: 'Burst' }] }), R), 24);
  assert.equal(powerCost(P('Blast', 10, { extras: [{ name: 'Accurate', steps: 2 }] }), R), 22);
  assert.equal(powerCost(P('Blast', 10, { extras: [{ name: 'Multiattack' }] }), R), 30);
});

test('alternate effects add 1 point each, 2 if dynamic', () => {
  const p = P('Blast', 10, { alternates: [P('Damage', 10, { name: 'Alt 1', range: 'Ranged' }), P('Affliction', 10, { name: 'Alt 2', range: 'Ranged' })] });
  assert.equal(powerCost(p, R), 22);
  assert.equal(powerCost({ ...p, dynamic: true }, R), 24);
});

test('removable devices: -1 per 5 points, easily removable -2 per 5', () => {
  const powers = [P('Protection', 8), P('Flight', 6)]; // 8 + 12 = 20
  assert.deepEqual(deviceCost({ kind: 'removable', powers }, R), { raw: 20, discount: 4, total: 16 });
  assert.equal(deviceCost({ kind: 'easily', powers }, R).total, 12);
});

test('effect-specific modifiers take priority (Teleport Accurate is +1 per rank)', () => {
  assert.equal(powerCost(P('Teleport', 8, { extras: [{ name: 'Accurate' }] }), R), 24);
  assert.equal(powerCost(P('Affliction', 10, { range: 'Ranged', extras: [{ name: 'Cumulative' }] }), R), 30);
});

test('Enhanced Trait costs as the base trait', () => {
  assert.equal(powerCost(P('Enhanced Trait', 5, { option: 'Strength' }), R), 10);
  assert.equal(powerCost(P('Enhanced Trait', 5, { option: 'Dodge' }), R), 5);
  assert.equal(powerCost(P('Enhanced Trait', 5, { option: 'Perception' }), R), 3);
});

test('Permanent Growth is +0 (the effect-specific extra), so Growth stays 2 per rank', () => {
  assert.equal(powerCost(P('Growth', 4, { extras: [{ name: 'Permanent' }] }), R), 8);
});

test('cost breakdown: abilities 2/rank, skills 1 per 2 ranks rounded up, defenses 1/rank, absent abilities -10', () => {
  const ch = {
    pl: 10,
    abilities: { Strength: 2, Stamina: 2, Agility: 2, Dexterity: 2, Fighting: 2, Intellect: 2, Awareness: 2, Presence: 2 },
    defenses: { Dodge: 4, Parry: 4, Fortitude: 3, Will: 3 },
    skills: [{ name: 'Perception', ranks: 5 }, { name: 'Stealth', ranks: 4 }],
    advantages: [{ name: 'Close Attack', rank: 2 }, { name: 'Power Attack', rank: 1 }],
    powers: [P('Blast', 10)],
  };
  const c = costBreakdown(ch, R);
  assert.equal(c.abilities, 32);
  assert.equal(c.skills, 5);
  assert.equal(c.skillRanks, 9);
  assert.equal(c.defenses, 14);
  assert.equal(c.advantages, 3);
  assert.equal(c.powers, 20);
  assert.equal(c.total, 74);
  assert.equal(costBreakdown({ ...ch, abilities: { ...ch.abilities, Stamina: null } }, R).abilities, 32 - 4 - 10);
});
