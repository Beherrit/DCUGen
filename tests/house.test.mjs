import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES as R } from '../src/engine/index.js';
import { checkLimits } from '../src/engine/limits.js';
import { setHouseRules, weakenPoints } from '../src/engine/house.js';
import { drain } from '../src/engine/pools.js';

const load = () => JSON.parse(fs.readFileSync(new URL('./fixtures/shadowshot.json', import.meta.url)));
afterEach(() => setHouseRules({}));
const errors = (ch) => checkLimits(ch, R).filter((i) => i.severity === 'error');

test('PL limits by the book, as warnings, or off', () => {
  const ch = load(); // Enhanced Stamina 6 always on: over the defense limits
  assert.ok(errors(ch).some((i) => i.rule === 'defense'));
  setHouseRules({ plLimits: 'warning' });
  assert.ok(!errors(ch).some((i) => i.rule === 'defense'));
  assert.ok(checkLimits(ch, R).some((i) => i.rule === 'defense' && i.severity === 'warning' && /house rule/.test(i.message)));
  setHouseRules({ plLimits: 'off' });
  assert.ok(!checkLimits(ch, R).some((i) => i.rule === 'defense'));
});

test('overspending can be allowed', () => {
  const ch = load();
  ch.abilities.Intellect = 20;
  assert.ok(errors(ch).some((i) => i.rule === 'budget'));
  setHouseRules({ budget: 'warning' });
  assert.ok(!errors(ch).some((i) => i.rule === 'budget'));
});

test('Weaken by margin or by degrees', () => {
  assert.equal(weakenPoints(12), 12);
  setHouseRules({ weaken: 'degrees' });
  assert.deepEqual([1, 5, 6, 11, 16].map(weakenPoints), [1, 1, 2, 3, 4]);
  const w = { rank: 12 };
  assert.equal(drain(w, 11), 3);
});

test('modifier and advantage problems carry the book page', () => {
  const ch = load();
  ch.advantages.push({ name: 'Diehard', rank: 3 });
  const i = checkLimits(ch, R).find((x) => x.message.includes('Diehard is not a ranked advantage'));
  assert.match(i.source, /^DCA \d+/);
});
