// Create (Hero's Handbook p91-92), Move Object and Element Control (p108, p95): created objects as cover, objects dropped or
// thrown as attacks, and a trap of objects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerArena, dice, text, R, who } from './helpers/power-arena.mjs';
import { createsOf, addCreated, createUpkeep, madeBy } from '../src/engine/battle/create.js';
import { coverPenalty, blocksDirect, pieceLabel } from '../src/engine/battle/cover.js';
import { damagePiece } from '../src/engine/battle/cover-damage.js';
import { isOpenSquare } from '../src/engine/battle/path.js';
import { startBattle, runToEnd } from '../src/engine/battle.js';

const x = (name, more = {}) => ({ name, ...more });
const create = (rank, extras = [], flaws = [], more = {}) => ({ name: 'Hard Light', effect: 'Create', rank, role: 'control', range: 'Ranged', extras, flaws, ...more });
const bolt = (rank = 8) => ({ name: 'Bolt', effect: 'Damage', rank, range: 'Ranged', role: 'attack', extras: [], flaws: [] });

/** M (team A) makes things; S (team B) shoots. They stand in a row, M at x = 2 and S at x = 8. */
function duel(power, shooter = bolt(), aim = 2) {
  const b = powerArena([['M', 'A', { powers: [power] }, { x: 2, y: 5 }], ['S', 'B', { powers: [shooter], abilities: { Dexterity: aim } }, { x: 8, y: 5 }]]);
  return { b, m: who(b, 'M'), s: who(b, 'S') };
}
const shot = (f) => f.s.attacks.find((a) => a.name === 'Bolt');

test('the power is read: a rank under 4 makes no cover, the Toughness is the rank, a wall needs rank 7, Proportional splits the rank', () => {
  assert.equal(createsOf({ powers: [create(3)] }).length, 0);
  const [s] = createsOf({ powers: [create(5)] });
  assert.equal(s.toughness, 5);
  assert.equal(s.level, 'partial');
  assert.equal(createsOf({ powers: [create(9)] })[0].level, 'total');
  const [p] = createsOf({ powers: [create(10, [], [x('Proportional')])] });
  assert.equal(p.toughness, 3, 'volume 7 and what is left of the rank is the Toughness');
  assert.equal(createsOf({ powers: [create(5, [x('Continuous')])] })[0].continuous, true);
});

test('a created object is a piece of cover with Toughness equal to the rank, and the log says what and where', () => {
  const f = duel(create(8));
  const [s] = createsOf(f.m.ch);
  const piece = addCreated(f.b, f.m, s, 3, 5);
  assert.equal(piece.toughness, 8);
  assert.equal(piece.created, true);
  assert.equal(piece.owner, 'M');
  assert.equal(f.b.cover.length, 1);
  assert.match(text(f.b), /M uses Hard Light \(rank 8\) and forms Hard Light at D6: Toughness 8, total cover, blocking shots both ways/);
  assert.match(pieceLabel(piece), /created, Toughness 8/);
});

test('it works as cover: a shot at the maker behind it is penalised, or stopped when the object is a wall', () => {
  const f = duel(create(5));
  addCreated(f.b, f.m, createsOf(f.m.ch)[0], 3, 5);
  assert.equal(coverPenalty(f.b, f.s, f.m, shot(f)), 2, 'partial cover: -2');
  const w = duel(create(9));
  addCreated(w.b, w.m, createsOf(w.m.ch)[0], 3, 5);
  assert.equal(blocksDirect(w.b, w.s, shot(w), w.m), true, 'a wall is total cover: the shot cannot be made');
});

test('it blocks movement: nobody can step onto a standing object', () => {
  const f = duel(create(8));
  assert.equal(isOpenSquare(f.b, 3, 5), true);
  addCreated(f.b, f.m, createsOf(f.m.ch)[0], 3, 5);
  assert.equal(isOpenSquare(f.b, 3, 5), false);
});

test('using the effect again replaces the maker earlier object of that power (a repair or a move)', () => {
  const f = duel(create(8));
  const [s] = createsOf(f.m.ch);
  addCreated(f.b, f.m, s, 3, 5);
  addCreated(f.b, f.m, s, 3, 4);
  assert.equal(madeBy(f.b, f.m).length, 1);
  assert.equal(f.b.cover[0].y, 4);
});

test('the object vanishes when its maker is down; a Continuous one stays', () => {
  const f = duel(create(8));
  addCreated(f.b, f.m, createsOf(f.m.ch)[0], 3, 5);
  f.m.out = true; f.m.outReason = 'ko';
  f.b.log.length = 0;
  createUpkeep(f.b);
  assert.equal(f.b.cover.length, 0);
  assert.match(text(f.b), /Hard Light at D6 vanishes: M can no longer keep it up/);
  const k = duel(create(8, [x('Continuous')]));
  addCreated(k.b, k.m, createsOf(k.m.ch)[0], 3, 5);
  k.m.out = true;
  createUpkeep(k.b);
  assert.equal(k.b.cover.length, 1);
});

test('the object can be damaged and destroyed like any object (Toughness = rank), and Impervious ones shrug off weak damage', () => {
  const f = duel(create(8));
  const piece = addCreated(f.b, f.m, createsOf(f.m.ch)[0], 3, 5);
  f.b.log.length = 0;
  damagePiece(f.b, f.s, piece, 20, dice(1)); // Toughness d20 1 + 8 = 9 against DC 35: far over three degrees
  assert.equal(piece.state, 'destroyed');
  const g = duel(create(8, [x('Impervious')]));
  const tough = addCreated(g.b, g.m, createsOf(g.m.ch)[0], 3, 5);
  g.b.log.length = 0;
  assert.equal(damagePiece(g.b, g.s, tough, 4, dice()), 0, 'no check at all against damage 4 or less');
  assert.match(text(g.b), /Impervious and shrugs off Damage 4 without a check/);
});

test('Feedback: damaging the object makes the maker resist with the effect rank as the bonus (p135)', () => {
  const f = duel(create(8, [], [x('Feedback')]));
  const piece = addCreated(f.b, f.m, createsOf(f.m.ch)[0], 3, 5);
  f.b.log.length = 0;
  damagePiece(f.b, f.s, piece, 12, dice(1, 2)); // the object fails (1 + 8 = 9 vs 27); the maker rolls 2 + 8 = 10 vs DC 27
  assert.match(text(f.b), /Feedback: the Hard Light is damaged \(Damage 12\), so M resists with the effect's rank: d20 2 \+8 = 10 vs DC 27/);
  assert.ok(f.m.bruises >= 1 || f.m.out, 'the maker was hurt');
});

test('dropped objects are a ranged attack against Dodge for damage equal to the rank, and a trap is a Snare of that rank', () => {
  const f = duel(create(8));
  const drop = f.m.attacks.find((a) => a.name === 'Hard Light (dropped object)');
  const trap = f.m.attacks.find((a) => a.name === 'Hard Light (trapping object)');
  assert.ok(drop && trap);
  assert.deepEqual([drop.effect, drop.range, drop.rank, drop.resistance, drop.roll], ['Damage', 'ranged', 8, 'Toughness', true]);
  assert.deepEqual([trap.effect, trap.rank, trap.resistance], ['Snare', 8, 'Dodge']);
  assert.deepEqual(trap.tiers, [['Hindered', 'Vulnerable'], ['Defenseless', 'Immobile']]);
});

test('Move Object throws objects for damage at its rank (Throwing Mastery and Improvised Weapon add 1 per rank) and seizes like a Snare', () => {
  const mo = { name: 'Telekinesis', effect: 'Move Object', rank: 9, role: 'control', range: 'Ranged', extras: [], flaws: [] };
  const f = powerArena([['M', 'A', { powers: [mo], advantages: [{ name: 'Throwing Mastery', rank: 2 }, { name: 'Improvised Weapon', rank: 1 }] }, { x: 1, y: 5 }], ['S', 'B', {}, { x: 5, y: 5 }]]);
  const m = who(f, 'M');
  const throwAtk = m.attacks.find((a) => a.name === 'Telekinesis (thrown objects)');
  assert.equal(throwAtk.rank, 12, '9 + 2 + 1');
  assert.equal(throwAtk.range, 'ranged');
  assert.equal(m.attacks.find((a) => a.name === 'Telekinesis (seized in the air)').effect, 'Snare');
});

test('Element Control is Perception Ranged: its thrown element needs no attack check', () => {
  const ec = { name: 'Earth Control', effect: 'Element Control', rank: 8, role: 'control', extras: [], flaws: [], detail: 'Earth' };
  const f = powerArena([['M', 'A', { powers: [ec] }, { x: 1, y: 5 }], ['S', 'B', {}, { x: 5, y: 5 }]]);
  const a = who(f, 'M').attacks.find((x) => x.name === 'Earth Control (thrown objects)');
  assert.equal(a.roll, false);
  assert.equal(a.perception, true);
  assert.equal(a.rank, 8);
});

test('the AI puts up cover against a shooter, and not against a fighter that must close in', () => {
  const f = duel(create(9), bolt(10), 10); // a deadly shot
  runToEnd(f.b, R);
  assert.match(text(f.b), /M uses Hard Light \(rank 9\) and forms Hard Light at/);
  const melee = { name: 'Claws', effect: 'Damage', rank: 8, range: 'Close', role: 'attack', extras: [], flaws: [] };
  const g = duel(create(9), melee, 10);
  g.b.log.length = 0;
  runToEnd(g.b, R);
  assert.doesNotMatch(text(g.b), /M uses Hard Light/);
});

test('created objects do not outlast the fight: starting again clears them', () => {
  const f = duel(create(8));
  addCreated(f.b, f.m, createsOf(f.m.ch)[0], 3, 5);
  startBattle(f.b, R);
  assert.equal(f.b.cover.length, 0);
});
