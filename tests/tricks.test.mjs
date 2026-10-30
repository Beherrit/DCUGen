// Skill tricks in the battle engine (Hero's Handbook p73 and p78): Daze, Startle and Set-up. Source: src/engine/battle/daze.js
// and tricks.js, with the feint in maneuvers.js. (Taunt and Teamwork are tested with the support actions.) Dice are scripted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, dice, arena, fighter, lastLog } from './helpers/fighters.mjs';
import { feint, grab, tryEscape } from '../src/engine/battle/maneuvers.js';
import { demoralize } from '../src/engine/battle/support-actions.js';
import { trip } from '../src/engine/battle/trip.js';
import { isProne } from '../src/engine/battle/prone.js';
import { daze, dazeByChoice, canDaze } from '../src/engine/battle/daze.js';
import { feintPick, setUpAllies } from '../src/engine/battle/tricks.js';
import { defenseVs } from '../src/engine/battle/conditions.js';
import { canAct } from '../src/engine/battle/conditions.js';
import { rollToHit } from '../src/engine/battle/attack-roll.js';
import { endOfTurn } from '../src/engine/battle/end-of-turn.js';
import { choosePlan } from '../src/engine/battle/plan.js';
import { takeTurn } from '../src/engine/battle/turn.js';
import { step } from '../src/engine/battle.js';
import { rngFor } from '../src/engine/battle/util.js';

const unarmed = (c) => c.attacks.find((a) => a.unarmed);
const NO_TRADE = { trade: 0, allOut: 0, defensive: 0, charge: false };
const DAZE = (param) => [{ name: 'Daze', param }];

/** A dazer with Deception 10 against a target with Insight 3 and Will 5 (so the target's best is 5). */
function dazePair(advantages = DAZE('Deception')) {
  const b = arena([['d', 'A', { advantages }], ['t', 'B', {}]]);
  const [d, t] = [fighter(b, 'd'), fighter(b, 't')];
  Object.assign(d.skills, { Deception: 10, Intimidation: 10 });
  Object.assign(t.skills, { Insight: 3, Deception: 0, Intimidation: 0 }); t.d.defenses.Will = 5;
  t.heroPoints = 0; d.heroPoints = 0;
  return { b, d, t };
}

// Requirement (p73): Daze is a Deception or Intimidation check against the target's best of the same skill, Insight or Will;
// a win leaves the target dazed (a single standard action) until the end of the dazer's next round.
test('Daze: winning the check leaves the target dazed, able to take only a standard action', () => {
  const { b, d, t } = dazePair();
  assert.equal(daze(b, d, t, dice(15, 5), 'Deception'), true);   // 25 against 10
  assert.equal(t.dazed, true);
  assert.equal(canAct(t), 'standard');
  assert.match(lastLog(b), /d tries to daze t: Deception d20 15 \+10 = 25 vs resistance d20 5 \+5 = 10 — t is DAZED \(a single standard action\) until the end of d's next round/);
  endOfTurn(b, t, dice());                                       // dazed wears off at the end of the target's turn
  assert.equal(t.dazed, false);
});

test('Daze: a hurt target with a hero point re-rolls a roll it is losing', () => {
  const { b, d, t } = dazePair();
  d.skills.Deception = 4; t.heroPoints = 1; t.bruises = 2;
  assert.equal(daze(b, d, t, dice(10, 2, 15), 'Deception'), false); // 14 against 7, then the re-roll makes it 20
  assert.ok(b.log.some((e) => /t spends a hero point to re-roll the Daze resistance/.test(e.text)));
  assert.equal(t.dazed, false);
});

test('Daze: a lost check does nothing', () => {
  const { b, d, t } = dazePair();
  assert.equal(daze(b, d, t, dice(2, 15), 'Deception'), false);
  assert.equal(t.dazed, false);
  assert.match(lastLog(b), /they shake it off/);
});

test('Daze: the target resists with the same skill, Insight or Will, whichever is highest', () => {
  const same = dazePair();
  same.t.skills.Deception = 12;                                  // its Deception beats Insight 3 and Will 5
  daze(same.b, same.d, same.t, dice(10, 10), 'Deception');       // 20 against 22
  assert.equal(same.t.dazed, false);
  assert.match(lastLog(same.b), /vs resistance d20 10 \+12 = 22/);
  const insight = dazePair();
  insight.t.skills.Insight = 9;
  daze(insight.b, insight.d, insight.t, dice(10, 10), 'Deception');
  assert.match(lastLog(insight.b), /vs resistance d20 10 \+9 = 19/);
  assert.equal(insight.t.dazed, true);
});

// Requirement (p73): a rank in Daze is one skill; Deception and Intimidation are separate advantages.
test('Daze: only the skills the character took can be used, one rank each', () => {
  const only = dazePair(DAZE('Deception'));
  assert.deepEqual(only.d.dazeSkills, ['Deception']);
  const both = dazePair([{ name: 'Daze', param: 'Deception' }, { name: 'Daze', param: 'Intimidation' }]);
  assert.deepEqual(both.d.dazeSkills.sort(), ['Deception', 'Intimidation']);
  const none = dazePair([]);
  assert.deepEqual(none.d.dazeSkills, []);
  assert.equal(dazeByChoice(none.b, none.d, { plan: 'attack', ev: 0 }, [none.t], dice()), false);
});

test('Daze: the AI dazes a dangerous foe when its own attack is poor, and not when the foe is already limited or immune', () => {
  const { b, d, t } = dazePair();
  t.attacks.forEach((a) => { a.bonus += 10; });                  // a foe worth slowing down
  assert.equal(dazeByChoice(b, d, { plan: 'attack', ev: 5 }, [t], dice()), false, 'its own attack is worth more');
  const rolls = dice(15, 5);
  assert.equal(dazeByChoice(b, d, { plan: 'attack', ev: 0.1 }, [t], rolls), true);
  assert.deepEqual([t.dazed, rolls.left()], [true, 0]);
  assert.equal(canDaze(t), false, 'already dazed');
  t.dazed = false; t.d.defenses.Will = null;
  assert.equal(canDaze(t), false, 'immune to Will effects');
  t.d.defenses.Will = 5; t.staggered = true;
  assert.equal(canDaze(t), false, 'a staggered foe is dazed enough');
});

// Requirement (p78): Startle is a feint with Intimidation, which the target resists with Insight, Intimidation or Will.
test('Startle: the feint uses Intimidation and the target resists with its best of Insight, Intimidation or Will', () => {
  const b = arena([['f', 'A', { advantages: [{ name: 'Startle' }] }], ['t', 'B', {}]]);
  const [f, t] = [fighter(b, 'f'), fighter(b, 't')];
  Object.assign(f.skills, { Deception: 2, Intimidation: 10 });
  Object.assign(t.skills, { Insight: 3, Deception: 8, Intimidation: 4 }); t.d.defenses.Will = 7; t.heroPoints = 0;
  assert.deepEqual(feintPick(f, t), { name: 'Intimidation', mine: 10, theirs: 7 });
  feint(b, f, t, dice(15, 5));                                   // 25 against 12
  assert.match(lastLog(b), /f feints with intimidation \(Startle\): Intimidation d20 15 \+10 = 25 vs t's Insight, Intimidation or Will d20 5 \+7 = 12 — t falls for it/);
  assert.equal(t.feinted.by, 'f');
  t.d.defenses.Will = null;                                      // immune to Will: Insight 3 and Intimidation 4 remain
  assert.equal(feintPick(f, t).theirs, 4);
});

test('without Startle the feint stays Deception against Insight or Deception, however good the Intimidation', () => {
  const b = arena([['f', 'A', {}], ['t', 'B', {}]]);
  const [f, t] = [fighter(b, 'f'), fighter(b, 't')];
  Object.assign(f.skills, { Deception: 2, Intimidation: 10 });
  Object.assign(t.skills, { Insight: 3, Deception: 8, Intimidation: 4 });
  assert.deepEqual(feintPick(f, t), { name: 'Deception', mine: 2, theirs: 8 });
});

// Requirement (p78): Set-up hands the feint to allies, one per rank, and the target is vulnerable to their next attack instead of the feinter's.
function feintTeam(ranks, positions = [], feinter = { Strength: 2, Fighting: 6 }) {
  const weak = { abilities: feinter }; const strong = { abilities: { Strength: 8, Fighting: 14 } };
  const b = arena([
    ['f', 'A', { ...weak, advantages: ranks ? [{ name: 'Set-up', rank: ranks }] : [] }, { x: 0, y: 0 }],
    ['a1', 'A', { ...strong }, positions[0] || { x: 1, y: 0 }], ['a2', 'A', { abilities: { Strength: 6, Fighting: 12 } }, positions[1] || { x: 2, y: 0 }],
    ['e', 'B', {}, { x: 1, y: 3 }]]);
  const m = Object.fromEntries(['f', 'a1', 'a2', 'e'].map((id) => [id, fighter(b, id)]));
  Object.assign(m.f.skills, { Deception: 20 }); m.e.heroPoints = 0;
  return { b, ...m };
}
test('Set-up: the feint makes the target vulnerable to the ally\'s next attack, not the feinter\'s', () => {
  const { b, f, a1, a2, e } = feintTeam(1);
  const full = defenseVs(e, 'Parry', f);
  feint(b, f, e, dice(20, 1));
  assert.deepEqual(e.feinted.for, ['a1']);
  assert.match(lastLog(b), /f feints : Deception.* — e falls for it and is vulnerable to a1's next attack \(Set-up\)/);
  assert.equal(defenseVs(e, 'Parry', a1), Math.ceil(full / 2));
  assert.equal(defenseVs(e, 'Parry', f), full, 'the feinter hands its benefit over');
  assert.equal(defenseVs(e, 'Parry', a2), full, 'only one ally with one rank');
  const hit = rollToHit(b, a1, unarmed(a1), e, dice(10), NO_TRADE, 0, []);
  assert.match(hit.text, /feinted: vulnerable to this attack/);
  assert.equal(defenseVs(e, 'Parry', a1), full, 'used up by that attack');
});

test('Set-up: two ranks hand it to two allies, each with an attack of its own', () => {
  const { b, f, a1, a2, e } = feintTeam(2);
  const full = defenseVs(e, 'Parry', f);
  feint(b, f, e, dice(20, 1));
  assert.deepEqual(e.feinted.for, ['a1', 'a2']);
  rollToHit(b, a1, unarmed(a1), e, dice(10), NO_TRADE, 0, []);
  assert.deepEqual(e.feinted.for, ['a2'], 'a1 used its own; a2 still has its');
  assert.equal(defenseVs(e, 'Parry', a2), Math.ceil(full / 2));
  rollToHit(b, a2, unarmed(a2), e, dice(10), NO_TRADE, 0, []);
  assert.equal(e.feinted, null);
});

test('Set-up: only allies the feinter can interact with, and only ones that attack better than the feinter', () => {
  const far = feintTeam(2, [{ x: 11, y: 0 }, { x: 2, y: 0 }]);
  assert.deepEqual(setUpAllies(far.b, far.f, far.e).map((a) => a.id), ['a2'], 'a1 is 55 ft away');
  const weakAlly = feintTeam(1, [], { Strength: 12, Fighting: 20 }); // the feinter hits harder than either ally
  assert.deepEqual(setUpAllies(weakAlly.b, weakAlly.f, weakAlly.e), []);
  feint(weakAlly.b, weakAlly.f, weakAlly.e, dice(20, 1));
  assert.deepEqual(weakAlly.e.feinted, { by: 'f', round: 1 }, 'kept by the feinter');
  const none = feintTeam(0);
  assert.deepEqual(setUpAllies(none.b, none.f, none.e), []);
});

test('Set-up: a feinter with it chooses to feint when an ally has the better attack', () => {
  const { b, f, e } = feintTeam(1);
  f.style = 'support'; e.d.defenses.Parry = 25;                 // a defense an attack alone rarely cracks
  const plan = choosePlan(b, R, f, [e], dice(), 'full');
  assert.equal(plan?.plan, 'feint');
  const without = feintTeam(0);
  without.f.style = 'support'; without.e.d.defenses.Parry = 25;
  assert.notEqual(choosePlan(without.b, R, without.f, [without.e], dice(), 'full')?.plan, 'feint');
});

// Requirement (p20): hero points go to the losing side of an opposed check or a contested roll: feint, demoralize, grab, escape, trip.
function pair(a = {}, t = {}) {
  const b = arena([['a', 'A', a], ['t', 'B', t]]);
  return { b, a: fighter(b, 'a'), t: fighter(b, 't') };
}
const spent = (b, re) => b.log.some((e) => re.test(e.text));
test('a hero point on a feint resistance, a demoralize resistance, and a grab resistance', () => {
  const feinted = pair();
  Object.assign(feinted.a.skills, { Deception: 2 }); Object.assign(feinted.t.skills, { Insight: 6, Deception: 0 }); feinted.t.bruises = 2;
  feint(feinted.b, feinted.a, feinted.t, dice(15, 5, 18));       // 17 against 11: the hurt target re-rolls to 24
  assert.ok(spent(feinted.b, /t spends a hero point to re-roll the feint resistance/));
  assert.equal(feinted.t.feinted, false);
  const cowed = pair();
  Object.assign(cowed.a.skills, { Intimidation: 2 }); Object.assign(cowed.t.skills, { Insight: 0 }); cowed.t.d.defenses.Will = 6; cowed.t.bruises = 2;
  assert.equal(demoralize(cowed.b, cowed.a, cowed.t, dice(15, 3, 18)), 0);
  assert.ok(spent(cowed.b, /t spends a hero point to re-roll the demoralize resistance/));
  const held = pair();
  held.t.d.defenses.Dodge = 6;
  grab(held.b, R, held.a, held.t, dice(1, 15), { free: true });  // DC 14 against 7: the re-roll breaks the hold
  assert.ok(spent(held.b, /t spends a hero point to re-roll the grab resistance/));
  assert.equal(held.a.holding, null);
});

test('a hero point on an escape check and on a trip resistance', () => {
  const held = pair();
  held.a.holding = 't'; held.t.grabbedBy = 'a';
  held.t.conditions.push({ name: 'Bound', degree: 2, from: 'a', source: 'grab', label: 'held' });
  held.t.skills.Athletics = 4;
  assert.equal(tryEscape(held.b, held.t, held.a, dice(3, 15)), true); // DC 14 against 7: the re-roll gets free
  assert.ok(spent(held.b, /t spends a hero point to re-roll the escape check/));
  assert.equal(held.t.grabbedBy, null);
  const tripped = pair();
  Object.assign(tripped.a.skills, { Acrobatics: 6, Athletics: 6 }); Object.assign(tripped.t.skills, { Acrobatics: 4, Athletics: 4 }); tripped.t.bruises = 2;
  trip(tripped.b, tripped.a, tripped.t, dice(20, 10, 3, 17, 12, 4)); // 16 against 7: the hurt target re-rolls to 21 and stays up
  assert.ok(spent(tripped.b, /t spends a hero point to re-roll the trip resistance/));
  assert.ok(!isProne(tripped.t));
});

// Requirement: the turn code calls the fortune and trick choices (Leadership, Inspire, Daze, recovering from exhaustion) on a real turn.
test('a whole turn: a leader rallies a stunned ally, an inspirer inspires, a dazer dazes, an exhausted fighter recovers, a finishing blow borrows Power Attack', () => {
  const weak = { abilities: { Strength: 0, Fighting: 0 } };
  const turn = (b, c) => takeTurn(b, R, c, rngFor(b));
  const lead = arena([['l', 'A', { ...weak, advantages: [{ name: 'Leadership' }] }, { x: 0, y: 0 }], ['w', 'A', {}, { x: 1, y: 0 }], ['e', 'B', { abilities: { Strength: 8 } }, { x: 0, y: 4 }]]);
  fighter(lead, 'w').conditions.push({ name: 'Stunned', degree: 1, source: 'blast', from: 'e' });
  turn(lead, fighter(lead, 'l'));
  assert.equal(fighter(lead, 'w').conditions.length, 0);
  assert.ok(lead.log.some((e) => /rally w \(Leadership\)/.test(e.text)));
  const band = arena([['i', 'A', { advantages: [{ name: 'Inspire', rank: 2 }] }, { x: 0, y: 0 }], ['x', 'A', {}, { x: 1, y: 0 }], ['y', 'A', {}, { x: 2, y: 0 }], ['e', 'B', {}, { x: 0, y: 4 }]]);
  turn(band, fighter(band, 'i'));
  assert.equal(fighter(band, 'x').inspired.bonus, 2);
  const dazer = arena([['d', 'A', { ...weak, advantages: DAZE('Deception') }, { x: 0, y: 0 }], ['t', 'B', { abilities: { Strength: 8, Fighting: 14 } }, { x: 0, y: 3 }]]);
  Object.assign(fighter(dazer, 'd').skills, { Deception: 30 }); fighter(dazer, 't').heroPoints = 0;
  turn(dazer, fighter(dazer, 'd'));
  assert.ok(dazer.log.some((e) => /d tries to daze t/.test(e.text)));
  const tired = arena([['a', 'A', {}, { x: 0, y: 0 }], ['e', 'B', {}, { x: 0, y: 4 }]]);
  fighter(tired, 'a').fatigue = 2;
  turn(tired, fighter(tired, 'a'));
  assert.ok(tired.log.some((e) => /a spends a hero point to recover from being exhausted/.test(e.text)));
  const finish = arena([['a', 'A', { abilities: { Strength: 8, Fighting: 12 } }, { x: 0, y: 0 }], ['t', 'B', { abilities: { Stamina: 8 } }, { x: 1, y: 0 }]]);
  Object.assign(fighter(finish, 't'), { staggered: true, heroPoints: 0 }); fighter(finish, 't').d.defenses.Parry = 0;
  turn(finish, fighter(finish, 'a'));
  assert.ok(finish.log.some((e) => /a spends a hero point on a Heroic Feat: Power Attack/.test(e.text)));
});

test('a whole round: the inspiration lasts until the inspirer\'s next turn begins, and no longer', () => {
  const b = arena([['i', 'A', { advantages: [{ name: 'Inspire', rank: 2 }] }, { x: 0, y: 0 }], ['x', 'A', {}, { x: 1, y: 0 }], ['y', 'A', {}, { x: 2, y: 0 }], ['e', 'B', {}, { x: 0, y: 4 }]]);
  b.order = ['i', 'x', 'y', 'e']; b.turn = 0;
  for (let k = 0; k < 4; k++) step(b, R);                        // round 1: i inspires, then the others act
  assert.equal(fighter(b, 'x').inspired?.bonus, 2);
  step(b, R);                                                    // round 2 begins with i's turn
  assert.deepEqual([b.round, fighter(b, 'x').inspired], [2, null]);
});
