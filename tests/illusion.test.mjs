// Illusion (Hero's Handbook p101-102) and Environment (p97, p169-170).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerArena, dice, text, R, who } from './helpers/power-arena.mjs';
import { illusionsOf, deceive, illusionUpkeep, countersIllusion } from '../src/engine/battle/illusion.js';
import { deceivedTurn } from '../src/engine/battle/illusion-turn.js';
import { environmentsOf, startEnvironment, slowOf, radiusFt, environmentRound, refreshEnvironment, environmentUpkeep } from '../src/engine/battle/environment.js';
import { environmentOption } from '../src/engine/battle/utility-environment.js';
import { concealmentPenalty } from '../src/engine/battle/odds.js';
import { squaresInMove } from '../src/engine/battle/geometry.js';
import { runToEnd } from '../src/engine/battle.js';

const illusion = (rank = 8) => ({ name: 'Mirage', effect: 'Illusion', rank, role: 'control', range: 'Perception', extras: [], flaws: [], option: 'All sense types' });
const shot = { name: 'Bolt', effect: 'Damage', rank: 3, range: 'Ranged', role: 'attack', extras: [], flaws: [] };
const claws = { name: 'Claws', effect: 'Damage', rank: 6, range: 'Close', role: 'attack', extras: [], flaws: [] };
const env = (name, rank, detail, option = '', more = {}) => ({ name, effect: 'Environment', rank, detail, option, role: 'utility', extras: [], flaws: [], ...more });

/** I (team A) the illusionist; T and V (team B) two foes; T is the one to fool and V the teammate it will take for a foe. */
function trio() {
  const b = powerArena([['I', 'A', { powers: [illusion()] }, { x: 1, y: 5 }], ['T', 'B', { powers: [claws] }, { x: 5, y: 5 }], ['V', 'B', { powers: [claws] }, { x: 6, y: 5 }]]);
  return { b, i: who(b, 'I'), t: who(b, 'T'), v: who(b, 'V'), s: illusionsOf(who(b, 'I').ch)[0] };
}

test('the Illusion power is read, and a sense that Counters Illusion sees through it', () => {
  assert.equal(illusionsOf({ powers: [illusion(7)] })[0].rank, 7);
  assert.equal(countersIllusion({ senses: 'Counters Illusion (visual)' }), true);
  assert.equal(countersIllusion({ senses: 'Darkvision' }), false);
});

test('switching looks: an opposed check of the Illusion rank against Insight; a win fools the foe into attacking its teammate', () => {
  const f = trio();
  assert.equal(deceive(f.b, f.i, f.s, f.t, f.v, dice(18, 3)), true); // Illusion 18 + 8 = 26 against Insight 3 + 2
  assert.match(text(f.b), /I uses Mirage \(rank 8\) to switch the looks of V and one of its own allies, so T sees a foe in V: Illusion d20 18 \+8 = 26 vs T's Insight d20 3 \+2 = 5.* — T is fooled and will attack V by mistake/);
  assert.equal(f.t.deceived.victim, 'V');
  const g = trio();
  assert.equal(deceive(g.b, g.i, g.s, g.t, g.v, dice(1, 20)), false);
  assert.match(text(g.b), /T is not fooled/);
  assert.equal(g.t.deceived, null);
});

test('a fooled fighter spends its turn attacking the teammate, then may see through it with an Insight check against 10 + rank', () => {
  const f = trio();
  deceive(f.b, f.i, f.s, f.t, f.v, dice(18, 3));
  f.t.x = 5; f.v.x = 6;
  f.b.log.length = 0;
  // the attack on V (hit roll 19, V's Toughness roll 1), then T's Insight check d20 4 + 2 = 6 against DC 18: still fooled
  assert.equal(deceivedTurn(f.b, R, f.t, dice(19, 1, 4)), true);
  assert.match(text(f.b), /T takes V for a foe \(Mirage\) and turns on it!/);
  assert.match(text(f.b), /T looks at what it just struck: Insight d20 4 \+2 = 6 vs DC 18 — still fooled/);
  assert.ok(f.t.deceived);
  f.v.out = false; f.v.outReason = null; // the first blow put V down; stand it up for the second
  assert.equal(deceivedTurn(f.b, R, f.t, dice(19, 1, 20)), true); // a natural 20 sees through it
  assert.match(text(f.b), /it sees through Mirage/);
  assert.equal(f.t.deceived, null);
  assert.equal(deceivedTurn(f.b, R, f.t, dice()), false, 'no longer fooled: a normal turn');
});

test('the illusion fades when its maker can no longer keep it up', () => {
  const f = trio();
  deceive(f.b, f.i, f.s, f.t, f.v, dice(18, 3));
  f.i.out = true;
  f.b.log.length = 0;
  illusionUpkeep(f.b);
  assert.equal(f.t.deceived, null);
  assert.match(text(f.b), /Mirage fades: T is no longer fooled/);
});

test('a fighter that Counters Illusion cannot be fooled, so the AI does not try', () => {
  const f = trio();
  f.t.senses = 'Counters Illusion'; f.v.senses = 'Counters Illusion';
  runToEnd(f.b, R);
  assert.doesNotMatch(text(f.b), /I uses Mirage/);
});

test('the AI uses the switch when two foes are about and the Insight of the one it fools is low', () => {
  const f = trio();
  f.b.log.length = 0;
  runToEnd(f.b, R);
  assert.match(text(f.b), /I uses Mirage \(rank 8\) to switch the looks of/);
  const lone = powerArena([['I', 'A', { powers: [illusion()] }, { x: 1, y: 5 }], ['T', 'B', { powers: [claws] }, { x: 5, y: 5 }]]);
  runToEnd(lone, R);
  assert.doesNotMatch(text(lone), /switch the looks/, 'with a single foe there is nobody to turn it on');
});

// ---- Environment ---------------------------------------------------------------------------------------------------

test('the Environment power is read: the kinds from its words, the level from its option, and the radius doubles with each rank', () => {
  const [s] = environmentsOf({ powers: [env('Weather Control', 6, 'Rain, wind, fog and cold')] });
  assert.deepEqual(s.kinds.sort(), ['cold', 'impede', 'visibility']);
  assert.equal(environmentsOf({ powers: [env('Chill', 4, 'Cold', 'Greater (extreme cold/heat)')] })[0].level, 2);
  assert.equal(environmentsOf({ powers: [env('Chill', 4, 'Cold')] })[0].level, 1);
  assert.deepEqual([1, 2, 3, 5].map(radiusFt), [30, 60, 120, 480]);
});

test('impeded movement takes ranks off the speed of everyone in the radius, allies too', () => {
  const b = powerArena([['E', 'A', { powers: [env('Gale', 1, 'Wind', 'Greater (extreme)')] }, { x: 1, y: 5 }], ['F', 'B', {}, { x: 4, y: 5 }], ['Far', 'B', {}, { x: 11, y: 5 }]]);
  const e = who(b, 'E'); const f = who(b, 'F'); const far = who(b, 'Far');
  const before = squaresInMove(b, f);
  startEnvironment(b, e, environmentsOf(e.ch)[0], ['impede']);
  assert.equal(slowOf(b, f), 2);
  assert.equal(squaresInMove(b, f), Math.max(1, Math.floor(before / 4)), 'two ranks slower: a quarter of the distance');
  assert.equal(slowOf(b, far), 0, 'outside the 30 ft radius of rank 1 (6 squares of 5 ft)');
});

test('light takes the concealment off darkness, and nothing else', () => {
  const dark = { name: 'Shadow Cloak', effect: 'Concealment', rank: 4, detail: 'Visual, darkness and shadows', role: 'defense', extras: [], flaws: [] };
  const fog = { name: 'Mist', effect: 'Concealment', rank: 4, detail: 'Visual, mist', role: 'defense', extras: [], flaws: [] };
  const b = powerArena([['L', 'A', { powers: [env('Lamp', 2, 'Light', 'Greater (daylight)')] }, { x: 1, y: 5 }], ['D', 'B', { powers: [dark] }, { x: 3, y: 5 }], ['M', 'B', { powers: [fog] }, { x: 3, y: 4 }]]);
  const [l, d, m] = ['L', 'D', 'M'].map((id) => who(b, id));
  const atk = { range: 'ranged' };
  const penalty = concealmentPenalty(l, d, atk);
  const mist = concealmentPenalty(l, m, atk);
  startEnvironment(b, l, environmentsOf(l.ch)[0], ['light']);
  refreshEnvironment(b);
  assert.equal(concealmentPenalty(l, d, atk), 0, 'daylight: no darkness concealment');
  assert.equal(concealmentPenalty(l, m, atk), mist, 'fog is not darkness');
  assert.ok(penalty > 0);
});

test('extreme cold asks a Fortitude check every tenth round, DC 10 and then one more each time, and fatigue follows a failure', () => {
  const b = powerArena([['C', 'A', { powers: [env('Deep Freeze', 12, 'Cold', 'Greater (extreme cold)')] }, { x: 1, y: 5 }], ['V', 'B', {}, { x: 3, y: 5 }]]);
  const c = who(b, 'C'); const v = who(b, 'V');
  startEnvironment(b, c, environmentsOf(c.ch)[0], ['cold']);
  b.log.length = 0;
  environmentRound(b, 5, dice());
  assert.equal(text(b), '', 'no check before the tenth round');
  environmentRound(b, 11, dice(1, 1)); // both roll a natural 1
  assert.match(text(b), /V in the extreme cold of Deep Freeze: Fortitude d20 1 .* vs DC 10 — fails and becomes fatigued/);
  assert.equal(v.fatigue, 1);
  environmentRound(b, 21, dice(1, 1));
  assert.match(text(b), /vs DC 11 — fails and becomes exhausted/);
  const mild = powerArena([['C', 'A', { powers: [env('Cool', 12, 'Cold')] }, { x: 1, y: 5 }], ['V', 'B', {}, { x: 3, y: 5 }]]);
  startEnvironment(mild, who(mild, 'C'), environmentsOf(who(mild, 'C').ch)[0], ['cold']);
  mild.log.length = 0;
  environmentRound(mild, 11, dice());
  assert.equal(text(mild), '', 'intense cold is a check every ten minutes: none in a fight');
});

test('an Environment ends when its user is down', () => {
  const b = powerArena([['E', 'A', { powers: [env('Gale', 3, 'Wind')] }, { x: 1, y: 5 }], ['F', 'B', {}, { x: 4, y: 5 }]]);
  startEnvironment(b, who(b, 'E'), environmentsOf(who(b, 'E').ch)[0], ['impede']);
  who(b, 'E').out = true;
  environmentUpkeep(b);
  assert.equal(b.env.length, 0);
});

test('the AI starts impeding weather against melee foes that must cross open ground, and not when the foes are on top of it', () => {
  const far = powerArena([['E', 'A', { powers: [env('Gale', 5, 'Wind', 'Greater (extreme)'), shot] }, { x: 0, y: 5 }], ['F', 'B', { powers: [claws] }, { x: 10, y: 5 }]]);
  far.order = ['E', 'F']; // E acts first, with the foe still ten squares off
  runToEnd(far, R);
  assert.match(text(far), /E uses Gale \(rank 5\): impeded movement/);
  const near = powerArena([['E', 'A', { powers: [env('Gale', 5, 'Wind', 'Greater (extreme)'), shot] }, { x: 4, y: 5 }], ['F', 'B', { powers: [claws] }, { x: 5, y: 5 }]]);
  assert.equal(environmentOption(near, who(near, 'E'), [who(near, 'F')]), null, 'nothing to slow: the foe is already in reach');
  assert.equal(environmentOption(far, who(far, 'E'), [who(far, 'F')]), null, 'after it is in force, starting it again is worth nothing');
});
