import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { rangeInfo, rangeBands, bandFor, ftToRank, fmtFt, strengthReach, travelTime, measure } from '../src/engine/range.js';

test('ranged bands: 25/50/100 ft per rank, doubled by Extended Range', () => {
  assert.deepEqual(rangeBands(8).map((b) => b.ft), [200, 400, 800]);
  assert.deepEqual(rangeBands(8, 1).map((b) => b.ft), [400, 800, 1600]);
  assert.equal(bandFor(350, 8).penalty, -2);
  assert.equal(bandFor(150, 8).penalty, 0);
  assert.equal(bandFor(900, 8).band, 'out');
});

test('a power range in words', () => {
  const blast = { name: 'Blast', effect: 'Damage', rank: 10, range: 'Ranged', extras: [], flaws: [] };
  assert.match(rangeInfo(blast, R).text, /short 250 ft · medium 500 ft \(−2\) · long 1,000 ft \(−5\)/);
  assert.equal(rangeInfo({ effect: 'Damage', rank: 5, extras: [], flaws: [] }, R).kind, 'Close');
  const burst = { effect: 'Damage', rank: 8, range: 'Ranged', extras: [{ name: 'Area', option: 'Burst', steps: 2 }], flaws: [] };
  assert.match(rangeInfo(burst, R).text, /60 ft radius burst, placed up to 200 ft away/);
  assert.match(rangeInfo({ effect: 'Flight', rank: 8, extras: [], flaws: [] }, R).text, new RegExp(measure(8, R).distance));
});

test('measurements: distance ranks, throwing, lifting, travel time', () => {
  assert.equal(ftToRank(30), 0);
  assert.equal(ftToRank(31), 1);
  assert.equal(fmtFt(10560), '2 miles');
  const s = strengthReach(9, R);
  assert.equal(s.lift, measure(9, R).mass);
  assert.equal(s.throwPerson, measure(7, R).distance);
  assert.equal(travelTime(30 * 2 ** 10, 8, R).rank, 2);
});
