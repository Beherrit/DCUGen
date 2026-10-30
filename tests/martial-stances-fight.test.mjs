// Martial Arts stances in the Battle Room (MA pp 128-131): what each stance does to a fighter, and how it is assumed and lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, artist, ring, who, choice, texts } from './helpers/ma-kit.mjs';
import { dice } from './helpers/fighters.mjs';
import { stanceDef } from '../src/engine/martial/lookup.js';
import { enterStance, assumeStance, stanceName, stanceUpkeep, stanceBonus, tradeCap } from '../src/engine/battle/stance-fight.js';
import { defenseOf, resistOf, activeConditions } from '../src/engine/battle/conditions.js';
import { squaresInMove, reachSquares } from '../src/engine/battle/geometry.js';
import { stanceDefense } from '../src/engine/battle/mods-martial.js';
import { rebuildCombatant } from '../src/engine/battle/combatant.js';
import { readExtras } from '../src/engine/battle/style-extras.js';

/** A plain martial artist with a kick, a fist and a sword, and a plain foe; the artist's numbers before and after a stance. */
function setup(extra = {}) {
  const ch = artist({ maneuvers: ['Snap Kick', 'Jab'], abilities: { Fighting: 3 }, ranks: 3, ...extra }); // modest bonuses, so no stance is held back by the power level limit
  ch.equipment = [{ name: 'Longsword', attack: { kind: 'close', rank: 3, strengthBased: true, crit: 19 }, qty: 1 }];
  const b = ring([['me', 'A', ch], ['foe', 'B', artist({ style: 'Boabom' })]]);
  const me = who(b, 'me');
  for (const s of me.ma.styles) Object.assign(s, readExtras(null)); // the stance alone: Aikido's own Defensive extra would add to it
  return { b, me };
}
const put = (c, name) => enterStance(c, { name, def: stanceDef(R, name), style: 'Aikido' });
const bonus = (c, name) => c.attacks.find((a) => a.name === name)?.bonus;
const rank = (c, name) => c.attacks.find((a) => a.name === name)?.rank;

test('Blocking: +2 Parry, -2 to every attack check', () => {
  const { me } = setup();
  const before = { parry: defenseOf(me, 'Parry'), atk: bonus(me, 'Jab') };
  put(me, 'Blocking');
  assert.equal(defenseOf(me, 'Parry'), before.parry + 2);
  assert.equal(bonus(me, 'Jab'), before.atk - 2);
  put(me, 'Neutral');
  assert.equal(defenseOf(me, 'Parry'), before.parry, 'Neutral puts everything back');
  assert.equal(bonus(me, 'Jab'), before.atk);
});

test('Bobbing: +2 Dodge, -2 attack. Avoiding: Dodge in place of Parry, -4 attack', () => {
  const { me } = setup();
  const dodge = defenseOf(me, 'Dodge'); const jab = bonus(me, 'Jab');
  put(me, 'Bobbing');
  assert.equal(defenseOf(me, 'Dodge'), dodge + 2);
  assert.equal(bonus(me, 'Jab'), jab - 2);
  put(me, 'Avoiding');
  assert.equal(defenseOf(me, 'Parry'), Math.max(me.d.defenses.Parry, me.d.defenses.Dodge), 'Parry is as good as Dodge');
  assert.equal(bonus(me, 'Jab'), jab - 4);
});

test('Crane: +2 attack and Parry, Dodge 0, and the fighter cannot move', () => {
  const { b, me } = setup();
  const parry = defenseOf(me, 'Parry'); const jab = bonus(me, 'Jab');
  assert.ok(squaresInMove(b, me) > 0);
  put(me, 'Crane');
  assert.equal(bonus(me, 'Jab'), jab + 2);
  assert.equal(defenseOf(me, 'Parry'), parry + 2);
  assert.equal(defenseOf(me, 'Dodge'), 0);
  assert.ok(activeConditions(me).has('Immobile'));
  assert.equal(squaresInMove(b, me), 0);
});

test('Disarming: +4 to disarm checks, -2 to all other attacks', () => {
  const { me } = setup();
  const jab = bonus(me, 'Jab'); const plain = stanceBonus(me, 'Disarm');
  put(me, 'Disarming');
  assert.equal(bonus(me, 'Jab'), jab - 2);
  assert.equal(stanceBonus(me, 'Disarm') - plain, 4 + 2, 'the disarm check gets +4 on top of undoing the general -2 on the attack it is built on');
});

test('Drunken: +2 Dodge, Defensive Roll as Toughness, Deception +8, Acrobatics -8, Intimidation -4, -1 attack', () => {
  const { me } = setup();
  const was = { dodge: defenseOf(me, 'Dodge'), tough: me.d.defenses.Toughness, dec: me.skills.Deception, acro: me.skills.Acrobatics, intim: me.skills.Intimidation, jab: bonus(me, 'Jab') };
  put(me, 'Drunken');
  assert.equal(defenseOf(me, 'Dodge'), was.dodge + 2);
  assert.equal(me.d.defenses.Toughness, was.tough + 2);
  assert.equal(me.skills.Deception, was.dec + 8);
  assert.equal(me.skills.Acrobatics, was.acro - 8);
  assert.equal(me.skills.Intimidation, was.intim - 4);
  assert.equal(bonus(me, 'Jab'), was.jab - 1);
});

test('Extended: +1 reach (5 ft) on close attacks, -1 Parry and Dodge', () => {
  const { b, me } = setup();
  const parry = defenseOf(me, 'Parry'); const reach = reachSquares(b, me, me.attacks.find((a) => a.name === 'Jab'));
  put(me, 'Extended');
  assert.equal(defenseOf(me, 'Parry'), parry - 1);
  assert.equal(reachSquares(b, me, me.attacks.find((a) => a.name === 'Jab')), reach + 1);
});

test('Finishing: -4 to attacks, defenses and effect ranks (the doubled damage is not played)', () => {
  const { me } = setup();
  const was = { jab: bonus(me, 'Jab'), rank: rank(me, 'Jab'), tough: me.d.defenses.Toughness, parry: defenseOf(me, 'Parry') };
  put(me, 'Finishing');
  assert.equal(bonus(me, 'Jab'), was.jab - 4);
  assert.equal(rank(me, 'Jab'), was.rank - 4);
  assert.equal(me.d.defenses.Toughness, was.tough - 4);
  assert.equal(defenseOf(me, 'Parry'), was.parry - 4);
});

test('Firing: +1 attack and damage with ranged attacks, -1 with the rest', () => {
  const ch = artist({ maneuvers: ['Jab'] });
  ch.powers.push({ id: 'p1', name: 'Bolt', effect: 'Damage', rank: 6, range: 'Ranged', extras: [], flaws: [], descriptors: [], alternates: [] });
  const b = ring([['me', 'A', ch], ['foe', 'B', artist()]]);
  const me = who(b, 'me');
  const was = { bolt: bonus(me, 'Bolt'), boltRank: rank(me, 'Bolt'), jab: bonus(me, 'Jab'), jabRank: rank(me, 'Jab') };
  put(me, 'Firing');
  assert.equal(bonus(me, 'Bolt'), was.bolt + 1);
  assert.equal(rank(me, 'Bolt'), was.boltRank + 1);
  assert.equal(bonus(me, 'Jab'), was.jab - 1);
  assert.equal(rank(me, 'Jab'), was.jabRank - 1);
});

test('Grappler: +2 to grab checks, -1 Dodge and Parry', () => {
  const { me } = setup();
  const parry = defenseOf(me, 'Parry'); const grab = stanceBonus(me, 'Grab');
  put(me, 'Grappler');
  assert.equal(defenseOf(me, 'Parry'), parry - 1);
  assert.equal(stanceBonus(me, 'Grab') - grab, 2);
});

test('Grounded: vulnerable, -1 attack, one rank less knockback, +2 against a trip; its own vulnerability does not break it', () => {
  const { b, me } = setup();
  const jab = bonus(me, 'Jab');
  put(me, 'Grounded');
  assert.ok(activeConditions(me).has('Vulnerable'));
  assert.equal(bonus(me, 'Jab'), jab - 1);
  assert.equal(stanceDefense(me, 'knockback'), 1);
  assert.equal(stanceDefense(me, 'trip'), 2);
  stanceUpkeep(b);
  assert.equal(stanceName(me), 'Grounded');
});

test('High: +2 Dodge as an active defense only; -2 against knockback and a trip', () => {
  const { me } = setup();
  const was = { active: defenseOf(me, 'Dodge'), resist: resistOf(me, 'Dodge') };
  put(me, 'High');
  assert.equal(defenseOf(me, 'Dodge'), was.active + 2);
  assert.equal(resistOf(me, 'Dodge'), was.resist, 'a Dodge resistance check gets nothing');
  assert.equal(stanceDefense(me, 'knockback'), -2);
  assert.equal(stanceDefense(me, 'trip'), -2);
});

test('Reactive: +2 to Dodge resistance checks only, -1 attack', () => {
  const { me } = setup();
  const was = { active: defenseOf(me, 'Dodge'), resist: resistOf(me, 'Dodge'), jab: bonus(me, 'Jab') };
  put(me, 'Reactive');
  assert.equal(defenseOf(me, 'Dodge'), was.active);
  assert.equal(resistOf(me, 'Dodge'), was.resist + 2);
  assert.equal(bonus(me, 'Jab'), was.jab - 1);
});

test('Kicker and Pugilist: +2 attack and damage with feet or hands, -2 with the rest', () => {
  const { me } = setup();
  const was = { kick: bonus(me, 'Snap Kick'), kickRank: rank(me, 'Snap Kick'), jab: bonus(me, 'Jab'), jabRank: rank(me, 'Jab') };
  put(me, 'Kicker');
  assert.equal(bonus(me, 'Snap Kick'), was.kick + 2);
  assert.equal(rank(me, 'Snap Kick'), was.kickRank + 2);
  assert.equal(bonus(me, 'Jab'), was.jab - 2);
  assert.equal(rank(me, 'Jab'), was.jabRank - 2);
  put(me, 'Pugilist');
  assert.equal(bonus(me, 'Jab'), was.jab + 2);
  assert.equal(rank(me, 'Jab'), was.jabRank + 2);
  assert.equal(bonus(me, 'Snap Kick'), was.kick - 2);
});

test('Low: hindered (half speed) and +4 against a trip', () => {
  const { b, me } = setup();
  const walk = squaresInMove(b, me);
  put(me, 'Low');
  assert.ok(activeConditions(me).has('Hindered'));
  assert.equal(squaresInMove(b, me), Math.max(1, Math.floor(walk / 2)));
  assert.equal(stanceDefense(me, 'trip'), 4);
});

test('Misleading, Wary, Power, Prone, Throwing: initiative and the rest', () => {
  const { me } = setup();
  const was = { init: me.initBonus, dec: me.skills.Deception, jab: bonus(me, 'Jab'), jabRank: rank(me, 'Jab'), parry: defenseOf(me, 'Parry') };
  put(me, 'Misleading');
  assert.equal(me.initBonus, was.init - 1);
  assert.equal(me.skills.Deception, was.dec + 4);
  assert.equal(bonus(me, 'Jab'), was.jab - 1);
  put(me, 'Wary');
  assert.equal(me.initBonus, was.init + 4);
  put(me, 'Power');
  assert.equal(rank(me, 'Jab'), was.jabRank + 2, 'close damage +2');
  assert.equal(defenseOf(me, 'Parry'), was.parry - 1);
  assert.equal(me.initBonus, was.init - 1);
  put(me, 'Prone');
  assert.equal(me.initBonus, was.init - 1);
  put(me, 'Throwing');
  assert.equal(me.initBonus, was.init - 2);
});

test('Showman: Deception +4 for a feint, -1 attack, Dodge and Parry', () => {
  const { me } = setup();
  const was = { dec: me.skills.Deception, jab: bonus(me, 'Jab'), dodge: defenseOf(me, 'Dodge') };
  put(me, 'Showman');
  assert.equal(me.skills.Deception, was.dec + 4);
  assert.equal(bonus(me, 'Jab'), was.jab - 1);
  assert.equal(defenseOf(me, 'Dodge'), was.dodge - 1);
});

test('Weapon: +1 attack and +2 damage with the weapon, -1 and -2 with every other attack', () => {
  const { me } = setup();
  const was = { sword: bonus(me, 'Longsword'), swordRank: rank(me, 'Longsword'), jab: bonus(me, 'Jab'), jabRank: rank(me, 'Jab') };
  put(me, 'Weapon');
  assert.equal(bonus(me, 'Longsword'), was.sword + 1);
  assert.equal(rank(me, 'Longsword'), was.swordRank + 2);
  assert.equal(bonus(me, 'Jab'), was.jab - 1);
  assert.equal(rank(me, 'Jab'), was.jabRank - 2);
});

test('Guarded and Offensive widen the Defensive and All-Out Attack trade: 5, or 10 with the advantage', () => {
  const { me } = setup();
  assert.equal(tradeCap(me, 'All-out Attack'), 2);
  put(me, 'Offensive');
  assert.equal(tradeCap(me, 'All-out Attack'), 5);
  assert.equal(tradeCap(me, 'Defensive Attack'), 2, 'the other trade is not widened');
  me.adv['All-out Attack'] = 1;
  assert.equal(tradeCap(me, 'All-out Attack'), 10);
  put(me, 'Guarded');
  assert.equal(tradeCap(me, 'Defensive Attack'), 5);
});

test('a stance is kept through a rebuild, and Neutral does nothing', () => {
  const { me } = setup();
  const jab = bonus(me, 'Jab');
  put(me, 'Neutral');
  assert.equal(bonus(me, 'Jab'), jab);
  put(me, 'Pugilist');
  const held = bonus(me, 'Jab');
  rebuildCombatant(me, R);
  assert.equal(bonus(me, 'Jab'), held);
  assert.equal(stanceName(me), 'Pugilist');
});

test('a stance bonus stays inside the power level limit: attack bonus plus rank at most twice the PL', () => {
  let checked = 0;
  for (let fighting = 1; fighting <= 14; fighting++) {
    const b = ring([['me', 'A', artist({ maneuvers: ['Jab'], abilities: { Fighting: fighting }, ranks: 2 })], ['foe', 'B', artist()]]);
    const me = who(b, 'me');
    const total = () => bonus(me, 'Jab') + rank(me, 'Jab');
    const before = total(); const room = Math.max(0, 20 - before);
    put(me, 'Crane'); // +2 attack
    if (before >= 18 && before <= 20) { assert.equal(total() - before, Math.min(2, room), `room ${room} under the limit`); checked++; }
  }
  assert.ok(checked, 'a fighter close to the limit was tried');
});

// ---- assuming a stance ----

test('assuming a stance: a check against the DC, a free action from Neutral, a move action from another stance', () => {
  const { b, me } = setup();
  assert.equal(choice(me, 'Blocking').dc, 13);
  assumeStance(b, me, choice(me, 'Blocking'), dice(12));
  assert.equal(stanceName(me), 'Blocking');
  assert.match(texts(b).at(-1), /shifts into Blocking stance \(Close Combat: Aikido d20 12 \+\d+ = \d+ vs DC 13\)/);
});

test('failing the Assume Stance check leaves the fighter in Neutral, whatever it held', () => {
  const { b, me } = setup({ ranks: 0 });
  put(me, 'Blocking');
  const r = assumeStance(b, me, choice(me, 'Guarded'), dice(1));
  assert.equal(r.ok, false);
  assert.equal(stanceName(me), 'Neutral');
  assert.match(texts(b).at(-1), /fails to settle into Guarded stance/);
});

test('Flowing Form takes 5 off the DC; Deceptive Stance adds 2 a rank', async () => {
  const { assumeDc } = await import('../src/engine/battle/stance-fight.js');
  const flow = setup({ adv: [{ name: 'Flowing Form', rank: 1 }] }).me;
  assert.equal(assumeDc(flow, choice(flow, 'Blocking')), 8);
  const sly = setup({ adv: [{ name: 'Deceptive Stance', rank: 2 }] }).me;
  assert.equal(assumeDc(sly, choice(sly, 'Blocking')), 17);
});

test('a Master may re-roll a failed Assume Stance check once a fight', () => {
  const { b, me } = setup({ tier: 'master', ranks: 0 });
  const r = assumeStance(b, me, choice(me, 'Guarded'), dice(1, 20));
  assert.equal(r.ok, true);
  assert.match(texts(b).at(-1), /Master re-roll/);
  put(me, 'Neutral');
  const second = assumeStance(b, me, choice(me, 'Guarded'), dice(1));
  assert.equal(second.ok, false, 'only one re-roll a fight');
});

// ---- losing a stance ----

test('the asleep, defenseless, immobile, paralyzed, prone, stunned and vulnerable conditions and incapacity break a stance', () => {
  for (const name of ['Prone', 'Stunned', 'Defenseless', 'Paralyzed', 'Asleep', 'Immobile', 'Vulnerable']) {
    const { b, me } = setup();
    put(me, 'Blocking');
    me.conditions.push({ name, degree: 1, from: 'foe', source: 'test' });
    stanceUpkeep(b);
    assert.equal(stanceName(me), 'Neutral', `${name} breaks the stance`);
    assert.match(texts(b).at(-1), /Blocking stance is broken \(\w+\): back to Neutral/);
  }
  const { b, me } = setup();
  put(me, 'Blocking');
  me.out = true;
  stanceUpkeep(b);
  assert.equal(stanceName(me), 'Neutral', 'knocked out');
});

test('a dazed or bruised fighter keeps its stance', () => {
  const { b, me } = setup();
  put(me, 'Blocking');
  me.dazed = true; me.bruises = 2;
  stanceUpkeep(b);
  assert.equal(stanceName(me), 'Blocking');
});
