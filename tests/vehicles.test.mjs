import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import {
  vehicleCost, hqCost, randomVehicle, randomHeadquarters, vehicleStatLine, hqStatLine,
  vehicleIssues, hqIssues, vehicleFeature, hqFeature,
} from '../src/engine/vehicles.js';

const V = R.raw.vehicles;
const H = R.raw.headquarters;

test('vehicle and headquarters data are built into the rules', () => {
  assert.ok(V && V.premade.length >= 100, 'vehicles.json premades');
  assert.ok(H && H.premade.length >= 50, 'headquarters.json premades');
  assert.equal(V.sizes.length, 6);
  assert.equal(H.sizes.length, 11);
});

test('book vehicles reproduce their printed cost (unless the book itself is inconsistent)', () => {
  const book = V.premade.filter((v) => v.source === 'DCA 158');
  assert.equal(book.length, 32, 'every vehicle on the DCA 158 table');
  for (const v of book) {
    assert.ok(Number.isInteger(v.book_cost), `${v.name} has a book cost`);
    if (v.book_cost_note) continue;
    assert.equal(vehicleCost(v, R).total, v.book_cost, `${v.name}`);
  }
  // Exceptions stay a small minority and each one explains itself.
  const noted = book.filter((v) => v.book_cost_note);
  for (const v of noted) assert.ok(v.book_cost_note.length > 40, v.name);
  assert.ok(noted.length <= 10, `${noted.length} noted`);
});

test('book headquarters reproduce their printed cost (unless the book itself is inconsistent)', () => {
  const book = H.premade.filter((h) => /^DCA/.test(h.source));
  assert.ok(book.length >= 9);
  for (const h of book) {
    if (h.book_cost_note) continue;
    assert.equal(hqCost(h, R).total, h.book_cost, `${h.name}`);
  }
});

test('every premade stores its computed cost', () => {
  for (const v of V.premade) assert.equal(v.cost, vehicleCost(v, R).total, v.name);
  for (const h of H.premade) assert.equal(h.cost, hqCost(h, R).total, h.name);
});

test('cost breakdowns add up', () => {
  for (const v of V.premade) {
    const c = vehicleCost(v, R);
    assert.equal(c.total, c.breakdown.reduce((s, b) => s + b.cost, 0), v.name);
  }
  for (const h of H.premade) {
    const c = hqCost(h, R);
    assert.equal(c.total, c.breakdown.reduce((s, b) => s + b.cost, 0), h.name);
  }
});

test('all feature names used by premades exist, ids are unique', () => {
  const vIds = new Set();
  for (const v of V.premade) {
    for (const f of v.features || []) assert.ok(vehicleFeature(f.name, R), `${v.name}: ${f.name}`);
    assert.deepEqual(vehicleIssues(v, R), [], v.name);
    assert.ok(!vIds.has(v.id), `duplicate ${v.id}`);
    vIds.add(v.id);
  }
  const hIds = new Set();
  for (const h of H.premade) {
    for (const f of h.features || []) assert.ok(hqFeature(f.name, R), `${h.name}: ${f.name}`);
    assert.deepEqual(hqIssues(h, R), [], h.name);
    assert.ok(!hIds.has(h.id), `duplicate ${h.id}`);
    hIds.add(h.id);
  }
});

test('hand-checked costs follow the book formulas', () => {
  // Fighter jet: Huge 2 + Str +2 + Flight 12 (24) + Tou +1 + missiles 22+8+6 + 1 AE = 66
  assert.equal(vehicleCost(V.premade.find((v) => v.id === 'book-fighter-jet'), R).total, 66);
  // Wizard's Tower pays for its Huge interior: 3 + Tou 10 (2) + 8 features = 13
  assert.equal(hqCost(H.premade.find((h) => h.id === 'book-wizards-tower'), R).total, 13);
  // Sizes below Small refund points but never push the total under 0
  assert.equal(hqCost({ size: 'Miniscule', toughness: 6, features: [] }, R).total, 0);
  assert.equal(hqCost({ size: 'Tiny', toughness: 7, features: [{ name: 'Living Space' }] }, R).total, 1);
  // Sails: Swimming 4 with Limited is 1 point per 2 ranks
  assert.equal(vehicleCost({ size: 'Medium', strength: 0, speed: 4, movement: 'Swimming', movement_flaws: [{ name: 'Limited' }], defense: 10, toughness: 5 }, R).total, 2);
});

test('random vehicles are valid and priced', () => {
  for (const category of [undefined, 'Ground', 'Water', 'Air', 'Space', 'Exotic']) {
    for (let i = 0; i < 25; i++) {
      const v = randomVehicle(R, { seed: `v-${category}-${i}`, category });
      assert.ok(v, 'got a vehicle');
      if (category) assert.equal(v.category, category);
      assert.deepEqual(vehicleIssues(v, R), [], v.name);
      assert.equal(v.cost, vehicleCost(v, R).total);
      assert.match(vehicleStatLine(v, R), /^Size \w+, Strength -?\d+, Speed .*Cost: \d+ ep$/);
    }
  }
  for (const setting of ['Fantasy', 'Steampunk', 'Sci-Fi', 'Military']) {
    const v = randomVehicle(R, { seed: setting, setting });
    assert.equal(v.setting, setting);
  }
  assert.deepEqual(randomVehicle(R, { seed: 'same' }), randomVehicle(R, { seed: 'same' }));
});

test('random headquarters are valid and priced', () => {
  for (const setting of [undefined, 'Modern', 'Fantasy', 'Cosmic', 'Mystic', 'Villain']) {
    for (let i = 0; i < 25; i++) {
      const h = randomHeadquarters(R, { seed: `h-${setting}-${i}`, setting });
      assert.ok(h);
      if (setting) assert.equal(h.setting, setting);
      assert.deepEqual(hqIssues(h, R), [], h.name);
      assert.equal(h.cost, hqCost(h, R).total);
      assert.match(hqStatLine(h, R), /Cost: \d+ ep$/);
    }
  }
});
