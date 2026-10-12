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

import { drain, loseDrained, settlePools, poolCapacity, poolSpent, poolAvailable } from '../src/engine/pools.js';

const fed = () => {
  const ch = load();
  Object.assign(redistribution(ch), { pool: true, feed: 'Ethenural Absorption' });
  return ch;
};
const absorption = (ch) => ch.powers.find((p) => p.name === 'Ethenural Absorption');

test('pools count in power points: Enhanced Stamina 6 holds 12, an ability rank costs 2, a defense rank 1', () => {
  const ch = load();
  Object.assign(redistribution(ch), { pool: true, placed: [{ target: 'Strength', points: 3 }, { target: 'Dodge', points: 2 }] });
  assert.equal(poolCapacity(redistribution(ch), R), 12);
  assert.equal(poolSpent(ch, redistribution(ch), R), 8);
});

test('a fed pool only holds what the Weaken drained, capped by its rank and the pool size', () => {
  const ch = fed();
  assert.equal(poolAvailable(ch, redistribution(ch), R), 0);
  assert.equal(drain(absorption(ch), 8), 8);
  assert.equal(poolAvailable(ch, redistribution(ch), R), 8);
  assert.equal(drain(absorption(ch), 9), 4, 'Weaken 12 holds 12 at most');
  assert.equal(poolAvailable(ch, redistribution(ch), R), 12);
});

test('when drained points fade, placed ranks are taken back newest first', () => {
  const ch = fed();
  drain(absorption(ch), 12);
  redistribution(ch).placed = [{ target: 'Strength', points: 4 }, { target: 'Agility', points: 2 }];
  loseDrained(absorption(ch), 3);
  settlePools(ch, R);
  assert.deepEqual(redistribution(ch).placed, [{ target: 'Strength', points: 4 }, { target: 'Agility', points: 0 }].filter((x) => x.points));
  assert.equal(deriveAll(ch, R).abilities.Strength, 13);
  loseDrained(absorption(ch), 99);
  settlePools(ch, R);
  assert.equal(redistribution(ch).placed, undefined);
  assert.equal(deriveAll(ch, R).abilities.Strength, 9);
});
