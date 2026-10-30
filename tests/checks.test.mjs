import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle, addCover } from '../src/engine/battle.js';
import { checkResult, opposedCheck, opposedOdds } from '../src/engine/battle/checks.js';
import { feint, grab, tryEscape } from '../src/engine/battle/maneuvers.js';
import { trip } from '../src/engine/battle/trip.js';
import { demoralize } from '../src/engine/battle/support-actions.js';
import { applyEffect } from '../src/engine/battle/attack-effects.js';
import { damagePiece } from '../src/engine/battle/cover-damage.js';
import { endOfTurn } from '../src/engine/battle/end-of-turn.js';
import { isProne } from '../src/engine/battle/prone.js';

// One way to resolve a check (Hero's Handbook printed pages 10 to 14): degrees, the critical success on a natural 20,
// and opposed checks with the tie rule. The first half tests src/engine/battle/checks.js directly; the second half shows
// each module that makes a check (feint, grab, escape, trip, demoralize, Toughness, cover, recovery) uses it.

/** Scripted d20 rolls, in order. Asking for more than were given fails the test; `left()` says how many were not used. */
const dice = (...rolls) => ({ int: () => { assert.ok(rolls.length, 'the engine asked for more dice than the test gave'); return rolls.shift(); }, left: () => rolls.length });
const read = (r) => [r.success, r.degrees];

// --- checkResult -----------------------------------------------------------------------------------------------------

test('degrees: one at the DC, one more per full 5 over; one under, one more per full 5 under', () => {
  // A roll of 10 with the bonus moved around a DC of 10 (no natural 20 anywhere).
  const at = (bonus) => read(checkResult(10, bonus, 10));
  assert.deepEqual(at(0), [true, 1]);
  assert.deepEqual(at(4), [true, 1]);
  assert.deepEqual(at(5), [true, 2]);
  assert.deepEqual(at(9), [true, 2]);
  assert.deepEqual(at(10), [true, 3]);
  assert.deepEqual(at(-1), [false, 1]);
  assert.deepEqual(at(-5), [false, 1]);
  assert.deepEqual(at(-6), [false, 2]);
  assert.deepEqual(at(-11), [false, 3]);
});

test('natural 20: a success gains a degree, a one-degree failure becomes a success, a two-degree failure becomes one', () => {
  // Roll 20 with the bonus chosen so that the total (and so the plain result) is as listed.
  const crit = (total) => checkResult(20, total - 20, 10);
  assert.deepEqual(read(crit(10)), [true, 2], 'plain: one degree of success');
  assert.deepEqual(read(crit(14)), [true, 2]);
  assert.deepEqual(read(crit(15)), [true, 3]);
  assert.deepEqual(read(crit(5)), [true, 1], 'plain: one degree of failure');
  assert.deepEqual(read(crit(9)), [true, 1]);
  assert.deepEqual(read(crit(4)), [false, 1], 'plain: two degrees of failure');
  assert.deepEqual(read(crit(-1)), [false, 2], 'plain: three degrees of failure');
  assert.equal(crit(4).crit, true);
  assert.equal(checkResult(19, -15, 10).crit, false, 'only a natural 20 is a critical success');
  assert.deepEqual(read(checkResult(19, -15, 10)), [false, 2], 'the same total without the natural 20');
});

// --- opposedCheck ----------------------------------------------------------------------------------------------------

test('opposed: the higher total wins and the degrees are counted from the loser\'s total', () => {
  const none = dice();
  let r = opposedCheck(none, { bonus: 0, roll: 15 }, { bonus: 0, roll: 10 });
  assert.deepEqual([r.winner, r.degrees, r.tie], ['a', 2, null]);
  r = opposedCheck(none, { bonus: 0, roll: 6 }, { bonus: 2, roll: 14 });
  assert.deepEqual([r.winner, r.degrees], ['b', 3], '16 against 6 is 10 over: three degrees');
  r = opposedCheck(none, { bonus: 10, roll: 12 }, { bonus: 2, roll: 5 });
  assert.deepEqual([r.winner, r.degrees], ['a', 4], '22 against 7 is 15 over');
  assert.deepEqual([r.rolls, r.totals], [[12, 5], { a: 22, b: 7 }]);
  assert.equal(none.left(), 0, 'no die was thrown when the sides were given their rolls and did not tie');
});

test('opposed: it rolls each side\'s die itself, a first and then b', () => {
  const rng = dice(14, 9);
  const r = opposedCheck(rng, { bonus: 0 }, { bonus: 3 });
  assert.deepEqual([r.rolls, r.winner], [[14, 9], 'a']);
  assert.equal(rng.left(), 0);
});

test('opposed: a tie goes to the higher bonus, with no extra die', () => {
  const rng = dice();
  let r = opposedCheck(rng, { bonus: 5, roll: 10 }, { bonus: 0, roll: 15 });
  assert.deepEqual([r.winner, r.tie, r.degrees], ['a', 'bonus', 1]);
  r = opposedCheck(rng, { bonus: 0, roll: 15 }, { bonus: 5, roll: 10 });
  assert.deepEqual([r.winner, r.tie], ['b', 'bonus']);
});

test('opposed: a tie with equal bonuses is a d20, 1 to 10 for a and 11 to 20 for b, and only then is it thrown', () => {
  for (const [die, winner] of [[1, 'a'], [10, 'a'], [11, 'b'], [20, 'b']]) {
    const rng = dice(die);
    const r = opposedCheck(rng, { bonus: 3, roll: 10 }, { bonus: 3, roll: 10 });
    assert.deepEqual([r.winner, r.tie, r.tieRoll, r.degrees], [winner, 'die', die, 1], `d20 ${die}`);
    assert.equal(rng.left(), 0);
  }
});

test('opposed: a natural 20 turns a loss by one degree into a win, but not a loss by two', () => {
  const rng = dice();
  let r = opposedCheck(rng, { bonus: -10, roll: 20 }, { bonus: 5, roll: 10 }); // 10 against 15
  assert.deepEqual([r.winner, r.degrees, r.bumped], ['a', 1, true]);
  r = opposedCheck(rng, { bonus: -10, roll: 20 }, { bonus: 6, roll: 10 }); // 10 against 16
  assert.deepEqual([r.winner, r.bumped], ['b', false]);
  r = opposedCheck(rng, { bonus: 5, roll: 10 }, { bonus: -10, roll: 20 }); // the same, for b
  assert.deepEqual([r.winner, r.bumped], ['b', true]);
  r = opposedCheck(rng, { bonus: -10, roll: 20 }, { bonus: 5, roll: 20 }); // both natural 20: they cancel, the totals decide
  assert.deepEqual([r.winner, r.bumped], ['b', false]);
});

test('opposed odds follow the same rules: an even match is even, a tie goes to the higher bonus', () => {
  assert.equal(opposedOdds(4, 4), 0.5);
  for (const [m, t] of [[0, 3], [8, 2], [-4, 6]]) assert.ok(Math.abs(opposedOdds(m, t) + opposedOdds(t, m) - 1) < 1e-9, `${m} against ${t}`);
  // A higher bonus wins every tie of totals (it used to lose them), so +1 against +0 is better than the even count of strict wins.
  assert.ok(opposedOdds(1, 0) > 0.5);
});

// --- each module uses it ---------------------------------------------------------------------------------------------

const body = () => ({
  pl: 10, abilities: { Strength: 4, Stamina: 4, Agility: 4, Dexterity: 2, Fighting: 8, Intellect: 0, Awareness: 2, Presence: 2 },
  defenses: { Parry: 6, Dodge: 6 }, skills: [], advantages: [], powers: [],
});
/** Two fighters, `a` (team A) acting against `t` (team B). */
function arena() {
  const b = createBattle({ seed: 'checks' });
  addCombatant(b, makeCombatant(R, body(), { id: 'a', team: 'A' }));
  addCombatant(b, makeCombatant(R, body(), { id: 't', team: 'B' }));
  startBattle(b, R);
  b.log.length = 0;
  const [a, t] = ['a', 't'].map((id) => b.combatants.find((c) => c.id === id));
  return { b, a, t };
}
const lastText = (b) => b.log.at(-1).text;
const NAT20 = /natural 20: \+1 degree/;

test('feint: a natural 20 wins a lost opposed check by one degree, not by two', () => {
  for (const [theirs, fooled] of [[15, true], [16, false]]) {
    const { b, a, t } = arena();
    Object.assign(a.skills, { Deception: -10, Acrobatics: -10 }); a.adv['Agile Feint'] = 0;
    Object.assign(t.skills, { Insight: 0, Deception: 0 });
    const rng = dice(20, theirs);
    feint(b, a, t, rng);
    assert.equal(!!t.feinted, fooled, `target rolls ${theirs}`);
    assert.equal(NAT20.test(lastText(b)), fooled);
    assert.equal(rng.left(), 0);
  }
});

test('feint: a tie in the totals goes to the higher bonus', () => {
  const { b, a, t } = arena();
  Object.assign(a.skills, { Deception: 5 }); a.adv['Agile Feint'] = 0;
  Object.assign(t.skills, { Insight: 0, Deception: 0 });
  feint(b, a, t, dice(10, 15)); // 15 against 15
  assert.ok(t.feinted);
  assert.match(lastText(b), /tied: the higher bonus wins/);
});

/** The grabber's Strength is 18 (a hold DC of 28); the target's Dodge and Strength are both `resist`. */
function holdArena(resist) {
  const s = arena();
  s.a.d.abilities.Strength = 18; s.a.adv['Grabbing Finesse'] = 0; s.a.adv['Improved Hold'] = 0;
  s.t.d.abilities.Strength = resist; s.t.d.defenses.Dodge = resist; s.t.defMod = 0;
  return s;
}

test('grab: the target\'s resistance check uses the natural 20 (5 short is a break free, 10 short is only restrained)', () => {
  const free = holdArena(3);
  grab(free.b, R, free.a, free.t, dice(20), { free: true }); // 23 against 28
  assert.equal(free.t.grabbedBy, null, 'one degree of failure raised to a success');
  assert.match(lastText(free.b), NAT20);
  const held = holdArena(-2);
  grab(held.b, R, held.a, held.t, dice(20), { free: true }); // 18 against 28: two degrees, now one
  assert.equal(held.t.grabbedBy, 'a');
  assert.ok(!held.t.conditions.some((x) => x.name === 'Bound'), 'two degrees would be Bound; the natural 20 leaves one (restrained)');
  const plain = holdArena(-2);
  grab(plain.b, R, plain.a, plain.t, dice(19), { free: true }); // 17 against 28: three degrees, no help (Bound)
  assert.ok(plain.t.conditions.some((x) => x.name === 'Bound'));
});

test('escape: a natural 20 gets out of a hold that is 5 short, not 6', () => {
  for (const out of [true, false]) {
    const { b, a, t } = arena();
    a.d.abilities.Strength = 8; a.adv['Improved Hold'] = 0; // hold DC 18
    t.attacks = []; t.grabbedBy = 'a'; a.holding = 't';
    t.skills.Athletics = out ? -7 : -8; t.skills['Sleight of Hand'] = -20; // 20 - 7 = 13 (5 short) or 12 (6 short)
    tryEscape(b, t, a, dice(20));
    assert.equal(t.grabbedBy === null, out, `bonus ${t.skills.Athletics}`);
    if (out) assert.match(lastText(b), NAT20);
  }
});

test('trip: the opposed check has the natural 20 and the tie rule (a tie used to go to the target)', () => {
  const setup = (mine, theirs) => {
    const s = arena();
    Object.assign(s.a.skills, { Acrobatics: mine, Athletics: -20 });
    Object.assign(s.t.skills, { Acrobatics: theirs, Athletics: -20 });
    return s;
  };
  let s = setup(0, 10); // a natural 20 for the tripper, 20 against 25
  trip(s.b, s.a, s.t, dice(20, 20, 15));
  assert.ok(isProne(s.t), 'one degree short, raised by the natural 20');
  s = setup(12, 10); // 20 against 20: the tripper has the higher bonus
  trip(s.b, s.a, s.t, dice(20, 8, 10));
  assert.ok(isProne(s.t));
  assert.match(lastText(s.b), /tied: the higher bonus wins/);
  s = setup(0, 10); // 6 short: no help. The target tries to throw the tripper back (a 1 against a 20 fails).
  trip(s.b, s.a, s.t, dice(20, 20, 16, 1, 20));
  assert.ok(!isProne(s.t));
});

test('demoralize: the opposed check has the natural 20 and degrees count from the target\'s result', () => {
  for (const [theirs, degrees] of [[10, 1], [11, 0]]) {
    const { b, a, t } = arena();
    Object.assign(a.skills, { Intimidation: -10 }); a.adv.Taunt = 0;
    Object.assign(t.skills, { Insight: 3 }); t.d.defenses.Will = 5; t.adv.Fearless = 0;
    assert.equal(demoralize(b, a, t, dice(20, theirs)), degrees, `target rolls ${theirs}`);
  }
});

const blast = (rank) => ({ id: 'x', name: 'test blast', effect: 'Damage', rank, resistance: 'Toughness', descriptors: [] });

test('Toughness check: a natural 20 takes a degree off the failure (and the log says so)', () => {
  const hit = (roll, rank) => {
    const { b, a, t } = arena();
    t.d.defenses.Toughness = 5; // DC 15 + rank
    const res = applyEffect(b, R, a, blast(rank), t, dice(roll), {});
    return { res, t, text: lastText(b) };
  };
  let r = hit(20, 15); // 25 against 30
  assert.deepEqual([r.res.landed, r.t.bruises], [false, 0], 'one degree of failure became a success');
  r = hit(20, 16); // 25 against 31: two degrees, now one
  assert.deepEqual([r.res.degrees, r.t.bruises, r.t.dazed], [1, 1, false]);
  assert.match(r.text, NAT20);
  r = hit(19, 16); // 24 against 31: two degrees
  assert.deepEqual([r.res.degrees, r.t.dazed], [2, true]);
  assert.doesNotMatch(r.text, NAT20);
});

test('cover Toughness check: a natural 20 takes a degree off, so a hole is not punched', () => {
  for (const [roll, degrees, state] of [[20, 1, 'intact'], [19, 2, 'holed']]) {
    const { b, a } = arena();
    const piece = addCover(b, 'brick-wall', 1); piece.toughness = 5; // DC 15 + rank 16 = 31
    assert.equal(damagePiece(b, a, piece, 16, dice(roll)), degrees, `roll ${roll}`);
    assert.equal(piece.state, state);
  }
});

test('recovery check at the end of a turn: a natural 20 that is 5 short recovers, 6 short does not', () => {
  for (const [dc, recovered] of [[25, true], [26, false]]) {
    const { b, a } = arena();
    a.d.defenses.Fortitude = 0;
    a.conditions.push({ name: 'Dazed', names: ['Dazed'], degree: 1, from: 't', source: 'zap', label: 'a zap', dc, resist: 'Fortitude', tiers: [['Dazed']], maxDegree: 1 });
    endOfTurn(b, a, dice(20));
    assert.equal(a.conditions.length === 0, recovered, `DC ${dc}`);
  }
});
