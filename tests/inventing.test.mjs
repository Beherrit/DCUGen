import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { checkLimits } from '../src/engine/limits.js';
import { deriveAll } from '../src/engine/derive.js';
import { costBreakdown, deviceCost } from '../src/engine/costs.js';
import { makeCombatant } from '../src/engine/battle/combatant.js';
import { statBlockText } from '../src/engine/render.js';
import {
  INVENT_KINDS, inventKinds, inventionCost, stepPlan, degreesOf, inventSkill, timeRank, timeRankText, spanText,
  addInvention, findInvention, removeInvention, applyCheck, useInvention, reuseInvention, endInventionScene, buyInvention, statusText,
} from '../src/engine/inventing.js';

// Batman's mind shield (DCA 145): Immunity to Mind Control, 5 points.
const shield = () => ({ name: 'Mind Shield', effect: 'Immunity', rank: 5, extras: [], flaws: [], descriptors: ['tech'], detail: 'Mind control' });
const zapper = (rank) => ({ name: 'Zapper', effect: 'Damage', rank, range: 'Ranged', extras: [], flaws: [], descriptors: ['electric'] });

function inventor() {
  const ch = generateCharacter(R, { pl: 10, seed: 'inventing-bench' });
  ch.advantages = [...(ch.advantages || []).filter((a) => !['Inventor', 'Ritualist'].includes(a.name)), { name: 'Inventor' }];
  ch.skills = [...(ch.skills || []).filter((s) => s.name !== 'Technology'), { name: 'Technology', ranks: 10 }];
  ch.npc = true;
  return ch;
}

test('the book\'s example: a 5-point mind shield', () => {
  const inv = { kind: 'invention', power: shield() };
  assert.equal(inventionCost(inv.power, R), 5);
  const design = stepPlan(inv, R, 'design');
  assert.equal(design.dc, 15);
  assert.equal(design.time, '5 hours');
  const build = stepPlan(inv, R, 'build');
  assert.equal(build.dc, 15);
  assert.equal(build.time, '20 hours');
  const jury = stepPlan(inv, R, 'build', { jury: true });
  assert.equal(jury.dc, 20, 'jury-rigging is +5');
  assert.equal(jury.time, '5 rounds');
  assert.equal(jury.routineOk, false);
  assert.equal(jury.fasterOk, false);
});

test('cutting the time: each time rank is -5', () => {
  const inv = { kind: 'invention', power: shield() };
  const fast = stepPlan(inv, R, 'build', { faster: 3 });
  assert.equal(fast.penalty, -15);
  assert.equal(fast.rank, timeRank(20 * 3600) - 3);
  assert.equal(fast.time, '2 hours 30 minutes (cut from 20 hours)', 'three time ranks is an eighth of the time (DCA 145)');
});

test('rituals: 4 hours of research and 10 minutes of performance per point (DCA 146)', () => {
  const inv = { kind: 'ritual', power: zapper(5) }; // 10 points
  assert.equal(inventionCost(inv.power, R), 10);
  assert.equal(stepPlan(inv, R, 'design').time, '40 hours');
  assert.equal(stepPlan(inv, R, 'build').time, '1 hour 40 minutes');
  assert.equal(stepPlan(inv, R, 'design').label, 'Research');
  assert.equal(stepPlan(inv, R, 'build').label, 'Performance');
  assert.equal(stepPlan(inv, R, 'build', { jury: true }).dc, 25);
  assert.equal(stepPlan(inv, R, 'build', { jury: true }).time, '10 rounds');
  assert.equal(INVENT_KINDS.ritual.advantage, 'Ritualist');
});

test('time ranks and words', () => {
  assert.equal(timeRank(6), 0);
  assert.equal(timeRank(3600), 9);
  assert.equal(timeRankText(9), '1 hour');
  assert.equal(spanText(30), '5 rounds');
  assert.equal(spanText(5 * 3600), '5 hours');
});

test('degrees of success and failure, with a natural 20 one better', () => {
  assert.equal(degreesOf(15, 15), 1);
  assert.equal(degreesOf(25, 15), 3);
  assert.equal(degreesOf(14, 15), -1);
  assert.equal(degreesOf(5, 15), -2);
  assert.equal(degreesOf(4, 15), -3);
  assert.equal(degreesOf(14, 15, 20), 1);
});

test('which kinds a character can do, and the skill it uses', () => {
  const ch = inventor();
  assert.deepEqual(inventKinds(ch), ['invention', 'magical']);
  const d = deriveAll(ch, R);
  const sk = inventSkill('invention', d);
  assert.equal(sk.label, 'Technology');
  assert.ok(sk.bonus >= 10);
  assert.equal(inventSkill('ritual', d), (d.skills.some((s) => s.name === 'Expertise' && /magic/i.test(s.spec || '')) ? inventSkill('ritual', d) : null));
});

test('design, build, use for a scene, then a hero point for another scene', () => {
  const ch = inventor();
  const inv = addInvention(ch, { kind: 'invention', power: shield() });
  assert.equal(inv.status, 'planned');
  assert.equal(statusText(inv), 'Needs a design');
  let r = applyCheck(inv, R, 'design', { total: 12, d20: 7 });
  assert.equal(r.deg, -1);
  assert.equal(inv.status, 'planned', 'a failed design starts over');
  r = applyCheck(inv, R, 'design', { total: 25, d20: null });
  assert.equal(inv.status, 'designed');
  r = applyCheck(inv, R, 'build', { total: 16, d20: 9 });
  assert.equal(inv.status, 'ready');
  useInvention(inv);
  assert.equal(inv.status, 'active');
  assert.equal(endInventionScene(ch), 1);
  assert.equal(inv.status, 'spent');
  reuseInvention(inv);
  assert.equal(inv.status, 'active');
  assert.equal(inv.log.length, 3);
});

test('three degrees of failure on the design: it seems right, but the invention will not work', () => {
  const ch = inventor();
  const inv = addInvention(ch, { power: shield() });
  const r = applyCheck(inv, R, 'design', { total: 2, d20: 2 });
  assert.equal(r.deg, -3);
  assert.equal(inv.status, 'designed');
  assert.ok(inv.flawed);
  applyCheck(inv, R, 'build', { total: 30, d20: 15 });
  assert.equal(inv.status, 'failed');
});

test('a failed construction does not work; a natural 1 or three degrees may be a mishap', () => {
  const ch = inventor();
  const inv = addInvention(ch, { power: shield() });
  applyCheck(inv, R, 'design', { total: 20, d20: null });
  let r = applyCheck(inv, R, 'build', { total: 14, d20: 4 });
  assert.equal(inv.status, 'designed');
  assert.equal(r.mishap, false);
  r = applyCheck(inv, R, 'build', { total: 14, d20: 1 });
  assert.equal(r.mishap, true);
});

test('jury-rigging skips the design and works this scene at once', () => {
  const ch = inventor();
  const inv = addInvention(ch, { power: shield() });
  const r = applyCheck(inv, R, 'build', { total: 21, d20: 11 }, { jury: true });
  assert.equal(r.dc, 20);
  assert.equal(inv.status, 'active');
  assert.ok(inv.juryRigged);
});

test('a failed ritual research means the ritual cannot be used', () => {
  const ch = inventor();
  const inv = addInvention(ch, { kind: 'ritual', power: zapper(4) });
  const r = applyCheck(inv, R, 'design', { total: 3, d20: 3 });
  assert.equal(inv.status, 'failed');
  assert.ok(r.mishap);
  assert.equal(statusText(inv), "Can't be used");
});

test('an invention in use counts on the sheet and in a fight, and costs nothing on the build', () => {
  const ch = inventor();
  const before = costBreakdown(ch, R).total;
  const inv = addInvention(ch, { power: zapper(8) });
  assert.ok(!deriveAll(ch, R).attacks.some((a) => a.name === 'Zapper'));
  inv.status = 'active';
  assert.ok(deriveAll(ch, R).attacks.some((a) => a.name === 'Zapper' && a.rank === 8));
  assert.equal(costBreakdown(ch, R).total, before);
  assert.ok(makeCombatant(R, ch).attacks.some((a) => a.name === 'Zapper'));
  assert.match(statBlockText(ch, R), /Inventions and rituals: Zapper \(invention, 16 points; in use this scene\)/);
});

test('inventions are held to the power level limits, and need the advantage', () => {
  const ch = inventor();
  ch.abilities.Dexterity = 6;
  addInvention(ch, { power: zapper(18) });
  const msgs = checkLimits(ch, R).map((i) => i.message);
  assert.ok(msgs.some((m) => m.startsWith('Invention Zapper:') && /limit is 20/.test(m)), msgs.join('\n'));
  ch.advantages = ch.advantages.filter((a) => a.name !== 'Inventor');
  assert.ok(checkLimits(ch, R).some((i) => i.rule === 'invention' && /needs the Inventor advantage/.test(i.message)));
});

test('buying it for good makes a Removable device', () => {
  const ch = inventor();
  const inv = addInvention(ch, { power: zapper(10) }); // 20 points
  const id = inv.id;
  const dev = buyInvention(ch, id, 'removable');
  assert.equal(dev.kind, 'removable');
  assert.equal(deviceCost(dev, R).total, 16, '20 points less 1 per 5');
  assert.equal(findInvention(ch, id), null);
  assert.equal(ch.inventions, undefined);
  const inv2 = addInvention(ch, { power: shield() });
  removeInvention(ch, inv2.id);
  assert.equal(ch.inventions, undefined);
});
