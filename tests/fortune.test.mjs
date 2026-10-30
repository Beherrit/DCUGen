// Fortune in the battle engine (Hero's Handbook p20 and p76-79): hero points and Luck on a fighter's own checks, Recover,
// Heroic Feat, Leadership, Inspire and Ultimate Effort. Source: src/engine/battle/fortune.js, feat.js, fortune-turn.js and the
// hooks in checks.js, attack-effects.js, attack-roll.js. Dice are scripted, so each rule is shown on exact rolls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, dice, arena, fighter, lastLog } from './helpers/fighters.mjs';
import { makeCombatant } from '../src/engine/battle.js';
import { body } from './helpers/fighters.mjs';
import { applyEffect } from '../src/engine/battle/attack-effects.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { rollToHit } from '../src/engine/battle/attack-roll.js';
import { checkPenalty } from '../src/engine/battle/conditions.js';
import { endOfTurn } from '../src/engine/battle/end-of-turn.js';
import { recoverFatigue, leadershipTurn, inspireTurn, expireInspire } from '../src/engine/battle/fortune-turn.js';
import { finishingFeat } from '../src/engine/battle/feat.js';
import { opposedCheck } from '../src/engine/battle/checks.js';
import { plainFx } from '../src/engine/battle/fortune.js';

const LUCK = (rank) => [{ name: 'Luck', rank }];
const unarmed = (c) => c.attacks.find((a) => a.unarmed);
/** A hit from `a` on `t` that has to be resisted: with the plain fighters, a Toughness check of +4 against DC 19. */
const hitOn = (b, a, t, rng) => applyEffect(b, R, a, unarmed(a), t, rng, {});
/** Back to a fighter who has taken no harm, so the next hit meets the same Toughness. */
const fresh = (c) => { c.bruises = 0; c.staggered = false; c.dazed = false; };
const duo = (t = {}, a = {}) => { const b = arena([['a', 'A', a], ['t', 'B', t]]); return { b, a: fighter(b, 'a'), t: fighter(b, 't') }; };

// Requirement (p20, p78): heroes start a fight with 1 hero point; Luck ranks are a separate pool of re-rolls.
test('a hero starts with 1 hero point and its Luck ranks as a separate pool', () => {
  const c = makeCombatant(R, body({ advantages: LUCK(3) }), { id: 'x', team: 'A' });
  assert.deepEqual([c.heroPoints, c.luck], [1, 3]);
  const plain = makeCombatant(R, body(), { id: 'y', team: 'A' });
  assert.deepEqual([plain.heroPoints, plain.luck], [1, 0]);
});

// Requirement (p78): Luck re-rolls once per round, up to its rank in times a fight, and only for re-rolls.
test('Luck: one re-roll a round, spent as it is used, and gone when the rank is used up', () => {
  const { b, a, t } = duo({ advantages: LUCK(2) });
  t.heroPoints = 0;
  hitOn(b, a, t, dice(3, 15));                                   // fails by 3 degrees; Luck re-rolls and keeps 15
  assert.match(b.log[0].text, /t uses Luck to re-roll the Toughness check: d20 3, then 15 — takes 15 \(1 Luck left\)/);
  assert.match(lastLog(b), /d20 15 \+4 = 19 vs DC 19 — resisted/);
  assert.deepEqual([t.luck, t.luckRound], [1, b.round]);
  fresh(t);
  const again = dice(3);
  hitOn(b, a, t, again);                                         // same round: no second re-roll, the failure stands
  assert.equal(again.left(), 0); assert.equal(t.luck, 1);
  assert.match(lastLog(b), /3 degrees: staggered/);
  b.round += 1; fresh(t);
  hitOn(b, a, t, dice(3, 2));                                    // next round: the last Luck (a 2 counts +10, so 12)
  assert.match(b.log.at(-2).text, /then 2 \(\+10, below 11\) — takes 12 \(0 Luck left\)/);
  b.round += 1; fresh(t);
  const gone = dice(3);
  hitOn(b, a, t, gone);                                          // out of Luck and hero points: nothing is re-rolled
  assert.equal(gone.left(), 0); assert.equal(t.luck, 0);
});

// Requirement (p78): Luck is spent before a hero point; a second re-roll in the same round costs a hero point.
test('Luck is spent first, then a hero point once Luck has been used this round', () => {
  const { b, a, t } = duo({ advantages: LUCK(2) });
  hitOn(b, a, t, dice(3, 15));
  assert.deepEqual([t.luck, t.heroPoints], [1, 1]);
  hitOn(b, a, t, dice(3, 15));
  assert.match(b.log.at(-2).text, /spends a hero point to re-roll the Toughness check.*\(0 hero points left\)/);
  assert.deepEqual([t.luck, t.heroPoints], [1, 0]);
});

// Requirement: a hero point is spent on a resistance check only when the failure matters and a re-roll could fix it.
test('a hero point on a resistance check: only a failure that staggers, and only if a re-roll can fix it', () => {
  const { b, a, t } = duo();
  const minor = dice(10);                                        // 14 vs DC 19: one degree, a bruise: not worth it
  hitOn(b, a, t, minor);
  assert.deepEqual([minor.left(), t.heroPoints], [0, 1]);
  t.d.defenses.Toughness = 3;                                    // DC 19 needs 16 on the die now: beyond what a re-roll gives often
  const far = dice(1);
  hitOn(b, a, t, far);
  assert.deepEqual([far.left(), t.heroPoints], [0, 1]);
  t.d.defenses.Toughness = 4; fresh(t);
  hitOn(b, a, t, dice(1, 14));                                   // 3 degrees, fixable: spent, and the re-roll resists
  assert.equal(t.heroPoints, 0);
  assert.match(b.log.at(-2).text, /spends a hero point to re-roll the Toughness check: d20 1, then 14 — takes 14/);
});

// Requirement (p20): a re-roll of 1 to 10 counts +10 and the better roll is kept.
test('Improve Roll: the re-roll counts +10 below 11, and the better of the two stands', () => {
  const { b, a, t } = duo();
  hitOn(b, a, t, dice(4, 1));                                    // 1 counts as 11: 4 becomes 11, a 15 total, one degree short
  assert.match(b.log[0].text, /d20 4, then 1 \(\+10, below 11\) — takes 11 \(0 hero points left\)/);
  assert.match(lastLog(b), /d20 11 \+4 = 15 vs DC 19 — 1 degree: bruised/);
});

// Requirement: opposed checks (feint, trip, grab, escape, demoralize) can be improved by the side that is behind.
test('an opposed check: the losing side with a hero point re-rolls before the outcome is known', () => {
  const { b, t } = duo();
  const res = opposedCheck(dice(15, 5, 18), { bonus: 0 }, { bonus: 5, fx: plainFx(b, t, 'feint resistance') });
  assert.deepEqual([res.winner, res.rolls, res.totals], ['b', [15, 18], { a: 15, b: 23 }]);
  assert.equal(t.heroPoints, 0);
  const u = duo();
  const won = opposedCheck(dice(15, 12), { bonus: 5 }, { bonus: 9, fx: plainFx(u.b, u.t, 'x') });
  assert.deepEqual([won.winner, u.t.heroPoints], ['b', 1]);      // a side that is winning spends nothing
});

// Requirement (p20): a hero point removes fatigue, or turns exhausted into fatigued, without an action.
test('Recover: a hero point turns exhausted into fatigued, and lifts fatigue for a close fighter', () => {
  const { b, a } = duo();
  a.fatigue = 2;
  assert.equal(recoverFatigue(b, a), true);
  assert.deepEqual([a.fatigue, a.heroPoints], [1, 0]);
  assert.match(lastLog(b), /spends a hero point to recover from being exhausted \(now fatigued\) \(0 left\)/);
  const close = duo();
  close.a.fatigue = 1; close.a.style = 'brawler';
  recoverFatigue(close.b, close.a);
  assert.deepEqual([close.a.fatigue, close.a.heroPoints], [0, 0]);
  const shot = duo();
  shot.a.fatigue = 1; shot.a.style = 'gunner';
  assert.equal(recoverFatigue(shot.b, shot.a), false, 'a shooter keeps its point for something else');
});

// Requirement (p20): Heroic Feat gives one rank of an advantage for a hero point until the end of the next turn: Interpose to save an ally.
test('Heroic Feat: an ally without Interpose borrows it to take a hit that would knock out its friend, then loses it', () => {
  const tough = { abilities: { Stamina: 14 } };
  const b = arena([['x', 'B', { abilities: { Strength: 10, Fighting: 14 } }], ['v', 'A', { abilities: { Stamina: 0 } }], ['g', 'A', tough]]);
  const [x, v, g] = ['x', 'v', 'g'].map((id) => fighter(b, id));
  v.d.defenses.Parry = 0;
  b.turn = b.order.length;                                       // g has already acted this round: its next turn is round 2
  resolveAttack(b, R, x, unarmed(x), v, dice(15, 10), {});
  assert.match(b.log.find((e) => /Heroic Feat/.test(e.text)).text, /g spends a hero point on a Heroic Feat: Interpose until the end of their next turn, to take the hit meant for v/);
  assert.match(lastLog(b), /g resists with Toughness/);
  assert.deepEqual([g.adv.Interpose, g.heroPoints, v.bruises, g.bruises], [1, 0, 0, 1]);
  assert.ok(b.log.some((e) => /g interposes and takes the hit meant for v/.test(e.text)));
  endOfTurn(b, g, dice());
  assert.equal(g.adv.Interpose, 1, 'still there until the end of its next turn');
  b.round += 1;
  endOfTurn(b, g, dice());
  assert.equal(g.adv.Interpose, 0);
});

test('Heroic Feat: no Interpose when the victim would hardly fall, or the ally would fall as easily', () => {
  const b = arena([['x', 'B', { abilities: { Strength: 4, Fighting: 14 } }], ['v', 'A', { abilities: { Stamina: 8 } }], ['g', 'A', { abilities: { Stamina: 8 } }]]);
  const [x, v, g] = ['x', 'v', 'g'].map((id) => fighter(b, id));
  v.d.defenses.Parry = 0;
  resolveAttack(b, R, x, unarmed(x), v, dice(15, 10), {});
  assert.deepEqual([g.adv.Interpose, g.heroPoints], [0, 1]);
});

// Requirement (p20): Heroic Feat for a Power Attack limit of +5 instead of +2 when the AI sees a finishing blow.
test('Heroic Feat: Power Attack is borrowed for a finishing blow on a staggered foe, not for a healthy one', () => {
  const strong = { abilities: { Strength: 8, Fighting: 12 } };
  const staggered = duo({ abilities: { Stamina: 8 } }, strong);
  staggered.t.staggered = true; staggered.t.d.defenses.Parry = 0;
  finishingFeat(staggered.b, staggered.a, unarmed(staggered.a), staggered.t);
  assert.deepEqual([staggered.a.adv['Power Attack'], staggered.a.heroPoints], [1, 0]);
  assert.match(lastLog(staggered.b), /Heroic Feat: Power Attack until the end of their next turn/);
  const healthy = duo({ abilities: { Stamina: 8 } }, strong);
  healthy.t.d.defenses.Parry = 0;
  finishingFeat(healthy.b, healthy.a, unarmed(healthy.a), healthy.t);
  assert.deepEqual([healthy.a.adv['Power Attack'], healthy.a.heroPoints], [0, 1]);
});

// Requirement (p77): Leadership, a standard action and a hero point, lifts stunned, dazed or fatigued from an ally you can interact with.
const stunned = () => ({ name: 'Stunned', degree: 1, source: 'blast', from: 'e' });
function squad(opts = {}) {
  const b = arena([['l', 'A', { advantages: [{ name: 'Leadership' }] }, { x: 0, y: 0 }], ['w', 'A', {}, { x: opts.far ? 9 : 2, y: 0 }], ['e', 'B', { abilities: { Strength: 8 } }, { x: 0, y: 5 }]], opts.options);
  return { b, l: fighter(b, 'l'), w: fighter(b, 'w'), e: fighter(b, 'e') };
}
test('Leadership: removes stunned from an ally in interaction range when the leader\'s own attack is worth less', () => {
  const { b, l, w, e } = squad();
  w.conditions.push(stunned());
  assert.equal(leadershipTurn(b, l, { plan: 'attack', ev: 99 }, [e]), false, 'its own attack is worth more');
  assert.equal(leadershipTurn(b, l, { plan: 'attack', ev: 0.02 }, [e]), true);
  assert.deepEqual([w.conditions.length, l.heroPoints], [0, 0]);
  assert.match(lastLog(b), /l spends a hero point to rally w \(Leadership\): no longer stunned \(0 hero points left\)/);
  w.dazed = true; l.heroPoints = 1;
  leadershipTurn(b, l, { plan: 'attack', ev: 0 }, [e]);
  assert.equal(w.dazed, false);
});

test('Leadership: not out of interaction range, and fatigue only for a Sustain team', () => {
  const far = squad({ far: true });
  far.w.conditions.push(stunned());
  assert.equal(leadershipTurn(far.b, far.l, { plan: 'attack', ev: 0 }, [far.e]), false);
  const tired = squad();
  tired.w.fatigue = 1;
  assert.equal(leadershipTurn(tired.b, tired.l, { plan: 'attack', ev: 0 }, [tired.e]), false);
  const sustain = squad({ options: { teamTactics: { A: 'sustain' } } });
  sustain.w.fatigue = 1;
  assert.equal(leadershipTurn(sustain.b, sustain.l, { plan: 'attack', ev: 99 }, [sustain.e]), true);
  assert.equal(sustain.w.fatigue, 0);
});

// Requirement (p77): Inspire, once a fight, a standard action and a hero point: allies (not the inspirer) get +1 per rank on all checks until the inspirer's next round.
function band() {
  const b = arena([['i', 'A', { advantages: [{ name: 'Inspire', rank: 2 }] }, { x: 0, y: 0 }], ['x', 'A', {}, { x: 1, y: 0 }], ['y', 'A', {}, { x: 2, y: 0 }], ['e', 'B', {}, { x: 0, y: 6 }]]);
  return { b, i: fighter(b, 'i'), x: fighter(b, 'x'), y: fighter(b, 'y'), e: fighter(b, 'e') };
}
test('Inspire: +1 a rank on all checks for the allies, not the inspirer, until its next round', () => {
  const { b, i, x, y, e } = band();
  x.heroPoints = 0;                                              // no re-roll of a miss to muddy the modifier
  const before = rollToHit(b, x, unarmed(x), e, dice(10), { trade: 0, allOut: 0, defensive: 0, charge: false }, 0, []).mod;
  assert.equal(inspireTurn(b, i), true);
  assert.deepEqual([checkPenalty(x), checkPenalty(y), checkPenalty(i), checkPenalty(e)], [-2, -2, 0, 0]);
  assert.deepEqual([i.heroPoints, i.inspireUsed], [0, true]);
  assert.match(lastLog(b), /i spends a hero point to inspire x, y \(Inspire 2\): \+2 on all checks until the start of i's next round/);
  assert.equal(rollToHit(b, x, unarmed(x), e, dice(10), { trade: 0, allOut: 0, defensive: 0, charge: false }, 0, []).mod, before + 2);
  expireInspire(b, x);                                           // another fighter's turn does not end it
  assert.equal(checkPenalty(x), -2);
  b.round += 1;
  expireInspire(b, i);                                           // the start of the inspirer's next round
  assert.deepEqual([checkPenalty(x), checkPenalty(y)], [0, 0]);
});

test('Inspire: once a fight, and only with two allies in range', () => {
  const { b, i } = band();
  inspireTurn(b, i); i.heroPoints = 1; b.round = 1;
  assert.equal(inspireTurn(b, i), false, 'once per fight');
  const alone = band();
  alone.y.x = 11;                                                // 55 ft away: out of interaction range
  assert.equal(inspireTurn(alone.b, alone.i), false);
});

// Requirement (p79): Ultimate Effort, a hero point, treats one kind of check as a 20 that is not a natural 20.
test('Ultimate Effort on attacks: a roll of 20 for a hero point, no automatic hit and no critical', () => {
  const { b, a, t } = duo({}, { advantages: [{ name: 'Ultimate Effort', param: 'Aim' }] });
  t.bruises = 1; t.d.defenses.Parry = 15;
  const out = rollToHit(b, a, unarmed(a), t, dice(), { trade: 0, allOut: 0, defensive: 0, charge: false }, 0, []);
  assert.deepEqual([out.roll, out.hit, out.crit, a.heroPoints], [20, true, false, 0]);
  assert.match(b.log[0].text, /a spends a hero point on Ultimate Effort: the attack check on t counts as a roll of 20/);
  const weak = duo({}, { advantages: [{ name: 'Ultimate Effort', param: 'Aim' }] });
  weak.t.bruises = 1; weak.t.d.defenses.Parry = 50;
  const tried = rollToHit(weak.b, weak.a, unarmed(weak.a), weak.t, dice(12, 5), { trade: 0, allOut: 0, defensive: 0, charge: false }, 0, []);
  assert.equal(tried.dice[0].roll, 12);                          // a 20 would not reach the defense: the die was thrown
  assert.ok(!weak.b.log.some((e) => /Ultimate Effort/.test(e.text)));
});

test('Ultimate Effort on a resistance check: Toughness counts as 20 against a hit that would often stagger', () => {
  const { b, a, t } = duo({ advantages: [{ name: 'Ultimate Effort', param: 'Toughness' }] }, { abilities: { Strength: 9 } });
  const none = dice();                                           // DC 24 against +4: a 20 just makes it, and no die is thrown
  hitOn(b, a, t, none);
  assert.match(b.log[0].text, /t spends a hero point on Ultimate Effort: the Toughness check counts as a roll of 20/);
  assert.match(lastLog(b), /d20 20 \+4 = 24 vs DC 24 — resisted/);
  assert.equal(t.heroPoints, 0);
  const soft = duo({ advantages: [{ name: 'Ultimate Effort', param: 'Toughness' }] });
  hitOn(soft.b, soft.a, soft.t, dice(12));                       // a mild hit (DC 19): not often bad, the die is thrown
  assert.equal(soft.t.heroPoints, 1);
});

// Requirement (p20, p78): a missed attack is re-rolled with Luck first, then a hero point; with hero points switched off, neither is used.
test('a missed attack: Luck re-rolls it first, then a hero point, and the hero point option switches both off', () => {
  const { b, a, t } = duo({}, { advantages: LUCK(1) });
  t.d.defenses.Parry = 15;                                       // DC 25 against +8: a 5 misses, an 18 hits
  const miss = (rng) => rollToHit(b, a, unarmed(a), t, rng, { trade: 0, allOut: 0, defensive: 0, charge: false }, 0, []);
  const first = miss(dice(5, 18));
  assert.deepEqual([first.hit, a.luck, a.heroPoints], [true, 0, 1]);
  assert.match(first.text, /Miss! a uses Luck to re-roll: 18 \+8 = 26/);
  const second = miss(dice(5, 18));
  assert.deepEqual([second.hit, a.heroPoints], [true, 0]);
  assert.match(second.text, /Miss! a spends a hero point to re-roll: 18/);
  const off = duo({}, { advantages: LUCK(1) });
  off.b.options.heroPoints = false; off.t.d.defenses.Parry = 15;
  const rng = dice(5);
  const out = rollToHit(off.b, off.a, unarmed(off.a), off.t, rng, { trade: 0, allOut: 0, defensive: 0, charge: false }, 0, []);
  assert.deepEqual([out.hit, rng.left(), off.a.luck], [false, 0, 1]);
});

// Requirement: hero points also go to a Dodge check against an area attack and to a recovery check, when the failure is a bad one.
test('a hero point on a Dodge check against an area attack, and on a recovery check from a severe condition', () => {
  const { b, a, t } = duo();
  const burst = { id: 'x', name: 'Boom', effect: 'Damage', rank: 8, resistance: 'Toughness', area: 'Burst', areaFt: 30, range: 'ranged', kind: 'area', roll: false, descriptors: [] };
  t.d.defenses.Dodge = 4;                                        // DC 18 needs 14: a 3 fails, the re-roll of 15 dodges for half
  resolveAttack(b, R, a, burst, t, dice(3, 15, 20), {});
  assert.ok(b.log.some((e) => /t spends a hero point to re-roll the Dodge check: d20 3, then 15/.test(e.text)));
  assert.ok(b.log.some((e) => /Dodge d20 15 \+4 = 19 vs DC 18 — half effect/.test(e.text)));
  const sick = (name) => { const s = duo(); s.t.d.defenses.Fortitude = 12; s.t.conditions.push({ name, names: [name], degree: 2, from: 'a', source: 'zap', label: 'a zap', dc: 20, resist: 'Fortitude', tiers: [[name]], maxDegree: 1 }); return s; };
  const stun = sick('Stunned');
  endOfTurn(stun.b, stun.t, dice(2, 15));                        // 14 against DC 20 fails; the re-roll recovers
  assert.deepEqual([stun.t.conditions.length, stun.t.heroPoints], [0, 0]);
  const dazed = sick('Dazed');
  const mild = dice(2);
  endOfTurn(dazed.b, dazed.t, mild);                             // a dazed result is not worth a hero point
  assert.deepEqual([mild.left(), dazed.t.heroPoints], [0, 1]);
});
