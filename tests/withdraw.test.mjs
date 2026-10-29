// The three support tactics (src/engine/battle/tactics-support.js, tactics-withdraw.js, support-plan.js): Intimidate and Break,
// Aid the Champion and Fighting Withdrawal. Fights are seeded, so each tactic is compared with no tactic on the same seeds and
// characters; the rules around them (who goes where, when the team has got away) are checked on hand-placed fighters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { catalogEntries } from '../src/engine/workshop.js';
import { catalogToCharacter } from '../src/engine/catalog.js';
import { createBattle, addCombatant, makeCombatant, startBattle, step, runToEnd, simulateMany, serializeBattle, reviveBattle, statusLine, conditionLabels } from '../src/engine/battle.js';
import { takeTurn } from '../src/engine/battle/turn.js';
import { withdrawTurn, withdrawHolds, withdrawOver, fleeChance, targetBias, tradeoffBias, interposeFor } from '../src/engine/battle/tactics.js';
import { demoralizerOf, championOf } from '../src/engine/battle/tactics-support.js';
import { demoralize } from '../src/engine/battle/support-actions.js';
import { supportTurn } from '../src/engine/battle/support-plan.js';
import { alive } from '../src/engine/battle/util.js';
import { aidBonus } from '../src/engine/battle/conditions.js';
import { makeRng } from '../src/engine/rng.js';

const hero = (arch, seed, pl = 10) => generateCharacter(R, { seed, archetype: arch, pl });
const minion = () => catalogToCharacter(catalogEntries(R).filter((e) => e.minion)[3]);
const fighter = (b, id) => b.combatants.find((c) => c.id === id);
const dice = (...rolls) => ({ int: () => { assert.ok(rolls.length, 'the engine asked for more dice than the test gave'); return rolls.shift(); } });

/** Team A (ids A0...) against team B (B0...); `tactic` is team A's, null for none. Not started. */
function arena(tactic, seed, A, B, options = {}) {
  const b = createBattle({ seed });
  Object.assign(b.options, options);
  if (tactic) b.options.teamTactics = { A: tactic };
  A.forEach((ch, k) => addCombatant(b, makeCombatant(R, ch, { id: `A${k}`, team: 'A' })));
  B.forEach((ch, k) => addCombatant(b, makeCombatant(R, ch, { id: `B${k}`, team: 'B' })));
  return b;
}
const squadA = (i) => [hero('mastermind', `a${i}`), hero('blaster', `b${i}`), hero('weaponmaster', `c${i}`), hero('paragon', `d${i}`)];
const squadB = (i) => [hero('powerhouse', `e${i}`), hero('crimefighter', `f${i}`), minion(), minion(), minion()];
const SEEDS = [0, 1, 2, 3, 4, 5];
const fight = (tactic, i, options) => { const b = arena(tactic, `obs-${i}`, squadA(i), squadB(i), options); runToEnd(b, R); return b; };
const count = (tactic, re) => SEEDS.reduce((n, i) => n + fight(tactic, i).log.filter((e) => re.test(e.text) && e.actor?.startsWith('A')).length, 0);

/** A started fight with hand-placed fighters: A0 a tank with Interpose (the rearguard), A1-A3 not; B0, B1 the foes. */
function scene(tactic = 'withdraw', options = {}, seed = 'w1') {
  const b = arena(tactic, seed, [hero('powerhouse', 'w1'), hero('blaster', 'w2'), hero('mystic', 'w3'), hero('speedster', 'w4')], [hero('paragon', 'w5'), hero('crimefighter', 'w6')], options);
  startBattle(b, R); b.log.length = 0;
  for (const c of b.combatants) { c.pos = c.team === 'A' ? 3 : 4; c.speed = 4; c.adv.Fearless = 0; }
  return { b, ...Object.fromEntries(b.combatants.map((c) => [c.id.toLowerCase(), c])) };
}
const lastText = (b) => b.log.at(-1).text;

// ---- Intimidate and Break -----------------------------------------------------------------------------------------

// Requirement: the team's best intimidator demoralizes enemies; with no tactic the same fighters never do.
test('intimidate: on the same six seeds, team A demoralizes only with the tactic, and the best intimidator starts it', () => {
  assert.equal(count(null, /demoraliz/), 0);
  assert.ok(count('intimidate', /demoraliz/) >= 20, `${count('intimidate', /demoraliz/)} demoralize lines`); // 44 when written
  const b = fight('intimidate', 2);
  assert.equal(b.log.find((e) => /demoraliz/.test(e.text)).actor, 'A0');
  assert.equal(demoralizerOf(b, 'A').id, 'A0', 'Intimidation 12 against 9, 3 and 1');
});

// Requirement: the intimidator demoralizes an enemy that is not already impaired each round; Fearless enemies are skipped.
test('intimidate: the best intimidator demoralizes the enemy it can, never the Fearless one, and the weaker intimidator attacks', () => {
  const { b, a0, a1, b0, b1 } = scene('intimidate');
  a0.skills.Intimidation = 30; a1.skills.Intimidation = 0; b1.adv.Fearless = 1;
  for (const c of b.combatants) c.pos = 3;
  const turn = (c) => supportTurn(b, c, { plan: 'attack', ev: 5, target: b0 }, [b0, b1], 'full', dice(15, 5));
  assert.equal(turn(a1), false, 'the weaker intimidator does not demoralize');
  assert.equal(turn(a0), true);
  assert.match(conditionLabels(b0).join(), /^(Impaired|Disabled)$/); assert.deepEqual(conditionLabels(b1), []);
  assert.equal(turn(a0), false, 'the only demoralizable enemy is already impaired');
});

// Requirement: minions on the other side flee more readily while demoralized (their flee chance goes up by half).
test('intimidate: a minion demoralized by an Intimidate and Break fighter flees 1.5 times as readily; no one else does', () => {
  const { b, a0, b0, b1 } = scene('intimidate');
  b0.minion = true; b1.minion = true; b1.pos = 7; b0.d.defenses.Will = 0; b0.skills.Insight = 0; a0.skills.Intimidation = 30;
  assert.equal(fleeChance(b, b0, 0.35), 0.35);
  demoralize(b, a0, b0, dice(15, 5));
  assert.ok(Math.abs(fleeChance(b, b0, 0.35) - 0.525) < 1e-9);
  assert.equal(fleeChance(b, b1, 0.35), 0.35, 'not demoralized');
  b.options.teamTactics = {};
  assert.equal(fleeChance(b, b0, 0.35), 0.35, 'the demoralizer\'s team plays no such tactic');
});

// Requirement: everyone else targets demoralized enemies first.
test('intimidate: the team weighs a demoralized enemy three times as much, and only on that tactic', () => {
  const { b, a0, a1, b0, b1 } = scene('intimidate');
  a0.skills.Intimidation = 30; b0.d.defenses.Will = 0; b0.skills.Insight = 0;
  demoralize(b, a0, b0, dice(15, 5));
  const bias = (c, t) => targetBias(b, c, t, { enemies: [b0, b1] });
  assert.deepEqual([bias(a1, b0), bias(a1, b1)], [3, 1]);
  b.options.teamTactics = {};
  assert.equal(bias(a1, b0), 1);
});

// ---- Aid the Champion -------------------------------------------------------------------------------------------

test('aid the champion: on the same six seeds the team aids far more often than with no tactic', () => {
  const [none, tactic] = [count(null, / aids /), count('aid', / aids /)];
  assert.ok(tactic >= 20 && tactic >= 2 * none, `${tactic} aid lines against ${none}`); // 63 against 10 when written
});

// Requirement: the champion has the best attack value; members whose attacks are worth under half of it aid the champion's attack.
test('aid the champion: the mage (0.31 against the champion\'s 1.06) aids the champion; the stronger attackers and the champion attack', () => {
  const { b, a0, a1, a2, a3, b0 } = scene('aid');
  assert.equal(championOf(b, 'A').unit, a1);
  const turn = (c) => supportTurn(b, c, { plan: 'attack', ev: 5, target: b0 }, [b0], 'full', dice(15));
  assert.deepEqual([a0, a1, a3].map(turn), [false, false, false]);
  assert.equal(a1.aid.length, 0);
  b.options.teamTactics = {};
  assert.equal(turn(a2), false, 'no tactic: the same mage keeps to its own plan');
  b.options.teamTactics = { A: 'aid' };
  assert.equal(turn(a2), true);
  assert.deepEqual([a1.aid.length, aidBonus(a1, fighter(b, a1.aid[0].vs))], [1, 2]);
  assert.match(lastText(b), new RegExp(`${a2.name} aids ${a1.name}`));
});

// ---- Fighting Withdrawal ----------------------------------------------------------------------------------------

// Requirement: the team's goal is escape; with the tactic the team gets away, with no tactic it never does.
test('withdraw: on the same six seeds team A gets away at once with the tactic, and never without it', () => {
  for (const i of SEEDS) {
    const away = fight('withdraw', i); const plain = fight(null, i);
    assert.equal(away.winner, 'A'); assert.equal(away.gotAway, true);
    assert.equal(lastText(away), 'Team A gets away. Team B holds the field.');
    assert.equal(away.combatants.filter((c) => c.team === 'A' && c.escaped).length, 2, 'half of four');
    assert.ok(away.round <= 3, `round ${away.round}`);
    assert.ok(!plain.gotAway && !plain.combatants.some((c) => c.escaped) && !plain.log.some((e) => /gets away/.test(e.text)));
  }
});

// Requirement: a fighter who starts a turn on its team's edge and is not grabbed escapes, and leaves the fight.
test('withdraw: a fighter on its edge gets away and is gone from the fight; one still short of it walks toward it', () => {
  const { b, a1, a2 } = scene();
  a1.pos = 0; a2.pos = 3; a2.speed = 2;
  assert.equal(withdrawTurn(b, a1), true);
  assert.deepEqual([a1.escaped, a1.fled], [true, true]);
  assert.equal(lastText(b), `${a1.name} reaches the edge and gets away.`);
  assert.deepEqual([statusLine(a1), conditionLabels(a1)], ['Got away', ['Got away']]);
  assert.ok(!alive(b).includes(a1));
  assert.equal(withdrawTurn(b, a2), true);
  assert.deepEqual([a2.pos, !!a2.escaped], [1, false]);
  assert.match(lastText(b), /toward the way out \(zone 4 \S+ 2\)/);
});

test('withdraw: team B\'s edge is the last zone, and in an enclosed room the edges are 0 and 1', () => {
  const { b, b0, b1 } = scene('withdraw');
  b.options.teamTactics = { B: 'withdraw' };
  b0.pos = 7; b1.pos = 5; b1.speed = 3;
  assert.equal(withdrawTurn(b, b0), true); assert.equal(b0.escaped, true);
  withdrawTurn(b, b1); assert.equal(b1.pos, 7);
  const room = scene('withdraw', { enclosed: true });
  room.a1.pos = 1; room.a1.speed = 1;
  withdrawTurn(room.b, room.a1); assert.equal(room.a1.pos, 0);
  room.b.options.teamTactics = { B: 'withdraw' }; room.b1.pos = 0;
  withdrawTurn(room.b, room.b1); assert.equal(room.b1.pos, 1);
});

// Requirement: a grabbed fighter does not escape, and a fighter who cannot move fights instead.
test('withdraw: a fighter who cannot move does not escape and attacks, while a free one at the edge leaves', () => {
  const { b, a1, b0 } = scene();
  a1.pos = 0; b0.pos = 0;
  a1.conditions.push({ name: 'Immobile', degree: 1, source: 'snare', from: null });
  assert.equal(withdrawTurn(b, a1), false);
  a1.conditions = []; a1.grabbedBy = 'B0';
  assert.equal(withdrawTurn(b, a1), false, 'a grabbed fighter on the edge is not free to go');
  assert.ok(!a1.escaped);
  a1.grabbedBy = null; a1.conditions.push({ name: 'Immobile', degree: 1, source: 'snare', from: null });
  takeTurn(b, R, a1, makeRng('imm'));
  assert.ok(!a1.escaped && !a1.fled);
  assert.ok(b.log.some((e) => e.actor === 'A1' && ['hit', 'miss', 'crit'].includes(e.kind)), 'it attacks');
  a1.conditions = [];
  takeTurn(b, R, a1, makeRng('free'));
  assert.equal(a1.escaped, true);
});

// Requirement: at least half the team's starting fighters escaping wins the fight by getting away.
test('withdraw: half the team away ends the fight with the other side holding the field; fewer does not', () => {
  const { b, a1, a3 } = scene();
  a1.pos = 0; a3.pos = 0;
  withdrawTurn(b, a1); assert.equal(withdrawOver(b), false); assert.equal(b.status, 'running');
  withdrawTurn(b, a3);
  assert.equal(withdrawOver(b), true);
  assert.deepEqual([b.status, b.winner, b.gotAway], ['over', 'A', true]);
  assert.deepEqual([lastText(b), b.log.at(-1).kind], ['Team A gets away. Team B holds the field.', 'end']);
  const odd = arena('withdraw', 'odd', [hero('blaster', 'w2'), hero('mystic', 'w3'), hero('speedster', 'w4')], [hero('paragon', 'w5')]);
  startBattle(odd, R);
  const [x, y] = [fighter(odd, 'A0'), fighter(odd, 'A1')];
  x.pos = 0; y.pos = 0; withdrawTurn(odd, x);
  assert.equal(withdrawOver(odd), false, '1 of 3');
  withdrawTurn(odd, y); assert.equal(withdrawOver(odd), true, '2 of 3');
});

test('withdraw: fighters who ran or fell do not count as escaped, but stay in the count of the team', () => {
  const { b, a1, a2, a3 } = scene();
  a1.fled = true; a2.fled = true;
  assert.equal(withdrawOver(b), false, 'two fled but none escaped');
  a3.pos = 0; a3.escaped = true; a3.fled = true; fighter(b, 'A0').out = true;
  assert.equal(withdrawOver(b), false, '1 of 4 escaped, one down');
  a1.escaped = true;
  assert.equal(withdrawOver(b), true);
});

// Requirement: with withdrawRounds set, surviving that many rounds with anyone standing also counts as getting away.
test('withdraw: holding out for the set rounds wins only once they are over, and only for a team still standing', () => {
  const { b, a0, a1, a2, a3 } = scene('withdraw', { withdrawRounds: { A: 3 } });
  b.round = 3; assert.equal(withdrawOver(b), false, 'round 3 is not yet 3 rounds survived');
  b.round = 4;
  for (const c of [a0, a1, a2, a3]) c.out = true;
  assert.equal(withdrawOver(b), false, 'nobody left standing');
  a3.out = false;
  assert.equal(withdrawOver(b), true);
  assert.equal(lastText(b), 'Team A gets away after holding out for 3 rounds. Team B holds the field.');
  const one = scene('withdraw', { withdrawRounds: { A: 1 } }); one.b.round = 2; withdrawOver(one.b);
  assert.match(lastText(one.b), /after holding out for 1 round\./);
  const none = scene('withdraw'); none.b.round = 30;
  assert.equal(withdrawOver(none.b), false, 'no hold-out rounds set');
});

test('withdraw: a whole fight with withdrawRounds 1 ends in round 2 as a hold-out win, with nobody escaped', () => {
  const b = arena('withdraw', 'w1', [hero('powerhouse', 'w1'), hero('blaster', 'w2'), hero('mystic', 'w3'), hero('speedster', 'w4')], [hero('paragon', 'w5'), hero('crimefighter', 'w6')], { withdrawRounds: { A: 1 } });
  runToEnd(b, R);
  assert.deepEqual([b.winner, b.gotAway, b.round, b.combatants.filter((c) => c.escaped).length], ['A', true, 2, 0]);
  assert.equal(lastText(b), 'Team A gets away after holding out for 1 round. Team B holds the field.');
});

// Requirement: an ordinary win (the other side beaten) takes precedence over getting away.
test('withdraw: when the other side is down the fight is an ordinary win, even if half the team had escaped', () => {
  const { b, a1, a3, b0, b1 } = scene();
  for (const c of [a1, a3]) { c.escaped = true; c.fled = true; }
  assert.equal(withdrawOver(b), true, 'with the foes standing it is a getaway');
  b.status = 'running'; b.winner = null; b.gotAway = false;
  b0.out = true; b1.out = true;
  assert.equal(withdrawOver(b), false);
  for (let i = 0; i < 10 && b.status === 'running'; i++) step(b, R);
  assert.deepEqual([b.status, b.winner, !!b.gotAway], ['over', 'A', false]);
  assert.match(lastText(b), /^The fight is over\. Team A wins/);
});

// Requirement: tanks and Interpose holders form a rearguard one zone behind the rest, interpose, and use Defensive Attack 2.
test('withdraw: the rearguard stays one zone behind the farthest of the rest, then follows as they leave, and walks out last', () => {
  const { b, a0, a1, a2, a3 } = scene();
  assert.deepEqual([a0, a1, a2, a3].map((c) => c.style === 'tank' || !!c.adv.Interpose), [true, false, false, false]);
  a1.pos = 4; a2.pos = 2; a3.pos = 1; a0.pos = 1; a0.speed = 5;
  withdrawTurn(b, a0);
  assert.equal(a0.pos, 5); assert.match(lastText(b), /to cover the retreat \(zone 2 \S+ 6\)/);
  a1.pos = 0; a2.pos = 0; a3.pos = 0; a0.speed = 1;
  withdrawTurn(b, a0); assert.equal(a0.pos, 4, 'one zone at a time back toward a post at zone 1');
  a0.pos = 2; a0.speed = 5; withdrawTurn(b, a0); assert.equal(a0.pos, 1);
  for (const c of [a1, a2, a3]) { c.fled = true; c.escaped = true; }
  withdrawTurn(b, a0); assert.equal(a0.pos, 0, 'with no one left to cover it goes to the edge');
  withdrawTurn(b, a0); assert.equal(a0.escaped, true);
});

test('withdraw: the rearguard holds its post instead of chasing or closing, Interposes always, and defends with Defensive Attack 2', () => {
  const { b, a0, a1, a2, b0 } = scene();
  const atk = a0.attacks.find((a) => a.roll && !a.area);
  assert.deepEqual(tradeoffBias(b, a0, b0, atk), { allOut: 0, defensive: 2 });
  assert.equal(tradeoffBias(b, a1, b0, a1.attacks.find((a) => a.roll && !a.area)), null);
  assert.equal(interposeFor(b, a0, a1), true); assert.equal(interposeFor(b, a1, a2), null);
  assert.equal(withdrawHolds(b, a0, { plan: 'move' }), true);
  assert.equal(lastText(b), `${a0.name} holds the rear and covers the others.`);
  assert.equal(withdrawHolds(b, a0, { plan: 'attack', attack: { kind: 'close' }, target: { pos: a0.pos + 1 } }), true);
  assert.equal(withdrawHolds(b, a0, { plan: 'attack', attack: { kind: 'close' }, target: { pos: a0.pos } }), false, 'a foe already in reach is fought');
  assert.equal(withdrawHolds(b, a0, { plan: 'attack', attack: { kind: 'ranged' }, target: { pos: a0.pos + 3 } }), false);
  assert.equal(withdrawHolds(b, a1, { plan: 'move' }), false, 'only the rearguard holds');
  b.options.teamTactics = {};
  assert.deepEqual([withdrawHolds(b, a0, { plan: 'move' }), tradeoffBias(b, a0, b0, atk)], [false, null]);
});

// Requirement: save and load keep escaped fighters and the getaway.
test('withdraw: a saved and reloaded getaway still has its escaped fighters, "Got away" status and result', () => {
  const b = fight('withdraw', 1);
  const back = reviveBattle(R, JSON.parse(JSON.stringify(serializeBattle(b))));
  const escaped = (x) => x.combatants.filter((c) => c.escaped).map((c) => c.id);
  assert.deepEqual(escaped(back), escaped(b)); assert.equal(escaped(back).length, 2);
  assert.deepEqual([back.winner, back.gotAway, back.status], ['A', true, 'over']);
  assert.deepEqual(back.combatants.filter((c) => c.escaped).map(statusLine), ['Got away', 'Got away']);
  assert.equal(back.log.length, b.log.length);
  assert.equal(step(back, R), 0);
});

test('withdraw: many runs count the getaways and who escaped, and none without the tactic', () => {
  const sim = (tactic) => simulateMany(arena(tactic, 'many', squadA(0), squadB(0)), R, 4);
  const away = sim('withdraw');
  assert.deepEqual([away.gotAway, away.wins.A], [4, 4]);
  assert.equal(Object.values(away.escaped).reduce((s, n) => s + n, 0), 8);
  const plain = sim(null);
  assert.equal(plain.gotAway, 0); assert.equal(Object.values(plain.escaped).reduce((s, n) => s + n, 0), 0);
});
