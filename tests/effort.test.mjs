// Extra effort (Hero's Handbook p19-20) and Extraordinary Effort (p74): which benefit the AI takes, what it costs, and that
// it is once a turn. Dice are scripted where a roll matters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerArena, dice, text, R, who } from './helpers/power-arena.mjs';
import { pickEffort, effortEffect, extraAction, extraResistance, speedEffort, payOwed } from '../src/engine/battle/effort.js';
import { squaresInMove } from '../src/engine/battle/geometry.js';
import { endOfTurn } from '../src/engine/battle/end-of-turn.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { zap } from './helpers/flaw-kit.mjs';

const brute = { abilities: { Strength: 8, Fighting: 8 } };

/** A brawler U (team A) next to T (team B). */
function fight(userSpec = {}, targetSpec = {}, options = {}) {
  const b = powerArena([['U', 'A', { style: 'brawler', ...brute, ...userSpec }, { x: 0, y: 0 }], ['T', 'B', { hp: 0, ...targetSpec }, { x: 1, y: 0 }]], { extraEffort: true, ...options });
  const u = who(b, 'U');
  return { b, u, t: who(b, 'T'), atk: u.attacks.find((a) => a.unarmed) };
}

test('a hurt unarmed fighter with a hero point pushes its Strength (+1 rank); without one it saves its strength', () => {
  const f = fight();
  f.u.staggered = true;
  assert.equal(pickEffort(f.b, f.u, f.atk, f.t, dice()), 'strength');
  const none = fight({ hp: 0 });
  none.u.staggered = true;
  assert.equal(pickEffort(none.b, none.u, none.atk, none.t, dice()), null, 'no hero point to take the fatigue away');
  const fresh = fight();
  assert.equal(pickEffort(fresh.b, fresh.u, fresh.atk, fresh.t, dice()), null, 'not losing: it saves its strength');
});

test('a power is pushed (+1 rank), or two ranks with Extraordinary Effort at double the cost', () => {
  const f = fight({ powers: [zap([], { rank: 8 })], advantages: [] });
  f.u.staggered = true;
  const power = f.u.attacks.find((a) => a.name === 'Zap');
  assert.equal(pickEffort(f.b, f.u, power, f.t, dice()), 'power');
  const big = fight({ hp: 0, powers: [zap([], { rank: 8 })], advantages: [{ name: 'Extraordinary Effort', rank: 1 }] });
  big.u.staggered = true;
  const bigPower = big.u.attacks.find((a) => a.name === 'Zap');
  assert.equal(pickEffort(big.b, big.u, bigPower, big.t, dice()), 'double');
  const e = effortEffect(big.b, big.u, dice(), 'double');
  assert.equal(e.rank, 2);
  assert.equal(big.u.fatigue, 2, 'two levels: exhausted (no hero point to take any away)');
  assert.match(e.text, /Extraordinary Effort: \+2 ranks \(two benefits\), now exhausted/);
  big.u.fatigue = 1; // already fatigued: the double effort is not offered
  big.u.effortRound = null;
  assert.equal(pickEffort(big.b, big.u, bigPower, big.t, dice()), 'power');
});

test('a hero point spent on the effort takes one level of fatigue away', () => {
  const f = fight();
  const e = effortEffect(f.b, f.u, dice(), 'strength'); // dice().chance is always true
  assert.equal(f.u.fatigue, 0);
  assert.equal(f.u.heroPoints, 0);
  assert.match(e.text, /spends a hero point to shrug off the fatigue/);
});

test('extra effort is once a turn, and the AI stops at fatigued', () => {
  const f = fight();
  f.u.staggered = true;
  effortEffect(f.b, f.u, dice(), 'strength');
  assert.equal(pickEffort(f.b, f.u, f.atk, f.t, dice()), null, 'already used this turn');
  f.b.round++;
  f.u.fatigue = 2;
  assert.equal(pickEffort(f.b, f.u, f.atk, f.t, dice()), null, 'exhausted');
});

test('the +2 bonus on the attack check goes into the roll and the log, and only when it lifts the odds enough', () => {
  const f = fight({ powers: [zap([], { rank: 8 })] }, { abilities: { Agility: 0 } }); // Dodge 6: a toss-up for a +2 attacker
  const atk = f.u.attacks.find((a) => a.name === 'Zap');
  atk.power = null; atk.equipment = true; atk.unarmed = false; // an attack with a roll and no power to push
  f.u.staggered = true;
  assert.equal(pickEffort(f.b, f.u, atk, f.t, dice()), 'bonus');
  resolveAttack(f.b, R, f.u, atk, f.t, dice(11, 20), { effort: 'bonus' }); // 11 + 2 + 2 = 15 against Dodge DC 20 with the bonus: 17 still misses...
  assert.match(text(f.b), /extra effort: \+2 on the attack check/);
  assert.match(text(f.b), /d20 11 \+4 = 15/, 'the bonus is in the modifier (+2 for the bonus on top of +2)');
});

test('an extra standard action finishes a staggered foe with a strong attack, once, and not without a hero point', () => {
  const f = fight({ abilities: { Strength: 0, Fighting: 0, Dexterity: 6 }, powers: [zap([], { rank: 12 })] });
  f.t.staggered = true;
  f.b.log.length = 0;
  const used = extraAction(f.b, R, f.u, dice(19, 2), false);
  assert.equal(used, true);
  assert.match(text(f.b), /U uses extra effort for an extra standard action/);
  const none = fight({ abilities: { Strength: 0, Fighting: 0, Dexterity: 6 }, powers: [zap([], { rank: 12 })], hp: 0 });
  none.t.staggered = true;
  assert.equal(extraAction(none.b, R, none.u, dice(), false), false);
  const fine = fight({ abilities: { Strength: 0, Fighting: 0, Dexterity: 6 }, powers: [zap([], { rank: 12 })] });
  assert.equal(extraAction(fine.b, R, fine.u, dice(), false), false, 'the foe is not hurt');
  const again = fight({ abilities: { Strength: 0, Fighting: 0, Dexterity: 6 }, powers: [zap([], { rank: 12 })] });
  again.t.staggered = true;
  assert.equal(extraAction(again.b, R, again.u, dice(), true), false, 'extra effort was already used this turn');
});

test('+1 speed rank doubles a move, and its fatigue comes at the end of the turn, not while moving', () => {
  const f = fight();
  const before = squaresInMove(f.b, f.u);
  assert.equal(speedEffort(f.b, f.u), true);
  assert.equal(squaresInMove(f.b, f.u), before * 2);
  assert.equal(f.u.fatigue, 0, 'not hindered while it moves');
  assert.equal(speedEffort(f.b, f.u), false, 'once a turn');
  payOwed(f.b, f.u, dice());
  assert.ok(f.u.fatigue + (f.u.heroPoints === 0 ? 1 : 0) >= 1, 'now it pays (a hero point may take it away)');
  assert.match(text(f.b), /pays for the speed/);
});

test('an extra resistance check: a severe ongoing effect that was not shaken off gets one more try, for a level of fatigue', () => {
  const f = fight({ hp: 0 });
  f.u.conditions.push({ name: 'Stunned', names: ['Stunned'], source: 'x', from: 'T', degree: 2, dc: 15, resist: 'Will', label: 'Mind Lock' });
  f.b.round = 2;
  endOfTurn(f.b, f.u, dice(2, 20), R); // fails the first check, then the extra one passes
  assert.match(text(f.b), /U uses extra effort for an extra resistance check/);
  assert.match(text(f.b), /shakes off Mind Lock/);
  assert.equal(f.u.fatigue, 1);
  assert.equal(extraResistance(f.b, f.u, dice(), true), false, 'fatigued already: not again');
  const mild = fight({ hp: 0 });
  mild.u.conditions.push({ name: 'Dazed', names: ['Dazed'], source: 'y', from: 'T', degree: 1, dc: 15, resist: 'Will', label: 'Daze' });
  endOfTurn(mild.b, mild.u, dice(2), R);
  assert.equal(mild.u.fatigue, 0, 'a mild condition is not worth the fatigue');
});
