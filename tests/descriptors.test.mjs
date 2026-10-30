// Descriptors and Immunity in the battle engine (Hero's Handbook p102-104, 125): src/engine/battle/descriptors.js and
// immunity.js. Dice are scripted wherever a roll matters; most checks read the immunity and the log lines, which need no dice at all.
// Insubstantial and Variable Descriptor are in insubstantial.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCombatant, areaVictims } from '../src/engine/battle.js';
import { isImmune, halfImmune } from '../src/engine/battle/odds.js';
import { applyEffect } from '../src/engine/battle/attack-effects.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { rollToHit } from '../src/engine/battle/attack-roll.js';
import { describeImmunities, critImmune } from '../src/engine/battle/immunity.js';
import { demoralize, canDemoralize } from '../src/engine/battle/support-actions.js';
import { grab } from '../src/engine/battle/maneuvers.js';
import { R, power, blast, immunity, char, arena, fighter, attack, dice, target, user, fireDamage } from './helpers/descriptor-kit.mjs';

const fireAffliction = () => attack(user([blast('Fire Snare', { effect: 'Affliction', detail: 'Resisted by Dodge; Hindered, Immobile, Paralyzed', descriptors: ['fire'] })]), 'Fire Snare');

// ---- descriptors -----------------------------------------------------------------------------------------------

test('a power without descriptors gets them from its name; fire and cold are energy, a sword is physical', () => {
  const c = user([blast('Fire Blast'), blast('Frost Bolt'), blast('Sword Strike', { range: 'Close' }), blast('Mystic Bolt'), blast('Searing Ray')]);
  const d = (name) => attack(c, name).descriptors;
  assert.deepEqual(['fire', 'energy'].filter((x) => !d('Fire Blast').includes(x)), []);
  assert.ok(!d('Fire Blast').includes('physical'));
  assert.ok(d('Frost Bolt').includes('cold') && d('Frost Bolt').includes('energy'));
  assert.ok(d('Sword Strike').includes('slashing') && d('Sword Strike').includes('physical'));
  assert.ok(d('Mystic Bolt').includes('magic') && !d('Mystic Bolt').includes('energy'), 'magic is neither physical nor energy');
  assert.ok(d('Searing Ray').includes('heat'));
});

test('a stated descriptor is kept and its synonyms are read as the same word', () => {
  const c = user([blast('Zap', { descriptors: ['Lightning'] }), blast('Hex', { descriptors: ['mystic'] })]);
  assert.ok(attack(c, 'Zap').descriptors.includes('electricity'));
  assert.ok(attack(c, 'Hex').descriptors.includes('magic'));
  assert.ok(!attack(c, 'Zap').descriptors.includes('fire'), 'the name is not read when the power states a descriptor');
});

test('equipment weapons: a blaster is energy, a club is bludgeoning, a pistol is ballistic', () => {
  const ch = char('descr-gear', []);
  ch.equipment = [
    { name: 'Blaster rifle', category: 'Energy Weapon', attack: { kind: 'ranged', rank: 6, strengthBased: false, crit: 20 } },
    { name: 'Club', category: 'Simple Melee Weapon', attack: { kind: 'close', rank: 2, strengthBased: true, crit: 20 } },
    { name: 'Pistol', category: 'Projectile Weapon', attack: { kind: 'ranged', rank: 4, strengthBased: false, crit: 20 } },
  ];
  const c = makeCombatant(R, ch, { team: 'A' });
  assert.ok(attack(c, 'Blaster rifle').descriptors.includes('energy') && !attack(c, 'Blaster rifle').descriptors.includes('physical'));
  assert.ok(attack(c, 'Club').descriptors.includes('bludgeoning') && attack(c, 'Club').descriptors.includes('weapon'));
  assert.ok(attack(c, 'Pistol').descriptors.includes('ballistic') && attack(c, 'Pistol').descriptors.includes('physical'));
});

test('the character power source goes on every power: a magician\'s untagged spell is magic, a device is technology', () => {
  const ch = char('descr-mage', [blast('Bolt'), blast('Bind', { effect: 'Affliction', detail: 'Resisted by Dodge; Hindered, Immobile, Paralyzed' })], { theme: { id: 'magic', name: 'Magic' } });
  const c = makeCombatant(R, ch, { team: 'A' });
  assert.ok(attack(c, 'Bolt').descriptors.includes('magic'));
  assert.ok(attack(c, 'Bind').descriptors.includes('magic'));
  assert.ok(!attack(c, 'Unarmed').descriptors.includes('magic'), 'fists are not spells');
  const tech = char('descr-tech', []);
  tech.devices = [{ name: 'Gauntlet', kind: 'easily', powers: [blast('Pulse')] }];
  assert.ok(attack(makeCombatant(R, tech, { team: 'A' }), 'Pulse').descriptors.includes('technology'));
  const optional = char('descr-own-field', [blast('Smite')], { descriptors: ['divine', 'magic'] });
  assert.ok(attack(makeCombatant(R, optional, { team: 'A' }), 'Smite').descriptors.includes('magic'), 'the optional character descriptors list is read');
});

test('an alternate effect without descriptors takes its array\'s; one with its own keeps them', () => {
  const alt = (name, descriptors) => blast(name, { descriptors });
  const ch = char('descr-array', [blast('Elemental Blast', { descriptors: ['cold'], alternates: [alt('Ice Wall Burst', []), alt('Ember', ['fire'])] })]);
  const c = makeCombatant(R, ch, { team: 'A' });
  assert.ok(attack(c, 'Ice Wall Burst').descriptors.includes('cold'));
  assert.ok(attack(c, 'Ember').descriptors.includes('fire') && !attack(c, 'Ember').descriptors.includes('cold'));
});

// ---- Immunity breadth (DCA 102-103) ------------------------------------------------------------------------------


test('Immunity to "fire damage" stops fire Damage and not a fire Affliction; "fire effects" stops both', () => {
  const dmg = target([immunity('Fire damage', 5)]);
  assert.match(isImmune(dmg, fireDamage()), /immune to fire damage/);
  assert.equal(isImmune(dmg, fireAffliction()), null);
  const all = target([immunity('Fire effects', 10)]);
  assert.match(isImmune(all, fireDamage()), /immune to fire effects/);
  assert.match(isImmune(all, fireAffliction()), /immune to fire effects/);
});

test('a bare common descriptor is read by its ranks: 1 is the environment only, 5 is Damage, 10 is every effect', () => {
  assert.equal(isImmune(target([immunity('fire', 1)]), fireDamage()), null);
  assert.match(isImmune(target([immunity('fire', 5)]), fireDamage()), /fire/);
  assert.equal(isImmune(target([immunity('fire', 5)]), fireAffliction()), null);
  assert.ok(isImmune(target([immunity('fire', 10)]), fireAffliction()));
  const env = target([immunity('Drowning, cold and high pressure', 3)]);
  assert.equal(isImmune(env, attack(user([blast('Ice Beam')]), 'Ice Beam')), null, 'one rank of cold is the cold environment, not cold attacks');
  assert.ok(describeImmunities(env).some((t) => /cold.*environment only/.test(t)));
});

test('the log names the immunity and the descriptor that matched', () => {
  const b = arena([char('descr-a', [blast('Fire Blast')])], [char('descr-b', [immunity('Fire damage', 5)])]);
  const a = fighter(b, 'A0'); const t = fighter(b, 'B0');
  const out = applyEffect(b, R, a, attack(a, 'Fire Blast'), t, dice(), {});
  assert.equal(out.landed, false);
  assert.match(b.log.at(-1).text, /Fire Blast: Beta0 is immune to fire damage \(the attack is fire\): no effect\./);
});

test('Immunity to physical damage, energy damage, and the half-effect flaw', () => {
  const phys = target([immunity('Physical damage', 20)]);
  const fists = attack(user([]), 'Unarmed');
  assert.match(isImmune(phys, fists), /physical damage/);
  assert.equal(isImmune(phys, fireDamage()), null);
  const energy = target([immunity('Energy damage', 20)]);
  assert.ok(isImmune(energy, fireDamage()));
  assert.equal(isImmune(energy, fists), null);
  const half = target([immunity('Fire damage', 5, [{ name: 'Limited to Half Effect' }])]);
  assert.equal(isImmune(half, fireDamage()), null);
  assert.match(halfImmune(half, fireDamage()), /fire damage/);
});

test('all effects resisted by Fortitude or Will, and by Toughness', () => {
  const fort = target([immunity('All effects resisted by Fortitude', 30)]);
  assert.ok(isImmune(fort, attack(user([blast('Toxin', { effect: 'Affliction', detail: 'Resisted by Fortitude; Dazed, Stunned, Incapacitated', descriptors: ['poison'] })]), 'Toxin')));
  assert.equal(isImmune(fort, fireDamage()), null);
  const tough = target([immunity('All effects resisted by Toughness', 80)]);
  assert.ok(isImmune(tough, fireDamage()));
  assert.ok(isImmune(tough, attack(user([]), 'Unarmed')));
});

test('life support stops poison, disease and suffocation but not a radiation blast', () => {
  const t = target([immunity('Life Support', 10)]);
  assert.ok(isImmune(t, attack(user([blast('Venom Spit', { effect: 'Affliction', detail: 'Resisted by Fortitude; Dazed, Stunned, Incapacitated', descriptors: ['poison'] })]), 'Venom Spit')));
  assert.ok(isImmune(t, attack(user([blast('Choke', { effect: 'Suffocation', range: 'Ranged' })]), 'Choke')));
  assert.equal(isImmune(t, attack(user([blast('Gamma Blast')]), 'Gamma Blast')), null);
});

test('sleep, fear, entrapment, fatigue, dazzle and alteration immunities stop their own effects', () => {
  const afflict = (name, detail, over = {}) => attack(user([blast(name, { effect: 'Affliction', detail, ...over })]), name);
  const sleepy = afflict('Lullaby', 'Resisted by Will; Fatigued, Exhausted, Asleep');
  assert.ok(isImmune(target([immunity('Sleep effects', 5)]), sleepy));
  assert.ok(isImmune(target([immunity('Fatigue effects', 5)]), sleepy));
  assert.equal(isImmune(target([immunity('Fire effects', 10)]), sleepy), null);
  const net = afflict('Net', 'Resisted by Dodge; Hindered and Vulnerable, Defenseless and Immobile');
  assert.ok(isImmune(target([immunity('Entrapment', 5)]), net));
  assert.ok(isImmune(target([immunity('Snares and bonds', 5)]), attack(user([blast('Webbing', { effect: 'Snare' })]), 'Webbing')));
  const flash = attack(user([blast('Flash', { effect: 'Dazzle', detail: 'Resisted by Dodge; Visually Impaired' })]), 'Flash');
  assert.ok(isImmune(target([immunity('Dazzle effects', 5)]), flash));
  assert.ok(isImmune(target([immunity('Visual effects', 5)]), flash));
  assert.equal(isImmune(target([immunity('Hearing', 5)]), flash), null, 'a sight dazzle does not touch a deaf-proof ear');
  const change = afflict('Hex of Frogs', 'Resisted by Fortitude; Dazed, Transformed, Incapacitated');
  assert.ok(isImmune(target([immunity('Alteration effects', 5)]), change));
  const scare = attack(user([blast('Dread', { effect: 'Affliction', detail: 'Resisted by Will; Impaired, Disabled, Incapacitated (terror)' })]), 'Dread');
  assert.equal(scare.fear, true);
  assert.ok(isImmune(target([immunity('Fear', 5)]), scare));
  assert.ok(isImmune(target([immunity('Emotion effects', 5)]), scare));
  assert.equal(makeCombatant(R, char('descr-fearless', [immunity('Fear', 5)]), { team: 'B' }).adv.Fearless > 0, true, 'immunity to fear is Fearless');
});

test('a magic immunity stops a magician\'s power that carries no descriptor of its own', () => {
  const mage = char('descr-magic-user', [blast('Bolt')], { theme: { id: 'magic', name: 'Magic' } });
  const bolt = attack(makeCombatant(R, mage, { team: 'A' }), 'Bolt');
  assert.match(isImmune(target([immunity('Magic damage', 5)]), bolt), /magic damage/);
  assert.match(isImmune(target([immunity('Magic', 10)]), bolt), /magic/);
  assert.equal(isImmune(target([immunity('Magic damage', 5)]), attack(user([blast('Bolt')]), 'Bolt')), null, 'the same untagged power from a non-magician is not magic');
});

test('"your own powers" (1 rank) stops effects that share a descriptor with the fighter\'s own powers', () => {
  const kin = target([blast('Kryptonian Heat', { descriptors: ['heat'] }), immunity('own powers', 1)]);
  assert.ok(isImmune(kin, attack(user([blast('Heat Vision', { descriptors: ['heat'] })]), 'Heat Vision')));
  assert.equal(isImmune(kin, attack(user([blast('Ice Beam', { descriptors: ['cold'] })]), 'Ice Beam')), null);
});

test('an attacker is never in its own area, and an ally with "own powers" immunity ignores the burst', () => {
  const burstPower = blast('Fire Burst', { descriptors: ['fire'], extras: [{ name: 'Area', option: 'Burst' }], range: 'Ranged' });
  const b = arena([char('descr-area-a', [burstPower]), char('descr-area-b', [blast('Torch', { descriptors: ['fire'] }), immunity('own powers', 1)])], [char('descr-area-c', [blast('Zap')])]);
  const [a, ally, foe] = ['A0', 'A1', 'B0'].map((id) => fighter(b, id));
  for (const f of [a, ally, foe]) { f.x = 5; f.y = 5; }
  const burst = attack(a, 'Fire Burst');
  assert.ok(burst.area, 'the burst is an area attack');
  assert.ok(!areaVictims(b, a, burst, foe).includes(a), 'the attacker is not caught in its own area');
  resolveAttack(b, R, a, burst, foe, dice(15, 15, 15, 15, 15, 15, 15, 15, 15, 15), {});
  assert.equal(a.bruises, 0);
  assert.ok(b.log.some((e) => /Fire Burst: Alpha1 is immune to its own powers/.test(e.text)), b.log.map((e) => e.text).join('\n'));
  assert.equal(ally.bruises, 0);
});

test('Immunity with Reflect sends the stopped attack back with its own attack check; with Redirect it goes at another enemy', () => {
  const reflecting = (extras) => power({ name: 'Mirror Ward', effect: 'Immunity', rank: 5, detail: 'Fire damage', role: 'defense', extras });
  const b = arena([char('descr-ref-a', [blast('Fire Blast')])], [char('descr-ref-b', [reflecting([{ name: 'Reflect' }])])]);
  const a = fighter(b, 'A0'); const t = fighter(b, 'B0');
  applyEffect(b, R, a, attack(a, 'Fire Blast'), t, dice(20, 1, 1, 1), {});
  const text = b.log.map((e) => e.text);
  assert.ok(text.some((x) => /Fire Blast: Beta0 is immune to fire damage/.test(x)));
  assert.ok(text.some((x) => /Beta0 reflects the attack back at Alpha0/.test(x)), text.join('\n'));
  assert.ok(text.some((x) => /Alpha0 resists with Toughness/.test(x)), 'the reflected blast hit the attacker');
  const plain = arena([char('descr-ref-c', [blast('Fire Blast')])], [char('descr-ref-d', [immunity('Fire damage', 5)])]);
  applyEffect(plain, R, fighter(plain, 'A0'), attack(fighter(plain, 'A0'), 'Fire Blast'), fighter(plain, 'B0'), dice(), {});
  assert.ok(!plain.log.some((e) => /reflects/.test(e.text)), 'without the extra nothing is sent back');
  const two = arena([char('descr-ref-e', [blast('Fire Blast')]), char('descr-ref-g', [])], [char('descr-ref-f', [reflecting([{ name: 'Reflect' }, { name: 'Redirect' }])])]);
  const [a2, mate, t2] = ['A0', 'A1', 'B0'].map((id) => fighter(two, id));
  [a2, mate, t2].forEach((f, k) => { f.x = 5 + k; f.y = 5; });
  applyEffect(two, R, a2, attack(a2, 'Fire Blast'), t2, dice(20, 1, 1, 1), {});
  const sent = two.log.find((e) => /Beta0 reflects the attack/.test(e.text));
  assert.ok(sent, two.log.map((e) => e.text).join('\n'));
  assert.match(sent.text, /Beta0 reflects the attack (back at Alpha0|at Alpha1)\./, 'Redirect may send it at either enemy');
});

test('critical hits: immunity turns a critical into a normal hit and says so', () => {
  const b = arena([char('descr-crit-a', [])], [char('descr-crit-b', []), char('descr-crit-c', [immunity('Critical hits', 2)])]);
  const a = fighter(b, 'A0'); const plain = fighter(b, 'B0'); const immune = fighter(b, 'B1');
  a.attacks.find((x) => x.unarmed).bonus = 30;
  const m = { trade: 0, allOut: 0, defensive: 0, charge: false };
  const fists = a.attacks.find((x) => x.unarmed);
  assert.equal(rollToHit(b, a, fists, plain, dice(20), m, 0, []).crit, true, 'control: a natural 20 is a critical');
  const r = rollToHit(b, a, fists, immune, dice(20), m, 0, []);
  assert.deepEqual([r.hit, r.crit], [true, false]);
  assert.match(r.text, /immune to critical hits: a normal hit/);
  assert.ok(critImmune(immune) && !critImmune(plain));
});

test('interaction skills: Demoralize and feints fail against an immune target, and the AI does not try', () => {
  const b = arena([char('descr-int-a', [])], [char('descr-int-b', [immunity('Interaction skills', 5)])]);
  const a = fighter(b, 'A0'); const t = fighter(b, 'B0');
  assert.equal(canDemoralize(t), false);
  assert.equal(demoralize(b, a, t, dice()), 0, 'no dice are rolled');
  assert.match(b.log.at(-1).text, /Alpha0 tries to demoralize Beta0, but Beta0 is immune to interaction skills/);
});

test('entrapment: an immune fighter cannot be grabbed, and says why', () => {
  const b = arena([char('descr-grab-a', [])], [char('descr-grab-b', [immunity('Entrapment', 5)])]);
  const a = fighter(b, 'A0'); const t = fighter(b, 'B0');
  grab(b, R, a, t, dice(), { free: true });
  assert.equal(t.grabbedBy, null);
  assert.match(b.log.at(-1).text, /immune to entrapment: no hold/);
});

test('mind reading and need for sleep are not attacks and stop nothing; they still show in the Battle Room', () => {
  const t = target([immunity('Need for sleep, starvation and thirst', 3)]);
  assert.equal(isImmune(t, fireDamage()), null);
  assert.equal(isImmune(t, attack(user([blast('Lullaby', { effect: 'Affliction', detail: 'Resisted by Will; Fatigued, Exhausted, Asleep' })]), 'Lullaby')), null);
  assert.ok(describeImmunities(t).length >= 1);
});

