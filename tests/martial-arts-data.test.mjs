import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMa, validateMa, maneuverCost, KNOWN_DISCREPANCIES, OPEN_ENDED } from '../tools/validate-ma.mjs';

const d = loadMa();
const byName = (list, name) => list.find((x) => x.name === name);

test('the Martial Arts data passes the validator with no errors', () => {
  const r = validateMa(d);
  assert.deepEqual(r.errors, []);
});

test('every one of the 33 stances is present with a DC, benefits, detriments and mods', () => {
  assert.equal(d.stances.length, 33);
  const neutral = byName(d.stances, 'Neutral');
  assert.equal(neutral.dc, 0);
  assert.deepEqual(neutral.mods, []);
  assert.equal(byName(d.stances, 'Blocking').dc, 13);
  assert.deepEqual(byName(d.stances, 'Blocking').mods, [{ stat: 'Parry', value: 2 }, { stat: 'attack', value: -2 }]);
  assert.ok(byName(d.stances, 'Crane').flags.includes('immobile'));
  assert.ok(byName(d.stances, 'Avoiding').flags.includes('dodgeForParry'));
  assert.equal(byName(d.stances, '(Named)').dc_per_rank, 1);
});

test('all 166 styles carry costed components, and the two worked examples add up to the printed points', () => {
  assert.equal(d.styles.length, 166);
  const adithada = byName(d.styles, 'Adithada');
  const aikido = byName(d.styles, 'Aikido');
  assert.equal(Object.values(adithada.cost_check.computed_subtotals).reduce((a, b) => a + b, 0), 40);
  assert.equal(Object.values(aikido.cost_check.computed_subtotals).reduce((a, b) => a + b, 0), 56);
  assert.deepEqual(adithada.style_flaws.map((f) => f.cost), [-1, -2]);
  assert.equal(aikido.weapon_elements.length, 3);
});

test('exactly the known styles disagree with their own book arithmetic', () => {
  const odd = d.styles.filter((s) => s.cost_check.status !== 'ok').map((s) => s.name).sort();
  const expected = [...Object.keys(KNOWN_DISCREPANCIES), ...OPEN_ENDED, 'Duan Quan', 'Fanzi Quan'].sort();
  assert.deepEqual(odd, expected);
  assert.equal(odd.length, 10);
});

test('a maneuver costs what its formula says at a rank', () => {
  assert.equal(maneuverCost(byName(d.maneuvers, 'Soft Landing'), 4), 2);
  assert.equal(maneuverCost(byName(d.maneuvers, 'Nerve Strike'), 3), 4);
  assert.equal(maneuverCost(byName(d.maneuvers, 'Awesome Strike'), 6), 1);
  assert.ok(byName(d.maneuvers, 'Axe Kick').mundane);
});

test('the validator catches a wrong style cost and an unknown maneuver (it can fail)', () => {
  const broken = structuredClone(d);
  byName(broken.styles, 'Aikido').style_flaws[0].cost = -9;
  assert.ok(validateMa(broken).errors.some((e) => e.startsWith('Aikido: Style Flaws items add to')));
  const stray = structuredClone(d);
  byName(stray.styles, 'Adithada').basic_maneuvers.push({ name: 'Moon Kick', cost: 1 });
  assert.ok(validateMa(stray).errors.some((e) => e.includes('unknown maneuver "Moon Kick"')));
  const wrongStance = structuredClone(d);
  byName(wrongStance.styles, 'Adithada').stances.push('Sleepy');
  assert.ok(validateMa(wrongStance).errors.some((e) => e.includes('unknown stance "Sleepy"')));
});
