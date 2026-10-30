// Super-Speed (Hero's Handbook p119), Burrowing (p89), Movement (p109), Extra Limbs (p98), Immortality (p102), Energy Absorption
// (p95) and Extra Attacks (Martial Arts p83-84).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerArena, dice, text, R, who } from './helpers/power-arena.mjs';
import { movementTraits, burrowSpeed, limbBonus } from '../src/engine/battle/movement-powers.js';
import { stepToward } from '../src/engine/battle/path.js';
import { squaresInMove } from '../src/engine/battle/geometry.js';
import { refreshEnvironment, startEnvironment, environmentsOf } from '../src/engine/battle/environment.js';
import { proneMod } from '../src/engine/battle/prone.js';
import { grab } from '../src/engine/battle/maneuvers.js';
import { addCover } from '../src/engine/battle.js';
import { immortalityOf, roundsToReturn, returnFromDeath } from '../src/engine/battle/immortality.js';
import { kill } from '../src/engine/battle/dying.js';
import { absorbsOf, absorbEnergy } from '../src/engine/battle/absorb.js';
import { fadeMods } from '../src/engine/battle/mods.js';
import { extraAttacksOf, attackCount } from '../src/engine/battle/extra-attacks-read.js';
import { runExtraAttacks } from '../src/engine/battle/extra-attacks.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';

const x = (name, more = {}) => ({ name, ...more });
const power = (name, effect, rank, more = {}) => ({ name, effect, rank, role: 'utility', extras: [], flaws: [], ...more });
const blast = (rank, name = 'Blast', more = {}) => ({ name, effect: 'Damage', rank, range: 'Ranged', role: 'attack', extras: [], flaws: [], ...more });
const duel = (a, b, at = [{ x: 1, y: 5 }, { x: 5, y: 5 }], options = {}) => powerArena([['A', 'A', a, at[0]], ['B', 'B', b, at[1]]], options);

// ---- Super-Speed, Burrowing, Movement ---------------------------------------------------------------------------------

test('Super-Speed: +4 initiative a rank and a ground speed at the rank', () => {
  const plain = duel({}, {});
  const fast = duel({ powers: [power('Blur', 'Super-Speed', 6)] }, {});
  assert.equal(who(fast, 'A').initBonus, who(plain, 'A').initBonus + 24);
  assert.equal(who(fast, 'A').moveRank, 6);
  assert.ok(squaresInMove(fast, who(fast, 'A')) > squaresInMove(plain, who(plain, 'A')));
});

test('Burrowing: a speed rank 5 under its rank, under the ground, so past scenery that a walker must go round', () => {
  assert.equal(burrowSpeed(8), 3);
  const b = duel({ powers: [power('Dig', 'Burrowing', 10)] }, {});
  const a = who(b, 'A');
  assert.equal(a.moveRank, 5);
  assert.equal(a.burrows, true);
  addCover(b, 'brick-wall', 2, 5);
  addCover(b, 'brick-wall', 2, 4);
  addCover(b, 'brick-wall', 2, 6);
  const walker = who(duel({}, {}), 'A');
  const goal = { x: 5, y: 5 };
  assert.deepEqual(stepToward(b, a, goal, 4, 1), { x: 4, y: 5 }, 'straight through the wall line');
  Object.assign(walker, { x: 1, y: 5, moveRank: 0 });
  assert.notDeepEqual(stepToward(b, walker, goal, 4, 1), { x: 4, y: 5 }, 'a walker cannot get through three pieces in a row in four steps');
});

test('Movement is read by its words: Permeate, Slithering, Sure-footed', () => {
  const t = movementTraits({ powers: [power('Phase', 'Movement', 2, { detail: 'Permeate 2, Slithering' }), power('Footing', 'Movement', 2, { detail: 'Sure-footed' })] });
  assert.equal(t.permeate, 1, 'Permeate 2 is a speed rank less');
  assert.equal(t.slithers, true);
  assert.equal(t.sureFooted, 2);
  assert.equal(movementTraits({ powers: [power('Climb', 'Movement', 1, { detail: 'Wall-crawling' })] }).permeate, null);
});

test('Permeate: the straight way through scenery, at a speed rank or two less', () => {
  const b = duel({ powers: [power('Phase', 'Movement', 3, { detail: 'Permeate 3' })] }, {});
  const a = who(b, 'A');
  for (let y = 3; y <= 7; y++) addCover(b, 'brick-wall', 2, y);
  assert.equal(a.permeates, 0);
  assert.deepEqual(stepToward(b, a, { x: 5, y: 5 }, 4, 1), { x: 4, y: 5 });
  const slow = duel({ powers: [power('Phase', 'Movement', 1, { detail: 'Permeate 1' })] }, {});
  const s = who(slow, 'A');
  for (let y = 3; y <= 7; y++) addCover(slow, 'brick-wall', 2, y);
  const walking = stepToward(slow, { ...s, permeates: null }, { x: 5, y: 5 }, 4, 1);
  assert.equal(s.permeates, 2);
  assert.deepEqual(stepToward(slow, s, { x: 5, y: 5 }, 4, 1), walking, 'two speed ranks less is one step in four, so walking round is nearer: it walks');
});

test('Slithering: no penalty for attacking while prone', () => {
  const b = duel({ powers: [power('Snake', 'Movement', 1, { detail: 'Slithering' })] }, {});
  const a = who(b, 'A'); const foe = who(b, 'B');
  a.conditions.push({ name: 'Prone', degree: 1, source: 'drop' });
  assert.equal(proneMod(a, foe, { kind: 'close' }), 0);
  const plain = who(duel({}, {}), 'A');
  plain.conditions.push({ name: 'Prone', degree: 1, source: 'drop' });
  assert.equal(proneMod(plain, foe, { kind: 'close' }), -5);
});

test('Sure-footed takes a speed rank off the loss to impeding weather per rank, and an adaptation to wind takes it all', () => {
  const gale = power('Gale', 'Environment', 2, { detail: 'Wind', option: 'Greater (extreme)' });
  const make = (powers) => { const b = powerArena([['E', 'A', { powers: [gale] }, { x: 1, y: 5 }], ['F', 'B', { powers }, { x: 2, y: 5 }]]); startEnvironment(b, who(b, 'E'), environmentsOf(who(b, 'E').ch)[0], ['impede']); refreshEnvironment(b); return who(b, 'F'); };
  assert.equal(make([]).slowed, 2);
  assert.equal(make([power('Footing', 'Movement', 1, { detail: 'Sure-footed' })]).slowed, 1);
  assert.equal(make([power('Wings', 'Movement', 1, { detail: 'Environmental adaptation: high winds' })]).slowed, 0);
});

// ---- Extra Limbs ------------------------------------------------------------------------------------------------------

test('Extra Limbs give the benefits of Improved Grab, and +1 a rank (to +5) on a grab, less Weak Limbed', () => {
  assert.equal(limbBonus(movementTraits({ powers: [power('Arms', 'Extra Limbs', 3)] })), 3);
  assert.equal(limbBonus(movementTraits({ powers: [power('Arms', 'Extra Limbs', 8)] })), 5);
  assert.equal(limbBonus(movementTraits({ powers: [power('Arms', 'Extra Limbs', 4, { flaws: [x('Weak Limbed', { steps: 2 })] })] })), 2);
  const b = duel({ powers: [power('Arms', 'Extra Limbs', 4)] }, {}, [{ x: 1, y: 5 }, { x: 2, y: 5 }]);
  const a = who(b, 'A'); const foe = who(b, 'B');
  assert.equal(a.adv['Improved Grab'], 1);
  assert.equal(a.limbBonus, 4);
  b.log.length = 0;
  grab(b, R, a, foe, dice(10, 1)); // the grab check: d20 10 + Fighting + 4 for the limbs
  assert.match(text(b), /d20 10 \+(\d+) = \d+ vs Parry DC/);
  const base = who(duel({}, {}, [{ x: 1, y: 5 }, { x: 2, y: 5 }]), 'A').attacks.find((q) => q.unarmed).bonus;
  assert.equal(Number(/d20 10 \+(\d+)/.exec(text(b))[1]), base + 4);
});

// ---- Immortality ------------------------------------------------------------------------------------------------------

test('Immortality: the time rank is 19 less the rank, in rounds, so a rank under 14 never returns within a fight', () => {
  assert.deepEqual([20, 19, 18, 17, 16, 15, 14, 13].map(roundsToReturn), [1, 1, 2, 5, 10, 20, 40, Infinity]);
  assert.equal(immortalityOf({ powers: [power('Deathless', 'Immortality', 11)] }), 11);
});

test('a dead Immortal returns when its time comes, with every damage condition gone and no hero points', () => {
  const b = duel({ powers: [power('Deathless', 'Immortality', 17)], hp: 2 }, {}, undefined, { lethal: true });
  const a = who(b, 'A');
  a.bruises = 3; a.staggered = true;
  kill(b, a);
  assert.match(text(b), /A has Immortality 17: it will return to life in 5 round/);
  b.round = 5;
  returnFromDeath(b);
  assert.equal(a.dead, true, 'not yet');
  b.round = 6;
  b.log.length = 0;
  returnFromDeath(b);
  assert.equal(a.dead, false);
  assert.equal(a.out, false);
  assert.deepEqual([a.bruises, a.staggered, a.heroPoints], [0, false, 0]);
  assert.match(text(b), /A returns from the dead \(Immortality\)/);
});

test('without Immortality, or with too low a rank, the dead stay dead', () => {
  const b = duel({ powers: [power('Deathless', 'Immortality', 8)] }, {}, undefined, { lethal: true });
  kill(b, who(b, 'A'));
  assert.equal(who(b, 'A').returnRound ?? null, null);
});

// ---- Energy Absorption ------------------------------------------------------------------------------------------------

test('Energy Absorption: a hit of the kind it feeds on raises the trait to the lower of its rank and the attack rank, topping off, and it fades', () => {
  const eat = power('Fire Eater', 'Energy Absorption', 6, { detail: 'Absorbs fire into Strength' });
  const b = duel({ powers: [eat] }, { powers: [blast(10, 'Fire Bolt', { detail: 'Fire' })] });
  const a = who(b, 'A'); const foe = who(b, 'B');
  const bolt = foe.attacks.find((q) => q.name === 'Fire Bolt');
  assert.deepEqual(absorbsOf(a.ch).map((s) => [s.rank, s.trait, s.descriptors.includes('fire')]), [[6, 'strength', true]]);
  const str = a.d.abilities.Strength;
  b.log.length = 0;
  absorbEnergy(b, foe, bolt, a);
  assert.equal(a.d.abilities.Strength, str + 6, 'the lower of rank 6 and the bolt rank 10');
  assert.match(text(b), /Energy Absorption: A takes in the fire of Fire Bolt and its strength rises by 6/);
  fadeMods(a);
  assert.equal(a.d.abilities.Strength, str + 5, 'one a turn');
  absorbEnergy(b, foe, bolt, a);
  assert.equal(a.d.abilities.Strength, str + 6, 'topped off again');
  absorbEnergy(b, foe, bolt, a);
  assert.equal(a.d.abilities.Strength, str + 6, 'never more than the rank');
});

test('Energy Absorption: a weak attack feeds only its own rank', () => {
  const eat = power('Fire Eater', 'Energy Absorption', 6, { detail: 'Absorbs fire into Strength' });
  const b = duel({ powers: [eat] }, { powers: [blast(3, 'Fire Spark', { detail: 'Fire' })] });
  const a = who(b, 'A'); const str = a.d.abilities.Strength;
  absorbEnergy(b, who(b, 'B'), who(b, 'B').attacks.find((q) => q.name === 'Fire Spark'), a);
  assert.equal(a.d.abilities.Strength, str + 3);
});

test('Energy Absorption: other kinds of attack feed nothing, and the hit is still suffered', () => {
  const eat = power('Fire Eater', 'Energy Absorption', 6, { detail: 'Absorbs fire into Strength' });
  const b = duel({ powers: [eat] }, { powers: [blast(10, 'Ice Bolt', { detail: 'Cold' })] }, [{ x: 1, y: 5 }, { x: 3, y: 5 }]);
  const a = who(b, 'A'); const foe = who(b, 'B');
  const str = a.d.abilities.Strength;
  resolveAttack(b, R, foe, foe.attacks.find((q) => q.name === 'Ice Bolt'), a, dice(19, 1), {});
  assert.equal(a.d.abilities.Strength, str);
  const hot = duel({ powers: [eat] }, { powers: [blast(10, 'Fire Bolt', { detail: 'Fire' })] }, [{ x: 1, y: 5 }, { x: 3, y: 5 }]);
  resolveAttack(hot, R, who(hot, 'B'), who(hot, 'B').attacks.find((q) => q.name === 'Fire Bolt'), who(hot, 'A'), dice(19, 1), {});
  assert.ok(who(hot, 'A').d.abilities.Strength > str, 'a hit that lands feeds it');
  assert.ok(who(hot, 'A').bruises >= 1 || who(hot, 'A').out, 'and is still suffered');
});

// ---- Extra Attacks ----------------------------------------------------------------------------------------------------

test('Extra Attacks is read: rank, and the flaws Activation (Move), Chain, Declining and Limited', () => {
  const ea = extraAttacksOf({ powers: [power('Flurry', 'Extra Attacks', 3, { flaws: [x('Declining'), x('Chain'), x('Activation', { option: 'Move Action' }), x('Limited', { detail: 'Dueling Blade' })] })] });
  assert.deepEqual([ea.rank, ea.declining, ea.chain, ea.move, ea.limited], [3, true, true, true, ['dueling blade']]);
  assert.equal(extraAttacksOf({ powers: [] }), null);
});

test('Extra Attacks: rank more attacks with the same power, each with the normal attack modifier', () => {
  const b = duel({ powers: [power('Flurry', 'Extra Attacks', 2)] }, {}, [{ x: 1, y: 5 }, { x: 2, y: 5 }]);
  const a = who(b, 'A'); const foe = who(b, 'B');
  const atk = a.attacks.find((q) => q.unarmed);
  b.log.length = 0;
  runExtraAttacks(b, R, a, atk, foe, dice(19, 1, 19, 1), true); // two more attacks: hit, the foe fails; hit, the foe fails
  assert.match(text(b), /A follows up with Extra Attacks: 2 more with Unarmed/);
  assert.equal(b.log.filter((e) => e.actor === 'A' && /Unarmed|swings|hits|strikes|attacks|punches|pounds|lets fly|unleashes/i.test(e.text) && e.kind !== 'note').length >= 2, true);
  assert.equal(attackCount(a, atk), 3, 'the planner counts the attack three times');
});

test('Extra Attacks: Declining takes 5 more off each attack, and Chain ends the series on a miss', () => {
  const dec = duel({ powers: [power('Flurry', 'Extra Attacks', 2, { flaws: [x('Declining')] })] }, {}, [{ x: 1, y: 5 }, { x: 2, y: 5 }]);
  const a = who(dec, 'A'); const foe = who(dec, 'B');
  dec.log.length = 0;
  runExtraAttacks(dec, R, a, a.attacks.find((q) => q.unarmed), foe, dice(15, 10, 15, 10), true);
  assert.match(text(dec), /Declining: −5 to hit/);
  assert.match(text(dec), /Declining: −10 to hit/);
  const chain = duel({ powers: [power('Flurry', 'Extra Attacks', 2, { flaws: [x('Chain')] })] }, {}, [{ x: 1, y: 5 }, { x: 2, y: 5 }]);
  chain.log.length = 0;
  runExtraAttacks(chain, R, who(chain, 'A'), who(chain, 'A').attacks.find((q) => q.unarmed), who(chain, 'B'), dice(), false);
  assert.match(text(chain), /Extra Attacks end: the first attack missed \(Chain\)/);
  assert.ok(attackCount(who(chain, 'A'), who(chain, 'A').attacks[0]) < 3, 'the planner discounts a chain');
});

test('Extra Attacks with Activation (Move Action) need a fighter who has not moved', () => {
  const b = duel({ powers: [power('Flurry', 'Extra Attacks', 2, { flaws: [x('Activation', { option: 'Move Action' })] })] }, {}, [{ x: 1, y: 5 }, { x: 2, y: 5 }]);
  const a = who(b, 'A');
  a.squaresMoved = 2;
  b.log.length = 0;
  runExtraAttacks(b, R, a, a.attacks.find((q) => q.unarmed), who(b, 'B'), dice(), true);
  assert.equal(text(b), '');
});
