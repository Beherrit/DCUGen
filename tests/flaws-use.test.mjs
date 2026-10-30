// Flaws that act on how a turn is spent and what an attack costs afterwards (Hero's Handbook p133-138, Martial Arts
// p94-98): Activation, Increased Action, Immobile, Fades, Tiring, Distracting, Side Effect, Prone, Push Over,
// Resistible, Sense-Dependent, Grab-Based, Uncontrolled, Concentration, Feedback, Strained. Dice are scripted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duel, fire, logOf, zap, flaw, who, dice, text, R, HIT } from './helpers/flaw-kit.mjs';
import { powerArena } from './helpers/power-arena.mjs';
import { expectedValue } from '../src/engine/battle/odds.js';
import { defenseOf } from '../src/engine/battle/conditions.js';
import { massRank } from '../src/engine/battle/knockback.js';
import { flawedAction, flawsStartTurn, uncontrolledFire, concentrate, concentrationBroken } from '../src/engine/battle/flaw-turn.js';
import { flawUsable } from '../src/engine/battle/flaw-odds.js';
import { bestAttackVs } from '../src/engine/battle/plan.js';
import { pickEffort } from '../src/engine/battle/turn-attack.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { endOfTurn } from '../src/engine/battle/end-of-turn.js';
import { weakenTraits } from '../src/engine/battle/weaken-traits.js';

const ev = (f, t = f.t) => expectedValue(f.u, f.atk, t, { b: f.b });
const plain = (over) => ev(duel([], over));

// ---- Activation, Increased Action, Immobile ----

test('Activation (standard): the turn goes on switching the power on; the next turn it is on', () => {
  const f = duel([flaw('Activation', { option: 'Standard action' })]);
  assert.ok(Math.abs(ev(f) / plain() - 0.5) < 1e-9, 'the AI counts the lost action');
  assert.equal(flawedAction(f.b, f.u, f.atk, f.t, 'full', dice()), true);
  assert.match(logOf(f), /U activates Zap \(Activation: a standard action\)/);
  assert.equal(flawedAction(f.b, f.u, f.atk, f.t, 'full', dice()), false, 'on now');
  assert.ok(Math.abs(ev(f) / plain() - 1) < 1e-9);
});

test('Activation (move): the standard action is left for the attack when the target is already in range', () => {
  const f = duel([flaw('Activation', { option: 'Move action' })]);
  assert.equal(flawedAction(f.b, f.u, f.atk, f.t, 'full', dice()), false);
  assert.equal(f.u.noMove, true, 'the move action went on activating');
  assert.match(logOf(f), /Activation: a move action/);
  const dazed = duel([flaw('Activation', { option: 'Move action' })]);
  assert.equal(flawedAction(dazed.b, dazed.u, dazed.atk, dazed.t, 'standard', dice()), true, 'one action: it all goes on switching on');
});

test('Increased Action: the attack takes a full action, so it is made where the fighter stands and not with a single action', () => {
  const f = duel([flaw('Increased Action')]);
  assert.equal(flawedAction(f.b, f.u, f.atk, f.t, 'standard', dice()), true);
  assert.match(logOf(f), /Increased Action: it takes a full action, and U has only a standard action/);
  assert.equal(flawedAction(f.b, f.u, f.atk, f.t, 'full', dice()), false);
  assert.equal(f.u.noMove, true);
  const far = duel([flaw('Increased Action')], { range: 'Close' });
  assert.notEqual(bestAttackVs(far.b, far.u, far.t, dice(), { full: true }).attack?.name, 'Zap', 'the AI does not pick a full-action attack it cannot reach');
  assert.equal(flawedAction(far.b, far.u, far.atk, far.t, 'full', dice()), true);
  assert.equal(far.u.x, 1, 'it closes in and uses the effect next turn');
});

test('Immobile: only while stationary, and the 2-point version also keeps the fighter still while it is used', () => {
  const f = duel([flaw('Immobile')]);
  f.u.squaresMoved = 3;
  assert.equal(flawedAction(f.b, f.u, f.atk, f.t, 'full', dice()), true);
  const still = duel([flaw('Immobile', { option: '-2' })]);
  assert.equal(flawedAction(still.b, still.u, still.atk, still.t, 'full', dice()), false);
  assert.equal(still.u.noMove, true);
  const one = duel([flaw('Immobile')]);
  assert.equal(flawedAction(one.b, one.u, one.atk, one.t, 'full', dice()), false);
  assert.equal(one.u.noMove, false, 'the 1-point flaw lets the fighter move after it is activated');
});

// ---- what a use costs: Fades, Tiring, Distracting, Side Effect, Prone, Push Over ----

test('Fades: one rank less each use, and nothing left after the last', () => {
  const f = duel([flaw('Fades')], { rank: 2 });
  fire(f, HIT, 1);
  assert.match(logOf(f), /Fades: down to rank 1/);
  fire(f, HIT, 1);
  assert.match(logOf(f), /Fades takes 1 rank off: rank 1/);
  assert.match(logOf(f), /Fades: no ranks left/);
  assert.equal(ev(f), 0);
  fire(f);
  assert.match(logOf(f), /Fades: all 2 ranks are gone/);
});

test('Tiring: a level of fatigue each use, and the AI stops at exhausted', () => {
  const f = duel([flaw('Tiring')]);
  fire(f, HIT, 1);
  assert.equal(f.u.fatigue, 1);
  assert.match(logOf(f), /Tiring: U is now fatigued/);
  f.u.fatigue = 2;
  assert.equal(ev(f), 0);
});

test('Distracting: vulnerable (defense halved) until the start of the next turn', () => {
  const f = duel([flaw('Distracting')]);
  const before = defenseOf(f.u, 'Dodge');
  fire(f, HIT, 1);
  assert.match(logOf(f), /Distracting: U is vulnerable until the start of its next turn/);
  assert.equal(defenseOf(f.u, 'Dodge'), Math.ceil(before / 2));
  flawsStartTurn(f.u);
  assert.equal(defenseOf(f.u, 'Dodge'), before);
});

test('Side Effect (always): the effect rebounds on the user every use, who gets a resistance check', () => {
  const f = duel([flaw('Side Effect', { option: 'Always' })]);
  fire(f, HIT, 1, 1);
  assert.match(logOf(f), /Side Effect \(every use\): the effect rebounds on U/);
  assert.equal(f.u.bruises, 1);
  assert.equal(f.t.bruises, 1);
});

test('Side Effect (on failure): nothing when the attack lands, the rebound when it misses or is resisted', () => {
  const landed = duel([flaw('Side Effect')]);
  fire(landed, HIT, 1);
  assert.equal(landed.u.bruises, 0);
  const missed = duel([flaw('Side Effect')], {}, {}, { hp: 0 });
  fire(missed, 2, 1);
  assert.match(logOf(missed), /Side Effect \(on failure\): the effect rebounds on U/);
  assert.equal(missed.u.bruises, 1);
  const resisted = duel([flaw('Side Effect')]);
  fire(resisted, HIT, 20, 1);
  assert.equal(resisted.t.bruises, 0);
  assert.equal(resisted.u.bruises, 1, 'resisted counts as a failure (DCA 137)');
});

test('Prone: a 2-point flaw always throws the user down; the 1-point flaw gives an Agility or Acrobatics check against 10 + rank', () => {
  const sure = duel([flaw('Prone', { option: '-2' })]);
  fire(sure, HIT, 1);
  assert.ok(sure.u.conditions.some((x) => x.name === 'Prone'));
  const falls = duel([flaw('Prone')]);
  fire(falls, HIT, 1, 5);
  assert.ok(falls.u.conditions.some((x) => x.name === 'Prone'));
  assert.match(logOf(falls), /Prone: U tries to stay on its feet, d20 5/);
  const stays = duel([flaw('Prone')]);
  fire(stays, HIT, 1, 20);
  assert.ok(!stays.u.conditions.some((x) => x.name === 'Prone'));
});

test('Push Over: the user is braced one rank less per rank against knockback until its next turn', () => {
  const f = duel([flaw('Push Over', { steps: 2 })]);
  const before = massRank(f.u);
  fire(f, HIT, 1);
  assert.equal(massRank(f.u), before - 2);
  flawsStartTurn(f.u);
  assert.equal(massRank(f.u), before);
});

// ---- the target's side: Resistible, Sense-Dependent ----

test('Resistible: the target makes a second check with the named defense and the better result stands', () => {
  const f = duel([flaw('Resistible', { detail: 'Dodge' })]);
  fire(f, HIT, 1, 20);                  // Toughness roll 1 would fail; Dodge roll 20 resists
  assert.match(logOf(f), /Dodge \(Resistible\)/);
  assert.equal(f.t.bruises, 0);
  const without = duel([]);
  fire(without, HIT, 1);
  assert.equal(without.t.bruises, 1);
  const both = duel([flaw('Resistible', { detail: 'Dodge' })]);
  fire(both, HIT, 1, 1);
  assert.equal(both.t.bruises, 1, 'both checks fail');
  assert.ok(ev(f) < plain(), 'the AI values it lower');
});

test('Sense-Dependent: a target that cannot perceive is immune; others may look away with a Dodge check', () => {
  const mk = () => duel([flaw('Sense-Dependent', { detail: 'sight' })]);
  const blind = mk();
  blind.t.conditions.push({ name: 'Blind', degree: 1, from: 'x', source: 'x' });
  fire(blind, HIT);
  assert.match(logOf(blind), /Sense-Dependent \(sight\): T cannot see, so it is immune/);
  assert.equal(ev(blind), 0);
  const dodged = mk();
  fire(dodged, HIT, 20);
  assert.match(logOf(dodged), /looks away in time: no effect/);
  assert.equal(dodged.t.bruises, 0);
  const seen = mk();
  fire(seen, HIT, 1, 1);
  assert.match(logOf(seen), /perceives it/);
  assert.equal(seen.t.bruises, 1);
  const deaf = duel([flaw('Sense-Dependent', { detail: 'hearing' })]);
  deaf.t.conditions.push({ name: 'Deaf', degree: 1, from: 'x', source: 'x' });
  fire(deaf, HIT);
  assert.match(logOf(deaf), /cannot hear/);
});

// ---- Grab-Based ----

test('Grab-Based: a grab first, the effect on its own once held, and the next turn needs no attack roll', () => {
  const f = duel([flaw('Grab-Based')], { range: 'Close', name: 'Zap' });
  f.t.x = 1;
  assert.ok(Math.abs(ev(f) / plain({ range: 'Close' }) - 0.7) < 1e-9);
  fire(f, 20, 1, 15);                   // grab attack roll, the target's grab resistance, the Damage resistance (one degree: bruised)
  assert.equal(f.t.grabbedBy, 'U');
  assert.match(logOf(f), /Grab-Based: it needs a hold first/);
  assert.match(logOf(f), /the hold is made, so the effect follows at once/);
  assert.equal(f.t.bruises, 1);
  fire(f, 15);                          // held: only the Damage resistance roll
  assert.match(logOf(f), /in the hold: no attack roll needed/);
  assert.equal(f.t.bruises, 2);
});

test('Grab-Based: a failed grab means no effect, and a target that slips every hold cannot be used on', () => {
  const f = duel([flaw('Grab-Based')], { range: 'Close' });
  f.t.x = 1;
  fire(f, 2);
  assert.equal(f.t.bruises, 0);
  assert.equal(f.t.grabbedBy, null);
  f.t.insub = { rank: 4 };
  assert.equal(flawUsable(f.b, f.u, f.atk, f.t), false);
});

// ---- Uncontrolled ----

test('Uncontrolled: the AI never picks it, but it goes off on its own on a d20 of 11 or more', () => {
  const f = duel([flaw('Uncontrolled')]);
  assert.equal(ev(f), 0);
  assert.notEqual(bestAttackVs(f.b, f.u, f.t, dice(), { full: true }).attack?.name, 'Zap');
  uncontrolledFire(f.b, R, f.u, [f.t], dice(10));
  assert.equal(f.t.bruises, 0);
  uncontrolledFire(f.b, R, f.u, [f.t], dice(15, HIT, 1));
  assert.match(logOf(f), /Zap: Uncontrolled: it goes off on its own \(d20 15\) at T/);
  assert.equal(f.t.bruises, 1);
});

// ---- Concentration, Feedback, Strained ----

const hold = (flaws) => duel(flaws, { name: 'Zap', effect: 'Affliction', detail: 'Resisted by Will; Entranced, Compelled, Controlled' });

test('Concentration: the effect on the target lasts only while the user keeps its mind on it', () => {
  const f = hold([flaw('Concentration')]);
  fire(f, HIT, 14);
  assert.ok(f.t.conditions.some((x) => x.concentrate && x.name === 'Entranced'));
  assert.equal(concentrate(f.b, f.u), true, 'a control that stops its target is worth the standard action');
  assert.match(logOf(f), /concentrates to keep Zap on T \(Concentration: a standard action each turn\)/);
  concentrationBroken(f.b, f.t);
  assert.ok(f.t.conditions.length, 'the user can still concentrate');
  f.u.out = true;
  concentrationBroken(f.b, f.t);
  assert.equal(f.t.conditions.length, 0);
  assert.match(logOf(f), /Concentration: Zap on T ends, because U can no longer concentrate/);
});

test('Concentration: a user that turns to something else lets go', () => {
  const f = hold([flaw('Concentration')]);
  f.t.conditions.push({ name: 'Dazed', names: ['Dazed'], degree: 1, from: 'U', source: 'Zap', label: 'Zap', concentrate: true });
  assert.equal(concentrate(f.b, f.u), false);
  assert.equal(f.t.conditions.length, 0);
});

test('Feedback: breaking out of a Snare with Damage hurts whoever made it', () => {
  const b = powerArena([['U', 'A', { powers: [zap([flaw('Feedback')], { name: 'Net', effect: 'Snare', rank: 6, detail: 'Resisted by Dodge' })] }, { x: 0, y: 0 }],
    ['T', 'B', { hp: 0, powers: [zap([], { name: 'Bolt', rank: 8 })] }, { x: 2, y: 0 }]], { heroPoints: true });
  const u = who(b, 'U'); const t = who(b, 'T');
  resolveAttack(b, R, u, u.attacks.find((a) => a.name === 'Net'), t, dice(HIT, 1), {});
  assert.ok(t.conditions.length, 'the net holds');
  b.log.length = 0;
  endOfTurn(b, t, dice(10, 1));          // the break-out roll, then the maker's Feedback roll
  assert.match(text(b), /Feedback: T damages Net \(Damage 8\)/);
  assert.equal(u.bruises, 1);
});

test('Strained: the effect cannot use extra effort', () => {
  const plainFight = duel([]);
  plainFight.u.staggered = true; plainFight.u.style = 'blaster';
  assert.equal(pickEffort(plainFight.b, plainFight.u, plainFight.atk, plainFight.t, dice()), 'power');
  const strained = duel([flaw('Strained')]);
  strained.u.staggered = true; strained.u.style = 'blaster';
  assert.equal(pickEffort(strained.b, strained.u, strained.atk, strained.t, dice()), null);
});

test('a Weaken with Fast Return gets back more ranks each round', () => {
  const f = duel([flaw('Fast Return', { steps: 2 })], { name: 'Zap', effect: 'Weaken', detail: 'Strength; resisted by Fortitude' });
  fire(f, HIT, 1);
  assert.equal(f.t.fastReturn, 2);
  weakenTraits(f.t, 'Strength', 6);
  f.t.weakened = { Strength: 6 };
  endOfTurn(f.b, f.t, dice());
  assert.equal(f.t.weakened.Strength, 3, 'one back as usual and two more');
  assert.match(logOf(f), /recovers 3 ranks of each weakened trait this round \(Fast Return\)/);
});
