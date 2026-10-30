// Descriptors, Immunity, Insubstantial and Variable Descriptor in the battle engine (Hero's Handbook p102-104, 125, 133):
// src/engine/battle/descriptors.js, immunity.js, insubstantial.js, insub-turn.js, variable-descriptor.js. Dice are scripted
// wherever a roll matters; most checks read the immunity and the log lines, which need no dice at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { createBattle, addCombatant, makeCombatant, startBattle, areaVictims } from '../src/engine/battle.js';
import { isImmune, halfImmune, expectedValue } from '../src/engine/battle/odds.js';
import { applyEffect } from '../src/engine/battle/attack-effects.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { rollToHit } from '../src/engine/battle/attack-roll.js';
import { describeImmunities, critImmune } from '../src/engine/battle/immunity.js';
import { formsOf, insubLoss } from '../src/engine/battle/insubstantial.js';
import { insubTurn } from '../src/engine/battle/insub-turn.js';
import { demoralize, canDemoralize } from '../src/engine/battle/support-actions.js';
import { grab } from '../src/engine/battle/maneuvers.js';

let n = 0;
const power = (over) => ({ id: `p${n++}`, extras: [], flaws: [], alternates: [], descriptors: [], role: 'attack', ...over });
const blast = (name, over = {}) => power({ name, effect: 'Damage', rank: 8, range: 'Ranged', ...over });
const immunity = (detail, rank, flaws = []) => power({ name: 'Immune', effect: 'Immunity', rank, detail, role: 'defense', flaws });
/** A paragon with its powers replaced by the given ones (and no gear or devices unless given). */
function char(seed, powers, over = {}) {
  const ch = generateCharacter(R, { seed, archetype: 'paragon', pl: 10 });
  ch.theme = { id: 'plain', name: 'Plain' }; ch.powers = powers; ch.devices = []; ch.equipment = []; ch.advantages = ch.advantages.filter((a) => !/Improved Critical|Fearless/.test(a.name));
  return Object.assign(ch, over);
}
function arena(A, B) {
  const b = createBattle({ seed: 'descr' });
  A.forEach((ch, k) => addCombatant(b, makeCombatant(R, ch, { id: `A${k}`, team: 'A', name: `Alpha${k}` })));
  B.forEach((ch, k) => addCombatant(b, makeCombatant(R, ch, { id: `B${k}`, team: 'B', name: `Beta${k}` })));
  startBattle(b, R);
  b.log.length = 0;
  return b;
}
const fighter = (b, id) => b.combatants.find((c) => c.id === id);
const attack = (c, name) => c.attacks.find((a) => a.name === name);
const dice = (...rolls) => ({ int: () => { assert.ok(rolls.length, 'the engine asked for more dice than the test gave'); return rolls.shift(); }, next: () => 0.5, chance: () => false, pick: (a) => a[0], weighted: (a) => a[0], left: () => rolls.length });
const target = (powers, over) => makeCombatant(R, char('descr-target', powers, over), { id: 'T', team: 'B', name: 'Target' });
const user = (powers, over) => makeCombatant(R, char('descr-user', powers, over), { id: 'U', team: 'A', name: 'User' });

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

const fireDamage = () => attack(user([blast('Fire Blast')]), 'Fire Blast');
const fireAffliction = () => attack(user([blast('Fire Snare', { effect: 'Affliction', detail: 'Resisted by Dodge; Hindered, Immobile, Paralyzed', descriptors: ['fire'] })]), 'Fire Snare');

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

// ---- Insubstantial (DCA 103-104, 125) ------------------------------------------------------------------------------

const insub = (rank, extras = [], detail = '', descriptors = []) => power({ name: `Form ${rank}`, effect: 'Insubstantial', rank, role: 'defense', extras, detail, descriptors });
function ghost(rank, over = {}) {
  const c = makeCombatant(R, char(`descr-ghost-${rank}`, [insub(rank), ...(over.powers || [])]), { id: 'G', team: 'B', name: 'Ghost' });
  c.insub = formsOf(c.ch)[0];
  return c;
}
const area = (name, descriptors) => attack(user([blast(name, { descriptors, extras: [{ name: 'Area', option: 'Burst' }] })]), name);

test('Insubstantial rank 1 has no immunity; rank 2 is immune to physical damage but not energy or area attacks', () => {
  const fists = attack(user([]), 'Unarmed');
  assert.equal(isImmune(ghost(1), fists), null);
  const gas = ghost(2);
  assert.match(isImmune(gas, fists), /physical damage \(gaseous form\)/);
  assert.equal(isImmune(gas, fireDamage()), null, 'energy still hurts a gas');
  assert.equal(isImmune(gas, area('Shrapnel Blast', ['bludgeoning'])), null, 'area attacks still affect a gaseous form');
});

test('Insubstantial rank 3 is immune to physical damage and to its own energy; rank 4 to physical and energy damage', () => {
  const fists = attack(user([]), 'Unarmed');
  const flame = makeCombatant(R, char('descr-flame', [insub(3, [], '', ['fire'])]), { team: 'B' });
  flame.insub = formsOf(flame.ch)[0];
  assert.ok(isImmune(flame, fists));
  assert.ok(isImmune(flame, fireDamage()), 'a fire body is immune to fire');
  assert.equal(isImmune(flame, attack(user([blast('Ice Beam')]), 'Ice Beam')), null, 'other energy hurts normally');
  const phantom = ghost(4);
  assert.ok(isImmune(phantom, fists) && isImmune(phantom, fireDamage()) && isImmune(phantom, attack(user([blast('Ice Beam')]), 'Ice Beam')));
  assert.equal(isImmune(phantom, attack(user([blast('Mind Lance', { effect: 'Mental Blast', descriptors: ['psychic'] })]), 'Mind Lance')), null, 'Will effects work on a ghost');
  assert.equal(isImmune(phantom, attack(user([blast('Hex', { descriptors: ['magic'] })]), 'Hex')), null, 'magic is neither physical nor energy');
  const chosen = ghost(4);
  chosen.insub = { ...chosen.insub, works: ['cold'] };
  assert.equal(isImmune(chosen, attack(user([blast('Ice Beam')]), 'Ice Beam')), null, 'the one other effect the power names works on the ghost');
});

test('Affects Insubstantial: rank 1 lands at half rank, rank 2 at full rank, against a form that would stop it', () => {
  const phantom = ghost(4);
  const withExtra = (opt) => attack(user([blast('Ghost Fire', { descriptors: ['fire'], extras: [{ name: 'Affects Insubstantial', option: opt }] })]), 'Ghost Fire');
  assert.equal(isImmune(phantom, withExtra('Half rank')), null);
  assert.match(halfImmune(phantom, withExtra('Half rank')), /half rank/);
  assert.equal(isImmune(phantom, withExtra('Full rank')), null);
  assert.equal(halfImmune(phantom, withExtra('Full rank')), null);
  const b = arena([char('descr-ai-a', [blast('Ghost Fire', { descriptors: ['fire'], extras: [{ name: 'Affects Insubstantial', option: 'Half rank' }] })])], [char('descr-ai-b', [insub(4)])]);
  const a = fighter(b, 'A0'); const t = fighter(b, 'B0');
  t.insub = formsOf(t.ch)[0];
  applyEffect(b, R, a, attack(a, 'Ghost Fire'), t, dice(10), {});
  assert.ok(b.log.some((e) => /partly immune to physical and energy damage .*half effect\): rank 4/.test(e.text)), b.log.map((e) => e.text).join('\n'));
});

test('an incorporeal attacker cannot affect the physical world unless the effect has Affects Corporeal (rank = the extra, up to full)', () => {
  const b = arena([char('descr-inc-a', [insub(4), blast('Chill Touch', { descriptors: ['cold'], rank: 8 }), blast('Dread Grip', { descriptors: ['cold'], rank: 8, extras: [{ name: 'Affects Corporeal', steps: 3 }] })])], [char('descr-inc-b', [])]);
  const a = fighter(b, 'A0'); const t = fighter(b, 'B0');
  a.insub = formsOf(a.ch)[0];
  const plain = applyEffect(b, R, a, attack(a, 'Chill Touch'), t, dice(), {});
  assert.equal(plain.landed, false);
  assert.match(b.log.at(-1).text, /Chill Touch: Alpha0 is incorporeal \(Insubstantial 4\) and cannot affect the physical world with it/);
  assert.equal(expectedValue(a, attack(a, 'Chill Touch'), t), 0);
  assert.ok(expectedValue(a, attack(a, 'Dread Grip'), t) > 0);
  applyEffect(b, R, a, attack(a, 'Dread Grip'), t, dice(1), {});
  assert.ok(b.log.some((e) => /Beta0 resists with Toughness: d20 1 .* vs DC 18/.test(e.text)), 'rank 3 from the extra: DC 15 + 3');
  a.insub = null;
  assert.ok(expectedValue(a, attack(a, 'Chill Touch'), t) > 0, 'solid again, it works');
});

test('a form of rank 2 or more has no Strength: fists lose the Strength part of their rank, fluid keeps it', () => {
  const fists = (c) => attack(c, 'Unarmed');
  const gas = ghost(2); const s = gas.d.abilities.Strength;
  assert.ok(s > 0, 'the test fighter is strong');
  assert.equal(insubLoss(gas, fists(gas)), Math.min(fists(gas).rank, s));
  assert.equal(insubLoss(ghost(1), fists(ghost(1))), 0, 'rank 1 keeps its normal Strength');
  gas.insub = null;
  assert.equal(insubLoss(gas, fists(gas)), 0, 'solid again');
});

test('the AI turns gaseous against a brawler, stays solid against an energy blaster, and is back solid to use its own fists', () => {
  const brawl = () => char('descr-brawl', []);
  const b = arena([brawl()], [char('descr-ghostly', [insub(2), blast('Spirit Bolt', { descriptors: ['psychic'], effect: 'Mental Blast' })])]);
  const ghostly = fighter(b, 'B0');
  ghostly.x = 4; ghostly.y = 4; fighter(b, 'A0').x = 5; fighter(b, 'A0').y = 4;
  insubTurn(b, ghostly, [fighter(b, 'A0')]);
  assert.ok(ghostly.insub, 'it turns insubstantial');
  assert.match(b.log.at(-1).text, /Beta0 turns gaseous \(Insubstantial 2\): physical damage/);
  const b2 = arena([char('descr-fire', [blast('Fire Blast')])], [char('descr-ghostly2', [insub(2), blast('Spirit Bolt', { descriptors: ['psychic'], effect: 'Mental Blast' })])]);
  const g2 = fighter(b2, 'B0');
  insubTurn(b2, g2, [fighter(b2, 'A0')]);
  assert.equal(g2.insub, null, 'a form that does not stop fire is no help against a fire blaster');
});

test('a fluid form flows out of a hold and cannot be grabbed again', () => {
  const b = arena([char('descr-holder', [])], [char('descr-fluid', [insub(1)])]);
  const holder = fighter(b, 'A0'); const fluid = fighter(b, 'B0');
  grab(b, R, holder, fluid, dice(1, 1, 1), { free: true });
  assert.ok(fluid.grabbedBy, 'held while solid');
  insubTurn(b, fluid, [holder]);
  assert.equal(fluid.grabbedBy, null);
  assert.equal(holder.holding, null);
  assert.match(b.log.at(-1).text, /Beta0 flows out of Alpha0's grip in fluid \(Insubstantial 1\)/);
  grab(b, R, holder, fluid, dice(), { free: true });
  assert.match(b.log.at(-1).text, /flows out of any hold/);
});

// ---- Variable Descriptor (DCA 133) ---------------------------------------------------------------------------------

const varBlast = (size, over = {}) => blast('Elemental Blast', { descriptors: ['fire'], extras: [{ name: 'Variable Descriptor', option: size }], ...over });

test('Variable Descriptor: against a fire-immune target the blast is used as another descriptor and the log says so', () => {
  const b = arena([char('descr-var-a', [varBlast('Closely related group')])], [char('descr-var-b', [immunity('Fire effects', 10)])]);
  const a = fighter(b, 'A0'); const t = fighter(b, 'B0');
  const atk = attack(a, 'Elemental Blast');
  assert.equal(atk.variable, 1);
  assert.ok(expectedValue(a, atk, t) > 0, 'the AI sees it can still hurt');
  const out = applyEffect(b, R, a, atk, t, dice(1, 1, 1, 1), {});
  assert.ok(out.landed !== undefined);
  const note = b.log.find((e) => /Variable Descriptor/.test(e.text));
  assert.ok(note, b.log.map((e) => e.text).join('\n'));
  assert.match(note.text, /Elemental Blast: Alpha0 changes its descriptor from fire to \w+ \(Variable Descriptor\), because Beta0 is immune to fire effects/);
  assert.ok(b.log.some((e) => /resists with Toughness/.test(e.text)), 'the damage was rolled');
  const fixed = char('descr-var-fixed', [blast('Fire Blast')]);
  const f = makeCombatant(R, fixed, { team: 'A' });
  assert.equal(expectedValue(f, attack(f, 'Fire Blast'), t), 0, 'control: the same blast without the extra does nothing');
});

test('Variable Descriptor rank 1 stays in its group; rank 2 reaches the broad group', () => {
  const allTemp = [immunity('Fire effects', 10), immunity('Heat effects', 10), immunity('Cold effects', 10)];
  const near = user([varBlast('Closely related group')]);
  const far = user([varBlast('Broad group')]);
  const t = target(allTemp);
  assert.equal(expectedValue(near, attack(near, 'Elemental Blast'), t), 0, 'every temperature descriptor is blocked');
  assert.ok(expectedValue(far, attack(far, 'Elemental Blast'), t) > 0, 'a broad group reaches electricity or light');
  assert.equal(attack(far, 'Elemental Blast').variable, 2);
});
