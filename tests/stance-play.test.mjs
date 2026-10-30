import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { deriveAll } from '../src/engine/derive.js';
import { playState, applyDamage, endScene } from '../src/engine/play.js';
import { stanceChoices, assumeStance, currentStance, stanceAction, stanceDisrupted, dropBrokenStance, DISRUPTING } from '../src/engine/martial/stance.js';
import { inStance, attackMod, stanceNotes } from '../src/engine/martial/stance-mods.js';
import { addStyle } from '../src/engine/martial/styles.js';
import { stanceDef } from '../src/engine/martial/lookup.js';

function fighter(pl = 10) {
  const ch = {
    pl, abilities: { Strength: 4, Stamina: 4, Agility: 4, Dexterity: 2, Fighting: 6, Intellect: 0, Awareness: 0, Presence: 0 },
    defenses: { Dodge: 2, Parry: 2 }, skills: [], advantages: [], powers: [],
  };
  addStyle(ch, R, 'Aikido', { tier: 'student' });
  ch.skills.find((s) => s.spec === 'Aikido').ranks = 6;
  return ch;
}

test('a character with the Stances advantage can assume the style stances; Neutral is always there', () => {
  const ch = fighter();
  const d = deriveAll(ch, R);
  const names = stanceChoices(ch, R, d).map((c) => c.name);
  assert.deepEqual(names, ['Neutral', 'Avoiding', 'Blocking', 'Disarming', 'Grappler', 'Grounded', 'Guarded']);
  const blocking = stanceChoices(ch, R, d).find((c) => c.name === 'Blocking');
  assert.equal(blocking.dc, 13);
  assert.equal(blocking.bonus, 6 + 6, 'Fighting 6 plus 6 ranks in Close Combat: Aikido');
  ch.styles[0].stances = false;
  assert.deepEqual(stanceChoices(ch, R, d).map((c) => c.name), ['Neutral']);
});

test('assuming a stance is a free action from Neutral and a move action otherwise; failing leaves you in Neutral', () => {
  const ch = fighter();
  const choices = stanceChoices(ch, R, deriveAll(ch, R));
  const blocking = choices.find((c) => c.name === 'Blocking');
  const grappler = choices.find((c) => c.name === 'Grappler');
  const s = playState({});
  assert.equal(stanceAction(s), 'free');
  const ok = assumeStance(s, blocking, 13);
  assert.deepEqual([ok.stance, ok.ok, ok.action], ['Blocking', true, 'free']);
  const inBlocking = { ...s, stance: 'Blocking' };
  assert.equal(stanceAction(inBlocking), 'move');
  const failed = assumeStance(inBlocking, grappler, 14);
  assert.deepEqual([failed.stance, failed.ok, failed.action], ['Neutral', false, 'move']);
  assert.equal(assumeStance(inBlocking, choices[0], 0).stance, 'Neutral', 'Neutral needs no check');
});

test('Blocking adds 2 to Parry and takes 2 off attacks; Crane sets Dodge to 0', () => {
  const ch = fighter();
  const d = deriveAll(ch, R);
  const b = inStance(d, stanceDef(R, 'Blocking'), ch.pl);
  assert.equal(b.defenses.Parry, d.defenses.Parry + 2);
  assert.equal(b.defenses.Dodge, d.defenses.Dodge);
  assert.equal(b.attacks[0].bonus, d.attacks[0].bonus - 2);
  assert.equal(d.defenses.Parry, 8, 'the unmodified numbers are untouched');
  const crane = inStance(d, stanceDef(R, 'Crane'), ch.pl);
  assert.equal(crane.defenses.Dodge, 0);
  assert.equal(crane.defenses.Parry, d.defenses.Parry + 2);
  assert.equal(crane.attacks[0].bonus, d.attacks[0].bonus + 2);
});

test('Avoiding lets Dodge stand in for Parry; Wary adds 4 to initiative; Power raises close damage', () => {
  const ch = fighter();
  const d = deriveAll(ch, R);
  const avoid = inStance(d, stanceDef(R, 'Avoiding'), ch.pl);
  assert.equal(avoid.defenses.Parry, Math.max(d.defenses.Parry, d.defenses.Dodge));
  assert.equal(inStance(d, stanceDef(R, 'Wary'), ch.pl).initiative, d.initiative + 4 - 0);
  const power = inStance(d, stanceDef(R, 'Power'), ch.pl);
  assert.equal(power.attacks[0].rank, d.attacks[0].rank + 2);
  assert.equal(power.initiative, d.initiative - 1);
});

test('kicks and punches are told apart: Kicker helps a kick and hurts a punch', () => {
  const kick = { name: 'Roundhouse Kick', kind: 'close', roll: true };
  const punch = { name: 'Jab', kind: 'close', roll: true };
  const kicker = stanceDef(R, 'Kicker');
  assert.equal(attackMod(kicker, kick), 2);
  assert.equal(attackMod(kicker, punch), -2);
  assert.equal(attackMod(kicker, kick, 'damage'), 2);
  assert.equal(attackMod(stanceDef(R, 'Firing'), { name: 'Bow', kind: 'ranged' }), 1);
});

test('a stance cannot push a total past the power level limit', () => {
  const ch = fighter(4);
  ch.abilities.Fighting = 6; // Dodge + Toughness already at the limit of 8 for PL 4
  const d = deriveAll(ch, R);
  const room = Math.max(0, 2 * ch.pl - d.defenses.Toughness);
  const bob = inStance(d, stanceDef(R, 'Bobbing'), ch.pl);
  assert.equal(bob.defenses.Dodge, Math.min(d.defenses.Dodge + 2, Math.max(d.defenses.Dodge, room)));
});

test('conditions that break a stance: asleep, defenseless, immobile, incapacitated, paralyzed, prone, stunned, vulnerable', () => {
  assert.deepEqual([...DISRUPTING].sort(), ['Asleep', 'Defenseless', 'Immobile', 'Paralyzed', 'Prone', 'Stunned', 'Vulnerable']);
  for (const c of DISRUPTING) {
    const s = { ...playState({}), stance: 'Blocking', conditions: [c] };
    assert.equal(stanceDisrupted(s), true, c);
    assert.equal(currentStance(s), 'Neutral', c);
    assert.equal('stance' in dropBrokenStance({ ...s }), false, c);
  }
  const held = { ...playState({}), stance: 'Blocking', conditions: ['Hindered'] };
  assert.equal(currentStance(held), 'Blocking', 'other conditions do not break it');
  assert.equal(currentStance({ ...held, damage: 'incapacitated' }), 'Neutral');
});

test('damage that incapacitates ends the stance, and so does the end of the scene', () => {
  const s = { ...playState({}), stance: 'Blocking' };
  assert.equal(applyDamage(s, { total: 0, dc: 25 }).state.stance, undefined);
  assert.equal(applyDamage(s, { total: 20, dc: 25 }).state.stance, 'Blocking', 'a bruise does not');
  assert.equal(endScene(s).stance, undefined);
});

test('the stance notes list conditional benefits the numbers cannot show', () => {
  assert.ok(stanceNotes(stanceDef(R, 'Misleading')).some((n) => /Deception/.test(n)));
  assert.deepEqual(stanceNotes(stanceDef(R, 'Neutral')), []);
});
