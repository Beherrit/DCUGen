import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES as R } from '../src/engine/index.js';
import { attacks } from '../src/engine/derive.js';
import { isAttackEffect, roleForPower, repairPowerRoles } from '../src/engine/repair.js';

const ballista = () => JSON.parse(readFileSync(new URL('./fixtures/ballista.json', import.meta.url), 'utf8'));
const dmg = (extra = {}) => ({ name: 'Bolt', effect: 'Damage', rank: 6, range: 'Ranged', extras: [], flaws: [], role: 'utility', ...extra });
const names = (ch) => attacks(ch, R).map((a) => a.name);

test('as shared, the Ballista sheet lists only Unarmed (the bug being repaired)', () => {
  assert.deepEqual(names(ballista()), ['Unarmed']);
});

test('repair turns Kinetic control into a ranged Damage attack at rank 12 that rolls with Ranged Combat: Throwing', () => {
  const ch = repairPowerRoles(ballista(), R);
  const list = attacks(ch, R);
  assert.deepEqual(list.map((a) => a.name), ['Unarmed', 'Kinetic control']);
  const k = list.find((a) => a.name === 'Kinetic control');
  assert.equal(k.kind, 'ranged');
  assert.equal(k.effect, 'Damage');
  assert.equal(k.rank, 12);
  assert.equal(k.bonus, 5);
  assert.equal(ch.powers.find((p) => p.name === 'Kinetic control').attackSkill, 'Throwing');
});

test('repair leaves the non-attack powers of the Ballista alone', () => {
  const ch = repairPowerRoles(ballista(), R);
  for (const p of ch.powers.filter((x) => x.name !== 'Kinetic control')) assert.equal(p.role, 'utility', p.name);
});

test('with attackSkill Throwing the repaired power gets bonus 5 (Dex 0 + Ranged Combat: Throwing 5)', () => {
  const ch = repairPowerRoles(ballista(), R);
  ch.powers.find((p) => p.name === 'Kinetic control').attackSkill = 'Throwing';
  const k = attacks(ch, R).find((a) => a.name === 'Kinetic control');
  assert.equal(k.bonus, 5);
});

test('a power that has an id is never changed, even a utility Damage power', () => {
  const ch = { powers: [dmg({ id: 'p1' })] };
  repairPowerRoles(ch, R);
  assert.equal(ch.powers[0].role, 'utility');
});

test('a power without an id and a Damage effect is promoted to attack', () => {
  const ch = { powers: [dmg()] };
  assert.equal(repairPowerRoles(ch, R), ch, 'returns the same character');
  assert.equal(ch.powers[0].role, 'attack');
});

test('only utility is promoted: movement and defense roles are kept', () => {
  const ch = { powers: [dmg({ role: 'movement' }), dmg({ role: 'defense' })] };
  repairPowerRoles(ch, R);
  assert.deepEqual(ch.powers.map((p) => p.role), ['movement', 'defense']);
});

test('Protection with role utility stays utility', () => {
  const ch = { powers: [{ name: 'Skin', effect: 'Protection', rank: 4, role: 'utility' }] };
  repairPowerRoles(ch, R);
  assert.equal(ch.powers[0].role, 'utility');
});

test('roleForPower: attack effects become attack, non-attack effects lose a stray attack role', () => {
  assert.equal(roleForPower({ effect: 'Protection', role: 'attack' }, R), 'utility');
  assert.equal(roleForPower({ effect: 'Affliction' }, R), 'attack');
  assert.equal(roleForPower({ effect: 'Damage', role: 'defense' }, R), 'attack');
  assert.equal(roleForPower({ effect: 'Flight', role: 'movement' }, R), 'movement');
  assert.equal(roleForPower({ effect: 'Flight' }, R), 'utility');
});

test('isAttackEffect: Damage, Affliction, Weaken, Nullify yes; Protection, Leaping, Flight no', () => {
  for (const e of ['Damage', 'Affliction', 'Weaken', 'Nullify']) assert.equal(isAttackEffect(e, R), true, e);
  for (const e of ['Protection', 'Leaping', 'Flight']) assert.equal(isAttackEffect(e, R), false, e);
});

test('alternates, linked effects and device powers without ids are repaired too', () => {
  const ch = {
    powers: [{
      id: 'p1', name: 'Array', effect: 'Protection', rank: 3, role: 'utility',
      alternates: [dmg({ name: 'Alt bolt' }), dmg({ name: 'Alt kept', id: 'a2' })],
      linked: [{ name: 'Flash', effect: 'Affliction', rank: 4, role: 'utility' }],
    }],
    devices: [{ name: 'Gadget', powers: [dmg({ name: 'Zap' }), dmg({ name: 'Zap kept', id: 'd2' })] }],
  };
  repairPowerRoles(ch, R);
  assert.equal(ch.powers[0].role, 'utility');
  assert.deepEqual(ch.powers[0].alternates.map((p) => p.role), ['attack', 'utility']);
  assert.equal(ch.powers[0].linked[0].role, 'attack');
  assert.deepEqual(ch.devices[0].powers.map((p) => p.role), ['attack', 'utility']);
});

test('a character with no powers, devices or alternates does not throw', () => {
  assert.doesNotThrow(() => repairPowerRoles({}, R));
  assert.doesNotThrow(() => repairPowerRoles({ powers: [{ name: 'x', effect: 'Damage', rank: 1, role: 'utility' }], devices: [{ name: 'empty' }] }, R));
  assert.deepEqual(repairPowerRoles({}, R), {});
});

test('the advancement snapshot is repaired too, so the log does not report a phantom change', () => {
  const ch = ballista();
  ch.advancement = { snapshot: JSON.parse(JSON.stringify({ powers: ch.powers, skills: ch.skills })) };
  repairPowerRoles(ch, R);
  const snap = ch.advancement.snapshot.powers.find((p) => p.name === 'Kinetic control');
  assert.equal(snap.role, 'attack');
  assert.equal(snap.attackSkill, 'Throwing');
});

test('no specialty is linked when two are free, or when one is already named after the power', () => {
  const two = repairPowerRoles({ skills: [{ name: 'Ranged Combat', spec: 'Throwing', ranks: 5 }, { name: 'Ranged Combat', spec: 'Guns', ranks: 3 }], powers: [dmg()] }, R);
  assert.equal(two.powers[0].attackSkill, undefined);
  const own = repairPowerRoles({ skills: [{ name: 'Ranged Combat', spec: 'Bolt', ranks: 5 }, { name: 'Ranged Combat', spec: 'Guns', ranks: 3 }], powers: [dmg()] }, R);
  assert.equal(own.powers[0].attackSkill, undefined);
  assert.equal(attacks(own, R).find((a) => a.name === 'Bolt').bonus, 5);
});

test('a specialty named after another attack or a piece of equipment is not free to link', () => {
  const ch = repairPowerRoles({ skills: [{ name: 'Ranged Combat', spec: 'Rifle', ranks: 4 }], equipment: [{ name: 'Rifle', attack: { kind: 'ranged', rank: 5 } }], powers: [dmg()] }, R);
  assert.equal(ch.powers[0].attackSkill, undefined);
});

test('a power with an id or an existing attackSkill is never relinked', () => {
  const ch = repairPowerRoles({ skills: [{ name: 'Ranged Combat', spec: 'Throwing', ranks: 5 }], powers: [dmg({ id: 'p1', role: 'attack' }), dmg({ name: 'Zap', role: 'attack', attackSkill: 'Zapping' })] }, R);
  assert.equal(ch.powers[0].attackSkill, undefined);
  assert.equal(ch.powers[1].attackSkill, 'Zapping');
});
