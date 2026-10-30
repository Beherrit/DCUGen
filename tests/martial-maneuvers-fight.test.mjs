// Combat maneuvers as attacks in the Battle Room (MA pp 136-153), and what the style adds to its own attacks (Student, Aggressive).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, artist, ring, who, texts } from './helpers/ma-kit.mjs';
import { dice } from './helpers/fighters.mjs';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { defenseOf } from '../src/engine/battle/conditions.js';
import { takeTurn } from '../src/engine/battle/turn.js';
import { styleStartTurn } from '../src/engine/battle/style-turn.js';

const atk = (c, name) => c.attacks.find((a) => a.name === name);
function duel(mine = {}, foe = {}) {
  const b = ring([['me', 'A', artist({ tier: 'initiate', ...mine })], ['foe', 'B', artist({ style: 'Boabom', ...foe })]]);
  return { b, me: who(b, 'me'), foe: who(b, 'foe') };
}

test('a basic maneuver is an attack: Strength plus the table modifier, the table attack modifier and critical range', () => {
  const { me } = duel({ maneuvers: ['Jab', 'Haymaker', 'Snap Kick', 'Axe Kick'] });
  const unarmed = atk(me, 'Unarmed');
  const jab = atk(me, 'Jab'); const hay = atk(me, 'Haymaker'); const snap = atk(me, 'Snap Kick'); const axe = atk(me, 'Axe Kick');
  assert.equal(jab.rank, unarmed.rank, 'Jab: Strength');
  assert.equal(jab.bonus, unarmed.bonus + 2, 'Jab: +2 to attack');
  assert.equal(jab.crit, 20);
  assert.equal(hay.rank, unarmed.rank + 6, 'Haymaker: Strength +6');
  assert.equal(hay.bonus, unarmed.bonus - 4);
  assert.equal(hay.crit, 18);
  assert.equal(snap.rank, unarmed.rank + 1);
  assert.equal(axe.crit, 19);
  assert.equal(jab.kind, 'close');
  assert.equal(jab.maneuver, true);
});

test('a maneuver that costs Parry and Dodge does so until the fighter next acts, and one that gives Parry gives it', () => {
  const { b, me, foe } = duel({ maneuvers: ['Haymaker', 'Snap Kick'] });
  const parry = defenseOf(me, 'Parry'); const dodge = defenseOf(me, 'Dodge');
  me.x = 0; foe.x = 1; foe.y = me.y = 0;
  resolveAttack(b, R, me, atk(me, 'Haymaker'), foe, dice(2, 5, 5, 5, 5), {}); // Haymaker: -5 Parry
  assert.equal(defenseOf(me, 'Parry'), parry - 5);
  assert.equal(defenseOf(me, 'Dodge'), dodge, 'only Parry');
  styleStartTurn(me);
  assert.equal(defenseOf(me, 'Parry'), parry, 'back to normal on the next turn');
  resolveAttack(b, R, me, atk(me, 'Snap Kick'), foe, dice(2, 5, 5, 5, 5), {});
  assert.equal(defenseOf(me, 'Parry'), parry + 2, 'Snap Kick: +2 Parry');
});

test('Sweep is an Affliction against Dodge that leaves the target vulnerable, then prone', () => {
  const { me } = duel({ maneuvers: ['Sweep'] });
  const s = atk(me, 'Sweep');
  assert.equal(s.effect, 'Affliction');
  assert.equal(s.resistance, 'Dodge');
  assert.deepEqual(s.tiers, [['Vulnerable'], ['Prone']]);
  assert.equal(s.maxDegree, 2, 'Limited Degree');
});

test('the Student advantage adds 2 to the attack with the style\'s unarmed attack and maneuvers; an Initiate gets nothing', () => {
  const init = duel({ maneuvers: ['Jab'] }).me;
  const stud = duel({ tier: 'student', maneuvers: ['Jab'] }).me;
  assert.equal(atk(stud, 'Jab').bonus, atk(init, 'Jab').bonus + 2);
  assert.equal(atk(stud, 'Unarmed').bonus, atk(init, 'Unarmed').bonus + 2);
  assert.deepEqual(atk(stud, 'Jab').bn, { Student: 2 });
  assert.equal(atk(init, 'Jab').bn, undefined);
});

test('the fight log names the Student bonus beside the roll', () => {
  const { b, me, foe } = duel({ tier: 'student', maneuvers: ['Jab'] });
  me.x = 0; foe.x = 1; me.y = foe.y = 0;
  resolveAttack(b, R, me, atk(me, 'Jab'), foe, dice(10, 5, 5, 5), {});
  assert.match(texts(b)[0], /Student: \+2/);
});

test('a style with the Aggressive extra adds 1 to attacks with its maneuvers and bars Defensive Attack and the Defend action', () => {
  const calm = duel({ style: 'Aikido', tier: 'initiate', maneuvers: ['Jab'] }).me; // Aikido is Defensive
  const keen = duel({ style: 'Bujinkan Budo Taijutsu', tier: 'initiate', maneuvers: ['Jab'] }).me;
  assert.equal(calm.noAllOut, true, 'a Defensive style forbids All-Out Attack and a charge');
  assert.equal(calm.noCharge, true);
  assert.equal(keen.noDefensive, true);
  assert.equal(keen.noDefend, true);
  assert.deepEqual(atk(keen, 'Jab').bn, { 'Aggressive style': 1 });
});

test('an advanced maneuver is an attack at the rank bought: Chi Strike hits Will, Stunning Attack afflicts Fortitude', () => {
  const chi = duel({ style: 'Bak Mei', maneuvers: [{ name: 'Chi Strike', rank: 5 }, { name: 'Stunning Attack', rank: 6 }] }).me;
  const strike = atk(chi, 'Chi Strike');
  assert.equal(strike?.rank, 5);
  assert.equal(strike?.resistance, 'Will');
  const stun = atk(chi, 'Stunning Attack');
  assert.equal(stun?.effect, 'Affliction');
  assert.equal(stun?.resist, 'Fortitude');
  assert.deepEqual(stun?.tiers, [['Impaired'], ['Stunned'], ['Incapacitated']]);
});

test('Focused Strike, Nerve Strike and Flurry give the style\'s close attacks a wider critical range, Penetrating and Multiattack', () => {
  const { me } = duel({ style: 'Bak Mei', maneuvers: ['Jab', { name: 'Focused Strike', rank: 2 }, 'Nerve Strike', 'Flurry'] });
  const jab = atk(me, 'Jab');
  assert.equal(jab.crit, 18, 'Improved Critical 2');
  assert.equal(jab.penetrating, true);
  assert.equal(jab.multiattack, true);
});

test('a weapon style strikes its maneuvers with the weapon and bars unarmed ones when it is Weapon Dependent', () => {
  const ch = artist({ style: 'Bojutsu/Jojutsu', tier: 'student', ranks: 2, maneuvers: ['Jab'] });
  ch.equipment = [{ name: 'Staff', attack: { kind: 'close', rank: 2, strengthBased: true }, qty: 1 }];
  const b = ring([['me', 'A', ch], ['foe', 'B', artist()]]);
  const me = who(b, 'me');
  assert.ok(atk(me, 'Jab (Staff)'), 'the maneuver is made with the staff');
  assert.equal(atk(me, 'Jab (Staff)').rank, atk(me, 'Staff').rank, 'Jab: the weapon\'s damage');
  assert.equal(atk(me, 'Jab (Staff)').item?.name, 'Staff', 'losing the staff takes the maneuver with it');
});

test('a martial artist uses its maneuvers in a fight and never idles with them to hand', () => {
  const { b, me } = duel({ tier: 'student', maneuvers: ['Jab', 'Snap Kick'] });
  me.x = 0; who(b, 'foe').x = 1;
  takeTurn(b, R, me, { next: () => 0.5, int: (a, z) => Math.floor((a + z) / 2), chance: () => true, pick: (a) => a[0], shuffle: (a) => a, weighted: (a) => a[0] });
  assert.ok(texts(b).some((t) => /Jab|Snap Kick|Unarmed|strikes|stance/.test(t)), texts(b).join(' / '));
  assert.ok(!texts(b).some((t) => /finds nothing worth doing/.test(t)));
});
