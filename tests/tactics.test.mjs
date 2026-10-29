// Team tactics (src/engine/battle/tactics*.js): each of the ten changes what a team does compared with no tactic.
// Fights are seeded, so every comparison runs the same seeds and characters with and without the tactic.
// Counts are summed over a small fixed set of seeds; the numbers in the comments are what the engine gave when the
// test was written, and the assertions leave a wide margin below them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { catalogEntries } from '../src/engine/workshop.js';
import { catalogToCharacter } from '../src/engine/catalog.js';
import { TEAM_TACTICS, createBattle, addCombatant, makeCombatant, startBattle, step, runToEnd, serializeBattle, reviveBattle } from '../src/engine/battle.js';
import { tacticOf, targetBias, attackBias, grabChance, tradeoffBias, forceEffort, spendOnMiss, mayFlee, mayDefend, recoverEarly, healsFreely, healThreshold, teamAttackMin, feintBias, interposeFor, positionGoal, wantsKite, aimsAlways, noteAttack, markTurn } from '../src/engine/battle/tactics.js';
import { vipOf } from '../src/engine/battle/tactics-marks.js';
import { choosePlan } from '../src/engine/battle/plan.js';
import { rngFor } from '../src/engine/battle/util.js';

const es = catalogEntries(R);
const catalog = (re) => catalogToCharacter(es.find((e) => re.test(e.name)));
const hero = (arch, seed, pl = 10) => generateCharacter(R, { seed, archetype: arch, pl });

/** A battle with team A (ids A0, A1, ...) against team B (B0, B1, ...). `tactic` is team A's tactic, or null for none. */
function arena(tactic, seed, A, B, options = {}) {
  const b = createBattle({ seed, name: 'Tactics test' });
  Object.assign(b.options, options);
  if (tactic) b.options.teamTactics = { A: tactic };
  A.forEach((ch, k) => addCombatant(b, makeCombatant(R, ch, { id: `A${k}`, team: 'A' })));
  B.forEach((ch, k) => addCombatant(b, makeCombatant(R, ch, { id: `B${k}`, team: 'B' })));
  return b;
}
const fighter = (b, id) => b.combatants.find((c) => c.id === id);
const teamOf = (b, team) => b.combatants.filter((c) => c.team === team);
const isAttack = (e) => ['hit', 'miss', 'crit'].includes(e.kind);
const byTeamA = (e) => e.actor?.startsWith('A');
const range = (n) => Array.from({ length: n }, (_, i) => i);

// The standard mixed squads used by several tests.
const squadA = (i) => [hero('paragon', `a${i}`), hero('blaster', `b${i}`), hero('weaponmaster', `c${i}`), hero('mystic', `d${i}`)];
const squadB = (i) => [hero('powerhouse', `e${i}`), hero('crimefighter', `f${i}`), hero('speedster', `g${i}`), hero('healer', `h${i}`)];

// ---------------------------------------------------------------------------------------------------------
// The shared rules: the list, the note, 'none', unknown ids, save and load.
// ---------------------------------------------------------------------------------------------------------

// Requirement: the ten tactics plus 'none' are offered, in order, with a label and a one-sentence blurb.
test('the tactic list starts with none and the first ten tactics in order, each with a label and a blurb', () => {
  // Later phases add tactics after these (Take Cover, Intimidate and Break, ...), so only the start is fixed.
  assert.deepEqual(Object.keys(TEAM_TACTICS).slice(0, 11), ['none', 'focus', 'alpha', 'line', 'bodyguard', 'kite', 'lockdown', 'pickoff', 'flank', 'sustain', 'noretreat']);
  assert.equal(TEAM_TACTICS.focus.label, 'Focus Fire');
  assert.equal(TEAM_TACTICS.noretreat.label, 'No Retreat');
  for (const [id, t] of Object.entries(TEAM_TACTICS)) {
    assert.ok(t.label.length > 3 && t.blurb.endsWith('.'), id);
  }
});

// Requirement: startBattle logs "Team X plays Y." once for every team that has a tactic, and for no one else.
test('startBattle notes "Team A plays Focus Fire." and does so for each team with a tactic only', () => {
  const b = arena('focus', 'note-1', squadA(0), squadB(0));
  startBattle(b, R);
  const notes = b.log.filter((e) => e.kind === 'note' && /plays/.test(e.text)).map((e) => e.text);
  assert.deepEqual(notes, ['Team A plays Focus Fire.']);

  const two = arena('alpha', 'note-2', squadA(0), squadB(0));
  two.options.teamTactics.B = 'line';
  startBattle(two, R);
  assert.deepEqual(two.log.filter((e) => /plays/.test(e.text)).map((e) => e.text), ['Team A plays Alpha Strike.', 'Team B plays Hold the Line.']);
});

test('every tactic id logs its own label in the note', () => {
  for (const [id, t] of Object.entries(TEAM_TACTICS)) {
    if (id === 'none') continue;
    const b = arena(id, 'note-3', squadA(0), squadB(0));
    startBattle(b, R);
    assert.ok(b.log.some((e) => e.text === `Team A plays ${t.label}.`), id);
  }
});

// Requirement: a team with no tactic fights exactly as before: same log, and no note.
test('no tactic, an explicit "none" and an unknown id all produce the same fight', () => {
  const run = (teamTactics) => {
    const b = arena(null, 'same-1', squadA(1), squadB(1));
    b.options.teamTactics = teamTactics;
    runToEnd(b, R);
    return b;
  };
  const unset = run({});
  const explicit = run({ A: 'none', B: 'none' });
  const unknown = run({ A: 'no-such-tactic' });
  assert.ok(unset.log.length > 20, 'the fight must have some length');
  assert.deepEqual(explicit.log, unset.log);
  assert.deepEqual(unknown.log, unset.log);
  assert.equal(explicit.winner, unset.winner);
  for (const b of [unset, explicit, unknown]) assert.equal(b.log.filter((e) => /plays/.test(e.text)).length, 0);
  assert.equal(tacticOf(unknown, fighter(unknown, 'A0')), 'none');
  assert.equal(tacticOf(unknown, fighter(unknown, 'B0')), 'none');
});

// Requirement: a tactic changes the fight (guards the comparison tests: they would be empty if every tactic did nothing).
test('every tactic changes the fight compared with none on the same seed', () => {
  const baseline = arena(null, 'differs-1', squadA(2), squadB(2));
  runToEnd(baseline, R);
  const text = (b) => JSON.stringify(b.log.filter((e) => !/plays/.test(e.text)));
  for (const id of Object.keys(TEAM_TACTICS).filter((x) => x !== 'none')) {
    const b = arena(id, 'differs-1', squadA(2), squadB(2), { vip: { A: 'A1' } });
    runToEnd(b, R);
    assert.notEqual(text(b), text(baseline), `${id} played exactly like none`);
  }
});

// Requirement: tactics and the bodyguard's VIP survive save and load, and the revived fight carries on identically.
test('tactics and VIP survive serializeBattle and reviveBattle, and the revived fight matches the uninterrupted one', () => {
  const make = () => {
    const b = arena('focus', 'save-1', squadA(3), squadB(3), { vip: { B: 'B1' } });
    b.options.teamTactics.B = 'bodyguard';
    return b;
  };
  const straight = make();
  runToEnd(straight, R);

  const b = make();
  startBattle(b, R);
  while (b.status === 'running' && b.round < 2) step(b, R);
  assert.equal(b.status, 'running');
  const revived = reviveBattle(R, JSON.parse(JSON.stringify(serializeBattle(b))));
  assert.deepEqual(revived.options.teamTactics, { A: 'focus', B: 'bodyguard' });
  assert.deepEqual(revived.options.vip, { B: 'B1' });
  assert.equal(tacticOf(revived, fighter(revived, 'A2')), 'focus');
  assert.equal(vipOf(revived, 'B').id, 'B1');
  runToEnd(revived, R);
  assert.deepEqual(revived.log, straight.log);
});

// ---------------------------------------------------------------------------------------------------------
// 1. Focus Fire
// ---------------------------------------------------------------------------------------------------------

// Requirement: the whole team marks one target and goes for it.
test('focus: the team marks one enemy (bias x3 for all of its members) and concentrates its attacks on it', () => {
  const b = arena('focus', 'focus-0', squadA(0), squadB(0));
  startBattle(b, R);
  const enemies = teamOf(b, 'B');
  const marked = enemies.filter((t) => targetBias(b, fighter(b, 'A0'), t, { enemies }) === 3);
  assert.equal(marked.length, 1, 'exactly one enemy is marked');
  for (const c of teamOf(b, 'A')) {
    assert.deepEqual(enemies.map((t) => targetBias(b, c, t, { enemies })), enemies.map((t) => (t === marked[0] ? 3 : 1)), `${c.id} agrees on the mark`);
    assert.equal(teamAttackMin(b, c, marked[0]), 1);
    assert.equal(teamAttackMin(b, c, enemies.find((t) => t !== marked[0])), 2);
  }
  const plain = arena(null, 'focus-0', squadA(0), squadB(0));
  startBattle(plain, R);
  assert.deepEqual(teamOf(plain, 'B').map((t) => targetBias(plain, fighter(plain, 'A0'), t, { enemies: teamOf(plain, 'B') })), [1, 1, 1, 1]);

  // Whole fights: the share of team A's attacks in rounds 1 and 2 that land on its most-attacked enemy (focus 71 of 90, none 55 of 87).
  const share = (tactic) => {
    let top = 0; let all = 0; let same = 0; let rounds = 0;
    for (const i of range(12)) {
      const f = arena(tactic, `foc-${i}`, squadA(i), squadB(i));
      runToEnd(f, R);
      for (const r of [1, 2]) {
        const targets = f.log.filter((e) => e.round === r && isAttack(e) && byTeamA(e)).map((e) => e.target);
        if (targets.length < 2) continue;
        const counts = {};
        targets.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
        top += Math.max(...Object.values(counts)); all += targets.length; rounds++;
        if (Object.keys(counts).length === 1) same++;
      }
    }
    return { share: top / all, same, rounds };
  };
  const focus = share('focus'); const none = share(null);
  assert.ok(focus.share > none.share + 0.08, `focus ${focus.share.toFixed(2)} vs none ${none.share.toFixed(2)}`);
  assert.ok(focus.same >= none.same + 2, `rounds with one shared target: focus ${focus.same}/${focus.rounds}, none ${none.same}/${none.rounds}`);
});

// ---------------------------------------------------------------------------------------------------------
// 2. Alpha Strike
// ---------------------------------------------------------------------------------------------------------

// Requirement: rounds 1 and 2 use the biggest All-out Attack and Power Attack, extra effort, and hero points on misses; later rounds are normal.
test('alpha: rounds 1 and 2 are all-out with extra effort and hero point re-rolls, round 3 on is like none', () => {
  const b = arena('alpha', 'alpha-0', squadA(0), squadB(0));
  startBattle(b, R);
  const c = fighter(b, 'A0');
  for (const [round, expected] of [[1, true], [2, true], [3, false], [4, false]]) {
    b.round = round;
    assert.equal(forceEffort(b, c), expected, `extra effort in round ${round}`);
    assert.equal(spendOnMiss(b, c), expected, `hero point on a miss in round ${round}`);
  }
  b.round = 1;
  const enemy = fighter(b, 'B0');
  const attack = c.attacks.find((a) => a.roll && !a.area && a.kind === 'close');
  assert.equal(tradeoffBias(b, c, enemy, attack).defensive, 0);
  assert.equal(tradeoffBias(b, c, enemy, attack).allOut, c.adv['All-out Attack'] ? 5 : 2);
  b.round = 3;
  assert.equal(tradeoffBias(b, c, enemy, attack), null);

  // Whole fights, team A's own lines. Rounds 1-2 with alpha: All-out 52, extra effort 60; with none: 3 and 0.
  // (The hero point re-roll on a miss is only checked through its hook: with no tactic a miss is re-rolled half the time anyway.)
  const tally = (tactic) => {
    const t = { early: { allOut: 0, effort: 0, attacks: 0 }, late: { allOut: 0, effort: 0, attacks: 0 } };
    for (const i of range(8)) {
      const f = arena(tactic, `alp-${i}`, squadA(i), squadB(i));
      runToEnd(f, R);
      for (const e of f.log.filter(byTeamA)) {
        const s = e.round <= 2 ? t.early : t.late;
        if (isAttack(e)) s.attacks++;
        if (/All-out Attack/.test(e.text)) s.allOut++;
        if (/extra effort/.test(e.text)) s.effort++;
      }
    }
    return t;
  };
  const alpha = tally('alpha'); const none = tally(null);
  assert.ok(alpha.early.allOut >= none.early.allOut + 25, `all-out in rounds 1-2: alpha ${alpha.early.allOut}, none ${none.early.allOut}`);
  assert.ok(alpha.early.effort >= none.early.effort + 25, `extra effort in rounds 1-2: alpha ${alpha.early.effort}, none ${none.early.effort}`);
  assert.ok(alpha.early.allOut / alpha.early.attacks > 0.5, 'most early alpha attacks are all-out');
  assert.ok(alpha.late.allOut / alpha.late.attacks < 0.15, `after round 2 alpha is back to normal (${alpha.late.allOut} of ${alpha.late.attacks})`);
  assert.ok(alpha.late.effort <= none.late.effort, `no alpha effort spree after round 2: alpha ${alpha.late.effort}, none ${none.late.effort}`);
});

// ---------------------------------------------------------------------------------------------------------
// 3. Hold the Line
// ---------------------------------------------------------------------------------------------------------

// The blaster and mystic seeds 'x1' are not tough enough to count as front-liners (Toughness below PL).
const lineSquad = (i) => [hero('blaster', 'x1'), hero('paragon', `la${i}`), hero('mystic', 'x1'), hero('powerhouse', `lp${i}`)];

// Requirement: front-liners stand in front with Defensive Attack 2, the rest one zone behind, and guards interpose for any ally.
test('line: the tough fighters take the front zone, the others stand one behind it', () => {
  const b = arena('line', 'line-0', lineSquad(0), squadB(0));
  startBattle(b, R);
  const [shooter, tank, caster, brute] = ['A0', 'A1', 'A2', 'A3'].map((id) => fighter(b, id));
  const front = Math.max(...teamOf(b, 'A').map((c) => c.pos));
  assert.equal(positionGoal(b, tank), front);
  assert.equal(positionGoal(b, brute), front);
  assert.equal(positionGoal(b, shooter), front - 1, 'ranged fighter one zone behind');
  assert.equal(positionGoal(b, caster), front - 1, 'caster one zone behind');
  const plain = arena(null, 'line-0', lineSquad(0), squadB(0));
  startBattle(plain, R);
  assert.equal(positionGoal(plain, fighter(plain, 'A0')), null);
});

test('line: front-liners use Defensive Attack 2, and guards interpose for any ally in the zone', () => {
  const b = arena('line', 'line-1', lineSquad(1), squadB(1));
  startBattle(b, R);
  const tank = fighter(b, 'A1');
  const attack = tank.attacks.find((a) => a.roll && !a.area);
  assert.deepEqual(tradeoffBias(b, tank, fighter(b, 'B0'), attack), { allOut: 0, defensive: 2 });
  assert.equal(interposeFor(b, tank, fighter(b, 'A0')), true);
  assert.equal(interposeFor(b, tank, fighter(b, 'A2')), true);
  assert.equal(interposeFor(b, fighter(b, 'B0'), fighter(b, 'B1')), null, 'the other team has no tactic');

  // Whole fights, enclosed so everyone is in one zone: team A uses Defensive Attack 210 times (of 391 attacks), none 0.
  const tally = (tactic) => {
    let defensive = 0; let interposeForCaster = 0;
    for (const i of range(6)) {
      const f = arena(tactic, `lin-${i}`, lineSquad(i), squadB(i));
      runToEnd(f, R);
      defensive += f.log.filter((e) => byTeamA(e) && /Defensive Attack/.test(e.text)).length;
    }
    for (const i of range(14)) {
      const A = [hero('paragon', `ia-${i}`), hero('blaster', `ib-${i}`), hero('mystic', `ic-${i}`)];
      A[0].advantages = [...(A[0].advantages || []), { name: 'Interpose', rank: 1 }];
      const f = arena(tactic, `gd-${i}`, A, [hero('powerhouse', `id-${i}`), hero('speedster', `ie-${i}`)], { enclosed: true });
      runToEnd(f, R);
      interposeForCaster += f.log.filter((e) => /interposes/.test(e.text) && e.actor === 'A0' && e.target === 'A2').length;
    }
    return { defensive, interposeForCaster };
  };
  const line = tally('line'); const none = tally(null);
  // The exact count depends on how long fights last (trips and other maneuvers shorten some); the front-liners'
  // Defensive Attack 2 itself is pinned by the hook test above.
  assert.ok(line.defensive >= none.defensive + 30, `Defensive Attack: line ${line.defensive}, none ${none.defensive}`);
  assert.ok(line.interposeForCaster >= none.interposeForCaster + 8, `interposes for the mystic ally: line ${line.interposeForCaster}, none ${none.interposeForCaster} (30 against 14)`);
});

// ---------------------------------------------------------------------------------------------------------
// 4. Bodyguard
// ---------------------------------------------------------------------------------------------------------

// Requirement: a VIP (named, else lowest Toughness); guards stand with it, interpose only for it, and go after whoever hit it.
test('bodyguard: the VIP is the named fighter, else the lowest Toughness; guards interpose for the VIP alone', () => {
  const A = () => [hero('paragon', 'bg-a'), hero('blaster', 'bg-b'), hero('mystic', 'bg-c')];
  const b = arena('bodyguard', 'bg-0', A(), squadB(0), { vip: { A: 'A2' } });
  startBattle(b, R);
  assert.equal(vipOf(b, 'A').id, 'A2');
  const guard = fighter(b, 'A0');
  assert.equal(interposeFor(b, guard, fighter(b, 'A2')), true);
  assert.equal(interposeFor(b, guard, fighter(b, 'A1')), false);
  assert.equal(positionGoal(b, guard), fighter(b, 'A2').pos);
  assert.equal(positionGoal(b, fighter(b, 'A2')), null, 'the VIP does not follow itself');

  const unnamed = arena('bodyguard', 'bg-0', A(), squadB(0));
  startBattle(unnamed, R);
  const lowest = teamOf(unnamed, 'A').reduce((low, x) => (x.d.defenses.Toughness < low.d.defenses.Toughness ? x : low));
  assert.equal(vipOf(unnamed, 'A').id, lowest.id);
});

test('bodyguard: an enemy that attacked the VIP since the guard last acted is x3 as a target', () => {
  const b = arena('bodyguard', 'bg-1', [hero('paragon', 'bg-a'), hero('blaster', 'bg-b'), hero('mystic', 'bg-c')], squadB(0), { vip: { A: 'A2' } });
  startBattle(b, R);
  const guard = fighter(b, 'A0'); const vip = fighter(b, 'A2');
  const [culprit, bystander] = [fighter(b, 'B0'), fighter(b, 'B1')];
  const enemies = teamOf(b, 'B');
  b.tick = 100; markTurn(b, guard);
  b.tick = 150; noteAttack(b, culprit, vip);
  assert.equal(targetBias(b, guard, culprit, { enemies }), 3);
  assert.equal(targetBias(b, guard, bystander, { enemies }), 1);
  b.tick = 200; markTurn(b, guard);
  assert.equal(targetBias(b, guard, culprit, { enemies }), 3, 'still counted on the guard\'s next turn');
  b.tick = 300; markTurn(b, guard);
  assert.equal(targetBias(b, guard, culprit, { enemies }), 1, 'forgotten once a whole turn has passed since');
  b.tick = 310; noteAttack(b, bystander, fighter(b, 'A1'));
  assert.equal(targetBias(b, guard, bystander, { enemies }), 1, 'an attack on a non-VIP does not count');
});

test('bodyguard: in whole fights the guards stay beside the VIP and interpose for it and for no one else', () => {
  const tally = (tactic) => {
    let interVip = 0; let interOther = 0; let dist = 0; let n = 0;
    for (const i of range(14)) {
      const A = [hero('paragon', `ia-${i}`), hero('blaster', `ib-${i}`), hero('mystic', `ic-${i}`)];
      A[0].advantages = [...(A[0].advantages || []), { name: 'Interpose', rank: 1 }];
      const f = arena(tactic, `gd-${i}`, A, [hero('powerhouse', `id-${i}`), hero('speedster', `ie-${i}`)], { enclosed: true, vip: { A: 'A1' } });
      runToEnd(f, R);
      for (const e of f.log.filter((x) => /interposes/.test(x.text) && x.actor === 'A0')) { if (e.target === 'A1') interVip++; else interOther++; }
    }
    for (const i of range(8)) {
      const A = [hero('paragon', `ba-${i}`), hero('blaster', `bb-${i}`), hero('mystic', `bc-${i}`), hero('weaponmaster', `bd-${i}`)];
      const f = arena(tactic, `bg-${i}`, A, [hero('powerhouse', `be-${i}`), hero('speedster', `bf-${i}`)], { vip: { A: 'A2' } });
      startBattle(f, R);
      while (f.status === 'running' && f.round < 3) step(f, R);
      for (const c of teamOf(f, 'A').filter((x) => x.id !== 'A2' && !x.out)) { dist += Math.abs(c.pos - fighter(f, 'A2').pos); n++; }
    }
    return { interVip, interOther, dist: dist / n };
  };
  const guard = tally('bodyguard'); const none = tally(null);
  assert.equal(guard.interOther, 0, 'a guard never takes a hit meant for a non-VIP');
  assert.ok(guard.interVip > 0, 'the guard does interpose for the VIP');
  assert.ok(none.interOther > 0, 'without the tactic the same fighter does interpose for others (26 for the VIP, 14 for others)');
  assert.ok(guard.dist < none.dist - 0.25, `average distance of the guards from the VIP in round 3: bodyguard ${guard.dist.toFixed(2)}, none ${none.dist.toFixed(2)}`);
});

// ---------------------------------------------------------------------------------------------------------
// 5. Kite
// ---------------------------------------------------------------------------------------------------------

// Requirement: ranged fighters keep away from melee enemies, avoid close fights and Aim when nobody is near.
test('kite: shooters aim and back away from melee enemies much more than with no tactic', () => {
  const tally = (tactic) => {
    let aims = 0; let away = 0;
    for (const i of range(12)) {
      const A = [hero('weaponmaster', `ka${i}`), hero('mystic', `kb${i}`), hero('infiltrator', `kc${i}`), hero('mastermind', `kd${i}`)];
      const B = [hero('powerhouse', `ke${i}`), hero('paragon', `kf${i}`), hero('martialartist', `kg${i}`)];
      const f = arena(tactic, `kite-${i}`, A, B);
      runToEnd(f, R);
      aims += f.log.filter((e) => byTeamA(e) && /takes aim/.test(e.text)).length;
      away += f.log.filter((e) => byTeamA(e) && /away from/.test(e.text)).length;
    }
    return { aims, away };
  };
  const kite = tally('kite'); const none = tally(null);
  // Every fighter on team B here can attack at range, so Kite never aims for free: aiming would cost a turn
  // and leave the shooter vulnerable to return fire. It still backs away from melee.
  assert.ok(kite.aims <= none.aims + 4, `aims against foes who shoot back: kite ${kite.aims}, none ${none.aims}`);
  assert.ok(kite.away >= none.away + 6, `steps away: kite ${kite.away}, none ${none.away} (20 against 7)`);
});

test('kite: close attacks are a quarter as attractive for a fighter who also has ranged ones, and aiming needs nobody within two zones', () => {
  const b = arena('kite', 'kite-0', [hero('weaponmaster', 'kw'), hero('paragon', 'kp')], [hero('powerhouse', 'ks')]);
  startBattle(b, R);
  const shooter = fighter(b, 'A0'); const enemy = fighter(b, 'B0');
  const close = shooter.attacks.find((a) => a.kind === 'close'); const ranged = shooter.attacks.find((a) => a.kind !== 'close');
  assert.ok(close && ranged, 'the weaponmaster has both');
  assert.ok(wantsKite(b, shooter));
  assert.equal(attackBias(b, shooter, close, enemy), 0.25);
  assert.equal(attackBias(b, shooter, ranged, enemy), 1);
  enemy.pos = shooter.pos + 5;
  assert.equal(aimsAlways(b, shooter, [enemy]), true);
  enemy.pos = shooter.pos + 2;
  assert.equal(aimsAlways(b, shooter, [enemy]), false);
  // An enemy that can shoot back takes away the free aim, however far away it is.
  enemy.pos = shooter.pos + 5;
  const shotBack = { ...enemy, attacks: [...enemy.attacks, { name: 'Rock', kind: 'ranged', effect: 'Damage', rank: 6, roll: true, bonus: 4 }] };
  assert.equal(aimsAlways(b, shooter, [shotBack]), false);
  const plain = arena(null, 'kite-0', [hero('weaponmaster', 'kw')], [hero('powerhouse', 'ks')]);
  startBattle(plain, R);
  assert.equal(wantsKite(plain, fighter(plain, 'A0')), false);
  assert.equal(attackBias(plain, fighter(plain, 'A0'), close, fighter(plain, 'B0')), 1);
});

// ---------------------------------------------------------------------------------------------------------
// 6. Lockdown
// ---------------------------------------------------------------------------------------------------------

const lockA = (k) => [hero('paragon', `la${k}`), hero('mastermind', `lb${k}`), hero('mystic', `lc${k}`)];
const lockB = (k) => [hero('powerhouse', `ld${k}`), hero('blaster', `le${k}`), hero('speedster', `lf${k}`)];
/** How often c's plan picks each enemy over `n` draws. */
function picks(b, who, n = 40) {
  const c = fighter(b, who); const enemies = teamOf(b, 'B'); const tally = {};
  for (let i = 0; i < n; i++) { const plan = choosePlan(b, R, c, enemies, rngFor(b), 'full'); tally[plan.target.id] = (tally[plan.target.id] || 0) + 1; }
  return tally;
}

// Requirement: damage dealers pile onto an enemy a teammate has controlled, but only while a controller still stands.
test('lockdown: a damage dealer finishes the controlled enemy, but only while a controller on the team is standing', () => {
  for (const k of [1, 2]) {
    const stun = (b) => fighter(b, 'B0').conditions.push({ name: 'Stunned', source: 'test' });
    const lock = arena('lockdown', 'plan', lockA(k), lockB(k)); startBattle(lock, R); stun(lock);
    const none = arena(null, 'plan', lockA(k), lockB(k)); startBattle(none, R); stun(none);
    assert.equal(picks(lock, 'A0')['B0'], 40, `seed ${k}: lockdown goes for the stunned enemy every time`);
    assert.equal(picks(none, 'A0')['B0'] ?? 0, 0, `seed ${k}: with no tactic the stunned enemy is passed over`);
    const alone = arena('lockdown', 'plan', lockA(k), lockB(k)); startBattle(alone, R); stun(alone);
    fighter(alone, 'A1').out = true; fighter(alone, 'A2').out = true;
    assert.equal(picks(alone, 'A0')['B0'] ?? 0, 0, `seed ${k}: with no controller left the bias is gone`);
  }
});

test('lockdown: control attacks are x2 against the marked enemy only, and grabs are likelier against it', () => {
  const b = arena('lockdown', 'lock-1', lockA(1), lockB(1));
  startBattle(b, R);
  const mind = fighter(b, 'A1');
  const control = mind.attacks.find((a) => a.tiers || a.effect === 'Nullify');
  assert.ok(control, 'the mastermind has a control attack');
  const enemies = teamOf(b, 'B');
  const biases = enemies.map((t) => attackBias(b, mind, control, t));
  assert.equal(biases.filter((x) => x === 2).length, 1, 'one marked enemy');
  assert.equal(biases.filter((x) => x === 1).length, 2);
  const marked = enemies[biases.indexOf(2)];
  assert.equal(grabChance(b, mind, marked, 0.3), 0.85);
  assert.equal(grabChance(b, mind, enemies[biases.indexOf(1)], 0.3), 0.3);
  const damage = mind.attacks.find((a) => !a.tiers && a.effect !== 'Nullify');
  if (damage) assert.equal(attackBias(b, mind, damage, marked), 1);
  const plain = arena(null, 'lock-1', lockA(1), lockB(1)); startBattle(plain, R);
  assert.equal(attackBias(plain, fighter(plain, 'A1'), control, fighter(plain, 'B0')), 1);
});

// ---------------------------------------------------------------------------------------------------------
// 7. Pick Them Off
// ---------------------------------------------------------------------------------------------------------

// Requirement: minions, hurt enemies and the softest fighter first.
test('pickoff: with three identical enemies it goes for the minion, and for the one with bruises, where none does not', () => {
  const twins = () => [hero('powerhouse', 'twin'), hero('powerhouse', 'twin'), hero('powerhouse', 'twin')];
  const withMinion = (b) => { fighter(b, 'B2').minion = true; };
  const none = arena(null, 'plan', [hero('weaponmaster', 'pk-a')], twins()); startBattle(none, R); withMinion(none);
  const pick = arena('pickoff', 'plan', [hero('weaponmaster', 'pk-a')], twins()); startBattle(pick, R); withMinion(pick);
  assert.equal(picks(pick, 'A0')['B2'], 40, 'pickoff always picks the minion');
  assert.ok((picks(none, 'A0')['B2'] ?? 0) < 20, 'none does not');

  const hurtNone = arena(null, 'plan', [hero('weaponmaster', 'pk-a')], twins()); startBattle(hurtNone, R); fighter(hurtNone, 'B1').bruises = 3;
  const hurtPick = arena('pickoff', 'plan', [hero('weaponmaster', 'pk-a')], twins()); startBattle(hurtPick, R); fighter(hurtPick, 'B1').bruises = 3;
  assert.equal(picks(hurtPick, 'A0')['B1'], 40);
  assert.ok(picks(hurtNone, 'A0')['B1'] < 40, 'with no tactic the bruised enemy is not an every-time choice');
});

test('pickoff: bias is 2.5 for a minion, +0.5 per bruise and 1.5 more for the softest Toughness', () => {
  const b = arena('pickoff', 'pick-1', [hero('paragon', 'pk-a')], [hero('powerhouse', 'pk-b'), hero('blaster', 'pk-c'), catalog(/thug/i)]);
  startBattle(b, R);
  const me = fighter(b, 'A0'); const enemies = teamOf(b, 'B');
  const [tough, other, grunt] = enemies;
  assert.equal(grunt.minion, true);
  const bias = (t) => targetBias(b, me, t, { enemies });
  const soft = Math.min(...enemies.map((e) => e.d.defenses.Toughness));
  const softBonus = (t) => (t.d.defenses.Toughness === soft ? 1.5 : 1);
  assert.equal(bias(tough), softBonus(tough));
  assert.equal(bias(grunt), 2.5 * softBonus(grunt));
  other.bruises = 2;
  assert.equal(bias(other), 2 * softBonus(other), 'two bruises double the appeal');
  const plain = arena(null, 'pick-1', [hero('paragon', 'pk-a')], [catalog(/thug/i)]);
  startBattle(plain, R);
  assert.equal(targetBias(plain, fighter(plain, 'A0'), fighter(plain, 'B0'), { enemies: teamOf(plain, 'B') }), 1);
});

// ---------------------------------------------------------------------------------------------------------
// 8. Feint and Flank
// ---------------------------------------------------------------------------------------------------------

// Requirement: fighters who are not duelists feint too, and the team piles onto the feinted or Vulnerable enemy.
test('flank: fighters who are not duelists feint, which they never do with no tactic', () => {
  const tally = (tactic) => {
    let feints = 0; let byOthers = 0;
    for (const i of range(12)) {
      const A = [hero('weaponmaster', `fa-${i}`), hero('paragon', `fb-${i}`), hero('mastermind', `fc-${i}`)];
      const B = [hero('powerhouse', `fd-${i}`, 12), hero('martialartist', `fe-${i}`, 12)];
      const f = arena(tactic, `fl-${i}`, A, B);
      runToEnd(f, R);
      const mine = f.log.filter((e) => byTeamA(e) && /feints/.test(e.text));
      feints += mine.length;
      byOthers += mine.filter((e) => { const c = fighter(f, e.actor); return c.style !== 'duelist' && !c.adv['Agile Feint']; }).length;
    }
    return { feints, byOthers };
  };
  const flank = tally('flank'); const none = tally(null);
  assert.ok(flank.byOthers >= 6, `feints by non-duelists: flank ${flank.byOthers} (12 in the sample run)`);
  assert.equal(none.byOthers, 0);
  assert.ok(flank.feints > none.feints);
});

test('flank: the feint threshold is loosened and teammates are x2.5 on a feinted or Vulnerable enemy', () => {
  const b = arena('flank', 'flank-1', [hero('weaponmaster', 'fl-a'), hero('paragon', 'fl-b')], [hero('powerhouse', 'fl-c'), hero('martialartist', 'fl-d')]);
  startBattle(b, R);
  const me = fighter(b, 'A0'); const enemies = teamOf(b, 'B');
  assert.deepEqual(feintBias(b, me), { slack: 4, ratio: 2 });
  assert.deepEqual(enemies.map((t) => targetBias(b, me, t, { enemies })), [1, 1]);
  enemies[0].feinted = { by: me.id };
  assert.equal(targetBias(b, me, enemies[0], { enemies }), 2.5);
  assert.equal(targetBias(b, fighter(b, 'A1'), enemies[0], { enemies }), 1, 'a feint by someone else does not count unless the target is Vulnerable');
  enemies[0].feinted = null;
  enemies[1].conditions.push({ name: 'Vulnerable', source: 'test' });
  assert.equal(targetBias(b, fighter(b, 'A1'), enemies[1], { enemies }), 2.5);
  const plain = arena(null, 'flank-1', [hero('weaponmaster', 'fl-a')], [hero('powerhouse', 'fl-c')]);
  startBattle(plain, R);
  assert.equal(feintBias(plain, fighter(plain, 'A0')), null);
});

// ---------------------------------------------------------------------------------------------------------
// 9. Sustain
// ---------------------------------------------------------------------------------------------------------

// Requirement: healers heal sooner and more, others fight defensively while a friend is down, the hurt recover early.
test('sustain: a team with a healer heals far more often than with no tactic', () => {
  const tally = (tactic) => {
    let heals = 0; let recovers = 0;
    for (const i of range(12)) {
      const A = [hero('healer', `sa-${i}`), hero('paragon', `sb-${i}`), hero('martialartist', `sc-${i}`)];
      const B = [hero('powerhouse', `sd-${i}`), hero('blaster', `se-${i}`)];
      const f = arena(tactic, `su-${i}`, A, B);
      runToEnd(f, R);
      heals += f.log.filter((e) => byTeamA(e) && e.kind === 'heal' && /uses/.test(e.text)).length;
      recovers += f.log.filter((e) => byTeamA(e) && /takes a moment to recover/.test(e.text)).length;
    }
    return { heals, recovers };
  };
  const sustain = tally('sustain'); const none = tally(null);
  assert.ok(sustain.heals >= none.heals + 8, `heal actions: sustain ${sustain.heals}, none ${none.heals} (16 against 2)`);
  assert.ok(sustain.recovers >= none.recovers, `Recover actions: sustain ${sustain.recovers}, none ${none.recovers}`);
});

test('sustain: heal at one bruise, Recover as soon as staggered, defensive attacks while a friend is staggered', () => {
  const b = arena('sustain', 'sus-1', [hero('healer', 'sa'), hero('paragon', 'sb')], [hero('powerhouse', 'sd')]);
  startBattle(b, R);
  const healer = fighter(b, 'A0'); const tank = fighter(b, 'A1');
  assert.equal(healsFreely(b, tank), true);
  assert.equal(recoverEarly(b, tank), true);
  assert.equal(healThreshold(b, tank), 1);
  const attack = tank.attacks.find((a) => a.roll && !a.area);
  assert.equal(tradeoffBias(b, tank, fighter(b, 'B0'), attack), null, 'nobody is staggered yet');
  healer.staggered = true;
  assert.deepEqual(tradeoffBias(b, tank, fighter(b, 'B0'), attack), { allOut: 0, defensive: 2 });
  const plain = arena(null, 'sus-1', [hero('healer', 'sa'), hero('paragon', 'sb')], [hero('powerhouse', 'sd')]);
  startBattle(plain, R);
  const p = fighter(plain, 'A1');
  assert.equal(healsFreely(plain, p), false);
  assert.equal(recoverEarly(plain, p), false);
  assert.equal(healThreshold(plain, p), 2);
  fighter(plain, 'A0').staggered = true;
  assert.equal(tradeoffBias(plain, p, fighter(plain, 'B0'), p.attacks.find((a) => a.roll && !a.area)), null);
});

// ---------------------------------------------------------------------------------------------------------
// 10. No Retreat
// ---------------------------------------------------------------------------------------------------------

// Requirement: nobody flees or digs in, and every close attack is all-out.
test('noretreat: beasts that run away with no tactic stand and fight', () => {
  const wolf = es.find((e) => /wolf/i.test(e.name));
  const tally = (tactic) => {
    let fled = 0;
    for (const i of range(20)) {
      const A = range(3).map(() => catalogToCharacter(wolf));
      const f = arena(tactic, `nr-${i}`, A, [hero('paragon', `nb${i}`, 12), hero('blaster', `nc${i}`, 12)]);
      runToEnd(f, R);
      fled += f.log.filter((e) => e.kind === 'flee' && byTeamA(e)).length;
    }
    return fled;
  };
  const none = tally(null);
  assert.ok(none >= 4, `the baseline must flee for the comparison to mean anything (${none}; 8 in the sample run)`);
  assert.equal(tally('noretreat'), 0);
});

test('noretreat: close attacks are nearly always all-out, and the hooks forbid fleeing and digging in', () => {
  const tally = (tactic) => {
    let close = 0; let allOut = 0;
    for (const i of range(12)) {
      const A = [hero('martialartist', `ma${i}`), hero('paragon', `mb${i}`), hero('powerhouse', `mc${i}`)];
      const f = arena(tactic, `nc-${i}`, A, [hero('powerhouse', `md${i}`), hero('martialartist', `me${i}`)]);
      runToEnd(f, R);
      for (const e of f.log.filter((x) => byTeamA(x) && isAttack(x) && /Parry/.test(x.text) && !/charge/.test(x.text))) { close++; if (/All-out Attack/.test(e.text)) allOut++; }
    }
    return { close, allOut };
  };
  const nr = tally('noretreat'); const none = tally(null);
  assert.ok(nr.allOut / nr.close > 0.8, `all-out share of close attacks: ${nr.allOut} of ${nr.close}`);
  // What matters is the gap: No Retreat goes all-out far more often than the same fighters with no tactic.
  assert.ok(nr.allOut / nr.close >= none.allOut / none.close + 0.3, `with no tactic: ${none.allOut} of ${none.close}`);

  const b = arena('noretreat', 'nr-h', [hero('paragon', 'nr-a')], [hero('powerhouse', 'nr-b')]);
  startBattle(b, R);
  const me = fighter(b, 'A0'); const foe = fighter(b, 'B0');
  assert.equal(mayFlee(b, me), false);
  assert.equal(mayDefend(b, me), false);
  assert.equal(mayFlee(b, foe), true, 'the other team is unaffected');
  assert.equal(mayDefend(b, foe), true);
  const close = me.attacks.find((a) => a.kind === 'close' && a.roll);
  assert.deepEqual(tradeoffBias(b, me, foe, close), { allOut: me.adv['All-out Attack'] ? 5 : 2, defensive: 0 });
  const ranged = me.attacks.find((a) => a.kind !== 'close' && a.roll && !a.area);
  if (ranged) assert.equal(tradeoffBias(b, me, foe, ranged), null, 'ranged attacks are left alone');
});
