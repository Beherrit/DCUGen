import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateLoadout, generateDevice, generateMinionSquad, generateMonster, randomCreature, creatureVariant, catalogEntries, estimatePL, LOADOUT_FOCUS, DEVICE_TYPES, MINION_TYPES, CREATURE_TEMPLATES } from '../src/engine/workshop.js';
import { checkLimits } from '../src/engine/limits.js';
import { costBreakdown } from '../src/engine/costs.js';
import { catalogToCharacter } from '../src/engine/catalog.js';

const errors = (ch) => checkLimits(ch, R).filter((i) => i.severity === 'error' && i.rule !== 'budget' && i.rule !== 'equipment');

test('gear loadouts never go over budget', () => {
  for (const focus of Object.keys(LOADOUT_FOCUS)) {
    for (let i = 0; i < 25; i++) {
      const ep = 5 + (i % 6) * 5;
      const l = generateLoadout(R, { ep, focus, seed: `${focus}-${i}`, pl: 10 });
      assert.ok(l.used <= ep, `${focus} used ${l.used}/${ep}`);
      assert.equal(l.used, l.items.reduce((s, x) => s + x.cost, 0));
      assert.equal(l.ranks, Math.ceil(l.used / 5));
    }
  }
});

test('devices are priced with the Removable rule, fit a budget and stay within PL', () => {
  for (const type of Object.keys(DEVICE_TYPES)) {
    for (let i = 0; i < 30; i++) {
      const pl = 4 + (i % 9);
      const budget = i % 3 === 0 ? 20 + i : undefined;
      const d = generateDevice(R, { pl, type, budget, seed: `${type}-${i}` });
      assert.deepEqual(d.issues, [], `${d.name}`);
      const per5 = d.device.kind === 'easily' ? 2 : 1;
      assert.equal(d.cost.total, d.cost.raw - Math.floor(d.cost.raw / 5) * per5);
      if (budget != null) assert.ok(d.cost.total <= budget || d.device.powers.every((p) => p.rank === 1), `${d.name} ${d.cost.total}/${budget}`);
    }
  }
});

test("minion squads are legal at their rank and report the villain's cost", () => {
  for (const type of MINION_TYPES) {
    for (const rank of [2, 4, 6]) {
      const s = generateMinionSquad(R, { type, rank, count: 6, seed: `${type}-${rank}` });
      assert.equal(s.member.pl, rank);
      assert.deepEqual(errors(s.member), []);
      assert.equal(costBreakdown(s.member, R).total, rank * 15);
      assert.equal(s.villainCost.minionAdvantage.total, rank * 6);
      assert.equal(s.names.length, 6);
    }
  }
});

test('monster maker builds legal monsters at every PL', () => {
  for (let pl = 2; pl <= 16; pl++) for (let i = 0; i < 8; i++) {
    const m = generateMonster(R, { pl, seed: `m-${pl}-${i}` });
    assert.deepEqual(errors(m), [], `${m.identity.codename} PL ${pl}`);
    assert.ok(m.fitsPL <= pl);
  }
});

test('every catalog entry is legal as written', () => {
  const entries = catalogEntries(R);
  assert.ok(entries.length >= 140, `catalog has ${entries.length} entries`);
  for (const e of entries) assert.deepEqual(errors(catalogToCharacter(e)), [], e.id);
});

test('every catalog creature works with every template', () => {
  for (const e of catalogEntries(R)) {
    for (const t of Object.keys(CREATURE_TEMPLATES)) {
      const c = creatureVariant(R, e, t, { seed: `${e.id}-${t}` });
      assert.deepEqual(errors(c), [], `${e.id} as ${t}`);
    }
  }
  assert.ok(randomCreature(R, { seed: 'x' }));
});

test('estimatePL finds the lowest legal PL', () => {
  const m = generateMonster(R, { pl: 10, seed: 'est' });
  const pl = estimatePL(m, R);
  assert.deepEqual(errors({ ...m, pl }), []);
  if (pl > 1) assert.ok(errors({ ...m, pl: pl - 1 }).length > 0);
});
