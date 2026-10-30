// The "Lethal damage" option: dying and death (Hero's Handbook p19 Dying, p93 Damage, p73 Diehard, p185 Going for the Kill),
// Debilitated abilities (p49) and steadying a dying ally. With the option off a fighter who would be dying is only
// incapacitated, as before. Dice are scripted: the attack roll, then the target's Toughness roll, then its dying check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duel, fire, logOf, HIT } from './helpers/flaw-kit.mjs';
import { powerArena, dice, text, R, who } from './helpers/power-arena.mjs';
import { dyingTurn, steady, startDying, staminaGone } from '../src/engine/battle/dying.js';
import { statusLine } from '../src/engine/battle/summaries.js';
import { weakenTraits } from '../src/engine/battle/weaken-traits.js';
import { activeConditions, canAct } from '../src/engine/battle/conditions.js';
import { createBattle, addCombatant, makeCombatant, runToEnd } from '../src/engine/battle.js';
import { damageResult } from '../src/engine/battle/damage-result.js';

const lethal = { lethal: true };
const KO = [HIT, 2]; // a hit, and a Toughness roll that fails by four degrees

test('off by default: damage that incapacitates only incapacitates', () => {
  const f = duel([]);
  fire(f, ...KO);
  assert.equal(f.t.out, true);
  assert.equal(f.t.dying, false);
  assert.doesNotMatch(logOf(f), /dying|DYING/);
  assert.equal(statusLine(f.t), 'Incapacitated');
});

test('lethal: damage that incapacitates makes the target dying and it checks at once (DC 15 Fortitude)', () => {
  const f = duel([], {}, {}, {}, lethal);
  fire(f, ...KO, 1);
  assert.equal(f.t.dying, true);
  assert.equal(f.t.dyingFails, 2, 'a roll of 1 on Fortitude 4 misses DC 15 by two degrees');
  assert.match(logOf(f), /T is DYING/);
  assert.match(logOf(f), /T is dying: Fortitude d20 1 \+4 = 5 vs DC 15/);
  assert.equal(statusLine(f.t), 'Dying');
});

test('three degrees of failure in all kill, over two checks', () => {
  const f = duel([], {}, {}, {}, lethal);
  fire(f, ...KO, 1);
  f.b.round++;
  dyingTurn(f.b, f.t, dice(1));
  assert.equal(f.t.dead, true);
  assert.equal(f.t.dying, false);
  assert.match(logOf(f), /T dies of the wounds/);
  assert.equal(statusLine(f.t), 'Dead');
});

test('exactly three degrees in all kill: two, then one more', () => {
  const f = duel([], {}, {}, {}, lethal);
  fire(f, ...KO, 1); // two degrees
  assert.equal(f.t.dying, true);
  f.b.round++;
  dyingTurn(f.b, f.t, dice(8)); // 8 + 4 = 12 against 15: one degree
  assert.equal(f.t.dyingFails, 3);
  assert.equal(f.t.dead, true);
});

test('two degrees in all do not kill', () => {
  const f = duel([], {}, {}, {}, lethal);
  fire(f, ...KO, 1);
  f.b.round++;
  dyingTurn(f.b, f.t, dice(12)); // a success: nothing changes
  assert.equal(f.t.dyingFails, 2);
  assert.equal(f.t.dead, false);
});

test('a single failure of three degrees kills at once', () => {
  const f = duel([], {}, { abilities: { Stamina: -4 } }, {}, lethal); // Fortitude -4: a roll of 1 is -3 against 15, three degrees
  fire(f, ...KO, 1);
  assert.equal(f.t.dead, true, 'dead on the first check');
  assert.match(logOf(f), /T dies of the wounds/);
});

test('two degrees of success stabilize, one changes nothing, and the check is once a round', () => {
  const f = duel([], {}, {}, {}, lethal);
  fire(f, ...KO, 1);
  f.b.round++;
  dyingTurn(f.b, f.t, dice(12)); // 12 + 4 = 16: one degree of success
  assert.equal(f.t.dying, true, 'still dying');
  assert.match(logOf(f), /holds on, still dying/);
  f.b.round++;
  dyingTurn(f.b, f.t, dice(20)); // 24 against 15 and a natural 20: stable
  assert.equal(f.t.dying, false);
  assert.equal(f.t.stable, true);
  assert.equal(f.t.out, true, 'still incapacitated');
  assert.equal(statusLine(f.t), 'Stable');
  const same = duel([], {}, {}, {}, lethal);
  fire(same, ...KO, 1);
  const before = text(same.b);
  dyingTurn(same.b, same.t, dice()); // the same round it fell: no second check (and no dice to give)
  assert.equal(text(same.b), before);
});

test('Diehard: no check, and it stabilizes on the following round', () => {
  const f = duel([], {}, { advantages: [{ name: 'Diehard', rank: 1 }] }, {}, lethal);
  fire(f, ...KO); // no dying check is rolled
  assert.equal(f.t.dying, true);
  assert.match(logOf(f), /Diehard: it will stabilize on the following round with no check/);
  dyingTurn(f.b, f.t, dice());
  assert.equal(f.t.dying, true, 'not in the same round');
  f.b.round++;
  dyingTurn(f.b, f.t, dice());
  assert.equal(f.t.dying, false);
  assert.match(logOf(f), /T stabilizes \(Diehard\)/);
});

test('more damage: an incapacitated fighter that fails a Damage check starts dying, and a dying one is killed', () => {
  const f = duel([], {}, {}, {}, lethal);
  const t = f.t;
  t.out = true; t.outReason = 'affliction'; // incapacitated by something other than Damage
  damageResult(f.b, f.u, t, 1, 'T resists', [], null, dice(1));
  assert.equal(t.dying, true, 'the further damage makes it dying');
  damageResult(f.b, f.u, t, 1, 'T resists', [], null, dice());
  assert.equal(t.dead, true, 'and the next kills it');
  assert.match(logOf(f), /is killed by the further damage/);
});

test('a minion taken out is killed in a lethal fight, and only down in any other', () => {
  const lethalFight = duel([], {}, { minion: true }, {}, lethal);
  lethalFight.t.minion = true;
  fire(lethalFight, HIT, 2);
  assert.equal(lethalFight.t.dead, true);
  assert.match(logOf(lethalFight), /T is killed \(a minion taken out\)/);
  const plain = duel([]);
  plain.t.minion = true;
  fire(plain, HIT, 2);
  assert.equal(plain.t.dead, false);
  assert.equal(statusLine(plain.t), 'Down');
});

test('Debilitated Stamina (below -5) is dying in a lethal fight and incapacitated otherwise, with -5 on the checks to avoid death', () => {
  const f = duel([], {}, { abilities: { Stamina: 0 } }, {}, lethal);
  weakenTraits(f.t, 'Stamina', 6); // 0 - 6 = -6
  staminaGone(f.b, f.t, dice(16)); // Fortitude 0 - 6 weakened = -6, and -5 more: 16 - 11 = 5, two degrees short of DC 15
  assert.equal(f.t.dying, true);
  assert.match(logOf(f), /Stamina is debilitated \(below -5\): dying/);
  assert.match(logOf(f), /vs DC 15/);
  const plain = duel([], {}, { abilities: { Stamina: 0 } });
  weakenTraits(plain.t, 'Stamina', 6);
  staminaGone(plain.b, plain.t);
  assert.equal(plain.t.out, true);
  assert.equal(plain.t.dying, false);
  assert.match(logOf(plain), /Stamina is debilitated \(below -5\): incapacitated/);
});

test('Debilitated Strength collapses the fighter (defenseless, immobile, stunned); Fighting leaves it dazed and defenseless', () => {
  const f = duel([], {}, { abilities: { Strength: 0, Fighting: 0 } });
  assert.equal(canAct(f.t), 'full');
  weakenTraits(f.t, 'Strength', 6);
  const s = activeConditions(f.t);
  for (const n of ['Defenseless', 'Immobile', 'Stunned']) assert.ok(s.has(n), n);
  assert.equal(canAct(f.t), 'none');
  const g = duel([], {}, { abilities: { Fighting: 0 } });
  weakenTraits(g.t, 'Fighting', 6);
  const d = activeConditions(g.t);
  assert.ok(d.has('Dazed') && d.has('Defenseless'));
  assert.equal(canAct(g.t), 'standard');
});

test('an ally with Treatment steadies a dying teammate with a standard action (DC 15), and a failed try leaves it dying', () => {
  const b = powerArena([
    ['M', 'A', { hp: 0, skills: [{ name: 'Treatment', ranks: 8 }] }, { x: 0, y: 0 }],
    ['P', 'A', { hp: 0 }, { x: 1, y: 0 }],
    ['E', 'B', {}, { x: 5, y: 0 }],
  ], { lethal: true });
  const [m, p] = [who(b, 'M'), who(b, 'P')];
  p.out = true; p.outReason = 'ko';
  startDying(b, p, dice(1)); // fails by two degrees
  assert.equal(p.dying, true);
  steady(b, m, p, dice(1)); // 1 + Treatment (8 + Intellect 0) = 9 vs 15
  assert.equal(p.dying, true);
  steady(b, m, p, dice(12));
  assert.equal(p.dying, false);
  assert.match(text(b), /M tries to save P with Treatment/);
  assert.match(text(b), /P stabilizes \(Treatment by M\)/);
});

test('a lethal fight to the end: nobody is left dying, the dead are named, and it ends', () => {
  const b = createBattle({ seed: 'lethal-end' });
  Object.assign(b.options, { lethal: true, scale: 'street' });
  const strong = { pl: 10, abilities: { Strength: 12, Stamina: 2, Agility: 2, Dexterity: 2, Fighting: 10, Intellect: 0, Awareness: 0, Presence: 0 }, defenses: { Parry: 6, Dodge: 4 }, skills: [], advantages: [], powers: [] };
  addCombatant(b, makeCombatant(R, JSON.parse(JSON.stringify(strong)), { id: 'A0', team: 'A', name: 'Brute' }));
  addCombatant(b, makeCombatant(R, JSON.parse(JSON.stringify({ ...strong, abilities: { ...strong.abilities, Strength: 2 } })), { id: 'B0', team: 'B', name: 'Pip' }));
  runToEnd(b, R);
  assert.equal(b.status, 'over');
  assert.ok(!b.combatants.some((c) => c.dying), 'every dying fighter has died or steadied');
  const dead = b.combatants.filter((c) => c.dead);
  if (dead.length) assert.match(text(b), new RegExp(`Dead: ${dead.map((c) => c.name).join(', ')}\\.`));
  assert.ok(b.round <= b.options.maxRounds + 1);
});

test('two fighters who cannot hurt each other still end in the same stalemate with the option on', () => {
  const run = (opts) => {
    const b = createBattle({ seed: 'no-harm' });
    Object.assign(b.options, { scale: 'street' }, opts);
    const none = { pl: 10, abilities: { Strength: -1, Stamina: 2, Agility: 2, Dexterity: 2, Fighting: 2, Intellect: 0, Awareness: 0, Presence: 0 }, defenses: { Parry: 6, Dodge: 4 }, skills: [], advantages: [], powers: [] };
    addCombatant(b, makeCombatant(R, JSON.parse(JSON.stringify(none)), { id: 'A0', team: 'A', name: 'One' }));
    addCombatant(b, makeCombatant(R, JSON.parse(JSON.stringify(none)), { id: 'B0', team: 'B', name: 'Two' }));
    runToEnd(b, R);
    return b;
  };
  const off = run({}); const on = run(lethal);
  assert.equal(off.winner, null);
  assert.equal(on.winner, null);
  assert.equal(on.round, off.round, 'the same number of rounds');
  assert.match(text(on), /no decision: the fight ends in a stalemate/);
});
