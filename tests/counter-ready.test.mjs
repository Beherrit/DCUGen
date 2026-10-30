// Countering effects (Hero's Handbook p85-86, Instant Counter p20-21; Martial Arts p92-93) and the Ready action (p177).
// Dice are scripted: the attack roll (19 hits Dodge 6 without a critical), then the counter's two effect checks (the
// counterer's, then the attacker's), then the target's resistance roll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerArena, dice, text, R, who } from './helpers/power-arena.mjs';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { countersByDescriptor, bestCounter } from '../src/engine/battle/counter.js';
import { readyChoice, readyTurn, dropReady } from '../src/engine/battle/ready.js';
import { moveTo } from '../src/engine/battle/movement.js';

const HIT = 19;
const x = (name, more = {}) => ({ name, ...more });
const bolt = (name, rank, extras = []) => ({ name, effect: 'Damage', rank, range: 'Ranged', role: 'attack', extras, flaws: [] });

/** U (team A) with a fire bolt; T (team B) with a frost ray, with or without a hero point. */
function duel({ frost = bolt('Frost Ray', 10), fire = bolt('Fire Bolt', 8), hp = 1 } = {}) {
  const b = powerArena([['U', 'A', { hp: 0, powers: [fire] }, { x: 0, y: 0 }], ['T', 'B', { hp, powers: [frost] }, { x: 2, y: 0 }]], { heroPoints: true });
  const [u, t] = [who(b, 'U'), who(b, 'T')];
  return { b, u, t, atk: u.attacks.find((a) => a.name === 'Fire Bolt') };
}
const shoot = (f, ...rolls) => resolveAttack(f.b, R, f.u, f.atk, f.t, dice(...rolls), {});

test('opposed descriptors counter each other, like ones only for magic and mind, and Improved Counter adds a descriptor', () => {
  assert.equal(countersByDescriptor(['cold'], ['fire']), true);
  assert.equal(countersByDescriptor(['light'], ['darkness']), true);
  assert.equal(countersByDescriptor(['fire'], ['fire']), false, 'fire does not counter fire');
  assert.equal(countersByDescriptor(['magic'], ['magic']), true);
  assert.equal(countersByDescriptor(['electricity'], ['fire']), false);
  assert.equal(countersByDescriptor(['electricity'], ['fire'], 1), true, 'Improved Counter: one more descriptor');
});

test('Instant Counter: a hero point lets the target counter a hit that would hurt it, and winning cancels both', () => {
  const f = duel();
  shoot(f, HIT, 20, 1); // the counter 20 + 10 = 30 against 1 + 8 = 9
  assert.match(text(f.b), /T counters Fire Bolt with Frost Ray using a hero point \(Instant Counter, 0 left\)/);
  assert.match(text(f.b), /the two effects cancel out/);
  assert.equal(f.t.bruises, 0);
  assert.equal(f.t.heroPoints, 0);
});

test('Instant Counter: a lost counter leaves the attack to work as normal, and the hero point is gone', () => {
  const f = duel();
  shoot(f, HIT, 1, 20, 2); // the counter 1 + 10 = 11 against 20 + 8 = 28; then the Toughness roll
  assert.match(text(f.b), /the counter fails/);
  assert.equal(f.t.heroPoints, 0);
  assert.ok(f.t.bruises >= 1 || f.t.out, 'the bolt went on to hit');
});

test('no counter without a hero point or a readied action, and none from a power that does not oppose it', () => {
  const none = duel({ hp: 0 });
  shoot(none, HIT, 2);
  assert.doesNotMatch(text(none.b), /counters/);
  const wrong = duel({ frost: bolt('Spark', 10) });
  shoot(wrong, HIT, 2);
  assert.doesNotMatch(text(wrong.b), /counters/);
  assert.equal(bestCounter(wrong.t, wrong.atk), null);
});

test('a readied counter needs no hero point', () => {
  const f = duel({ hp: 0 });
  f.t.ready = { kind: 'counter', round: f.b.round };
  shoot(f, HIT, 20, 1);
  assert.match(text(f.b), /using a readied action/);
  assert.equal(f.t.ready, null, 'used up');
});

test('Improved Counter lets a power counter a descriptor it is not opposed to', () => {
  const f = duel({ frost: bolt('Spark', 10, [x('Improved Counter')]) });
  shoot(f, HIT, 20, 1);
  assert.match(text(f.b), /T counters Fire Bolt with Spark/);
});

test('Diminishing Counter: a counter that fails still cuts the attack to the margin by which it lost, plus one', () => {
  const f = duel({ frost: bolt('Frost Ray', 10, [x('Diminishing Counter')]) });
  shoot(f, HIT, 1, 5, 2); // 1 + 10 = 11 against 5 + 8 = 13: the margin is 2, so rank 3
  assert.match(text(f.b), /Diminishing Counter saps Fire Bolt down to rank 3/);
  assert.match(text(f.b), /vs DC 18/, 'the Toughness check is against Damage 3: 15 + 3');
});

test('Overwhelming Counter: a counter that wins sends a rank per degree of the win back at the attacker', () => {
  const f = duel({ frost: bolt('Frost Ray', 10, [x('Overwhelming Counter')]) });
  shoot(f, HIT, 20, 1, 2); // 30 against 9: 21 over is five degrees, so five ranks; then the attacker's Toughness roll
  assert.match(text(f.b), /Overwhelming Counter: 5 ranks surge back at U/);
  assert.ok(f.u.bruises >= 1 || f.u.out, 'U took the surge');
});

// ---- Ready ----

/** A close fighter U at one end, a brawler T that will walk up to it, the battle on 5 ft squares. */
function standoff(extra = {}) {
  const b = powerArena([['U', 'A', { style: 'brawler', abilities: { Strength: 8, Fighting: 8 }, ...extra }, { x: 0, y: 0 }], ['T', 'B', { hp: 0, abilities: { Strength: 4 } }, { x: 9, y: 0 }]], {});
  return { b, u: who(b, 'U'), t: who(b, 'T') };
}

test('Ready: a close fighter with nobody in reach, and a brawler about to walk into it, holds an attack for the foe', () => {
  const f = standoff();
  f.t.x = 4; // within the brawler\'s move and charge, still out of the fighter\'s reach
  const pick = readyChoice(f.b, f.u, { plan: 'move' }, [f.t], 'full');
  assert.equal(pick?.kind, 'attack');
  assert.equal(readyTurn(f.b, f.u, { plan: 'move' }, [f.t], 'full'), true);
  assert.equal(f.u.ready.kind, 'attack');
  assert.match(text(f.b), /U readies .* will strike whoever walks into reach/);
});

test('Ready: not when the foe cannot get there anyway, when it has a ranged attack, or when the fighter already has a target', () => {
  const far = standoff();
  far.t.moveFt = 5; // a slow foe: one square a move
  assert.equal(readyChoice(far.b, far.u, { plan: 'move' }, [far.t], 'full'), null, 'too far to walk up');
  const near = standoff();
  near.t.x = 4;
  assert.equal(readyChoice(near.b, near.u, { plan: 'attack' }, [near.t], 'full'), null, 'it has something to hit');
  assert.equal(readyChoice(near.b, near.u, { plan: 'move' }, [near.t], 'standard'), null, 'a dazed fighter has one action');
  const shooter = powerArena([['U', 'A', { style: 'brawler', abilities: { Strength: 8, Fighting: 8 } }, { x: 0, y: 0 }], ['T', 'B', { hp: 0, powers: [bolt('Fire Bolt', 8)] }, { x: 4, y: 0 }]], {});
  assert.equal(readyChoice(shooter, who(shooter, 'U'), { plan: 'move' }, [who(shooter, 'T')], 'full'), null, 'a shooter does not have to walk in');
});

test('Ready: the readied attack is taken as the foe moves into reach, once, and is lost at the fighter\'s next turn otherwise', () => {
  const f = standoff();
  f.t.x = 4;
  f.u.ready = { kind: 'attack', atk: f.u.attacks.find((a) => a.unarmed).id, round: f.b.round };
  moveTo(f.b, f.t, { x: 3, y: 0 }, 'closer'); // still out of reach: nothing
  assert.doesNotMatch(text(f.b), /readied attack/);
  moveTo(f.b, f.t, { x: 1, y: 0 }, 'into reach');
  assert.match(text(f.b), /U takes the readied attack as T comes in \(reaction\)/);
  assert.equal(f.u.ready, null);
  const lost = standoff();
  lost.u.ready = { kind: 'attack', atk: 'x', round: lost.b.round };
  dropReady(lost.b, lost.u);
  assert.equal(lost.u.ready, null);
  assert.match(text(lost.b), /readied attack never came to anything/);
});
