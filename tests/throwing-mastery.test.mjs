// Throwing Mastery (Hero's Handbook p79): +1 damage per rank with thrown weapons. It applies to equipment with "thrown" or
// "throwing" in its name, category or descriptors, to Strength-based ranged attacks, and to a Damage power whose attack skill
// is the Ranged Combat specialty Throwing. The bonus joins the attack's rank on the sheet and in the fight, and stops where
// bonus plus rank would pass the power level limit. Source: src/engine/derive.js throwingBonus and attacks().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { R, dice, powerArena, who, text } from './helpers/power-arena.mjs';
import { body } from './helpers/fighters.mjs';
import { attacks, deriveAll } from '../src/engine/derive.js';
import { repairPowerRoles } from '../src/engine/repair.js';
import { checkLimits } from '../src/engine/limits.js';
import { offenseLines } from '../src/engine/render.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';

const ballista = (mastery = 3) => {
  const ch = JSON.parse(readFileSync(new URL('./fixtures/ballista.json', import.meta.url), 'utf8'));
  ch.advantages = ch.advantages.filter((a) => a.name !== 'Throwing Mastery').concat(mastery ? [{ name: 'Throwing Mastery', rank: mastery }] : []);
  return repairPowerRoles(ch, R);
};
const withMastery = (rank, extra = {}) => ({ ...body({ advantages: rank ? [{ name: 'Throwing Mastery', rank }] : [] }), ...extra });
const find = (ch, name) => attacks(ch, R).find((a) => a.name === name);
const knife = { name: 'Throwing knife', category: 'Simple Melee Weapon', attack: { kind: 'ranged', rank: 1, strengthBased: false, crit: 20 } };

test('thrown equipment gets +1 damage per rank, named by its name, its category or its descriptors', () => {
  const ch = withMastery(2, { equipment: [
    knife,
    { name: 'Boomerang', category: 'Thrown Weapon', attack: { kind: 'ranged', rank: 1, strengthBased: false, crit: 20 } },
    { name: 'Pebble', descriptors: ['thrown'], attack: { kind: 'ranged', rank: 1, strengthBased: false, crit: 20 } },
    { name: 'Longbow', category: 'Ranged Weapon', attack: { kind: 'ranged', rank: 3, strengthBased: false, crit: 20 } },
    { name: 'Throwing axe', attack: { kind: 'close', rank: 2, strengthBased: false, crit: 20 } },
  ] });
  assert.deepEqual(['Throwing knife', 'Boomerang', 'Pebble'].map((n) => find(ch, n).rank), [3, 3, 3]);
  assert.equal(find(ch, 'Throwing knife').thrown, 2);
  assert.equal(find(ch, 'Longbow').rank, 3);
  assert.equal(find(ch, 'Throwing axe').rank, 2);        // a close attack is not thrown
});

test('a Strength-based ranged attack (a thrown object) gets the bonus on top of Strength, and a Damage power with the Throwing specialty too', () => {
  const rock = { name: 'Rock', attack: { kind: 'ranged', rank: 1, strengthBased: true, crit: 20 } };
  const boulder = { name: 'Boulder toss', effect: 'Damage', rank: 2, range: 'Ranged', strengthBased: true, role: 'attack', extras: [], flaws: [] };
  const ch = withMastery(2, { equipment: [rock], powers: [boulder] });
  assert.equal(find(ch, 'Rock').rank, 1 + 4 + 2);        // rank 1 + Strength 4 + Throwing Mastery 2
  assert.equal(find(ch, 'Boulder toss').rank, 2 + 4 + 2);
  const dart = { name: 'Dart gun', effect: 'Damage', rank: 5, range: 'Ranged', attackSkill: 'Throwing', role: 'attack', extras: [], flaws: [] };
  const skilled = withMastery(2, { powers: [dart], skills: [{ name: 'Ranged Combat', spec: 'Throwing', ranks: 4 }] });
  assert.equal(find(skilled, 'Dart gun').rank, 7);
  const plainBlast = withMastery(2, { powers: [{ ...dart, name: 'Blast', attackSkill: undefined }] });
  assert.equal(find(plainBlast, 'Blast').rank, 5);       // not Strength-based, not the Throwing specialty: nothing thrown
});

test('only Damage is thrown harder: not an Affliction, and not without the advantage', () => {
  const fog = { name: 'Fog dart', effect: 'Affliction', rank: 5, range: 'Ranged', attackSkill: 'Throwing', role: 'attack', extras: [], flaws: [] };
  assert.equal(find(withMastery(2, { powers: [fog] }), 'Fog dart').rank, 5);
  assert.equal(find(withMastery(0, { equipment: [knife] }), 'Throwing knife').rank, 1);
});

test('Ballista\'s Kinetic control is Damage 12 plus 3 from Throwing Mastery, 15 on the sheet', () => {
  const k = find(ballista(), 'Kinetic control');
  assert.deepEqual([k.rank, k.thrown, k.bonus], [15, 3, 5]);
  assert.equal(find(ballista(0), 'Kinetic control').rank, 12);
  assert.match(offenseLines(ballista(), R).find((o) => o.label === 'Kinetic control').text, /Damage 15 \(incl\. \+3 Throwing Mastery\)/);
});

test('the power level limit counts the bonus as rank, and the bonus stops where it would pass the limit', () => {
  const full = ballista(3);                              // +5 attack, rank 12 + 3 = 20 = 2 x PL 10
  assert.deepEqual(checkLimits(full, R).filter((i) => i.rule === 'attack'), []);
  const greedy = ballista(5);                            // two more ranks would pass 2 x PL: they do not count
  assert.equal(find(greedy, 'Kinetic control').rank, 15);
  assert.deepEqual(checkLimits(greedy, R).filter((i) => i.rule === 'attack'), []);
  greedy.pl = 9;                                         // at PL 9 the limit is 18: 5 + 12 is 17, so only 1 of the ranks counts
  assert.equal(find(greedy, 'Kinetic control').rank, 13);
  const over = ballista(3); over.powers.find((p) => p.name === 'Kinetic control').rank = 16;   // already over the limit: no bonus, the error stays
  assert.equal(find(over, 'Kinetic control').rank, 16);
  assert.equal(checkLimits(over, R).filter((i) => i.rule === 'attack').length, 1);
});

test('in the fight the sheet and the combatant agree: Damage 15 makes the Toughness DC 30', () => {
  const b = powerArena([['bal', 'A', { ch: ballista(), hp: 0 }, { x: 0, y: 0 }], ['t', 'B', { abilities: { Fighting: 0 }, hp: 0 }, { x: 1, y: 0 }]]);
  const k = who(b, 'bal').attacks.find((a) => a.name === 'Kinetic control');
  assert.equal(k.rank, deriveAll(ballista(), R).attacks.find((a) => a.name === 'Kinetic control').rank);
  const d = dice(15, 3);                                 // 15 + 5 = 20 hits Dodge 10 + 10; the Toughness check of 3 + 4 fails the DC
  resolveAttack(b, R, who(b, 'bal'), k, who(b, 't'), d);
  assert.equal(d.left(), 0);
  assert.match(text(b), /Kinetic control at t: d20 15 \+5 = 20 vs Dodge DC 20 — hit/);
  assert.match(text(b), /resists with Toughness: d20 3 \+4 = 7 vs DC 30/);
  const plain = powerArena([['bal', 'A', { ch: ballista(0), hp: 0 }, { x: 0, y: 0 }], ['t', 'B', { abilities: { Fighting: 0 }, hp: 0 }, { x: 1, y: 0 }]]);
  resolveAttack(plain, R, who(plain, 'bal'), who(plain, 'bal').attacks.find((a) => a.name === 'Kinetic control'), who(plain, 't'), dice(15, 3));
  assert.match(text(plain), /vs DC 27/);
});
