// Advantage prerequisites (data/advantages.json "requires") are granted along with the advantage, and kept when trimming.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { checkLimits } from '../src/engine/limits.js';
import { grantPrerequisites, missingPrerequisites, isLastPrerequisite, prerequisitesGrantable } from '../src/engine/prereqs.js';
import { addAdvantageRanks } from '../src/engine/martial/styles.js';

const blank = () => ({ pl: 10, abilities: {}, defenses: {}, skills: [], advantages: [], powers: [], devices: [], equipment: [] });

test('granting Attack Mastery brings Attack Specialist with the same attack', () => {
  const ch = blank();
  const added = [];
  assert.ok(grantPrerequisites(ch, R, 'Attack Mastery', 'Naginata', { add: (name, param) => { added.push([name, param]); ch.advantages.push({ name, rank: 1, param }); } }));
  assert.deepEqual(added, [['Attack Specialist', 'Naginata']]);
  assert.deepEqual(missingPrerequisites(ch, R, 'Attack Mastery').advantages, []);
});

test('skill prerequisites are bought too (Ritualist needs Expertise: Magic)', () => {
  const ch = blank();
  grantPrerequisites(ch, R, 'Ritualist', null, { add: () => {}, addSkill: (name, spec, ranks) => ch.skills.push({ name, spec, ranks }) });
  assert.deepEqual(ch.skills, [{ name: 'Expertise', spec: 'Magic', ranks: 2 }]);
});

test('a style package brings the prerequisite and records it as part of the style', () => {
  const ch = blank();
  const entry = { added: { skills: [], advantages: [] } };
  addAdvantageRanks(ch, entry, { name: 'Improved Joint Lock' }, 1, R);
  assert.deepEqual(ch.advantages.map((a) => a.name), ['Joint Lock', 'Improved Joint Lock']);
  assert.deepEqual(entry.added.advantages.map((a) => a.name), ['Joint Lock', 'Improved Joint Lock']);
});

test('a weapon element comes from the style, so Improvised Weapon Element waits for one', () => {
  const ch = blank();
  assert.equal(prerequisitesGrantable(ch, R, 'Improvised Weapon Element'), false);
  ch.styles = [{ name: 'Kenjutsu', tier: 'initiate', weaponElements: ['Katana'] }];
  assert.equal(prerequisitesGrantable(ch, R, 'Improvised Weapon Element'), true);
  assert.deepEqual(missingPrerequisites(ch, R, 'Improvised Weapon Element').advantages, []);
});

test('trimming keeps the last rank of a prerequisite', () => {
  const ch = { ...blank(), advantages: [{ name: 'Trance', rank: 1 }, { name: 'Healing Trance', rank: 1 }], skills: [{ name: 'Technology', ranks: 1 }] };
  assert.equal(isLastPrerequisite(ch, R, { advantage: ch.advantages[0] }), true);
  assert.equal(isLastPrerequisite(ch, R, { advantage: ch.advantages[1] }), false);
  assert.equal(isLastPrerequisite(ch, R, { skill: ch.skills[0] }), false);
  ch.advantages.push({ name: 'Inventor', rank: 1 });
  assert.equal(isLastPrerequisite(ch, R, { skill: ch.skills[0] }), true);
});

test('generated characters meet their advantage prerequisites', () => {
  for (let i = 0; i < 300; i++) {
    const ch = generateCharacter(R, { seed: `prereq-${i}` });
    const bad = checkLimits(ch, R).filter((x) => x.rule === 'advantage' && /requires/.test(x.message));
    assert.deepEqual(bad.map((x) => x.message), [], `seed prereq-${i}`);
  }
});
