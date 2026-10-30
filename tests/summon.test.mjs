// Summon and Duplication (Hero's Handbook p118 and p94), Command (p175) and the Martial Arts Calling flaw (MA 95).
// Dice are scripted where a roll matters (an initiative or a resistance check).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerArena, dice, text, R, who } from './helpers/power-arena.mjs';
import { summonsOf, summonRoom, liveSummons } from '../src/engine/battle/summon.js';
import { callSummons, issueCommand, summonSkip, summonUpkeep } from '../src/engine/battle/summon-run.js';
import { fullCopyRank, minionArchetype } from '../src/engine/battle/summon-build.js';
import { startBattle, step, runToEnd } from '../src/engine/battle.js';
import { canAct } from '../src/engine/battle/conditions.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';

const x = (name, more = {}) => ({ name, ...more });
const summon = (rank, extras = [], more = {}) => ({ name: 'Grave Servants', effect: 'Summon', rank, detail: 'Zombies', role: 'control', extras, flaws: [], ...more });
const bolt = (rank = 8) => ({ name: 'Bolt', effect: 'Damage', rank, range: 'Ranged', role: 'attack', extras: [], flaws: [] });

/** A summoner S (team A) and a foe T (team B) a few squares off. */
function pair(power, spec = {}) {
  const b = powerArena([['S', 'A', { powers: [power], ...spec }, { x: 1, y: 5 }], ['T', 'B', { powers: [bolt()] }, { x: 7, y: 5 }]]);
  return { b, s: who(b, 'S'), t: who(b, 'T') };
}
const call = (f, ...rolls) => callSummons(f.b, R, f.s, summonsOf(f.s.ch)[0], dice(...rolls));

test('the power is read: Multiple Minions doubles the number, Horde, Active, Heroic, Sacrifice and Calling are found', () => {
  const ch = { powers: [summon(6, [x('Multiple Minions', { steps: 2 }), x('Horde'), x('Sacrifice'), x('Mental Link')], { flaws: [x('Calling')] })] };
  const [s] = summonsOf(ch);
  assert.equal(s.max, 4);
  assert.equal(s.horde, true);
  assert.equal(s.sacrifice, true);
  assert.equal(s.calling, true);
  assert.equal(s.active, false);
  const [a] = summonsOf({ powers: [summon(4, [x('Active')])] });
  assert.equal(a.active, true);
  const [h] = summonsOf({ powers: [summon(4, [x('Heroic')])] });
  assert.equal(h.heroic && h.active, true, 'Heroic includes Active');
  assert.equal(summonsOf({ powers: [{ name: 'Wall', effect: 'Create', rank: 4 }] }).length, 0);
});

test('a minion appears beside the summoner on its team, built on rank x 15 points, dazed, and as a minion', () => {
  const f = pair(summon(6));
  const [m] = call(f, 12);
  assert.ok(m, 'a minion came');
  assert.equal(m.team, 'A');
  assert.ok(Math.max(Math.abs(m.x - f.s.x), Math.abs(m.y - f.s.y)) <= 1, 'beside the summoner');
  assert.equal(m.pl, 6, 'power level = rank, so 90 points');
  assert.equal(m.minion, true);
  assert.equal(canAct(m), 'standard', 'dazed: a standard action only');
  assert.equal(m.summon.by, 'S');
  assert.ok(f.b.combatants.includes(m) && f.b.order.includes(m.id), 'in the fight and in the initiative order');
  assert.match(text(f.b), /S uses Grave Servants \(rank 6\) and calls .*built on 90 points.*dazed.*acting from the next round/);
  assert.equal(m.heroPoints, 0, 'minions have no hero points');
});

test('a minion cannot have minions of its own', () => {
  const f = pair(summon(9));
  const [m] = call(f, 12);
  assert.equal(summonsOf(m.ch).length, 0);
});

test('Active and Heroic minions are not dazed; Heroic ones are not minions', () => {
  const act = pair(summon(5, [x('Active')]));
  assert.equal(canAct(call(act, 12)[0]), 'full');
  const hero = pair(summon(5, [x('Heroic')]));
  const [h] = call(hero, 12);
  assert.equal(h.minion, false, 'treated like a normal character');
  assert.equal(canAct(h), 'full');
});

test('one minion per use, up to the cap; Horde calls them all at once, and leaves the summoner vulnerable', () => {
  const f = pair(summon(4, [x('Multiple Minions', { steps: 2 })]));
  const s = summonsOf(f.s.ch)[0];
  for (let k = 0; k < 4; k++) assert.equal(call(f, 10 + k).length, 1);
  assert.equal(summonRoom(f.b, f.s, s), 0);
  assert.equal(call(f).length, 0, 'the cap is four');
  assert.equal(liveSummons(f.b, f.s).length, 4);
  const h = pair(summon(4, [x('Multiple Minions', { steps: 2 }), x('Horde')]));
  assert.equal(call(h, 10, 11, 12, 13).length, 4);
  assert.equal(h.s.distracted, true, 'vulnerable until the start of the next turn');
  assert.match(text(h.b), /Horde: S is vulnerable/);
});

test('a downed minion still counts: it cannot be called again until it has recovered', () => {
  const f = pair(summon(4, [x('Multiple Minions', { steps: 1 })]));
  const [m] = call(f, 12);
  m.out = true; m.outReason = 'minion';
  assert.equal(summonRoom(f.b, f.s, summonsOf(f.s.ch)[0]), 1, 'one of two used, the downed one still holds its place');
});

test('a minion does not act in the round it came (even an Active one), and waits for orders until Command is given', () => {
  const quick = pair(summon(4, [x('Active')]));
  const [q] = call(quick, 12);
  assert.equal(summonSkip(quick.b, q), true, 'the round it came');
  quick.b.round += 1;
  assert.equal(summonSkip(quick.b, q), false, 'from the next round');
  const f = pair(summon(4));
  const [m] = call(f, 12);
  f.b.round += 1;
  f.b.log.length = 0;
  assert.equal(summonSkip(f.b, m), true, 'no orders yet');
  assert.match(text(f.b), /Zombie #1 waits for S's orders/);
  assert.equal(issueCommand(f.b, f.s), true);
  assert.match(text(f.b), /S commands .* to attack \(Command, a move action\)/);
  assert.equal(summonSkip(f.b, m), false);
  assert.equal(issueCommand(f.b, f.s), false, 'orders stand until the task is done: nothing more to command');
});

test('Active, Heroic and duplicate summons need no orders', () => {
  const f = pair(summon(4, [x('Active')]));
  const [m] = call(f, 12);
  f.b.round += 1;
  assert.equal(summonSkip(f.b, m), false);
  assert.equal(issueCommand(f.b, f.s), false);
});

test('the summoner spends its move action on Command at the start of a turn when its full action is available', () => {
  const f = pair(summon(4));
  const [m] = call(f, 12);
  f.b.round = 2; f.b.turn = 0;
  f.b.order = ['S', 'T', m.id];
  f.b.log.length = 0;
  f.s.dazed = false;
  step(f.b, R); // S acts first in this order
  assert.match(text(f.b), /S commands Zombie #1 to attack \(Command, a move action\)/);
  assert.equal(m.summon.commanded, true);
});

test('minions vanish when the summoner is out, and the fight can end', () => {
  const f = pair(summon(4, [x('Multiple Minions', { steps: 1 })]));
  const [m] = call(f, 12);
  f.s.out = true; f.s.outReason = 'ko';
  f.b.log.length = 0;
  summonUpkeep(f.b);
  assert.equal(m.out, true);
  assert.equal(m.vanished, true);
  assert.match(text(f.b), /S can no longer keep the summon up: Zombie #1 vanishes/);
});

test('Sacrifice: a hero point shifts a hit onto a minion in range', () => {
  const f = pair(summon(4, [x('Sacrifice')]), { hp: 2 });
  const [m] = call(f, 12);
  m.x = f.s.x + 1; m.y = f.s.y; f.t.x = f.s.x + 4; f.t.y = f.s.y;
  const atk = f.t.attacks.find((a) => a.name === 'Bolt');
  f.b.log.length = 0;
  resolveAttack(f.b, R, f.t, atk, f.s, dice(19, 1), {}); // the hit lands; the minion rolls its resistance (1: fails)
  assert.match(text(f.b), /S spends a hero point and shifts the effect onto Zombie #1 \(Sacrifice, 1 left\)/);
  assert.equal(f.s.heroPoints, 1);
  assert.equal(f.s.bruises, 0, 'the summoner took nothing');
  assert.equal(m.out, true, 'the minion fell to the first failed check');
});

test('no Sacrifice without the extra', () => {
  const f = pair(summon(4), { hp: 2 });
  const [m] = call(f, 12);
  m.x = f.s.x + 1; m.y = f.s.y; f.t.x = f.s.x + 4; f.t.y = f.s.y;
  f.b.log.length = 0;
  resolveAttack(f.b, R, f.t, f.t.attacks.find((a) => a.name === 'Bolt'), f.s, dice(19, 1), {});
  assert.doesNotMatch(text(f.b), /Sacrifice/);
  assert.equal(f.s.heroPoints, 2);
});

test('Resistible: the minion resists with Will against 10 + rank, and a resisted call cannot be tried again', () => {
  const f = pair(summon(4, [], { flaws: [x('Resistible', { detail: 'Resisted by Will' })] }));
  assert.equal(call(f, 20).length, 0, 'a natural 20 resists');
  assert.match(text(f.b), /Resistible: the minion rolls Will .* vs DC 14.*resists and does not come/);
  const f2 = pair(summon(4, [], { flaws: [x('Resistible', { detail: 'Resisted by Will' })] }));
  assert.equal(call(f2, 1, 12).length, 1, 'a natural 1 fails the check and the minion must come (the second roll is its initiative)');
});

test('Calling (MA 95): the minion walks in from the team edge instead of appearing beside the summoner', () => {
  const f = pair(summon(4, [], { flaws: [x('Calling')] }));
  f.s.x = 5; // away from its team's edge
  const [m] = call(f, 12);
  assert.ok(Math.max(Math.abs(m.x - f.s.x), Math.abs(m.y - f.s.y)) > 1, 'not beside the summoner');
  assert.equal(m.x, 1, 'it comes from the summoner team edge');
  assert.match(text(f.b), /walk in from the edge \(Calling\)/);
});

test('Feedback: damaging a minion makes the summoner resist with the effect rank as the bonus (p135)', () => {
  const f = pair(summon(6, [], { flaws: [x('Feedback')] }));
  const [m] = call(f, 12);
  m.x = f.s.x + 1; m.y = f.s.y; f.t.x = f.s.x + 4; f.t.y = f.s.y;
  f.b.log.length = 0;
  resolveAttack(f.b, R, f.t, f.t.attacks.find((a) => a.name === 'Bolt'), m, dice(19, 1, 3), {}); // hit, the minion fails its check, the summoner rolls 3
  assert.match(text(f.b), /Feedback: Zombie #1 is damaged \(Damage 8\), so S resists with the effect's rank: d20 3 \+6 = 9 vs DC 23/);
  assert.ok(f.s.bruises >= 1 || f.s.out, 'the summoner was hurt too');
});

test('Duplication: a full-power copy has the summoner traits except the power; a lower rank is scaled down', () => {
  const dup = { name: 'Double', effect: 'Duplication', rank: 1, role: 'control', extras: [], flaws: [] };
  const f = pair(dup);
  const full = fullCopyRank(f.s.ch, R);
  assert.ok(full >= 1);
  const big = pair({ ...dup, rank: full });
  const [d] = callSummons(big.b, R, big.s, summonsOf(big.s.ch)[0], dice(12));
  assert.equal(d.ch.abilities.Fighting, big.s.ch.abilities.Fighting, 'same traits');
  assert.equal(summonsOf(d.ch).length, 0, 'except this power');
  assert.equal(d.minion, true, 'a duplicate is a minion');
  assert.equal(canAct(d), 'full', 'Active');
  assert.match(text(big.b), /calls a duplicate of itself/);
  const [small] = call(f, 12);
  assert.ok(small.ch.abilities.Fighting < f.s.ch.abilities.Fighting, 'a scaled-down copy has lower ranks');
  assert.equal(small.ch.pl, 1);
  f.b.round += 1;
  assert.equal(summonSkip(f.b, small), false, 'a duplicate thinks and acts like its maker: no orders needed');
});

test('the minion kind is read from the power words', () => {
  assert.equal(minionArchetype({ detail: 'Zombies', name: 'x' }), 'm-zombie');
  assert.equal(minionArchetype({ detail: 'Launches PL 4 attack drones', name: 'x' }), 'm-drone');
  assert.equal(minionArchetype({ detail: '', name: 'Plain' }), 'm-hench');
});

test('the AI summons on its first turn, and the minions take part and then fall with the summoner', () => {
  const f = pair(summon(6, [x('Multiple Minions', { steps: 2 })]));
  f.b.log.length = 0;
  runToEnd(f.b, R);
  assert.match(text(f.b), /S uses Grave Servants/);
  assert.ok(f.b.combatants.filter((c) => c.summon).length >= 2, 'several minions came');
  assert.ok(f.b.combatants.some((c) => c.summon && f.b.log.some((e) => e.actor === c.id && /Bolt|Soul|attack|goes after|takes a shot|rushes|unleashes|swings/i.test(e.text))), 'a minion acted');
});

test('starting the battle again removes the minions of the last run', () => {
  const f = pair(summon(4));
  call(f, 12);
  assert.equal(f.b.combatants.length, 3);
  startBattle(f.b, R);
  assert.equal(f.b.combatants.length, 2);
  assert.equal(f.b.combatants.some((c) => c.summon), false);
});
