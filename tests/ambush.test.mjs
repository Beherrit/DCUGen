import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle, step, serializeBattle, reviveBattle, activeConditions, conditionLabels } from '../src/engine/battle.js';

// Two hand-made fighters: a melee brute with no powers and a glass-cannon archer-type.
const bruiser = () => ({
  name: 'Bruiser', pl: 10,
  abilities: { Strength: 8, Stamina: 8, Agility: 2, Dexterity: 0, Fighting: 8, Intellect: 0, Awareness: 0, Presence: 0 },
  defenses: { Dodge: 2, Parry: 6, Fortitude: 6, Will: 2 },
  skills: [], advantages: [], powers: [],
});
const shooter = (advantages = []) => ({
  name: 'Shooter', pl: 10,
  abilities: { Strength: 0, Stamina: 4, Agility: 6, Dexterity: 6, Fighting: 2, Intellect: 0, Awareness: 0, Presence: 0 },
  defenses: { Dodge: 6, Parry: 2, Fortitude: 4, Will: 2 },
  skills: [{ name: 'Ranged Combat', spec: 'Blast', ranks: 4 }],
  advantages,
  powers: [{ name: 'Blast', effect: 'Damage', rank: 10, range: 'Ranged', role: 'attack', extras: [], flaws: [] }],
});

const BRUISER_ID = 'bruiser-1'; // team A, the ambusher
const SHOOTER_ID = 'shooter-1'; // team B, the surprised side
// Pinned seed. The round tests need a seed where the fight is still running after round 2 and the Bruiser
// attacks in round 1. Checked by running the file; see the report for the seeds tried.
const SEED = 'ambush-1';

function arena({ ambush = 'A', enclosed = false, seed = SEED, shooterAdv = [] } = {}) {
  const b = createBattle({ seed, name: 'Ambush test' });
  if (enclosed) b.options.enclosed = true;
  b.options.ambush = ambush;
  addCombatant(b, makeCombatant(R, bruiser(), { id: BRUISER_ID, team: 'A', style: 'brawler' }));
  addCombatant(b, makeCombatant(R, shooter(shooterAdv), { id: SHOOTER_ID, team: 'B', style: 'blaster' }));
  return b;
}
const fighter = (b, id) => b.combatants.find((c) => c.id === id);
const surprise = (c) => c.conditions.filter((x) => x.source === 'surprise');
const teamOf = (b, id) => fighter(b, id)?.team;
const acts = (b, team, kinds) => b.log.filter((e) => kinds.includes(e.kind) && e.actor && teamOf(b, e.actor) === team);
const ATTACK_KINDS = ['attack', 'hit', 'miss'];
// Play exactly up to the end of round n. (runRound also plays the first turn of the next round, which would blur the checks.)
function finishRound(b, n) {
  let guard = 0;
  while (b.status === 'running' && !(b.round === n && b.turn >= b.order.length) && guard++ < 200) step(b, R);
}

// Requirement: with ambush A, team B fighters carry a surprise condition, team A does not, ambushers start next to an enemy.
test('ambush A on open ground: team B is Surprised, team A is not, and the ambusher starts within one zone of the enemy', () => {
  const b = arena();
  startBattle(b, R);
  const a = fighter(b, BRUISER_ID);
  const s = fighter(b, SHOOTER_ID);
  assert.equal(surprise(s).length, 1);
  assert.equal(surprise(s)[0].name, 'Surprised');
  assert.equal(surprise(a).length, 0);
  assert.ok(Math.abs(a.pos - s.pos) <= 1, `ambusher at ${a.pos}, enemy at ${s.pos}`);
  const notes = b.log.filter((e) => e.kind === 'note' && e.text.startsWith('Ambush: team'));
  assert.equal(notes.length, 1);
  assert.match(notes[0].text, /^Ambush: team A catches the others off guard/);
});

// Requirement: in the surprise round only the ambushers act.
test('ambush A: in round 1 team B never attacks and logs a skip, team A attacks', () => {
  const b = arena();
  startBattle(b, R);
  finishRound(b, 1);
  assert.deepEqual(acts(b, 'B', ATTACK_KINDS), [], 'surprised team B made an attack');
  const skips = b.log.filter((e) => e.kind === 'skip' && e.actor === SHOOTER_ID);
  assert.equal(skips.length, 1);
  assert.match(skips[0].text, / is surprised and loses the round\./);
  assert.ok(acts(b, 'A', ['hit', 'miss']).length >= 1, 'ambusher made no attack in round 1');
  assert.equal(b.log.filter((e) => e.kind === 'skip' && teamOf(b, e.actor) === 'A').length, 0, 'ambusher lost its turn');
});

// Requirement: by the end of round 2 the surprise is gone and a recover line was logged.
test('ambush A: after round 2 the surprise conditions are gone and team B logged a recover', () => {
  const b = arena();
  startBattle(b, R);
  finishRound(b, 1);
  assert.equal(surprise(fighter(b, SHOOTER_ID)).length, 1, 'surprise must last through round 1');
  finishRound(b, 2);
  assert.equal(b.round, 2);
  for (const c of b.combatants) assert.equal(surprise(c).length, 0, `${c.name} still surprised`);
  const rec = b.log.filter((e) => e.kind === 'recover' && e.actor === SHOOTER_ID);
  assert.equal(rec.length, 1);
  assert.match(rec[0].text, / recovers from the surprise\./);
  assert.ok(!activeConditions(fighter(b, SHOOTER_ID)).has('Surprised'));
});

// Requirement: Uncanny Dodge means not vulnerable when surprised, but still caught off guard (DCA 167, Uncanny Dodge).
test('ambush A: Uncanny Dodge keeps the fighter from being vulnerable, but they still lose the surprise round', () => {
  const b = arena({ shooterAdv: [{ name: 'Uncanny Dodge', rank: 1 }] });
  startBattle(b, R);
  const s = fighter(b, SHOOTER_ID);
  assert.equal(surprise(s).length, 1);
  assert.ok(activeConditions(s).has('Stunned'));
  assert.ok(!activeConditions(s).has('Vulnerable'));
  assert.ok(b.log.some((e) => e.kind === 'note' && /Uncanny Dodge/.test(e.text)), 'no Uncanny Dodge note');
  finishRound(b, 1);
  assert.equal(acts(b, 'B', ['skip']).length, 1, 'the surprised fighter must lose round 1');
  assert.equal(acts(b, 'B', ATTACK_KINDS).length, 0);
});

// Requirement: the surprise ends at the start of round 2, before anyone acts in it (DCA 167).
test('ambush A: the surprise wears off when round 2 begins, before the first turn of round 2', () => {
  const b = arena();
  startBattle(b, R);
  finishRound(b, 1);
  step(b, R); // first turn of round 2
  const roundLine = b.log.findIndex((e) => e.kind === 'round' && /^Round 2\./.test(e.text));
  const rec = b.log.findIndex((e) => e.kind === 'recover' && e.actor === SHOOTER_ID);
  assert.ok(roundLine >= 0 && rec > roundLine, 'recover must follow the Round 2 line');
  const firstTurn = b.log.findIndex((e, k) => k > roundLine && e.actor && e.kind !== 'recover');
  assert.ok(firstTurn < 0 || rec < firstTurn, 'recover must come before any round 2 action');
  assert.equal(surprise(fighter(b, SHOOTER_ID)).length, 0);
});

// Requirement: in the surprise round the ambushers get a standard action only (DCA 167); melee ambushers start in reach.
test('ambush A: a melee ambusher starts in its target zone and attacks without moving in round 1', () => {
  const b = arena();
  startBattle(b, R);
  assert.equal(fighter(b, BRUISER_ID).pos, fighter(b, SHOOTER_ID).pos, 'melee ambusher must start in reach');
  finishRound(b, 1);
  assert.equal(acts(b, 'A', ['move']).length, 0, 'no move and attack in the surprise round');
  assert.ok(acts(b, 'A', ATTACK_KINDS).length >= 1);
});

test('ambush A: the ambusher is back to full turns in round 2', () => {
  const b = arena();
  startBattle(b, R);
  assert.equal(fighter(b, BRUISER_ID).surpriseActor, true);
  finishRound(b, 1);
  step(b, R);
  assert.equal(fighter(b, BRUISER_ID).surpriseActor, false);
});

// Requirement: no ambush, or an ambush team with nobody on it, changes nothing.
test('no ambush and ambush on an empty team: no surprise conditions and no ambush note', () => {
  for (const ambush of [null, 'C']) {
    const b = arena({ ambush });
    startBattle(b, R);
    finishRound(b, 2);
    for (const c of b.combatants) assert.equal(surprise(c).length, 0, `${c.name} surprised with ambush=${ambush}`);
    assert.equal(b.log.filter((e) => e.text.startsWith('Ambush: team')).length, 0, `ambush=${ambush}`);
    assert.equal(b.log.filter((e) => e.kind === 'skip' || e.kind === 'recover').length, 0, `ambush=${ambush}`);
  }
});

// Requirement: works together with enclosed space.
test('ambush A and enclosed together: positions stay in zones 0..1 and the surprise rules hold', () => {
  const b = arena({ enclosed: true });
  startBattle(b, R);
  const inside = (label) => { for (const c of b.combatants) assert.ok(c.pos >= 0 && c.pos <= 1, `${c.name} at ${c.pos} ${label}`); };
  inside('at start');
  const a = fighter(b, BRUISER_ID);
  const s = fighter(b, SHOOTER_ID);
  assert.equal(surprise(s).length, 1);
  assert.equal(surprise(a).length, 0);
  assert.ok(Math.abs(a.pos - s.pos) <= 1);
  finishRound(b, 1);
  inside('after round 1');
  assert.deepEqual(acts(b, 'B', ATTACK_KINDS), []);
  assert.equal(b.log.filter((e) => e.kind === 'skip' && e.actor === SHOOTER_ID).length, 1);
  assert.equal(b.log.filter((e) => e.text.startsWith('Ambush: team')).length, 1);
});

// Requirement: the option survives save and load.
test('ambush survives save and load', () => {
  const b = arena();
  const back = reviveBattle(R, JSON.parse(JSON.stringify(serializeBattle(b))));
  assert.equal(back.options.ambush, 'A');
  const none = reviveBattle(R, JSON.parse(JSON.stringify(serializeBattle(arena({ ambush: null })))));
  assert.equal(none.options.ambush ?? null, null);
});

// Requirement: the surprised are vulnerable. The engine does not export defenseOf, so this checks the
// exported activeConditions (which defenseOf reads to halve defenses) and conditionLabels (what the UI shows).
test('surprised fighter reads as Surprised, Stunned and Vulnerable; the ambusher does not', () => {
  const b = arena();
  startBattle(b, R);
  const s = fighter(b, SHOOTER_ID);
  const cond = activeConditions(s);
  assert.ok(cond.has('Vulnerable'), 'surprised fighter is not vulnerable');
  assert.ok(cond.has('Stunned'), 'surprised fighter can act');
  assert.ok(conditionLabels(s).includes('Surprised'), `labels: ${conditionLabels(s)}`);
  const a = activeConditions(fighter(b, BRUISER_ID));
  assert.ok(!a.has('Vulnerable') && !a.has('Stunned'));
  assert.ok(!conditionLabels(fighter(b, BRUISER_ID)).includes('Surprised'));
});
