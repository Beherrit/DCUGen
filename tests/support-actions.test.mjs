// Demoralize (DCA 61, Taunt 78), Aid (DCA 175) and Teamwork (DCA 78) in the battle engine: src/engine/battle/support-actions.js,
// support-plan.js and their hooks (conditions, odds, attack-roll, end-of-turn). Dice are scripted so each degree of success is exact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { catalogEntries } from '../src/engine/workshop.js';
import { catalogToCharacter } from '../src/engine/catalog.js';
import { createBattle, addCombatant, makeCombatant, startBattle, statusLine, conditionLabels } from '../src/engine/battle.js';
import { demoralize, aid, aidAttackOf } from '../src/engine/battle/support-actions.js';
import { supportTurn } from '../src/engine/battle/support-plan.js';
import { endOfTurn } from '../src/engine/battle/end-of-turn.js';
import { aidBonus, checkPenalty, defenseVs } from '../src/engine/battle/conditions.js';
import { expectedValue, bestEvNow, hitOdds } from '../src/engine/battle/odds.js';
import { rollToHit } from '../src/engine/battle/attack-roll.js';
import { makeRng } from '../src/engine/rng.js';

const hero = (arch, seed, pl = 10) => generateCharacter(R, { seed, archetype: arch, pl });
const minion = () => catalogToCharacter(catalogEntries(R).filter((e) => e.minion)[3]);

function arena(A, B) {
  const b = createBattle({ seed: 'support' });
  A.forEach((ch, k) => addCombatant(b, makeCombatant(R, ch, { id: `A${k}`, team: 'A' })));
  B.forEach((ch, k) => addCombatant(b, makeCombatant(R, ch, { id: `B${k}`, team: 'B' })));
  startBattle(b, R);
  b.log.length = 0;
  return b;
}
const fighter = (b, id) => b.combatants.find((c) => c.id === id);
/** Scripted d20 rolls, in order; `left()` says how many were not used. */
const dice = (...rolls) => ({ int: () => { assert.ok(rolls.length, 'the engine asked for more dice than the test gave'); return rolls.shift(); }, left: () => rolls.length });

/** A mastermind (Intimidation 10) against a lone target with Will 5 and Insight 3: diff of the opposed check is r1 when r2 is 5. */
function duel() {
  const b = arena([hero('mastermind', 'o1')], [hero('powerhouse', 'o3')]);
  const a = fighter(b, 'A0'); const t = fighter(b, 'B0');
  Object.assign(a.skills, { Intimidation: 10, Deception: 0 }); a.adv.Taunt = 0; a.adv.Teamwork = 0;
  Object.assign(t.skills, { Insight: 3, Deception: 0 }); t.d.defenses.Will = 5; t.adv.Fearless = 0;
  return { b, a, t };
}

// Requirement: success is impaired (-2) until 3 degrees, disabled (-5) from 4 degrees (DCA 61).
for (const [r1, degrees, name, penalty] of [[4, 1, 'Impaired', 2], [5, 2, 'Impaired', 2], [14, 3, 'Impaired', 2], [15, 4, 'Disabled', 5]]) {
  test(`demoralize: a check ${r1} over the resistance is ${degrees} degree(s) and leaves the target ${name}`, () => {
    const { b, a, t } = duel();
    assert.equal(demoralize(b, a, t, dice(r1, 5)), degrees);
    assert.equal(checkPenalty(t), penalty);
    assert.deepEqual(conditionLabels(t), [name]);
    assert.equal(statusLine(t), name);
    const e = b.log.at(-1);
    assert.match(e.text, new RegExp(`${degrees} degrees?, ${name.toUpperCase()} \\(-${penalty} on checks\\) until the end of ${a.name}'s next round`));
    assert.deepEqual([e.dice[0].total, e.dice[0].dc], [r1 + 10, 5 + 5]);
  });
}

// Requirement: a failed check does nothing; a natural 20 turns a failure into one degree.
test('demoralize: a failed check leaves no condition, and only a natural 20 rescues a losing roll', () => {
  const { b, a, t } = duel();
  assert.equal(demoralize(b, a, t, dice(9, 15)), 0);
  assert.deepEqual(conditionLabels(t), []);
  assert.match(b.log.at(-1).text, /tries to demoralize .*shrug it off/);
  a.skills.Intimidation = -10;
  assert.equal(demoralize(b, a, t, dice(19, 20)), 0);
  assert.equal(demoralize(b, a, t, dice(20, 20)), 0, 'both sides rolled a natural 20: they cancel and the totals decide');
  assert.equal(demoralize(b, a, t, dice(20, 11)), 0, 'a natural 20 behind by 6 is still one degree short');
  assert.equal(demoralize(b, a, t, dice(20, 10)), 1);
  assert.deepEqual(conditionLabels(t), ['Impaired']);
});

// Requirement: Fearless targets and targets immune to Will cannot be demoralized, and the attempt costs no roll or log line.
test('demoralize: Fearless and Will-immune targets are refused without rolling', () => {
  const { b, a, t } = duel();
  t.adv.Fearless = 1;
  const rolls = dice(20, 1);
  assert.equal(demoralize(b, a, t, rolls), 0);
  t.adv.Fearless = 0; t.d.defenses.Will = null;
  assert.equal(demoralize(b, a, t, rolls), 0);
  assert.equal(rolls.left(), 2); assert.equal(b.log.length, 0); assert.deepEqual(conditionLabels(t), []);
});

// Requirement: the target resists with the higher of Insight and Will; an impaired demoralizer rolls 2 lower.
test('demoralize: the target resists with Insight when that is higher than Will, and an impaired demoralizer rolls 2 lower', () => {
  const { b, a, t } = duel();
  t.skills.Insight = 9;
  demoralize(b, a, t, dice(10, 5));
  assert.equal(b.log.at(-1).dice[0].dc, 5 + 9);
  a.conditions.push({ name: 'Impaired', degree: 1, source: 'other', from: null });
  demoralize(b, a, t, dice(10, 5));
  assert.equal(b.log.at(-1).dice[0].mod, 8);
});

// Requirement: Taunt lets Deception demoralize (p77), resisted also by Deception; without Taunt only Intimidation counts.
test('demoralize: with Taunt a better Deception is used, and the target may resist with its own Deception', () => {
  const { b, a, t } = duel();
  a.skills.Deception = 14; a.adv.Taunt = 1; t.skills.Deception = 12;
  assert.equal(demoralize(b, a, t, dice(10, 5)), 2);
  const e = b.log.at(-1);
  assert.match(e.text, /Deception \(Taunt\)/);
  assert.deepEqual([e.dice[0].mod, e.dice[0].dc], [14, 5 + 12]);
});

test('demoralize: Deception is ignored without Taunt, or when Intimidation is the better skill', () => {
  const { b, a, t } = duel();
  a.skills.Deception = 14; t.skills.Deception = 12;
  demoralize(b, a, t, dice(10, 5));
  assert.deepEqual([b.log.at(-1).dice[0].mod, b.log.at(-1).dice[0].dc], [10, 10]);
  a.adv.Taunt = 1; a.skills.Deception = 6;
  demoralize(b, a, t, dice(10, 5));
  assert.match(b.log.at(-1).text, /Intimidation d20/);
});

// Requirement: minions that can all see and hear the demoralizer fall to one check against one group resistance.
function minionScene() {
  const b = arena([hero('mastermind', 'o1')], [minion(), minion(), minion(), hero('powerhouse', 'o3')]);
  const a = fighter(b, 'A0'); a.skills.Intimidation = 10; a.adv.Taunt = 0;
  for (const x of b.combatants) { if (x.team === 'B') { x.pos = a.pos; x.adv.Fearless = 0; x.skills.Insight = 0; } if (x.minion) x.d.defenses.Will = 3; }
  return { b, a, m: ['B0', 'B1', 'B2'].map((id) => fighter(b, id)), boss: fighter(b, 'B3') };
}
const labels = (list) => list.map((x) => conditionLabels(x).join('/'));

test('demoralize: one roll pair demoralizes every minion in earshot, in one log line, and not the hero beside them', () => {
  const { b, a, m, boss } = minionScene();
  const rolls = dice(10, 5);
  assert.equal(demoralize(b, a, m[0], rolls), 3);
  assert.equal(rolls.left(), 0); assert.equal(b.log.length, 1);
  assert.deepEqual(labels(m), ['Impaired', 'Impaired', 'Impaired']);
  assert.deepEqual(conditionLabels(boss), []);
  assert.match(b.log[0].text, /demoralizes .*, .*, .*: /);
});

test('demoralize: the group is resisted at its highest resistance, and Fearless, distant and already-impaired minions are left out of it', () => {
  const { b, a, m } = minionScene();
  m[1].d.defenses.Will = 20;
  assert.equal(demoralize(b, a, m[0], dice(10, 5)), 0, 'beats 3 but not 20');
  assert.deepEqual(labels(m), ['', '', '']);
  m[1].adv.Fearless = 1; // out of the group, so its Will no longer sets the bar
  m[2].pos = a.pos + 3; // beyond earshot (2 zones)
  assert.equal(demoralize(b, a, m[0], dice(10, 5)), 3);
  assert.deepEqual(labels(m), ['Impaired', '', '']);
  const before = JSON.stringify(m[0].conditions);
  m[2].pos = a.pos; m[1].adv.Fearless = 0; m[1].d.defenses.Will = 3;
  demoralize(b, a, m[1], dice(19, 5)); // 4 degrees: the group is B1 and B2, and B0 keeps its earlier, lighter condition
  assert.deepEqual(labels(m), ['Impaired', 'Disabled', 'Disabled']);
  assert.equal(JSON.stringify(m[0].conditions), before);
});

test('demoralize: Disabled replaces Impaired, and a lighter result does not undo Disabled', () => {
  const { b, a, t } = duel();
  for (const r1 of [5, 16, 5]) demoralize(b, a, t, dice(r1, 5));
  assert.deepEqual(t.conditions.map((x) => x.name), ['Disabled']);
});

// Requirement: lasts until the end of the demoralizer's next round; the target's own turns do not end it.
test('demoralize: it lapses at the end of the demoralizer\'s next round, not before and not on other turns', () => {
  const { b, a, t } = duel();
  const rng = makeRng('x');
  b.round = 1; demoralize(b, a, t, dice(5, 5));
  endOfTurn(b, a, rng); assert.equal(checkPenalty(t), 2, 'the same round');
  b.round = 2; endOfTurn(b, t, rng); assert.equal(checkPenalty(t), 2, 'the target\'s own turn');
  assert.equal(b.log.filter((e) => e.kind === 'recover').length, 0, 'no recovery check against a demoralize');
  endOfTurn(b, a, rng); assert.equal(checkPenalty(t), 0); assert.deepEqual(conditionLabels(t), []);
});

function trio() {
  const b = arena([hero('blaster', 'p1'), hero('paragon', 'p2'), hero('speedster', 'p3')], [hero('powerhouse', 'p4')]);
  for (const x of b.combatants) { x.pos = 3; x.adv.Teamwork = 0; Object.assign(x.skills, { Intimidation: -20 }); }
  return { b, helper: fighter(b, 'A0'), ally: fighter(b, 'A1'), third: fighter(b, 'A2'), foe: fighter(b, 'B0') };
}
const aidWith = (b, helper, ally, foe, roll, bonus = 0, mode = 'attack') => aid(b, helper, ally, foe, dice(roll), { mode, attack: { bonus } });

// Requirement: an attack check against DC 10; 1+ degrees give +2, 4+ degrees (total 25) give +5.
for (const [roll, bonus, amount] of [[9, 0, 0], [10, 0, 2], [24, 0, 2], [25, 0, 5], [20, -15, 2], [1, 40, 0]]) {
  test(`aid: d20 ${roll} + ${bonus} against DC 10 gives ${amount}`, () => {
    const { b, helper, ally, foe } = trio();
    assert.equal(aidWith(b, helper, ally, foe, roll, bonus), amount);
    assert.equal(aidBonus(ally, foe), amount);
    assert.match(b.log.at(-1).text, amount ? new RegExp(`\\+${amount} to an attack on ${foe.name}`) : /no help/);
  });
}

// Requirement: +2/+5 on the ally's attack check against that opponent only.
test('aid: the attack bonus applies to the named foe only and reaches the to-hit roll and the odds', () => {
  const { b, helper, ally, foe, third } = trio();
  const atk = ally.attacks.find((a) => a.roll && !a.area);
  const mod = () => { const notes = []; return [rollToHit(b, ally, atk, foe, makeRng('r'), { trade: 0, allOut: 0, defensive: 0, charge: false }, 0, notes).mod, notes]; };
  const [base] = mod(); const ev = expectedValue(ally, atk, foe); const evThird = expectedValue(ally, atk, third);
  aidWith(b, helper, ally, foe, 25);
  const [boosted, notes] = mod();
  assert.equal(boosted - base, 5); assert.deepEqual(notes, ['aid: +5']);
  assert.ok(expectedValue(ally, atk, foe) > ev);
  assert.equal(expectedValue(ally, atk, third), evThird, 'the aid is against the named foe only');
  assert.equal(aidBonus(ally, foe, 'defense'), 0);
});

// Requirement: the aider may choose +2 to defense against that opponent instead.
test('aid: the defense bonus applies to Parry and Dodge against the named foe only, and lowers the foe\'s odds', () => {
  const { b, helper, ally, foe, third } = trio();
  const [parry, dodge] = [defenseVs(ally, 'Parry', foe), defenseVs(ally, 'Dodge', foe)];
  const atk = foe.attacks.find((a) => a.roll && !a.area); const ev = expectedValue(foe, atk, ally);
  aidWith(b, helper, ally, foe, 12, 0, 'defense');
  assert.deepEqual([defenseVs(ally, 'Parry', foe), defenseVs(ally, 'Dodge', foe)], [parry + 2, dodge + 2]);
  assert.equal(defenseVs(ally, 'Parry', third), parry);
  assert.equal(aidBonus(ally, foe), 0, 'no attack bonus from a defense aid');
  assert.ok(expectedValue(foe, atk, ally) < ev);
  aidWith(b, helper, ally, foe, 30, 0, 'defense');
  assert.equal(defenseVs(ally, 'Parry', foe), parry + 5);
});

test('aid: aids do not stack (the best counts), and a helper\'s new aid replaces its old one', () => {
  const { b, helper, ally, foe, third } = trio();
  aidWith(b, helper, ally, foe, 12); aidWith(b, third, ally, foe, 30);
  assert.equal(aidBonus(ally, foe), 5);
  aidWith(b, third, ally, foe, 12);
  assert.deepEqual([ally.aid.length, aidBonus(ally, foe)], [2, 2]);
});

// Requirement: Teamwork gives +5 on the Aid check (treated as a team check).
test('aid: Teamwork adds 5 to the aid check, and only to it', () => {
  const { b, helper, ally, foe } = trio();
  const noTeam = dice(5); helper.adv.Teamwork = 0;
  assert.equal(aid(b, helper, ally, foe, noTeam, { attack: { bonus: 0 } }), 0);
  helper.adv.Teamwork = 1;
  assert.equal(aid(b, helper, ally, foe, dice(5), { attack: { bonus: 0 } }), 2);
  assert.match(b.log.at(-1).text, /d20 5 \+5 = 10 vs DC 10 \(Teamwork \+5\)/);
  assert.equal(aid(b, helper, ally, foe, dice(20), { attack: { bonus: 0 } }), 5, 'a 25 with Teamwork is four degrees');
  const { b: b2, a, t } = duel(); a.adv.Teamwork = 1; demoralize(b2, a, t, dice(10, 5));
  assert.equal(b2.log.at(-1).dice[0].mod, 10, 'Demoralize is not a team check');
});

// Requirement: until the end of the ally's next turn.
test('aid: it ends with the ally\'s next turn: this round if the ally has yet to act, else next round', () => {
  const { b, helper, ally, foe } = trio();
  b.order = [ally.id, helper.id, 'x']; b.turn = 2; b.round = 4; // the ally already acted this round
  aidWith(b, helper, ally, foe, 12);
  assert.equal(ally.aid[0].until, 5);
  const rng = makeRng('x');
  endOfTurn(b, ally, rng); assert.equal(aidBonus(ally, foe), 2, 'its turn this round was already over');
  endOfTurn(b, helper, rng); assert.equal(aidBonus(ally, foe), 2, 'the helper\'s turn does not end it');
  b.round = 5; endOfTurn(b, ally, rng); assert.equal(aidBonus(ally, foe), 0);
  b.order = [helper.id, ally.id, 'x']; b.turn = 1; b.round = 6; // the ally acts later this round
  aidWith(b, helper, ally, foe, 12);
  assert.equal(ally.aid[0].until, 6);
  endOfTurn(b, ally, rng); assert.equal(aidBonus(ally, foe), 0);
});

const plan = (foe, ev) => ({ plan: ev === 0 ? 'move' : 'attack', ev, target: foe });
const turn = (b, c, foe, ev) => supportTurn(b, c, plan(foe, ev), [foe], 'full', dice(15, 15));
const gainOf = (helper, ally, foe, teamwork = 0) => hitOdds(aidAttackOf(helper).bonus + teamwork, 0).hit * (bestEvNow(ally, foe, undefined, 2) - bestEvNow(ally, foe));

// Requirement: aid only when pAid x (ally's EV with +2 minus without) beats the aider's own attack, and the own attack is worth under 0.5.
test('aid decision: aids when pAid x ally gain beats its own attack value, and not when its own attack is worth more', () => {
  const { b, helper, ally, third, foe } = trio();
  const gain = gainOf(helper, ally, foe);
  assert.ok(gain > 0.1 && gain < 0.3, `setup: the gain is ${gain}`);
  assert.equal(turn(b, helper, foe, gain + 0.03), false, 'own attack worth more');
  assert.deepEqual(ally.aid, []); assert.equal(b.log.length, 0);
  assert.equal(turn(b, helper, foe, gain - 0.03), true, 'own attack worth less');
  assert.deepEqual([ally.aid.length, third.aid.length], [1, 0]);
  assert.equal(ally.aid[0].mode, 'attack');
});

test('aid decision: helps the ally who gains most, then the next, and nobody who has an aid already or is far from the foe', () => {
  const { b, helper, ally, third, foe } = trio();
  assert.ok(gainOf(helper, ally, foe) > gainOf(helper, third, foe) + 0.05);
  turn(b, helper, foe, 0);
  assert.equal(ally.aid.length, 1); assert.equal(third.aid.length, 0);
  assert.equal(turn(b, helper, foe, 0), true, 'the next best ally is helped once the first has an aid');
  assert.equal(third.aid.length, 1);
  assert.equal(turn(b, helper, foe, 0), false, 'everyone already has an aid');
  assert.equal(b.log.filter((e) => /aids /.test(e.text)).length, 2);
  const far = trio(); far.ally.pos = 6; far.third.pos = 6;
  assert.equal(turn(far.b, far.helper, far.foe, 0), false, 'allies 3 zones from the foe are not engaged with it');
});

test('aid decision: a helper who would rarely succeed does not aid, and Teamwork makes it worth trying', () => {
  const { b, helper, foe } = trio();
  for (const a of helper.attacks) a.bonus = -8;
  assert.equal(turn(b, helper, foe, 0), false, 'pAid 0.15');
  helper.adv.Teamwork = 1;
  assert.equal(turn(b, helper, foe, 0), true, 'pAid 0.40 with Teamwork');
  assert.equal(b.log.at(-1).dice[0].mod, -3);
});

test('aid decision: a staggered ally in the fight gets a defense aid when no attack aid is worth more than the own attack', () => {
  const { b, helper, ally, foe } = trio();
  const ev = gainOf(helper, ally, foe) + 0.1;
  assert.equal(turn(b, helper, foe, ev), false);
  ally.staggered = true;
  assert.equal(turn(b, helper, foe, ev), true);
  assert.deepEqual(ally.aid.map((x) => x.mode), ['defense']);
  assert.equal(turn(b, helper, foe, ev), false, 'already aided');
});

// Requirement: demoralize when Intimidation beats the target by 5+ and the own attack is worth under 0.4, or against 3+ minions.
test('demoralize decision: a good Intimidation and a poor attack demoralize; a good attack, a small gap or a Fearless foe do not', () => {
  const { b, a, t } = duel(); t.pos = a.pos;
  const go = (ev) => supportTurn(b, a, plan(t, ev), [t], 'full', dice(10, 5));
  assert.equal(go(0.4), false); assert.deepEqual(conditionLabels(t), []);
  assert.equal(go(0.39), true); assert.deepEqual(conditionLabels(t), ['Impaired']);
  assert.equal(go(0.1), false, 'already impaired');
  const d = duel(); d.t.pos = d.a.pos; d.a.skills.Intimidation = 9; // 9 - 5 = 4: under 5
  assert.equal(supportTurn(d.b, d.a, plan(d.t, 0), [d.t], 'full', dice(10, 5)), false);
  d.a.skills.Intimidation = 10; d.t.adv.Fearless = 1;
  assert.equal(supportTurn(d.b, d.a, plan(d.t, 0), [d.t], 'full', dice(10, 5)), false);
});

test('demoralize decision: three or more minions in earshot are demoralized even when the own attack is good', () => {
  const { b, a, m } = minionScene();
  assert.equal(supportTurn(b, a, plan(m[0], 2), m, 'full', dice(10, 5)), true);
  assert.deepEqual(labels(m), ['Impaired', 'Impaired', 'Impaired']);
  const s2 = minionScene(); s2.m[2].pos = s2.a.pos + 3;
  assert.equal(supportTurn(s2.b, s2.a, plan(s2.m[0], 2), s2.m, 'full', dice(10, 5)), false, 'only two in earshot');
});
