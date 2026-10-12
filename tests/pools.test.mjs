import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES as R } from '../src/engine/index.js';
import { checkLimits } from '../src/engine/limits.js';
import { deriveAll } from '../src/engine/derive.js';
import { costBreakdown } from '../src/engine/costs.js';
import { poolTargets } from '../src/engine/pools.js';

const load = () => JSON.parse(fs.readFileSync(new URL('./fixtures/shadowshot.json', import.meta.url)));
const errors = (ch) => checkLimits(ch, R).filter((i) => i.severity === 'error' && i.rule !== 'budget');
const redistribution = (ch) => ch.powers.find((p) => p.name === 'Physical stat redistribution');

test('an always-on Enhanced Stamina 6 breaks the defense limits (the problem)', () => {
  const ch = load();
  assert.equal(deriveAll(ch, R).abilities.Stamina, 12);
  assert.ok(errors(ch).some((i) => i.rule === 'defense'));
});

test('as a pool it counts for nothing until placed, and costs the same', () => {
  const before = costBreakdown(load(), R).total;
  const ch = load();
  redistribution(ch).pool = true;
  assert.equal(costBreakdown(ch, R).total, before);
  assert.equal(deriveAll(ch, R).abilities.Stamina, 6);
  assert.deepEqual(errors(ch), []);
});

test('placed points count where they go: abilities, defenses, skills, powers', () => {
  const ch = load();
  Object.assign(redistribution(ch), { pool: true, placed: [{ target: 'Strength', points: 3 }, { target: 'Dodge', points: 1 }, { target: 'skill:Athletics', points: 1 }, { target: 'power:Flight', points: 1 }] });
  const d = deriveAll(ch, R);
  assert.equal(d.abilities.Strength, 12);
  assert.equal(d.defenses.Dodge, 4 + 2 + 1);
  assert.equal(d.skills.find((s) => s.name === 'Athletics').bonus, 12 + 4 + 1);
  assert.deepEqual(errors(ch), []);
});

test('placing more than the pool holds is an error; going over PL while placed is only a warning', () => {
  const ch = load();
  Object.assign(redistribution(ch), { pool: true, placed: [{ target: 'Stamina', points: 7 }] });
  assert.ok(errors(ch).some((i) => i.rule === 'pool'));
  redistribution(ch).placed = [{ target: 'Stamina', points: 6 }];
  assert.deepEqual(errors(ch), []);
  assert.ok(checkLimits(ch, R).some((i) => i.rule === 'pool' && i.severity === 'warning'));
});

test('pool targets list the character\'s own skills and other powers', () => {
  const ch = load();
  redistribution(ch).pool = true;
  const all = poolTargets(ch).flatMap(([, list]) => list.map(([v]) => v));
  assert.ok(all.includes('skill:Close Combat (Unarmed)'));
  assert.ok(all.includes('power:Flight'));
  assert.ok(!all.includes('power:Physical stat redistribution'));
  assert.ok(all.includes('other'));
});
