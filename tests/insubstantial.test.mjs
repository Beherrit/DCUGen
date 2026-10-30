// Insubstantial (Hero's Handbook p103-104, 125) and Variable Descriptor (p133) in the battle engine:
// src/engine/battle/insubstantial.js, insub-turn.js and variable-descriptor.js. Dice are scripted wherever a roll matters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCombatant } from '../src/engine/battle.js';
import { isImmune, halfImmune, expectedValue } from '../src/engine/battle/odds.js';
import { applyEffect } from '../src/engine/battle/attack-effects.js';
import { formsOf, insubLoss } from '../src/engine/battle/insubstantial.js';
import { insubTurn } from '../src/engine/battle/insub-turn.js';
import { grab } from '../src/engine/battle/maneuvers.js';
import { R, power, blast, immunity, char, arena, fighter, attack, dice, target, user, fireDamage } from './helpers/descriptor-kit.mjs';

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

test('the AI turns gaseous against a brawler, stays solid against an energy blaster', () => {
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

test('the AI turns solid again when the foe\'s attacks go through the form anyway and its own need a body', () => {
  const b = arena([char('descr-mind-foe', [blast('Mind Lance', { effect: 'Mental Blast', descriptors: ['psychic'] })])], [char('descr-solidify', [insub(4), blast('Chill Touch', { descriptors: ['cold'], rank: 9 })])]);
  const ghostly = fighter(b, 'B0');
  ghostly.insub = formsOf(ghostly.ch)[0];
  insubTurn(b, ghostly, [fighter(b, 'A0')]);
  assert.equal(ghostly.insub, null, 'nothing is gained by staying incorporeal against a mind attack, and the touch cannot land');
  assert.match(b.log.at(-1).text, /Beta0 turns solid again/);
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
