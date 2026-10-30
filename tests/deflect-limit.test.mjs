// A limited Deflect: every way the limit can be written on a sheet, and that it holds on real attack rolls. Source:
// src/engine/battle/deflect-limit.js and the hooks in deflect.js. Dice are scripted. SOFT has Parry 6 (a flat defense of
// 16); STRIKER is SOFT with Unarmed +8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, dice, deflect, powerArena, who, unarmed, text } from './helpers/power-arena.mjs';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { deflectOf } from '../src/engine/battle/deflect.js';
import { deflectLimit, limitCovers } from '../src/engine/battle/deflect-limit.js';

const SOFT = { abilities: { Fighting: 0 } };
const STRIKER = { abilities: { Fighting: 0 }, skills: [{ name: 'Close Combat', spec: 'Unarmed', ranks: 8 }] };
const only = (over) => deflectLimit({ ...deflect(5), ...over });
const limited = (option) => ({ flaws: [{ name: 'Limited', option }] });

test('the limit is read however it is written', () => {
  const cases = [
    [{ descriptors: ['fire only'] }, ['fire']], [{ descriptors: ['lightning only'] }, ['electricity']], [{ descriptors: ['only fire'] }, ['fire']],
    [{ descriptors: ['Fire (only)'] }, ['fire']], [{ descriptors: ['resistance to psionic'] }, ['psychic']], [{ descriptors: ['fire and cold only'] }, ['fire', 'cold']],
    [{ descriptors: ['fire, cold only'] }, ['fire', 'cold']], [{ detail: 'Lightning attacks only' }, ['electricity']], [{ detail: 'against fire and ice' }, ['fire', 'cold']],
    [limited('fire only'), ['fire']], [limited('Fire'), ['fire']], [limited('to lightning'), ['electricity']], [{ flaws: [{ name: 'Limited to Lightning' }] }, ['electricity']],
    [{ name: 'Deflect (Fire Only)' }, ['fire']], [{ descriptors: ['bullets only'] }, ['ballistic']], [{ detail: 'magic only' }, ['magic']], [{ descriptors: ['energy only'] }, ['energy']],
    [limited('physical attacks'), ['physical']], [limited('Ranged Attacks'), ['ranged']], [{ detail: 'melee attacks only' }, ['close']],
  ];
  for (const [over, want] of cases) assert.deepEqual(only(over), want, JSON.stringify(over));
});

test('words that only describe the power, or a limit on when it works, are no limit on the attack', () => {
  for (const over of [{ descriptors: ['fire'] }, { descriptors: ['force field'] }, { name: 'Lightning Shield' }, { name: 'Fire Deflect' }, limited('only while flying'), { detail: 'only in water' }, { detail: 'Only as a reaction' }]) {
    assert.equal(only(over), null, JSON.stringify(over));
  }
});

test('limitCovers matches a descriptor, a family word or the kind of attack', () => {
  const fire = { descriptors: ['fire', 'energy'], kind: 'ranged', range: 'ranged' };
  const fist = { descriptors: ['unarmed', 'physical'], kind: 'close', range: 'close' };
  assert.ok(limitCovers(null, fist), 'no limit covers everything');
  assert.ok(limitCovers(['fire'], fire) && !limitCovers(['fire'], fist));
  assert.ok(limitCovers(['energy'], fire) && !limitCovers(['energy'], fist));
  assert.ok(limitCovers(['physical'], fist) && !limitCovers(['physical'], fire));
  assert.ok(limitCovers(['ranged'], fire) && !limitCovers(['ranged'], fist));
  assert.ok(limitCovers(['close'], fist) && !limitCovers(['close'], fire));
});

/** The attacker swings at a guard with a Reaction Deflect 5 limited by `over`, with the attack's descriptors set. Returns the log. */
function reactionFight(over, descriptors, rolls) {
  const b = powerArena([
    ['atk', 'A', STRIKER, { x: 0, y: 0 }],
    ['guard', 'B', { ...SOFT, powers: [{ ...deflect(5, ['Reaction']), ...over }] }, { x: 1, y: 0 }],
  ], { heroPoints: false });
  resolveAttack(b, R, who(b, 'atk'), { ...unarmed(who(b, 'atk')), descriptors }, who(b, 'guard'), dice(...rolls));
  return text(b);
}

test('fire only: it deflects a fire attack, and a heat attack, which is fire, but not cold or fists', () => {
  const fireOnly = { descriptors: ['fire only'] };
  assert.match(reactionFight(fireOnly, ['fire', 'heat', 'energy'], [12, 8]), /deflects/); // 12 + 5 = 17 beats the flat 16
  assert.doesNotMatch(reactionFight(fireOnly, ['cold', 'energy'], [8, 15]), /deflect/i);
  assert.doesNotMatch(reactionFight(fireOnly, ['unarmed', 'physical'], [8, 15]), /deflect/i);
});

test('lightning only, from a Limited flaw: it deflects lightning but not fire', () => {
  const lightningOnly = limited('lightning only');
  assert.deepEqual(deflectOf({ powers: [{ ...deflect(5, ['Reaction']), ...lightningOnly }] }).only, ['electricity']);
  assert.match(reactionFight(lightningOnly, ['electricity', 'energy'], [12, 8]), /deflects/);
  assert.doesNotMatch(reactionFight(lightningOnly, ['fire', 'energy'], [8, 15]), /deflect/i);
});

test('close attacks only: a Deflect limited to melee deflects fists, ranged attacks only does not', () => {
  assert.match(reactionFight(limited('melee attacks'), ['unarmed', 'physical'], [12, 8]), /deflects/);
  assert.doesNotMatch(reactionFight(limited('ranged attacks'), ['unarmed', 'physical'], [8, 15]), /deflect/i);
});
