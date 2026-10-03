import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { costBreakdown } from '../src/engine/costs.js';
import { startAdvancement, awardPoints, recordChanges, pendingChanges, revertChanges, advancementSummary, removeEntry } from '../src/engine/advancement.js';

const fresh = () => generateCharacter(R, { seed: 'adv-test', pl: 10 });

test('awards raise the budget; raising PL alone does not (DCA 190)', () => {
  const ch = fresh();
  assert.equal(costBreakdown(ch, R).budget, 150);
  awardPoints(ch, R, 2, 'Session 1');
  awardPoints(ch, R, 1, 'Session 2');
  assert.equal(costBreakdown(ch, R).budget, 153);
  ch.pl = 11;
  assert.equal(costBreakdown(ch, R).budget, 153);
  const s = advancementSummary(ch, R);
  assert.equal(s.earned, 3);
  assert.equal(s.unspent, 3);
});

test('spending is diffed, logged and moves the snapshot', () => {
  const ch = fresh();
  awardPoints(ch, R, 4, 'Arc finale');
  ch.abilities.Fighting += 1;
  ch.defenses.Will = (ch.defenses.Will || 0) + 1;
  const p = pendingChanges(ch, R);
  assert.equal(p.points, 3);
  assert.ok(p.changes.some((c) => /^Fighting/.test(c.text) && c.points === 2));
  recordChanges(ch, R, 'Training');
  const e = ch.advancement.log.at(-1);
  assert.equal(e.type, 'spend');
  assert.equal(e.points, 3);
  assert.equal(pendingChanges(ch, R).changes.length, 0);
  assert.equal(advancementSummary(ch, R).spent, 3);
  assert.equal(advancementSummary(ch, R).unspent, 1);
});

test('undo restores the last recorded build; removing an award lowers the budget', () => {
  const ch = fresh();
  startAdvancement(ch, R);
  const before = JSON.stringify(ch.abilities);
  ch.abilities.Strength += 3;
  revertChanges(ch);
  assert.equal(JSON.stringify(ch.abilities), before);
  awardPoints(ch, R, 5, 'oops');
  removeEntry(ch, ch.advancement.log[0].id);
  assert.equal(costBreakdown(ch, R).budget, 150);
});
