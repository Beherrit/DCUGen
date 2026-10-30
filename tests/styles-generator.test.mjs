import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { costBreakdown, powerCost } from '../src/engine/costs.js';
import { checkLimits } from '../src/engine/limits.js';
import { grantStyle, styleChoices } from '../src/engine/genstyle.js';
import { stanceChoices } from '../src/engine/martial/stance.js';
import { deriveAll } from '../src/engine/derive.js';
import { makeRng } from '../src/engine/rng.js';

const ARCHES = ['martialartist', 'weaponmaster', 'crimefighter'];

test('martial artists, weapon masters and crime fighters know a real fighting style, legal and on budget', () => {
  const tiers = new Set();
  for (const arch of ARCHES) {
    for (let pl = 5; pl <= 15; pl += 2) {
      for (let i = 0; i < 4; i++) {
        const ch = generateCharacter(R, { seed: `gs-${arch}-${pl}-${i}`, archetype: arch, pl });
        const cost = costBreakdown(ch, R);
        assert.equal(cost.total, cost.budget, `${arch} PL ${pl} #${i} spends exactly 15 per level`);
        assert.deepEqual(checkLimits(ch, R).filter((x) => x.severity === 'error'), [], `${arch} PL ${pl} #${i} is legal`);
        assert.ok(ch.styles?.length === 1, `${arch} PL ${pl} #${i} has a style`);
        const s = ch.styles[0];
        assert.ok(R.raw.styles.some((x) => x.name === s.name));
        assert.equal(ch.style.name, s.name, 'the sheet\'s style tag is the style the hero knows');
        assert.ok(s.stances, 'it comes with its stances');
        assert.ok(ch.skills.some((k) => k.name === s.skill.name && k.spec === s.skill.spec && k.ranks >= 1), 'and its Close Combat skill');
        const power = ch.powers.filter((p) => p.maneuver);
        assert.equal(power.length, s.maneuvers.length, 'every maneuver is a power marked for its style');
        assert.ok(power.every((p) => p.style === s.name && powerCost(p, R) >= 0));
        assert.ok(stanceChoices(ch, R, deriveAll(ch, R)).length > 1, 'and can assume its stances in play');
        tiers.add(s.tier);
      }
    }
  }
  assert.ok(tiers.has('initiate') && tiers.has('student'), `tiers seen: ${[...tiers]}`);
});

test('the same seed rolls the same style and maneuvers', () => {
  const a = generateCharacter(R, { seed: 'gs-repeat', archetype: 'martialartist', pl: 10 });
  const b = generateCharacter(R, { seed: 'gs-repeat', archetype: 'martialartist', pl: 10 });
  assert.deepEqual(a.styles, b.styles);
  assert.deepEqual(a.powers, b.powers);
});

test('other archetypes roll no fighting style', () => {
  for (const arch of ['paragon', 'blaster', 'mystic', 'speedster']) {
    const ch = generateCharacter(R, { seed: `gs-none-${arch}`, archetype: arch, pl: 10 });
    assert.equal(ch.styles, undefined, arch);
    assert.ok(!ch.powers.some((p) => p.maneuver));
  }
});

test('a weapon master gets a style for weapons and a martial artist one for bare hands', () => {
  const wm = R.raw.archetypes.find((a) => a.id === 'weaponmaster');
  const ma = R.raw.archetypes.find((a) => a.id === 'martialartist');
  assert.ok(styleChoices(R, wm).every((s) => /^Weapon/.test(s.type)));
  assert.ok(styleChoices(R, ma).every((s) => s.type === 'Unarmed'));
  assert.ok(styleChoices(R, wm).every((s) => ['Traditional', 'Cinematic'].includes(s.category)));
});

test('a style that cannot be paid for leaves the character exactly as it was', () => {
  const ch = generateCharacter(R, { seed: 'gs-restore', archetype: 'martialartist', pl: 10 });
  delete ch.styles;
  ch.powers = ch.powers.filter((p) => !p.maneuver);
  // Nothing left to trade (no skills, no advantages) and a budget the build already uses up.
  ch.skills = []; ch.advantages = [];
  const before = JSON.stringify(ch);
  const ctx = { arch: R.raw.archetypes.find((a) => a.id === 'martialartist'), style: null, budget: costBreakdown(ch, R).total - 1, rng: makeRng('restore') };
  assert.equal(grantStyle(ch, R, ctx), null);
  assert.equal(JSON.stringify(ch), before);
});

test('paying for a style gives up skills and advantages that do nothing in a fight before ones that do', () => {
  const ch = generateCharacter(R, { seed: 'gs-keep', archetype: 'martialartist', pl: 10 });
  delete ch.styles;
  ch.powers = ch.powers.filter((p) => !p.maneuver);
  ch.skills = ['History', 'Art', 'Science', 'Law', 'Business', 'Medicine', 'Magic', 'Streetwise'].map((spec) => ({ name: 'Expertise', spec, ranks: 10 }));
  ch.skills.push({ name: 'Sleight of Hand', ranks: 6 });
  ch.advantages = [{ name: 'Improved Critical', rank: 2, param: 'Unarmed' }, { name: 'Improved Initiative', rank: 1 }, { name: 'Evasion', rank: 1 }];
  const budget = costBreakdown(ch, R).total;
  const ctx = { arch: R.raw.archetypes.find((a) => a.id === 'martialartist'), style: null, budget, rng: makeRng('keep') };
  assert.ok(grantStyle(ch, R, ctx), 'the style fits by trading the history ranks');
  const adv = (name) => ch.advantages.find((a) => a.name === name)?.rank || 0;
  assert.ok(adv('Improved Critical') >= 2 && adv('Improved Initiative') >= 1 && adv('Evasion') >= 1, 'fight advantages kept');
  assert.ok(ch.skills.find((k) => k.name === 'Sleight of Hand').ranks >= 6, 'fight skills kept');
});
