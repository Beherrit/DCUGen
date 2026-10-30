// Changing build in a fight: Alternate Form and Metamorph (Hero's Handbook p88, p108), Shapeshift (p116), Mimic (p107) and
// Transform (p120). Dice are scripted where a roll matters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerArena, dice, text, R, who } from './helpers/power-arena.mjs';
import { body } from './helpers/fighters.mjs';
import { addForm, switchForm, activeForm } from '../src/engine/forms.js';
import { swapPowerOf } from '../src/engine/battle/form-swap.js';
import { formTurn, formChoices } from '../src/engine/battle/form-turn.js';
import { shapeshiftsOf, shapeOf, SHAPES } from '../src/engine/battle/shapeshift.js';
import { mimicsOf, copyOf, scan } from '../src/engine/battle/mimic.js';
import { addMods, dropMods, fadeMods } from '../src/engine/battle/mods.js';
import { transformOption, transformsOf, transformUpkeep } from '../src/engine/battle/transform.js';
import { startBattle } from '../src/engine/battle.js';
import { canAct, defenseOf } from '../src/engine/battle/conditions.js';

const x = (name, more = {}) => ({ name, ...more });
const blast = (rank, name = 'Blast') => ({ name, effect: 'Damage', rank, range: 'Ranged', role: 'attack', extras: [], flaws: [] });
const altForm = (action = 'move') => ({ name: 'Other Shape', effect: 'Alternate Form', rank: 1, role: 'utility', extras: [], flaws: [{ name: 'Activation', option: action }] });
const snap = (c) => JSON.stringify({ d: c.d.defenses, a: c.attacks.map((a) => [a.id, a.rank, a.bonus]), s: c.d.abilities.Strength, m: c.moveRank });

test('what a change of build costs: Alternate Form the action its Activation names, Metamorph a free action, nothing without forms', () => {
  const two = (powers) => addForm({ ...body(), powers }, { copy: true });
  assert.equal(swapPowerOf(two([altForm('move')])).action, 'move');
  assert.equal(swapPowerOf(two([altForm('standard')])).action, 'standard');
  assert.equal(swapPowerOf(two([{ name: 'Faces', effect: 'Morph', rank: 2, extras: [x('Metamorph')], flaws: [], role: 'utility' }])).action, 'free');
  assert.equal(swapPowerOf({ ...body(), powers: [altForm()] }), null, 'no other build to change into');
  assert.equal(swapPowerOf(two([])), null, 'no power to change with');
});

/** A fighter whose second build has a big blast and whose first has none, against a foe it can shoot. */
function twoFaced(action = 'move') {
  let ch = addForm({ ...body(), powers: [altForm(action)] }, { copy: true });
  ch = switchForm(ch, 1);
  ch.powers = [altForm(action), blast(10, 'Heat Ray')];
  ch.forms[1].name = 'Fire form';
  ch = switchForm(ch, 0);
  ch.forms[0].name = 'Human form';
  const b = powerArena([['A', 'A', { ch }, { x: 1, y: 5 }], ['B', 'B', { powers: [blast(8)], defenses: { Dodge: 0, Parry: 0 } }, { x: 5, y: 5 }]]);
  return { b, a: who(b, 'A'), foe: who(b, 'B') };
}

test('Alternate Form: a fighter in the weaker build takes the stronger one as a move action and still has its standard action', () => {
  const f = twoFaced('move');
  assert.equal(activeForm(f.a.ch), 0);
  f.a.bruises = 1;
  f.b.log.length = 0;
  const mode = formTurn(f.b, R, f.a, [f.foe], 'full');
  assert.equal(mode, 'standard', 'the move action went on changing');
  assert.equal(activeForm(f.a.ch), 1);
  assert.ok(f.a.attacks.some((a) => a.name === 'Heat Ray'), 'its numbers are rebuilt from the new build');
  assert.equal(f.a.bruises, 1, 'the fight state stays');
  assert.deepEqual([f.a.x, f.a.y], [1, 5]);
  assert.match(text(f.b), /A changes form from Human form to Fire form \(a move action\)/);
});

test('a standard-action Alternate Form is a turn option beside the attack, not taken at the start of the turn', () => {
  const f = twoFaced('standard');
  const mode = formTurn(f.b, R, f.a, [f.foe], 'full');
  assert.equal(mode, 'full');
  assert.equal(activeForm(f.a.ch), 0);
  const choices = formChoices(f.b, R, f.a, [f.foe]);
  assert.ok(choices.length && choices.every((c) => c.action === 'standard'));
});

test('a fighter already in the better build stays in it, and a fight starts again in the build it began in', () => {
  const f = twoFaced('move');
  formTurn(f.b, R, f.a, [f.foe], 'full');
  assert.equal(formTurn(f.b, R, f.a, [f.foe], 'full'), 'full', 'nothing better to change to');
  startBattle(f.b, R);
  assert.equal(activeForm(f.a.ch), 0, 'back in the build the fight was set up in');
});

test('Shapeshift is read by rank, five points a rank', () => {
  const [s] = shapeshiftsOf({ powers: [{ name: 'Shifting', effect: 'Shapeshift', rank: 4, role: 'utility', extras: [], flaws: [] }] });
  assert.equal(s.points, 20);
});

test('changes of traits go on and come off exactly, and a rebuilt fighter gets them back', () => {
  const b = powerArena([['A', 'A', { powers: [blast(5)] }, { x: 1, y: 5 }], ['B', 'B', {}, { x: 5, y: 5 }]]);
  const a = who(b, 'A');
  const before = snap(a);
  addMods(a, 'test', 'k', [{ kind: 'defense', trait: 'Toughness', amount: 7 }, { kind: 'strength', amount: 3 }, { kind: 'bonus', range: 'ranged', amount: 2 }, { kind: 'speed', amount: 1 }]);
  assert.notEqual(snap(a), before);
  assert.equal(a.d.defenses.Toughness, JSON.parse(before).d.Toughness + 7);
  const withMods = snap(a);
  a.mods = JSON.parse(JSON.stringify(a.mods));
  dropMods(a, 'test');
  assert.equal(snap(a), before);
  addMods(a, 'test', 'k', [{ kind: 'defense', trait: 'Toughness', amount: 7 }, { kind: 'strength', amount: 3 }, { kind: 'bonus', range: 'ranged', amount: 2 }, { kind: 'speed', amount: 1 }]);
  a.d = { ...a.d }; // a rebuild: fresh numbers, then the recorded changes
  const rebuilt = JSON.parse(withMods);
  assert.deepEqual(rebuilt, JSON.parse(snap(a)));
});

test('a change that fades loses its rate each turn and goes when nothing is left', () => {
  const b = powerArena([['A', 'A', {}, { x: 1, y: 5 }], ['B', 'B', {}, { x: 5, y: 5 }]]);
  const a = who(b, 'A');
  const t0 = a.d.defenses.Toughness;
  addMods(a, 'absorb', 'k', [{ kind: 'defense', trait: 'Toughness', amount: 3 }], 1);
  fadeMods(a);
  assert.equal(a.d.defenses.Toughness, t0 + 2);
  fadeMods(a); fadeMods(a);
  assert.equal(a.d.defenses.Toughness, t0);
  assert.equal(a.mods.length, 0);
});

test('Shapeshift: against a deadly shot the AI takes a shape that adds to its defenses or its own attack, as a move action, within the points', () => {
  const ss = { name: 'Shifting', effect: 'Shapeshift', rank: 4, role: 'utility', extras: [], flaws: [] };
  const b = powerArena([['S', 'A', { powers: [ss] }, { x: 1, y: 5 }], ['F', 'B', { powers: [blast(12)], abilities: { Dexterity: 8 } }, { x: 5, y: 5 }]]);
  const s = who(b, 'S'); const f = who(b, 'F');
  const before = snap(s);
  b.log.length = 0;
  const mode = formTurn(b, R, s, [f], 'full');
  assert.equal(mode, 'standard');
  assert.ok(shapeOf(s), 'a shape was taken');
  assert.match(text(b), /S uses Shifting \(rank 4\) and becomes .*: 20 points of traits for the fight/);
  assert.notEqual(snap(s), before);
  const delta = s.d.defenses.Toughness - JSON.parse(before).d.Toughness + (s.d.defenses.Dodge - JSON.parse(before).d.Dodge) + (s.d.defenses.Parry - JSON.parse(before).d.Parry);
  assert.ok(delta <= 20, `the defenses it gained (${delta}) are within the 20 points`);
  assert.equal(formTurn(b, R, s, [f], 'full'), 'full', 'it keeps the shape rather than changing again');
});

test('every shape costs exactly the points: strength 2 a rank, a defense 1, damage 1', () => {
  const b = powerArena([['S', 'A', {}, { x: 1, y: 5 }], ['F', 'B', {}, { x: 5, y: 5 }]]);
  const s = who(b, 'S');
  for (const shape of SHAPES) {
    const cost = shape.mods(20, s).reduce((n, m) => n + (m.kind === 'strength' ? 2 * m.amount : m.kind === 'attack' ? m.attack.rank : m.amount), 0);
    assert.ok(cost <= 20 && cost >= 19, `${shape.key} costs ${cost}`);
  }
});

test('Mimic: the copy has the foe effect at the lower of its rank and what the points buy, made with the mimic own attack check', () => {
  const mimic = { name: 'Copy', effect: 'Mimic', rank: 2, role: 'utility', extras: [], flaws: [] };
  const b = powerArena([['M', 'A', { powers: [mimic] }, { x: 1, y: 5 }], ['F', 'B', { powers: [blast(14, 'Plasma')] }, { x: 5, y: 5 }]]);
  const m = who(b, 'M'); const f = who(b, 'F');
  const [s] = mimicsOf(m.ch);
  assert.equal(s.points, 10);
  const copy = copyOf(R, m, s, f, f.attacks.find((a) => a.name === 'Plasma'));
  assert.equal(copy.rank, 10, '10 points buy rank 10 of Damage at 1 a rank, under the foe 14');
  assert.equal(copy.bonus, m.d.abilities.Dexterity, 'the mimic own attack check');
  b.log.length = 0;
  scan(b, m, s, f, copy);
  assert.match(text(b), /M scans F with Copy \(rank 2, 10 points\) and copies F's Plasma at rank 10/);
  assert.ok(m.attacks.some((a) => a.rank === 10 && /Plasma/.test(a.name)));
  assert.equal(copyOf(R, m, s, f, f.attacks.find((a) => a.unarmed)), null, 'plain Strength is not a trait worth copying');
});

test('Mimic: the AI scans a foe whose attack beats its own, and not otherwise', () => {
  const mimic = { name: 'Copy', effect: 'Mimic', rank: 3, role: 'utility', extras: [], flaws: [] };
  const weak = powerArena([['M', 'A', { powers: [mimic, blast(2, 'Spark')] }, { x: 1, y: 5 }], ['F', 'B', { powers: [blast(12, 'Plasma')], defenses: { Dodge: 0, Parry: 0 } }, { x: 5, y: 5 }]]);
  const pick = formChoices(weak, R, who(weak, 'M'), [who(weak, 'F')]).filter((c) => c.action === 'standard');
  assert.ok(pick.length, 'a weak attacker gains from copying the stronger one');
  const strong = powerArena([['M', 'A', { powers: [mimic, blast(12, 'Big')] }, { x: 1, y: 5 }], ['F', 'B', { powers: [blast(6, 'Plasma')] }, { x: 5, y: 5 }]]);
  assert.equal(formChoices(strong, R, who(strong, 'M'), [who(strong, 'F')]).filter((c) => c.action === 'standard').length, 0);
});

// ---- Transform -------------------------------------------------------------------------------------------------------

const transform = (rank) => ({ name: 'Transmute', effect: 'Transform', rank, range: 'Close', role: 'control', extras: [], flaws: [], option: 'Anything into anything' });
const gun = { name: 'Revolver', cost: 4, effect: 'Damage 8', attack: { kind: 'ranged', rank: 8, crit: 20 } };

test('Transform on a held weapon: a touch against Parry, then the item Dodge check with +5 for a held item; a failure takes its attacks', () => {
  const b = powerArena([['T', 'A', { powers: [transform(10)] }, { x: 4, y: 5 }], ['G', 'B', { equipment: [gun] }, { x: 5, y: 5 }]]);
  const t = who(b, 'T'); const g = who(b, 'G');
  assert.equal(transformsOf(t.ch)[0].rank, 10);
  assert.ok(g.attacks.some((a) => a.name === 'Revolver'));
  b.log.length = 0;
  transformOption(b, t, [g], 'full').run(b, R, t, dice(19, 1)); // touch 19 hits; the Dodge check rolls 1 and fails
  assert.match(text(b), /T reaches for G's Revolver with Transmute \(rank 10\): d20 19 .* vs Parry DC .* — touched\. G resists for the item: Dodge d20 1 .* vs DC 20 — the Revolver is transformed into something harmless/);
  assert.ok(!g.attacks.some((a) => a.name === 'Revolver'));
  assert.deepEqual(g.dropped, ['equipment:Revolver']);
});

test('Transform on a held weapon: a passed Dodge check leaves it, a missed touch does nothing', () => {
  const b = powerArena([['T', 'A', { powers: [transform(10)] }, { x: 4, y: 5 }], ['G', 'B', { equipment: [gun] }, { x: 5, y: 5 }]]);
  const t = who(b, 'T'); const g = who(b, 'G');
  const dodge = defenseOf(g, 'Dodge');
  transformOption(b, t, [g], 'full').run(b, R, t, dice(19, 20 - (dodge + 5))); // the roll that only passes with the +5 for a held item
  assert.match(text(b), /the Revolver is unchanged/);
  transformOption(b, t, [g], 'full').run(b, R, t, dice(1));
  assert.match(text(b), /— miss\./);
  assert.ok(g.attacks.some((a) => a.name === 'Revolver'));
});

test('Transform on a being without a Stamina: a Will check, three degrees leave it Transformed and out; it reverts when the transformer is down', () => {
  const b = powerArena([['T', 'A', { powers: [transform(12)] }, { x: 4, y: 5 }], ['R', 'B', { abilities: { Stamina: null }, powers: [blast(8)] }, { x: 5, y: 5 }]]);
  const t = who(b, 'T'); const r = who(b, 'R');
  b.log.length = 0;
  transformOption(b, t, [r], 'full').run(b, R, t, dice(19, 1)); // the touch hits; Will d20 1 fails by several degrees
  assert.match(text(b), /R is TRANSFORMED and out of the fight/);
  assert.equal(r.out, true);
  assert.equal(r.outReason, 'transformed');
  t.out = true;
  b.log.length = 0;
  transformUpkeep(b);
  assert.equal(r.out, false);
  assert.match(text(b), /R changes back/);
});

test('a living being cannot be transformed, so the AI does not try it on one', () => {
  const b = powerArena([['T', 'A', { powers: [transform(12)] }, { x: 4, y: 5 }], ['L', 'B', { powers: [blast(8)] }, { x: 5, y: 5 }]]);
  assert.equal(transformOption(b, who(b, 'T'), [who(b, 'L')], 'full'), null);
  assert.equal(canAct(who(b, 'L')), 'full');
});
