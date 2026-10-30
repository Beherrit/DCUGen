// Extras that change what a hit does or how the target resists it (Hero's Handbook p125-133, Martial Arts p91-94): Sleep,
// Incurable, Innate, Potent, Partial Resistance, Stacking, Proficient, plus the target's side of the resistance check
// (Great Endurance p74, Second Chance p78, the minion rule p174). Dice are scripted: the attack roll (19 hits without a
// critical against Dodge 6), then the target's resistance roll, against DC 15 + rank for Damage and 10 + rank otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duel, fire, logOf, zap, HIT } from './helpers/flaw-kit.mjs';
import { powerArena, dice, R, who } from './helpers/power-arena.mjs';
import { heal } from '../src/engine/battle/support.js';
import { dcOf } from '../src/engine/battle/odds.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { statusLine } from '../src/engine/battle/summaries.js';
import { activeConditions } from '../src/engine/battle/conditions.js';
import { extrasOf, durationOf } from '../src/engine/battle/extras.js';

const x = (name, more = {}) => ({ name, ...more });
const fort = (extras = [], more = {}) => ({ effect: 'Affliction', rank: 8, detail: 'Resisted by Fortitude; Dazed, Stunned, Incapacitated', extras, ...more });

test('the extras that matter are read once into atk.ex, and nothing else is', () => {
  assert.equal(extrasOf({ extras: [x('Accurate'), x('Area')] }), null);
  assert.deepEqual(extrasOf({ extras: [x('Sleep'), x('Homing', { steps: 2 }), x('Partial Resistance', { option: '+2' })] }), { sleep: true, homing: 2, partialRes: 2 });
  assert.equal(durationOf(extrasOf({ extras: [x('Increased Duration', { steps: 2 })] })), 'sustained');
});

// ---- Sleep ----

test('Sleep: Damage that would incapacitate leaves the target asleep, and a sleeper is not dying', () => {
  const f = duel([], { extras: [x('Sleep')] }, {}, {}, { lethal: true });
  fire(f, HIT, 2);
  assert.equal(f.t.out, true);
  assert.equal(f.t.outReason, 'asleep');
  assert.equal(f.t.dying, false, 'asleep is not near death');
  assert.equal(statusLine(f.t), 'Asleep');
  assert.match(logOf(f), /T is put to SLEEP \(Sleep\)/);
});

test('Sleep: an Affliction whose third degree is incapacitated leaves the target asleep', () => {
  const f = duel([], fort([x('Sleep')]));
  fire(f, HIT, 1); // 1 + 4 = 5 against DC 18: three degrees
  assert.equal(f.t.outReason, 'asleep');
  assert.ok(activeConditions(f.t).has('Unaware'), 'asleep is defenseless, stunned and unaware');
  assert.match(logOf(f), /ASLEEP/);
});

// ---- Incurable ----

test('Incurable: Healing cannot take off the damage it caused, but takes off other damage', () => {
  const f = duel([], { extras: [x('Incurable')] });
  f.u.healing = { name: 'Mend', rank: 20, ranged: false, proficient: 0 };
  fire(f, HIT, 12); // 16 against DC 23: two degrees, dazed and a bruise
  assert.equal(f.t.bruises, 1);
  heal(f.b, f.u, f.t, dice(20));
  assert.equal(f.t.bruises, 1, 'the Incurable bruise stays');
  assert.equal(f.t.dazed, false, 'the daze went');
  assert.match(logOf(f), /remaining damage is Incurable: Mend cannot take it off/);
  const plain = duel([]);
  plain.u.healing = { name: 'Mend', rank: 20, ranged: false, proficient: 0 };
  fire(plain, HIT, 12);
  heal(plain.b, plain.u, plain.t, dice(20));
  assert.equal(plain.t.bruises, 0, 'ordinary damage heals');
});

// ---- Innate ----

test('Innate: a sustained Protection that is Innate cannot be nullified', () => {
  const shield = (extras) => ({ name: 'Field', effect: 'Protection', rank: 6, range: 'Personal', role: 'defense', extras, flaws: [] });
  const attackNull = (extras) => {
    const b = powerArena([['U', 'A', { powers: [zap([], { effect: 'Nullify', rank: 12 })] }, { x: 0, y: 0 }], ['T', 'B', { powers: [shield(extras)], hp: 0 }, { x: 2, y: 0 }]]);
    const [u, t] = [who(b, 'U'), who(b, 'T')];
    resolveAttack(b, R, u, u.attacks.find((a) => a.name === 'Zap'), t, dice(HIT, 20, 1), {});
    return { b, t };
  };
  const plain = attackNull([x('Sustained')]);
  assert.equal(plain.t.sustainedProtection, 6);
  assert.equal(plain.t.nullified, 6, 'switched off');
  const innate = attackNull([x('Sustained'), x('Innate')]);
  assert.equal(innate.t.sustainedProtection, 0);
  assert.equal(innate.t.innateProtection, 6);
  assert.equal(innate.t.nullified, 0);
  assert.match(innate.b.log.map((e) => e.text).join('\n'), /T's protection is Innate and cannot be nullified: no effect/);
});

// ---- Potent, Partial Resistance, Stacking, Proficient ----

test('Potent: +1 to the resistance DC per rank on a Fortitude effect, none on a Toughness one', () => {
  const dc = (atk) => dcOf(atk, atk.rank);
  assert.equal(dc({ effect: 'Affliction', rank: 8, resistance: 'Fortitude', ex: { potent: 3 } }), 21);
  assert.equal(dc({ effect: 'Affliction', rank: 8, resistance: 'Fortitude', ex: null }), 18);
  assert.equal(dc({ effect: 'Damage', rank: 8, resistance: 'Toughness', ex: { potent: 3 } }), 23, 'not on a Toughness check');
  const f = duel([], fort([x('Potent', { steps: 2 })]));
  fire(f, HIT, 18);
  assert.match(logOf(f), /vs DC 20/);
});

test('Partial Resistance +2: one degree of success halves the effect and counts as a degree of failure', () => {
  const f = duel([], fort([x('Partial Resistance', { option: '+2' })]));
  fire(f, HIT, 16); // 20 against DC 18: one degree of success
  assert.match(logOf(f), /Partial Resistance halves the effect to rank 4 and counts as a degree of failure/);
  assert.equal(f.t.dazed || f.t.conditions.some((c) => c.name === 'Dazed'), true, 'one degree of failure: dazed');
  const clear = duel([], fort([x('Partial Resistance', { option: '+2' })]));
  fire(clear, HIT, 20); // a natural 20 adds a degree: two degrees of success resist outright
  assert.doesNotMatch(logOf(clear), /Partial Resistance/);
});

test('Partial Resistance +1: a second check at the halved rank, and passing it resists, failing it takes the lesser effect', () => {
  const pass = duel([], fort([x('Partial Resistance', { option: '+1' })]));
  fire(pass, HIT, 16, 14); // second check 14 + 4 = 18 against DC 14
  assert.match(pass.b.log.map((e) => e.text).join('\n'), /second check d20 14 \+4 = 18 vs DC 14 — resisted/);
  assert.equal(pass.t.conditions.length, 0);
  const fail = duel([], fort([x('Partial Resistance', { option: '+1' })]));
  fire(fail, HIT, 16, 2); // 6 against DC 14: two degrees at rank 4
  assert.ok(fail.t.conditions.some((c) => c.name === 'Stunned'), 'two degrees: stunned');
});

test('Stacking: each repeat use on the same target raises the DC, and it fades a point a round', () => {
  const f = duel([], fort([x('Stacking')]));
  fire(f, HIT, 30);
  fire(f, HIT, 30);
  const lines = f.b.log.filter((e) => /resists with/.test(e.text)).map((e) => e.text);
  assert.match(lines[0], /vs DC 18\b(?!.*Stacking)/);
  assert.match(lines[1], /vs DC 19 \(\+1, Stacking\)/);
  f.b.round += 3; // idle for a while: the bonus has worn off
  fire(f, HIT, 30);
  const last = f.b.log.filter((e) => /resists with/.test(e.text)).pop().text;
  assert.match(last, /vs DC 18\b/);
});

test('Proficient: +2 on the effect\'s power check per rank (Nullify, Healing)', () => {
  const b = powerArena([['U', 'A', { powers: [zap([], { effect: 'Nullify', rank: 6, extras: [x('Proficient', { steps: 2 })] })] }, { x: 0, y: 0 }], ['T', 'B', { powers: [{ name: 'Field', effect: 'Protection', rank: 6, range: 'Personal', role: 'defense', extras: [x('Sustained')], flaws: [] }], hp: 0 }, { x: 2, y: 0 }]]);
  const [u, t] = [who(b, 'U'), who(b, 'T')];
  resolveAttack(b, R, u, u.attacks.find((a) => a.name === 'Zap'), t, dice(HIT, 5, 5), {});
  assert.match(b.log.map((e) => e.text).join('\n'), /d20 5 \+ 10 = 15 \(includes \+4, Proficient\)/);
  u.healing = { name: 'Mend', rank: 4, ranged: false, proficient: 2 };
  b.log.length = 0;
  t.bruises = 2;
  heal(b, u, t, dice(10)); // 10 + 4 + 4 = 18: eight over DC 10 is two degrees
  assert.equal(t.bruises, 0);
});

// ---- the target's side ----

test('Great Endurance: +5 on a Fortitude check against suffocation or an effect that starts by fatiguing', () => {
  const f = duel([], fort([], { detail: 'Resisted by Fortitude; Fatigued, Exhausted, Incapacitated' }), { advantages: [{ name: 'Great Endurance', rank: 1 }] });
  fire(f, HIT, 9); // 9 + 4 + 5 = 18 against DC 18: resisted
  assert.match(logOf(f), /includes \+5, Great Endurance/);
  assert.match(logOf(f), /resisted/);
  const none = duel([], fort([], { detail: 'Resisted by Fortitude; Dazed, Stunned, Incapacitated' }), { advantages: [{ name: 'Great Endurance', rank: 1 }] });
  fire(none, HIT, 9);
  assert.doesNotMatch(logOf(none), /Great Endurance/, 'a daze is not a fatigue');
});

test('Second Chance: one more check against the named hazard, and the better result counts', () => {
  const f = duel([], {}, { advantages: [{ name: 'Second Chance', rank: 1, param: 'Damage' }] });
  fire(f, HIT, 2, 18); // 6 against DC 23 is four degrees; the second roll, 22, is one
  assert.match(logOf(f), /Second Chance: re-rolled 22, better/);
  assert.equal(f.t.out, false, 'one degree only');
  const other = duel([], {}, { advantages: [{ name: 'Second Chance', rank: 1, param: 'falling' }] });
  fire(other, HIT, 2);
  assert.doesNotMatch(logOf(other), /Second Chance/);
});

test('Minions: failing any resistance check, a minion suffers the worst degree of the effect', () => {
  const f = duel([], fort([]));
  f.t.minion = true;
  fire(f, HIT, 12); // 16 against DC 18: one degree of failure
  assert.equal(f.t.out, true, 'incapacitated, whatever the degree');
  assert.match(logOf(f), /a minion suffers the worst degree/);
  const hero = duel([], fort([]));
  fire(hero, HIT, 12);
  assert.equal(hero.t.out, false);
});

test('Minions: a Weaken takes its full rank from a minion that fails the check', () => {
  const f = duel([], { effect: 'Weaken', rank: 6, detail: 'Toughness; resisted by Fortitude', extras: [] });
  f.t.minion = true;
  fire(f, HIT, 10); // 14 against DC 16: one degree of failure, which would cost a hero one rank
  assert.equal(f.t.weakened.Toughness, 6, 'the minion loses all six ranks');
});

