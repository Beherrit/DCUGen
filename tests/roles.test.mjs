// Roles (src/engine/battle/roles.js): what a build suggests, how little they weigh, and the pieces the utilities lean on:
// how a Weaken's trait is read and what it does, traits lent to allies (grants.js), Nullify's worth, the Sustain and
// Bodyguard weights, and the line on the Battle Room card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, deflect, powerArena, who } from './helpers/power-arena.mjs';
import { ROLES, ROLE_WEIGHT, roleWeight, detectRoles } from '../src/engine/battle/roles.js';
import { parseWeakenTrait, weakenTraits } from '../src/engine/battle/weaken-traits.js';
import { weakenedAttack, defenseOf } from '../src/engine/battle/conditions.js';
import { giftsOf, lend, refreshGrants, holderOf } from '../src/engine/battle/grants.js';
import { nullifyGain } from '../src/engine/battle/utility-control.js';
import { healOption } from '../src/engine/battle/utility-heal.js';
import { protectWeight } from '../src/engine/battle/utility-protect.js';
import { expectedValue } from '../src/engine/battle/odds.js';
import { enemiesOf } from '../src/engine/battle/util.js';
import { serializeBattle, reviveBattle } from '../src/engine/battle.js';
import { rolesNote } from '../src/app/battle-roles.js';

const power = (name, effect, rank, extra = {}) => ({ name, effect, rank, extras: [], flaws: [], role: 'attack', range: 'Close', ...extra });
const smash = (rank) => power('Smash', 'Damage', rank);
const mend = (rank, extras = []) => power('Mend', 'Healing', rank, { role: 'utility', extras });
const gift = (effect, rank, option) => power('Aura', effect, rank, { role: 'utility', range: 'Personal', ...(option ? { option } : {}), extras: [{ name: 'Affects Others', option: 'Others only' }] });
const PLAIN = { abilities: { Strength: 0, Fighting: 4, Stamina: 2 }, defenses: { Parry: 0, Dodge: 0 } };
const NO_HEROES = { heroPoints: false };
const rolesOf = (powers, spec = {}) => { const b = powerArena([['x', 'A', { ...PLAIN, ...spec, powers }], ['y', 'B', PLAIN]], NO_HEROES); return who(b, 'x').roles; };

// ---- detection ----------------------------------------------------------------------------------------

test('roles come from the build: a healer, a controller, a debuffer, a buffer, a protector, a striker, a tank', () => {
  assert.deepEqual(ROLES, ['healer', 'controller', 'debuffer', 'buffer', 'protector', 'striker', 'tank']);
  assert.deepEqual(rolesOf([]), [], 'a plain fighter has no role');
  assert.ok(rolesOf([mend(5)]).includes('healer'));
  assert.ok(rolesOf([power('Stun', 'Affliction', 6, { detail: 'Resisted by Fortitude; Dazed, Stunned, Incapacitated' })]).includes('controller'));
  assert.ok(rolesOf([power('Sap', 'Weaken', 6, { detail: 'Strength' })]).includes('debuffer'));
  assert.ok(rolesOf([gift('Enhanced Trait', 5, 'Dodge')]).includes('buffer'));
  assert.ok(rolesOf([deflect(5)]).includes('protector'));
  assert.ok(rolesOf([smash(9)]).includes('striker'), 'rank 9 is within 2 of the power level');
  assert.ok(!rolesOf([smash(3)]).includes('striker'));
  assert.ok(rolesOf([], { abilities: { Strength: 0, Fighting: 4, Stamina: 14 } }).includes('tank'));
});

test('a mixed build has several roles, and each weighs only its own kind of choice by 15 percent', () => {
  const roles = rolesOf([mend(6), smash(9), power('Stun', 'Affliction', 6, { detail: 'Dazed, Stunned, Incapacitated' })]);
  assert.deepEqual(roles, ['healer', 'controller', 'striker']);
  const b = powerArena([['x', 'A', { ...PLAIN, powers: [mend(6), smash(9)] }], ['y', 'B', PLAIN]], NO_HEROES);
  assert.equal(ROLE_WEIGHT, 1.15);
  assert.equal(roleWeight(who(b, 'x'), 'healer'), 1.15);
  assert.equal(roleWeight(who(b, 'x'), 'controller'), 1, 'no controller role, no weight');
  assert.deepEqual(detectRoles({ attacks: [], adv: {}, d: { defenses: { Toughness: 0 } }, pl: 10 }), []);
});

test('the card shows the roles next to the style', () => {
  assert.equal(rolesNote({ roles: ['healer', 'controller'] }), ' · Roles: healer, controller');
  assert.equal(rolesNote({ roles: [] }), '');
  assert.equal(rolesNote({}), '');
});

// ---- Weaken: which trait, and what it does ------------------------------------------------------------

test('a Weaken power names its trait: Strength, Toughness, Dodge, Parry, Will, Fortitude, Fighting, an attack power, or all', () => {
  const read = (t) => parseWeakenTrait(`${t}; Resisted by Fortitude`);
  assert.deepEqual(['Strength', 'Toughness', 'Dodge', 'Parry', 'Will', 'Fortitude', 'Fighting', 'Dexterity'].map(read), ['Strength', 'Toughness', 'Dodge', 'Parry', 'Will', 'Fortitude', 'Fighting', 'Dexterity']);
  assert.equal(read('Energy Blast'), 'Power:blast');
  assert.equal(read('All traits'), 'All');
  assert.equal(parseWeakenTrait(''), 'Toughness', 'the old default');
  const b = powerArena([['x', 'A', { ...PLAIN, powers: [power('Sap', 'Weaken', 6, { detail: 'Fighting; Resisted by Will' })] }], ['y', 'B', PLAIN]], NO_HEROES);
  assert.equal(who(b, 'x').attacks.find((a) => a.name === 'Sap').weakens, 'Fighting');
});

test('a weakened Fighting lowers Parry and close attack checks, a weakened attack power lowers that attack\'s rank, All hits every defense', () => {
  const b = powerArena([['x', 'A', { ...PLAIN, powers: [smash(8)] }], ['y', 'B', PLAIN]], NO_HEROES);
  const x = who(b, 'x'); const atk = x.attacks.find((a) => a.name === 'Smash');
  const parry = defenseOf(x, 'Parry'); const ev = expectedValue(x, atk, who(b, 'y'));
  weakenTraits(x, 'Fighting', 3);
  assert.equal(defenseOf(x, 'Parry'), parry - 3);
  assert.deepEqual(weakenedAttack(x, atk), { rank: 0, bonus: 3 });
  assert.ok(expectedValue(x, atk, who(b, 'y')) < ev);
  weakenTraits(x, 'Power:smash', 2);
  assert.equal(weakenedAttack(x, atk).rank, 2);
  weakenTraits(x, 'All', 4);
  assert.deepEqual(['Toughness', 'Dodge', 'Parry', 'Fortitude', 'Will'].map((k) => x.weakened[k]), [2, 2, 2, 2, 2]);
});

// ---- traits lent to allies ----------------------------------------------------------------------------

test('a gift is lent to one ally at a time, moves its numbers, and lapses when the giver is stunned; a save keeps it', () => {
  const b = powerArena([['g', 'A', { ...PLAIN, powers: [gift('Enhanced Trait', 4, 'Dodge')] }], ['a1', 'A', PLAIN, { x: 1, y: 0 }], ['a2', 'A', PLAIN, { x: 2, y: 0 }], ['foe', 'B', PLAIN, { x: 5, y: 0 }]], NO_HEROES);
  const g = who(b, 'g'); const [a1, a2] = [who(b, 'a1'), who(b, 'a2')];
  const [one] = g.gifts;
  assert.deepEqual([one.trait, one.amount, one.kinds], ['Dodge', 4, ['Dodge']]);
  const base = a1.d.defenses.Dodge;
  lend(b, g, a1, one);
  assert.equal(a1.d.defenses.Dodge, base + 4); assert.equal(holderOf(b, g, one.key), a1);
  lend(b, g, a2, one);
  assert.deepEqual([a1.d.defenses.Dodge, a2.d.defenses.Dodge], [base, base + 4], 'moved, not doubled');
  const revived = reviveBattle(R, JSON.parse(JSON.stringify(serializeBattle(b))));
  assert.equal(revived.combatants.find((c) => c.id === 'a2').d.defenses.Dodge, base + 4, 'a loaded fight keeps the gift');
  g.conditions.push({ name: 'Stunned', names: ['Stunned'], degree: 2, from: 'foe', source: 'x', label: 'x', dc: 15, resist: 'Fortitude' });
  refreshGrants(b);
  assert.deepEqual([a2.d.defenses.Dodge, a2.grants.length], [base, 0]);
  assert.deepEqual(giftsOf({ powers: [power('Fly', 'Flight', 4, { extras: [{ name: 'Affects Others' }] }), gift('Enhanced Trait', 3, 'Intellect')] }), [], 'a trait the fight does not use is not a gift');
});

test('a Regeneration lent by touch counts as a heal and mends an ally a little each round', () => {
  const b = powerArena([['g', 'A', { ...PLAIN, powers: [gift('Regeneration', 10)] }, { x: 0, y: 0 }], ['a', 'A', PLAIN, { x: 1, y: 0 }], ['foe', 'B', PLAIN, { x: 5, y: 0 }]], NO_HEROES);
  const g = who(b, 'g'); const a = who(b, 'a'); a.bruises = 2;
  assert.ok(g.roles.includes('healer'));
  const o = healOption(b, g, enemiesOf(b, g), 'full');
  assert.equal(o.patient, a);
  o.run(b, R, g);
  assert.equal(a.regenRank, 10);
});

// ---- Nullify, Sustain, Bodyguard ----------------------------------------------------------------------

test('Nullify is worth the gain for allies who strike while a sustained defense is down, and nothing against no defense', () => {
  const nullify = power('Dispel', 'Nullify', 10, { range: 'Ranged', detail: 'Force' });
  const shield = power('Field', 'Force Field', 10, { role: 'defense', range: 'Personal' });
  const b = powerArena([['n', 'A', { ...PLAIN, powers: [nullify] }, { x: 1, y: 0 }], ['s', 'A', { ...PLAIN, powers: [smash(9)] }, { x: 2, y: 0 }], ['warded', 'B', { ...PLAIN, powers: [shield] }, { x: 1, y: 1 }], ['bare', 'B', PLAIN, { x: 0, y: 1 }]], NO_HEROES);
  const n = who(b, 'n'); const atk = n.attacks.find((a) => a.name === 'Dispel');
  const opts = { dist: 0, b };
  assert.ok(nullifyGain(b, n, atk, who(b, 'warded'), opts) > 0.1);
  assert.equal(nullifyGain(b, n, atk, who(b, 'bare'), opts), 0);
});

test('Sustain doubles a heal and Bodyguard raises a protecting choice by half, on top of the role', () => {
  const squad = (tactics) => powerArena([['med', 'A', { ...PLAIN, powers: [mend(6), deflect(5)] }, { x: 1, y: 0 }], ['ally', 'A', PLAIN, { x: 2, y: 0 }], ['foe', 'B', PLAIN, { x: 4, y: 0 }]], { ...NO_HEROES, ...(tactics ? { teamTactics: { A: tactics } } : {}) });
  const worth = (b) => healOption(b, who(b, 'med'), enemiesOf(b, who(b, 'med')), 'full').u;
  const [plain, sustain] = [squad(null), squad('sustain')];
  who(plain, 'ally').bruises = 2; who(sustain, 'ally').bruises = 2;
  assert.ok(Math.abs(worth(sustain) / worth(plain) - 2) < 1e-9);
  assert.ok(Math.abs(protectWeight(squad('bodyguard'), who(squad('bodyguard'), 'med')) - 1.5 * ROLE_WEIGHT) < 1e-9);
  assert.equal(protectWeight(plain, who(plain, 'ally')), 1);
});

test('a controller\'s control is already valued turn by turn, so the role adds no weight to it; the healer\'s heal keeps its 15 percent', () => {
  const b = powerArena([['c', 'A', { ...PLAIN, powers: [power('Stun', 'Affliction', 6, { detail: 'Resisted by Fortitude; Dazed, Stunned, Incapacitated' }), mend(5)] }], ['y', 'B', PLAIN]], NO_HEROES);
  assert.deepEqual(who(b, 'c').roles.slice(0, 2), ['healer', 'controller']);
  assert.equal(roleWeight(who(b, 'c'), 'controller'), 1);
  assert.equal(roleWeight(who(b, 'c'), 'healer'), ROLE_WEIGHT);
});
