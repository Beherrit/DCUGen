// One utility for every way to spend a turn (src/engine/battle/utility*.js): a heal, a control, a Weaken, a buff and a guard
// are scored in the same expected degrees as an attack. Hand-built fighters on a small grid; each case has a "wins" and a
// "loses" side. Dice are not scripted: the margins are wide enough that the die-roll wobble in the planner cannot flip them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, deflect, powerArena, who, text } from './helpers/power-arena.mjs';
import { takeTurn } from '../src/engine/battle/turn.js';
import { choosePlan } from '../src/engine/battle/plan.js';
import { healOption, healChances, damageOf } from '../src/engine/battle/utility-heal.js';
import { buffOption } from '../src/engine/battle/utility-buff.js';
import { attackValue } from '../src/engine/battle/utility-attack.js';
import { weakenValue } from '../src/engine/battle/utility-weaken.js';
import { controlValue } from '../src/engine/battle/utility-control.js';
import { deflectTurn } from '../src/engine/battle/deflect-plan.js';
import { expectedValue } from '../src/engine/battle/odds.js';
import { heal } from '../src/engine/battle/support.js';
import { enemiesOf, rngFor } from '../src/engine/battle/util.js';
import { makeRng } from '../src/engine/rng.js';
import { CONDITION_WORTH, DAZED_WORTH, TURN_PER_HARM, K_ATTACK } from '../src/engine/battle/utility-scale.js';

const power = (name, effect, rank, extra = {}) => ({ name, effect, rank, extras: [], flaws: [], role: 'attack', range: 'Close', ...extra });
const smash = (rank) => power('Smash', 'Damage', rank);
const mend = (rank) => power('Mend', 'Healing', rank, { role: 'utility' });
const stun = (rank) => power('Stun Touch', 'Affliction', rank, { detail: 'Resisted by Fortitude; Dazed, Stunned, Incapacitated' });
const sap = (rank, trait = 'Toughness') => power('Sap', 'Weaken', rank, { detail: `${trait}; Resisted by Fortitude` });
const lend = (option, rank) => power('Shield Aura', 'Enhanced Trait', rank, { role: 'utility', option, extras: [{ name: 'Affects Others', option: 'Others only' }] });
const SOFT = { abilities: { Strength: 0, Fighting: 4, Stamina: 2 }, defenses: { Parry: 4, Dodge: 4 } };
const OPEN = { abilities: { Strength: 0, Fighting: 4, Stamina: 2 }, defenses: { Parry: 0, Dodge: 0 } };
const SKILLED = { abilities: { Strength: 0, Fighting: 10, Stamina: 2 }, defenses: { Parry: 4, Dodge: 4 } };
const BRUTE = { abilities: { Strength: 0, Fighting: 8, Stamina: 2 }, defenses: { Parry: 0, Dodge: 0 } };
const armor = (rank) => power('Armor', 'Protection', rank, { role: 'defense', range: 'Personal' });
const NO_HEROES = { heroPoints: false };
const turn = (b, id, seed = 'u') => { b.status = 'running'; takeTurn(b, R, who(b, id), makeRng(seed)); return text(b); };

// ---- 1 and 2: heal ------------------------------------------------------------------------------------

test('1. heal wins: a healer with a poor attack heals a staggered ally instead of swinging', () => {
  const b = powerArena([['med', 'A', { ...SOFT, powers: [mend(6), smash(2)] }, { x: 1, y: 0 }], ['ally', 'A', SOFT, { x: 2, y: 0 }], ['foe', 'B', { powers: [smash(8)] }, { x: 4, y: 0 }]], NO_HEROES);
  who(b, 'ally').staggered = true; who(b, 'ally').bruises = 1;
  b.trace = [];
  assert.match(turn(b, 'med'), /med uses Mend on ally/);
  assert.equal(b.trace.choices[0].choice, 'heal');
  assert.ok(b.trace.choices[0].utility > b.trace.choices[0].own);
});

test('2. heal loses: one bruise on an ally is not worth a very strong attack, and a healthy ally is never healed', () => {
  const b = powerArena([['med', 'A', { powers: [mend(6), smash(15)] }, { x: 1, y: 0 }], ['ally', 'A', SOFT, { x: 2, y: 0 }], ['foe', 'B', { ...OPEN, powers: [smash(2)] }, { x: 2, y: 1 }]], NO_HEROES);
  who(b, 'ally').bruises = 1;
  const foes = enemiesOf(b, who(b, 'med'));
  const heal1 = healOption(b, who(b, 'med'), foes, 'full');
  const plan = choosePlan(b, R, who(b, 'med'), foes, rngFor(b), 'full');
  assert.ok(heal1.u < plan.utility, `heal ${heal1.u.toFixed(2)} against attack ${plan.utility.toFixed(2)}`);
  assert.doesNotMatch(turn(b, 'med'), /uses Mend/);
  who(b, 'ally').bruises = 0;
  assert.equal(healOption(b, who(b, 'med'), foes, 'full'), null, 'nobody to heal');
});

test('heal check against the book: DC 10, a degree per damage condition worst first, no second try after a failure', () => {
  assert.match(R.effect('Healing').summary, /DC 10 check, one per degree/);
  const b = powerArena([['med', 'A', { powers: [mend(5)] }, { x: 0, y: 0 }], ['ally', 'A', SOFT, { x: 1, y: 0 }], ['foe', 'B', SOFT, { x: 5, y: 0 }]], NO_HEROES);
  const ally = who(b, 'ally'); Object.assign(ally, { staggered: true, dazed: true, bruises: 2 });
  const roll = (n) => ({ int: () => n, chance: () => false, next: () => 0.5, pick: (a) => a[0] });
  heal(b, who(b, 'med'), ally, roll(5));   // 5 + 5 = 10: one degree, the worst condition
  assert.deepEqual([ally.staggered, ally.dazed, ally.bruises], [false, true, 2]);
  heal(b, who(b, 'med'), ally, roll(15));  // 20 is DC 10 + 10: three degrees
  assert.deepEqual([ally.staggered, ally.dazed, ally.bruises], [false, false, 0].map((x, i) => (i === 2 ? 0 : x)));
  Object.assign(ally, { bruises: 2 });
  heal(b, who(b, 'med'), ally, roll(4));   // 9 fails
  assert.equal(ally.bruises, 2);
  assert.equal(ally.healFailed, true);
  assert.equal(healOption(b, who(b, 'med'), enemiesOf(b, who(b, 'med')), 'full'), null, 'the book says wait a minute before trying again');
  assert.deepEqual(damageOf({ staggered: true, dazed: true, bruises: 1 }).length, 3);
  assert.ok(healChances(5, 3)[0] > healChances(5, 3)[1], 'more degrees are less likely');
});

// ---- 3 and 4: control ---------------------------------------------------------------------------------

/** A stunner and a damage dealer on one side against a dangerous brute and a harmless clerk. */
function controlArena() {
  return powerArena([
    ['ctl', 'A', { ...SKILLED, powers: [stun(8), smash(3)] }, { x: 1, y: 0 }], ['ally', 'A', SOFT, { x: 2, y: 0 }],
    ['brute', 'B', { ...BRUTE, powers: [smash(12)] }, { x: 1, y: 1 }], ['clerk', 'B', { ...BRUTE, powers: [smash(1)] }, { x: 0, y: 1 }],
  ], NO_HEROES);
}

test('3. control wins: stunning the dangerous brute is worth more than the old severity guess, far more than the clerk, and is picked', () => {
  const b = controlArena();
  const c = who(b, 'ctl'); const brute = who(b, 'brute'); const clerk = who(b, 'clerk');
  const atk = c.attacks.find((a) => a.name === 'Stun Touch');
  const opts = { dist: 0, b };
  const ev = expectedValue(c, atk, brute, opts);
  const worth = (t) => controlValue(b, c, atk, t, opts);
  assert.ok(worth(brute) > ev, `the brute's turns are worth ${worth(brute).toFixed(2)} against a guess of ${ev.toFixed(2)}`);
  assert.ok(attackValue(b, c, atk, brute, ev, opts) >= worth(brute), 'the planner uses it');
  assert.ok(worth(clerk) < worth(brute) / 2, 'a clerk with a feeble attack is worth less than half as much to stop');
  assert.ok(worth(clerk) < ev, 'and less than the old guess, which did not look at who it was');
  const plan = choosePlan(b, R, c, enemiesOf(b, c), makeRng('p'), 'full');
  assert.deepEqual([plan.target.id, plan.attack.name], ['brute', 'Stun Touch']);
});

test('4. control loses: a brute that is already stunned is worth little to stun again, so the next threat comes first', () => {
  const b = controlArena();
  const c = who(b, 'ctl'); const brute = who(b, 'brute');
  const atk = c.attacks.find((a) => a.name === 'Stun Touch');
  const fresh = controlValue(b, c, atk, brute, { dist: 0, b });
  brute.conditions.push({ name: 'Stunned', names: ['Stunned'], degree: 2, from: 'ally', source: 'other', label: 'Other', dc: 18, resist: 'Fortitude' });
  const held = controlValue(b, c, atk, brute, { dist: 0, b });
  assert.ok(held < fresh * 0.25, `already held ${held.toFixed(2)} against ${fresh.toFixed(2)}`);
  assert.equal(who(b, 'brute').out, false);
});

// ---- 5 and 6: weaken ----------------------------------------------------------------------------------

test('5. weaken wins: lowering a boss\'s Toughness pays when the team\'s strikers hit it next', () => {
  const b = powerArena([
    ['deb', 'A', { ...SOFT, powers: [sap(12), smash(2)] }, { x: 1, y: 0 }], ['s1', 'A', { ...SOFT, powers: [smash(8)] }, { x: 2, y: 0 }], ['s2', 'A', { ...SOFT, powers: [smash(8)] }, { x: 2, y: 1 }],
    ['boss', 'B', { ...OPEN, powers: [smash(3), armor(20)] }, { x: 1, y: 1 }],
  ], NO_HEROES);
  const c = who(b, 'deb'); const boss = who(b, 'boss');
  const atk = c.attacks.find((a) => a.name === 'Sap');
  const opts = { dist: 0, b };
  assert.equal(atk.weakens, 'Toughness');
  const worth = weakenValue(b, c, atk, boss, opts);
  const dmg = expectedValue(c, c.attacks.find((a) => a.name === 'Smash'), boss, opts);
  assert.ok(worth > dmg * 3, `weaken ${worth.toFixed(2)} against its own damage ${dmg.toFixed(2)}`);
  assert.equal(choosePlan(b, R, c, enemiesOf(b, c), makeRng('p'), 'full').attack.name, 'Sap');
});

test('6. weaken loses: lowering a trait that no attack of the team uses is worth nothing', () => {
  const b = powerArena([
    ['deb', 'A', { ...SOFT, powers: [sap(8, 'Will'), smash(5)] }, { x: 1, y: 0 }], ['s1', 'A', { ...SOFT, powers: [smash(8)] }, { x: 2, y: 0 }],
    ['boss', 'B', { ...OPEN, powers: [smash(3), armor(10)] }, { x: 1, y: 1 }],
  ], NO_HEROES);
  const c = who(b, 'deb'); const atk = c.attacks.find((a) => a.name === 'Sap');
  assert.equal(atk.weakens, 'Will');
  assert.equal(weakenValue(b, c, atk, who(b, 'boss'), { dist: 0, b }), 0, 'Damage is resisted by Toughness');
  assert.equal(choosePlan(b, R, c, enemiesOf(b, c), makeRng('p'), 'full').attack.name, 'Smash');
});

// ---- 7 and 8: buff ------------------------------------------------------------------------------------

/** A buffer with Parry 8 to lend and an attack of `ownRank`, beside an unarmored ally, with a hard hitter in front. */
function buffArena(ownRank, foeRank = 10) {
  return powerArena([['aur', 'A', { ...SOFT, powers: [lend('Parry', 8), smash(ownRank)] }, { x: 1, y: 0 }], ['ally', 'A', OPEN, { x: 2, y: 0 }],
    ['foe', 'B', { ...SOFT, abilities: { Strength: 0, Fighting: 8, Stamina: 2 }, powers: [smash(foeRank)] }, { x: 3, y: 0 }]], NO_HEROES);
}

test('7. buff wins: lending Parry to an ally under heavy fire beats a weak attack, and the gift lasts while the giver can keep it up', () => {
  const b = buffArena(1);
  const ally = who(b, 'ally'); const parry = ally.d.defenses.Parry;
  b.trace = [];
  assert.match(turn(b, 'aur'), /aur lends ally Shield Aura \(Parry \+8\)/);
  assert.equal(ally.d.defenses.Parry, parry + 8);
  assert.equal(b.trace.choices[0].choice, 'buff');
  who(b, 'aur').conditions.push({ name: 'Stunned', names: ['Stunned'], degree: 2, from: 'foe', source: 'x', label: 'x', dc: 15, resist: 'Fortitude' });
  turn(b, 'ally');                                      // the next turn starts: the giver can no longer keep it up
  assert.equal(ally.d.defenses.Parry, parry);
  assert.equal(ally.grants.length, 0);
});

test('8. buff loses: with a strong attack of its own the buffer attacks, and a calm ally is not worth a gift', () => {
  const calm = buffArena(9);
  const aur = who(calm, 'aur'); const foes = enemiesOf(calm, aur);
  const plan = choosePlan(calm, R, aur, foes, makeRng('p'), 'full');
  const gift = buffOption(calm, aur, foes, 'full');
  assert.ok(!gift || gift.u < plan.utility, `buff ${gift?.u.toFixed(2)} against attack ${plan.utility.toFixed(2)}`);
  assert.doesNotMatch(turn(calm, 'aur'), /lends/);
  const quiet = buffArena(9, 1);
  const worth = (arena) => buffOption(arena, who(arena, 'aur'), enemiesOf(arena, who(arena, 'aur')), 'full')?.u ?? 0;
  assert.ok(worth(quiet) < worth(calm) / 2, 'a foe with a feeble attack gives the gift little to do');
});

// ---- 9 and 10: protect --------------------------------------------------------------------------------

/** A guard with Deflect and the given attack beside an ally, with a hard hitter 3 squares away. */
function guardArena(ownRank, foeRank = 10) {
  return powerArena([
    ['guard', 'A', { ...SOFT, powers: [deflect(9), smash(ownRank)] }, { x: 1, y: 0 }], ['ally', 'A', { ...SOFT, abilities: { Strength: 0, Fighting: 0, Stamina: 0 }, defenses: { Parry: 0, Dodge: 0 } }, { x: 2, y: 0 }],
    ['foe', 'B', { ...SOFT, powers: [smash(foeRank)] }, { x: 4, y: 0 }],
  ], NO_HEROES);
}

test('9. protect wins: the Defend action to deflect beats a weak attack when the ally would take a heavy hit', () => {
  const b = guardArena(1);
  const g = who(b, 'guard');
  const choice = choosePlan(b, R, g, enemiesOf(b, g), makeRng('p'), 'full');
  assert.equal(deflectTurn(b, g, choice, enemiesOf(b, g), 'full'), true);
  assert.equal(g.deflecting, true);
});

test('10. protect loses: with a strong attack of its own the guard attacks instead', () => {
  const b = guardArena(12, 2);
  const g = who(b, 'guard');
  const choice = choosePlan(b, R, g, enemiesOf(b, g), makeRng('p'), 'full');
  assert.equal(deflectTurn(b, g, choice, enemiesOf(b, g), 'full'), false);
  assert.equal(g.deflecting, false);
});

// ---- the best option, and the measured scale -------------------------------------------------------------

test('the best heal goes to the patient with the most to mend, whichever ally stands where', () => {
  for (const [near, far] of [['a1', 'a2'], ['a2', 'a1']]) {
    const b = powerArena([['med', 'A', { powers: [mend(6)] }, { x: 3, y: 0 }], [near, 'A', SOFT, { x: 2, y: 0 }], [far, 'A', SOFT, { x: 4, y: 0 }], ['foe', 'B', { ...OPEN, powers: [smash(2)] }, { x: 8, y: 0 }]], NO_HEROES);
    const hurt = who(b, far); hurt.staggered = true; hurt.bruises = 2;
    who(b, near).bruises = 1;
    const o = healOption(b, who(b, 'med'), enemiesOf(b, who(b, 'med')), 'full');
    assert.equal(o.patient.id, far, 'three conditions beat one');
    who(b, near).bruises = 0; who(b, far).staggered = false; who(b, far).bruises = 1;
    who(b, near).dazed = true;
    assert.equal(healOption(b, who(b, 'med'), enemiesOf(b, who(b, 'med')), 'full').patient.id, far, 'a bruise beats a daze, which wears off on its own');
  }
});

test('the measured scale: a bruise and staggered are worth the same to heal, a daze about half, and a lost enemy turn about 1.3 of its harm', () => {
  assert.deepEqual(damageOf({ staggered: true, dazed: true, bruises: 1 }), [CONDITION_WORTH, DAZED_WORTH, CONDITION_WORTH]);
  assert.ok(Math.abs(DAZED_WORTH / CONDITION_WORTH - 0.43) < 0.01, 'a daze is about 0.43 of a condition: half a turn of the 0.024 a lost turn gains, against 0.028');
  assert.ok(TURN_PER_HARM > 1.2 && TURN_PER_HARM < 1.4);
  assert.ok(K_ATTACK > 0.005 && K_ATTACK < 0.02);
});

test('Sustain: a healer tries again after a failed check with extra effort and walks to a hurt ally out of reach; otherwise it does neither', () => {
  const squad = (tactics, ally = { x: 1, y: 0 }) => powerArena([['med', 'A', { powers: [mend(6)] }, { x: 0, y: 0 }], ['ally', 'A', SOFT, ally], ['foe', 'B', { ...OPEN, powers: [smash(2)] }, { x: 11, y: 11 }]], { ...NO_HEROES, ...(tactics ? { teamTactics: { A: tactics } } : {}) });
  const ask = (b) => healOption(b, who(b, 'med'), enemiesOf(b, who(b, 'med')), 'full');
  const roll = (n) => ({ int: () => n, chance: () => false, next: () => 0.5, pick: (a) => a[0] });
  for (const [tactics, retries] of [[null, false], ['sustain', true]]) {
    const b = squad(tactics); const ally = who(b, 'ally'); const med = who(b, 'med');
    ally.bruises = 2; ally.healFailed = true;
    const o = ask(b);
    assert.equal(!!o, retries, 'a failed check blocks the retry unless the Sustain healer pays in fatigue');
    if (o) { o.run(b, R, med, roll(15)); assert.deepEqual([med.fatigue, ally.healFailed, ally.bruises], [1, false, 0]); }
  }
  assert.equal(ask(squad(null, { x: 9, y: 0 })), null, 'out of reach, with no plan to walk');
  const far = squad('sustain', { x: 9, y: 0 });
  const walk = ask(far);
  assert.equal(walk, null, 'a healthy ally needs no one');
  who(far, 'ally').bruises = 2;
  const o = ask(far); const before = who(far, 'med').x;
  o.run(far, R, who(far, 'med'));
  assert.ok(who(far, 'med').x > before, 'it walks toward the patient');
  assert.equal(who(far, 'ally').bruises, 2, 'and heals next turn, not this one');
});
