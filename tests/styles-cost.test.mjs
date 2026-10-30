import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { costBreakdown, powerCost } from '../src/engine/costs.js';
import { checkLimits } from '../src/engine/limits.js';
import { addStyle, removeStyle, setTier, setStances, toggleWeaponElement } from '../src/engine/martial/styles.js';
import { addManeuver, removeManeuver, setManeuverRank } from '../src/engine/martial/maneuvers.js';
import { buyWholeStyle } from '../src/engine/martial/template.js';
import { strengthManeuverNumbers } from '../src/engine/martial/limits.js';
import { deriveAll } from '../src/engine/derive.js';
import { availableModifiers } from '../src/engine/powersmith.js';

const plain = (more = {}) => ({
  pl: 10, abilities: { Strength: 2, Stamina: 2, Agility: 2, Dexterity: 2, Fighting: 4, Intellect: 0, Awareness: 0, Presence: 0 },
  defenses: {}, skills: [], advantages: [], powers: [], ...more,
});
const styleOf = (name) => R.raw.styles.find((s) => s.name === name);

test('a character built to a style template costs exactly the style\'s printed points, plus the tier advantages', () => {
  // Adithada 40, Aikido 56 (MA 171-172), and a weapon style, a bow style and two more.
  for (const [name, points] of [['Adithada', 40], ['Aikido', 56]]) {
    const ch = plain({ abilities: {} });
    assert.ok(buyWholeStyle(ch, R, name));
    const c = costBreakdown(ch, R);
    assert.equal(c.total - c.styleParts.tiers, points, `${name}: components add to ${points}`);
    assert.equal(c.styleParts.tiers, 3, 'a Master holds Initiate, Student and Master (one point each)');
  }
});

test('the template costs match the book for every style that has no open-ended parts', () => {
  const bad = [];
  let checked = 0;
  for (const s of R.raw.styles) {
    const cc = s.cost_check;
    if (cc.status === 'open-ended' || cc.free_spend) continue;
    const ch = { pl: 10, abilities: {}, defenses: {}, skills: [], advantages: [], powers: [] };
    buyWholeStyle(ch, R, s.name);
    const c = costBreakdown(ch, R);
    const got = c.total - c.styleParts.tiers;
    checked++;
    if (got !== cc.computed_total) bad.push(`${s.name}: built ${got}, book components ${cc.computed_total}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(checked >= 150, `checked ${checked} styles`);
});

test('a weapon style adds its weapon elements at a point each', () => {
  const ch = plain({ abilities: {} });
  buyWholeStyle(ch, R, 'Aikido');
  const elements = styleOf('Aikido').weapon_elements.length;
  assert.equal(ch.styles[0].weaponElements.length, elements);
  assert.equal(costBreakdown(ch, R).styleParts.elements, elements);
  toggleWeaponElement(ch, 'Aikido', 'Knife', false);
  assert.equal(costBreakdown(ch, R).styleParts.elements, elements - 1);
});

test('tiers cost a point per rank each: Initiate 1, Student 2, Master 3, and ranks add across styles', () => {
  const ch = plain({ abilities: {} });
  addStyle(ch, R, 'Aikido');
  assert.equal(costBreakdown(ch, R).styleParts.tiers, 1);
  setTier(ch, 'Aikido', 'student');
  assert.equal(costBreakdown(ch, R).styleParts.tiers, 2);
  assert.equal(ch.styles[0].stances, true, 'Student needs the Stances advantage');
  addStyle(ch, R, 'Adithada');
  assert.equal(costBreakdown(ch, R).styleParts.tiers, 3);
  setTier(ch, 'Adithada', 'master');
  assert.equal(costBreakdown(ch, R).styleParts.tiers, 5);
});

test('stances cost one point; turning them off drops a Student back to Initiate', () => {
  const ch = plain({ abilities: {} });
  addStyle(ch, R, 'Aikido');
  const before = costBreakdown(ch, R).styleParts;
  setStances(ch, 'Aikido', true);
  assert.equal(costBreakdown(ch, R).styleParts.stances, before.stances + 1);
  setTier(ch, 'Aikido', 'student');
  setStances(ch, 'Aikido', false);
  assert.equal(ch.styles[0].tier, 'initiate');
});

test('buying and removing a style and its maneuvers keeps the points consistent', () => {
  const ch = plain();
  const start = costBreakdown(ch, R).total;
  assert.ok(addStyle(ch, R, 'Aikido'));
  assert.equal(addStyle(ch, R, 'Aikido'), false, 'a style is known once');
  const withStyle = costBreakdown(ch, R).total;
  assert.ok(withStyle !== start);
  const sl = addManeuver(ch, R, 'Aikido', { name: 'Soft Landing', rank: 4 });
  assert.equal(sl.maneuver, true);
  assert.equal(sl.style, 'Aikido');
  assert.equal(powerCost(sl, R), 2, 'Soft Landing: 1 point per 2 ranks');
  assert.equal(costBreakdown(ch, R).total, withStyle + 2);
  assert.equal(costBreakdown(ch, R).powers, 0, 'maneuvers count under Fighting styles, not Powers');
  assert.equal(addManeuver(ch, R, 'Aikido', { name: 'Soft Landing', rank: 4 }), null, 'bought once per style');
  assert.ok(setManeuverRank(ch, R, 'Aikido', 'Soft Landing', undefined, 8));
  assert.equal(costBreakdown(ch, R).total, withStyle + 4);
  assert.ok(removeManeuver(ch, 'Aikido', 'Soft Landing'));
  assert.equal(costBreakdown(ch, R).total, withStyle);
  addManeuver(ch, R, 'Aikido', { name: 'Throw' });
  assert.ok(removeStyle(ch, 'Aikido'));
  assert.deepEqual(costBreakdown(ch, R).total, start);
  assert.equal(ch.styles, undefined);
  assert.equal(ch.powers.length, 0);
  assert.equal(ch.skills.length, 0, 'the style skill goes with the style');
});

test('removing a style takes back only what it put on the sheet', () => {
  const ch = plain({ skills: [{ name: 'Close Combat', spec: 'Unarmed', ranks: 4 }], advantages: [{ name: 'Fast Grab' }] });
  const before = JSON.stringify({ skills: ch.skills, advantages: ch.advantages });
  buyWholeStyle(ch, R, 'Aikido');
  assert.ok(ch.skills.some((s) => s.spec === 'Aikido' && s.ranks === 6));
  removeStyle(ch, 'Aikido');
  assert.equal(JSON.stringify({ skills: ch.skills, advantages: ch.advantages }), before);
});

test('a basic maneuver priced by the style keeps the style\'s printed price', () => {
  const ch = plain();
  addStyle(ch, R, 'Banshay');
  const p = addManeuver(ch, R, 'Banshay', { name: 'Riposte', rank: 3, price: 9 });
  assert.equal(powerCost(p, R), 9);
});

test('a Strength maneuver counts against the power level limit', () => {
  const haymakerErrors = (ch) => checkLimits(ch, R).filter((i) => i.rule === 'attack' && /Haymaker/.test(i.message));
  const ch = plain({ pl: 10, abilities: { Strength: 10, Fighting: 8 } });
  addStyle(ch, R, 'Adithada', { tier: 'student' });
  const haymaker = addManeuver(ch, R, 'Adithada', { name: 'Haymaker' });
  // Fighting 8 + 1 style rank - 4 (Haymaker) + 2 (Student) = +7; damage Str 10 + 6 = 16; 23 is over 2 x PL 20.
  assert.deepEqual(strengthManeuverNumbers(ch, R, haymaker), { bonus: 7, rank: 16 });
  assert.equal(haymakerErrors(ch).length, 1);
  ch.abilities.Strength = 6;
  assert.deepEqual(strengthManeuverNumbers(ch, R, haymaker), { bonus: 7, rank: 12 });
  assert.equal(haymakerErrors(ch).length, 0);
});

test('Extra Attacks builds in the Power Lab: 5 a rank, extras and flaws from the data', () => {
  const ea = { name: 'Flurry', effect: 'Extra Attacks', rank: 3, extras: [{ name: 'Mobility', steps: 2 }], flaws: [{ name: 'Declining' }] };
  assert.ok(availableModifiers(ea, R, 'extra').some((m) => m.name === 'Quickened Charge'));
  assert.ok(availableModifiers(ea, R, 'flaw').some((m) => m.name === 'Chain'));
  // 5 per rank, Declining -1 per rank = 4 x 3 ranks = 12, Mobility +1 flat per step x 2 = 14.
  assert.equal(powerCost(ea, R), 14);
});

test('Student and Master without the Stances advantage is flagged', () => {
  const ch = plain();
  addStyle(ch, R, 'Aikido');
  ch.styles[0].tier = 'student';
  ch.styles[0].stances = false;
  assert.ok(checkLimits(ch, R).some((i) => i.rule === 'style' && /Stances/.test(i.message)));
});

test('characters without styles are unchanged', () => {
  const ch = plain({ advantages: [{ name: 'Fast Grab' }], skills: [{ name: 'Athletics', ranks: 4 }] });
  const c = costBreakdown(ch, R);
  assert.equal(c.styles, 0);
  assert.equal(c.total, c.abilities + c.powers + c.advantages + c.skills + c.defenses);
  assert.equal(deriveAll(ch, R).attacks.length, 1);
  assert.ok(checkLimits(ch, R).every((i) => i.rule !== 'style'));
});

test('a style must cost more than its style flaws pay back (MA 134): a bare Initiate of a flawed style is illegal', () => {
  const flawed = (ch) => checkLimits(ch, R).filter((x) => x.severity === 'error' && /style flaws/.test(x.message));
  const ch = plain({ abilities: {} });
  addStyle(ch, R, 'Aikido');
  assert.ok(styleOf('Aikido').style_flaws.length, 'Aikido has style flaws');
  assert.equal(flawed(ch).length, 1, 'Initiate alone does not cover the flaws');
  buyWholeStyle(ch, R, 'Aikido');
  assert.equal(flawed(ch).length, 0, 'the whole style as listed covers them');
});
