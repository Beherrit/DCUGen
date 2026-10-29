import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle, rebuildCombatant, serializeBattle, reviveBattle } from '../src/engine/battle.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { takeTurn } from '../src/engine/battle/turn.js';
import { trip } from '../src/engine/battle/trip.js';
import { disarm } from '../src/engine/battle/disarm.js';
import { smash } from '../src/engine/battle/smash.js';
import { itemsOf } from '../src/engine/battle/items.js';
import { makeProne } from '../src/engine/battle/prone.js';
import { deviceCost } from '../src/engine/costs.js';
import { makeRng } from '../src/engine/rng.js';

// Hero's Handbook p176-178 (Trip, Disarm, Smash, Finishing Attack) and p75-77 (the Improved advantages).
// Scripted dice: d20 values are handed out in the order the engine asks, so every degree is exact. A fighter has
// Fighting 6, Parry 12 (DC 22), Strength 4, so an unarmed bonus of +6 and a maneuver bonus of +4 at -2.
const dice = (...rolls) => ({ left: () => rolls.length, int: () => { if (!rolls.length) throw new Error('out of dice'); return rolls.shift(); }, next: () => 0.5, chance: () => true, pick: (a) => a[0] });
const mk = (name, o = {}) => ({
  name, pl: 10, identity: { codename: name },
  abilities: { Strength: 4, Stamina: 4, Agility: 2, Dexterity: 3, Fighting: 6, Intellect: 0, Awareness: 0, Presence: 0, ...(o.abilities || {}) },
  defenses: { Dodge: 4, Parry: 6, Fortitude: 5, Will: 3, Toughness: 0, ...(o.defenses || {}) },
  skills: [], advantages: o.advantages || [], powers: o.powers || [], equipment: o.equipment || [], devices: o.devices || [],
});
const spear = { name: 'Spear', cost: 4, effect: 'Damage 3', attack: { kind: 'close', rank: 3, strengthBased: true, crit: 19 } };
const gun = { name: 'Revolver', cost: 4, effect: 'Damage 8', attack: { kind: 'ranged', rank: 8, crit: 20 } };
const bow = { name: 'Bow', cost: 4, effect: 'Damage 8', attack: { kind: 'ranged', rank: 8, crit: 20 } };
const blast = (rank) => ({ name: 'Blast', effect: 'Damage', rank, range: 'Ranged', role: 'attack', extras: [], flaws: [] });

function fight(a, t, o = {}) {
  const b = createBattle({ seed: 'maneuvers', name: 'm' });
  addCombatant(b, makeCombatant(R, a, { id: 'A0', team: 'A', style: o.styleA || 'brawler' }));
  addCombatant(b, makeCombatant(R, t, { id: 'B0', team: 'B', style: o.styleB || 'brawler' }));
  startBattle(b, R); b.log.length = 0;
  const [c, d] = b.combatants;
  c.heroPoints = 0; d.heroPoints = 0; c.x = 3; c.y = 5; d.x = 3; d.y = 5;
  return { b, c, t: d };
}
const prone = (x) => x.conditions.some((k) => k.name === 'Prone');
const names = (x) => x.attacks.map((a) => a.name);
const unarmed = (c) => c.attacks.find((a) => a.unarmed);
const setSkills = (x, acro, athl) => { x.skills.Acrobatics = acro; x.skills.Athletics = athl; };

// ---- Trip ---------------------------------------------------------------------------------------------------------

test('trip: the attack is made at -2 against Parry (hits on 18, misses on 17), and a miss ends it', () => {
  const run = (roll, adv = []) => { const f = fight(mk('T', { advantages: adv }), mk('X')); setSkills(f.c, 20, 20); trip(f.b, f.c, f.t, dice(roll, 20, 1)); return f; };
  assert.equal(run(18).b.log[0].dice[0].mod, 4, 'Fighting +6 less 2');
  assert.ok(prone(run(18).t), '18 + 4 = 22 meets Parry DC 22');
  const miss = run(17);
  assert.equal(miss.b.log[0].kind, 'miss');
  assert.ok(!prone(miss.t) && !prone(miss.c), '17 + 4 = 21 misses; nobody falls and no opposed check follows');
  assert.equal(miss.b.log.length, 1);
  assert.ok(prone(run(16, [{ name: 'Improved Trip' }]).t), 'Improved Trip has no -2: 16 + 6 = 22');
});

test('trip: opposed check uses the better of Acrobatics and Athletics on each side; a win puts the target prone', () => {
  const duel = (mine, theirs, r1, r2) => { const f = fight(mk('T'), mk('X')); setSkills(f.c, mine[0], mine[1]); setSkills(f.t, theirs[0], theirs[1]); trip(f.b, f.c, f.t, dice(20, r1, r2, 1, 20)); return f; };
  const win = duel([10, 0], [0, 9], 10, 10); // Acrobatics 10 beats the target's Athletics 9 only if each side takes its best
  assert.ok(prone(win.t) && !prone(win.c));
  assert.equal(win.t.conditions.find((k) => k.name === 'Prone').source, 'trip');
  assert.match(win.b.log[0].text, /Acrobatics or Athletics d20 10 \+10 = 20 against d20 10 \+9 = 19/);
  assert.ok(!prone(duel([10, 0], [0, 9], 5, 10).t), 'the target uses its better skill (9), so 15 loses to 19');
  assert.ok(prone(duel([10, 0], [0, 9], 9, 10).t), 'a tie in the totals goes to the higher bonus: the tripper has 10 against 9');
  assert.ok(!prone(duel([9, 0], [0, 10], 10, 9).t), 'and to the defender when the defender has the higher bonus');
});

test('trip: a lost opposed check lets the target try to trip the attacker back; a failed counter ends it', () => {
  const run = (back1, back2) => { const f = fight(mk('T'), mk('X')); setSkills(f.c, 2, 2); setSkills(f.t, 9, 9); trip(f.b, f.c, f.t, dice(20, 3, 18, back1, back2)); return f; };
  const f = run(17, 4);
  assert.ok(prone(f.c) && !prone(f.t), 'counter 17 + 9 = 26 against 4 + 2 = 6');
  assert.equal(f.b.log.length, 2);
  assert.match(f.b.log[1].text, /counter-trip.*26 against d20 4 \+2 = 6.*PRONE/);
  const g = run(1, 20);
  assert.ok(!prone(g.c) && !prone(g.t), 'counter 1 + 9 = 10 against 20 + 2 loses');
});

test('Improved Trip: no -2, no counter-trip, and the target rolls its weaker skill', () => {
  const imp = () => fight(mk('T', { advantages: [{ name: 'Improved Trip' }] }), mk('X'));
  const a = imp(); setSkills(a.c, 4, 4); setSkills(a.t, 0, 12); // Acrobatics 0 is the weaker; Athletics 12 would win with 8 against 12
  trip(a.b, a.c, a.t, dice(20, 12, 8));
  assert.ok(prone(a.t), '12 + 4 = 16 beats 8 + 0');
  assert.equal(a.b.log[0].dice[0].mod, 6, 'no -2 penalty');
  assert.match(a.b.log[0].text, /\(Improved Trip\)/);
  const b = imp(); setSkills(b.c, 0, 0); setSkills(b.t, 9, 9);
  const rolls = dice(20, 2, 19, 20, 1); // the last two would let a counter-trip succeed if one were rolled
  trip(b.b, b.c, b.t, rolls);
  assert.ok(!prone(b.t) && !prone(b.c));
  assert.equal(rolls.left(), 2, 'only the attack and the opposed check were rolled');
});

// ---- Disarm -------------------------------------------------------------------------------------------------------

test('disarm: -2 with a close attack, -5 with a ranged one, none with Improved Disarm', () => {
  const mod = (weapon, adv, who) => {
    const f = fight(mk('D', { equipment: weapon ? [weapon] : [], advantages: adv }), mk('X', { equipment: [gun] }));
    const atk = who === 'unarmed' ? unarmed(f.c) : f.c.attacks.find((a) => a.name === weapon.name);
    disarm(f.b, f.c, atk, f.t, itemsOf(f.t)[0], dice(20, 1, 20), 0);
    return f.b.log[0].dice[0].mod - atk.bonus;
  };
  assert.equal(mod(null, [], 'unarmed'), -2);
  assert.equal(mod(gun, [], 'gun'), -5);
  assert.equal(mod(null, [{ name: 'Improved Disarm' }], 'unarmed'), 0);
  assert.equal(mod(gun, [{ name: 'Improved Disarm' }], 'gun'), 0);
});

test('disarm: the attack\'s damage rank is rolled against the target\'s Strength; the dropped item\'s attacks are gone', () => {
  const run = (r1, r2) => {
    const f = fight(mk('D', { equipment: [gun], abilities: { Strength: 0 } }), mk('X', { equipment: [gun], abilities: { Strength: 2, Agility: 8 } }));
    const atk = f.c.attacks.find((a) => a.name === 'Revolver');
    assert.equal(atk.rank, 8);
    assert.deepEqual(names(f.t), ['Unarmed', 'Revolver']);
    disarm(f.b, f.c, atk, f.t, itemsOf(f.t)[0], dice(20, r1, r2), 0);
    return f;
  };
  const lost = run(5, 12); // 13 against 14
  assert.deepEqual(names(lost.t), ['Unarmed', 'Revolver']);
  assert.match(lost.b.log[0].text, /keeps hold of it/);
  const tie = run(6, 12); // 6 + 8 = 14 against 12 + 2 = 14: a tie goes to the higher bonus, the disarmer's 8 against 2
  assert.deepEqual(names(tie.t), ['Unarmed']);
  const won = run(7, 12); // 15 against 14
  assert.deepEqual(names(won.t), ['Unarmed']);
  assert.deepEqual(won.t.dropped, ['equipment:Revolver']);
  assert.match(won.b.log[0].text, /Damage 8 against Strength.*knocked from X's hands/);
});

test('a disarmed item stays gone through save, load and a rebuild; an unarmed disarmer only may snatch it up', () => {
  const f = fight(mk('D'), mk('X', { equipment: [gun] }));
  disarm(f.b, f.c, unarmed(f.c), f.t, itemsOf(f.t)[0], dice(20, 20, 1), 0);
  assert.match(f.b.log[0].text, /may snatch it up as a free action/);
  const loaded = reviveBattle(R, JSON.parse(JSON.stringify(serializeBattle(f.b))));
  const x = loaded.combatants.find((k) => k.id === 'B0');
  assert.deepEqual(x.dropped, ['equipment:Revolver']);
  assert.deepEqual(names(x), ['Unarmed']);
  rebuildCombatant(x, R);
  assert.deepEqual(names(x), ['Unarmed'], 'rebuilding from the character does not bring the revolver back');
  assert.deepEqual(names(loaded.combatants.find((k) => k.id === 'A0')), ['Unarmed'], 'the disarmer does not gain the attack');
  const fresh = makeCombatant(R, mk('X', { equipment: [gun] }), { id: 'z', team: 'B' });
  assert.deepEqual(names(fresh), ['Unarmed', 'Revolver'], 'only the fighter that lost it is without it');
});

test('disarm with a melee weapon: a lost check lets the target disarm back (its damage against our Strength)', () => {
  const run = (back1, back2, adv = []) => {
    const f = fight(mk('S', { equipment: [spear], advantages: adv }), mk('Brute', { abilities: { Strength: 8 } }));
    const atk = f.c.attacks.find((a) => a.name === 'Spear');
    const rolls = dice(20, 2, 18, back1, back2);
    disarm(f.b, f.c, atk, f.t, itemsOf(f.c)[0], rolls, 0);
    return { ...f, rolls };
  };
  const won = run(18, 3); // Brute: damage 8 + 18 = 26 against Strength 4 + 3 = 7
  assert.deepEqual(names(won.c), ['Unarmed'], 'the Spear is dropped');
  assert.match(won.b.log[1].text, /Brute tries to disarm S in return \(damage 8 against Strength\).*S drops the Spear/);
  const held = run(1, 20);
  assert.deepEqual(names(held.c), ['Unarmed', 'Spear']);
  assert.match(held.b.log[1].text, /it holds on/);
  const imp = run(18, 3, [{ name: 'Improved Disarm' }]);
  assert.equal(imp.rolls.left(), 2, 'Improved Disarm: no counter-disarm is rolled');
  assert.deepEqual(names(imp.c), ['Unarmed', 'Spear']);
});

test('disarm with a ranged weapon that loses is not answered', () => {
  const f = fight(mk('G', { equipment: [gun] }), mk('Brute', { abilities: { Strength: 8 } }));
  const rolls = dice(20, 2, 18, 18, 3);
  disarm(f.b, f.c, f.c.attacks.find((a) => a.name === 'Revolver'), f.t, itemsOf(f.c)[0], rolls, 0);
  assert.equal(rolls.left(), 2);
  assert.deepEqual(names(f.c), ['Unarmed', 'Revolver']);
});

// ---- Smash --------------------------------------------------------------------------------------------------------

test('smash: -5 to hit against the holder defense, none with Improved Smash', () => {
  const hits = (roll, adv = []) => {
    const f = fight(mk('S', { abilities: { Strength: 6 }, advantages: adv }), mk('X', { equipment: [gun], defenses: { Parry: 0 } })); // Parry DC 16
    smash(f.b, f.c, unarmed(f.c), f.t, itemsOf(f.t)[0], dice(roll, 20), 0);
    return f.b.log[0].kind !== 'miss';
  };
  assert.ok(hits(15), '15 + 6 - 5 = 16 meets Parry DC 16');
  assert.ok(!hits(14), '14 + 1 = 15 misses');
  assert.ok(hits(10, [{ name: 'Improved Smash' }]), 'with Improved Smash 10 + 6 = 16');
  assert.ok(!hits(9, [{ name: 'Improved Smash' }]));
});

test('object Toughness: a device is its points / 5 (at least 1); equipment follows its material', () => {
  const dev = { name: 'Cannon Arm', kind: 'none', powers: [blast(8)] };
  const tiny = { name: 'Pen Laser', kind: 'none', powers: [blast(1)] };
  const total = deviceCost(dev, R).total;
  assert.ok(total >= 10, `a real device (${total} points)`);
  const item = itemsOf(makeCombatant(R, mk('X', { devices: [dev, tiny] }), { id: 'x', team: 'A' }));
  assert.equal(item.find((i) => i.name === 'Cannon Arm').toughness, Math.floor(total / 5));
  assert.ok(deviceCost(tiny, R).total < 5);
  assert.equal(item.find((i) => i.name === 'Pen Laser').toughness, 1);
  const eq = itemsOf(makeCombatant(R, mk('Y', { equipment: [gun, bow, { ...spear, name: 'Quarterstaff' }] }), { id: 'y', team: 'A' }));
  const tough = Object.fromEntries(eq.map((i) => [i.name, i.toughness]));
  assert.deepEqual(tough, { Revolver: 9, Bow: 3, Quarterstaff: 3 });
});

test('smash: Toughness check against Damage rank + 15; 1 degree scars, 2 break, 3 destroy, and the attacks are gone', () => {
  // Strength 6 unarmed: DC 21 against the Revolver's Toughness 9
  const run = (roll) => { const f = fight(mk('S', { abilities: { Strength: 6 } }), mk('X', { equipment: [gun] })); smash(f.b, f.c, unarmed(f.c), f.t, itemsOf(f.t)[0], dice(20, roll), 0); return f; };
  assert.deepEqual(names(run(12).t), ['Unarmed', 'Revolver']);
  assert.match(run(12).b.log[0].text, /holds/);
  const scarred = run(7); // 16 vs 21: 5 short
  assert.deepEqual(names(scarred.t), ['Unarmed', 'Revolver']);
  assert.match(scarred.b.log[0].text, /scarred but still works \(1 degree\)/);
  const broken = run(6); // 15 vs 21: 6 short
  assert.deepEqual(names(broken.t), ['Unarmed']);
  assert.match(broken.b.log[0].text, /broken \(2 degrees\)/);
  assert.deepEqual(broken.t.dropped, ['equipment:Revolver']);
  assert.match(run(2).b.log[0].text, /broken \(2 degrees\)/, '11 short is still 2 degrees');
  const destroyed = run(1); // 10 vs 21: 11 short
  assert.match(destroyed.b.log[0].text, /destroyed \(3 degrees\)/);
  assert.deepEqual(names(destroyed.t), ['Unarmed']);
});

// ---- Finishing attack ---------------------------------------------------------------------------------------------

test('finishing attack: a defenseless target is rolled against DC 10 and a hit is a critical', () => {
  const f = fight(mk('H'), mk('B')); f.t.conditions.push({ name: 'Defenseless', degree: 1, source: 'test' });
  resolveAttack(f.b, R, f.c, unarmed(f.c), f.t, dice(5, 10, 10), {}); // 5 + 6 = 11 against DC 10
  assert.equal(f.b.log[0].kind, 'crit');
  assert.match(f.b.log[0].text, /d20 5 \+6 = 11 vs Parry DC 10 \(finishing attack\) — CRITICAL HIT/);
  assert.equal(f.b.log[0].dice[0].dc, 10);
});

test('finishing attack: a bonus too low to rely on the die takes the routine check, which hits but is no critical', () => {
  const f = fight(mk('W', { abilities: { Fighting: 0 } }), mk('B')); f.t.conditions.push({ name: 'Defenseless', degree: 1, source: 'test' });
  const atk = unarmed(f.c); atk.bonus = 0;
  const rolls = dice(1, 10);
  resolveAttack(f.b, R, f.c, atk, f.t, rolls, {});
  assert.equal(f.b.log[0].kind, 'hit', 'not a critical');
  assert.deepEqual(f.b.log[0].dice, [], 'no attack die was rolled');
  assert.match(f.b.log[0].text, /finishing attack as a routine check, 10 vs Parry DC 10/);
  assert.equal(rolls.left(), 1, 'only the Toughness check rolled, so the natural 1 never touched the attack');
});

// ---- AI choices ---------------------------------------------------------------------------------------------------

function scene(team, opts = {}) {
  const b = createBattle({ seed: 'ai' }); Object.assign(b.options, opts);
  for (const [id, ch, style] of team) addCombatant(b, makeCombatant(R, ch, { id, team: id[0], style }));
  startBattle(b, R); b.log.length = 0;
  for (const [id, , , pos] of team) { const c = b.combatants.find((x) => x.id === id); c.x = pos; c.y = 5; c.heroPoints = 0; }
  return b;
}
const get = (b, id) => b.combatants.find((c) => c.id === id);
const turn = (b, id, seed) => { b.log.length = 0; takeTurn(b, R, get(b, id), makeRng(seed)); return b.log.map((e) => e.text).join('\n'); };
const SEEDS = ['t1', 't2', 't3', 't4'];
const archer = () => mk('Archer', { powers: [blast(7)], abilities: { Fighting: 0 }, defenses: { Parry: 0 } });

test('AI trip: against a shooter, a melee fighter with good odds trips instead of striking', () => {
  for (const seed of SEEDS) {
    const b = scene([['A0', mk('Judoka'), 'duelist', 3], ['B0', archer(), 'blaster', 4]]);
    setSkills(get(b, 'A0'), 12, 12); setSkills(get(b, 'B0'), 0, 0);
    assert.match(turn(b, 'A0', seed), /Judoka tries to trip Archer at -2/, seed);
  }
});

test('AI trip: with an ally who fights up close in the target\'s zone, even a melee target is tripped; alone it is not', () => {
  const brute = () => mk('Brute', { abilities: { Strength: 8, Fighting: 2 }, defenses: { Parry: 0 }, equipment: [spear] });
  const withAlly = scene([['A0', mk('Judoka'), 'duelist', 3], ['A1', mk('Spearman', { equipment: [spear] }), 'brawler', 4], ['B0', brute(), 'brawler', 4]]);
  setSkills(get(withAlly, 'A0'), 12, 12); setSkills(get(withAlly, 'B0'), 0, 0);
  assert.match(turn(withAlly, 'A0', 't1'), /tries to trip Brute/);
  const alone = scene([['A0', mk('Judoka'), 'duelist', 3], ['B0', brute(), 'brawler', 4]]);
  setSkills(get(alone, 'A0'), 12, 12); setSkills(get(alone, 'B0'), 0, 0);
  assert.doesNotMatch(turn(alone, 'A0', 't1'), /trip/);
});

test('AI trip is declined when the odds are poor, when the target is already prone, and against a minion', () => {
  const mkScene = () => scene([['A0', mk('Judoka'), 'duelist', 3], ['A1', mk('Spearman', { equipment: [spear] }), 'brawler', 4], ['B0', archer(), 'blaster', 4]]);
  const poor = mkScene(); setSkills(get(poor, 'A0'), -3, -3); setSkills(get(poor, 'B0'), 10, 10);
  assert.doesNotMatch(turn(poor, 'A0', 't1'), /trip/);
  const down = mkScene(); setSkills(get(down, 'A0'), 12, 12); setSkills(get(down, 'B0'), 0, 0); makeProne(get(down, 'B0'), get(down, 'A0'), 'trip', 'x');
  assert.doesNotMatch(turn(down, 'A0', 't1'), /trip/);
  const mob = mkScene(); setSkills(get(mob, 'A0'), 12, 12); setSkills(get(mob, 'B0'), 0, 0); get(mob, 'B0').minion = true;
  assert.doesNotMatch(turn(mob, 'A0', 't1'), /trip/);
});

test('a minion without Improved Trip never trips; with it, it does', () => {
  const mkScene = (adv) => { const b = scene([['A0', mk('Thug', { advantages: adv }), 'minion', 3], ['B0', archer(), 'blaster', 4]]); setSkills(get(b, 'A0'), 12, 12); setSkills(get(b, 'B0'), 0, 0); return b; };
  assert.doesNotMatch(turn(mkScene([]), 'A0', 't1'), /trip/);
  assert.match(turn(mkScene([{ name: 'Improved Trip' }]), 'A0', 't1'), /tries to trip Archer \(Improved Trip\)/);
});

test('AI disarm: the target\'s best attack is a held weapon worth well over its next best', () => {
  for (const seed of SEEDS) {
    const b = scene([['A0', mk('Bruiser', { abilities: { Strength: 9 } }), 'brawler', 3], ['B0', mk('Gunman', { equipment: [gun], abilities: { Strength: 0, Fighting: 0 } }), 'gunner', 3]]);
    assert.match(turn(b, 'A0', seed), /Bruiser tries to disarm Gunman of the Revolver at -2/, seed);
  }
});

test('AI disarm is declined when the weapon is no better than 1.5 times the next attack, when it is not the best attack, when the odds are poor, and against a minion', () => {
  const gunman = (o) => mk('Gunman', { equipment: [gun], ...o }); // Revolver worth 1.17; its fists 1.03 here, 0.2 against a hard hitter
  const bruiser = (o = {}) => mk('Bruiser', { abilities: { Strength: 9, Fighting: 10, ...o }, defenses: { Parry: 0 } });
  const close = scene([['A0', bruiser(), 'brawler', 3], ['B0', gunman({ abilities: { Strength: 8, Fighting: 6 }, defenses: { Parry: 0 } }), 'gunner', 3]]);
  assert.doesNotMatch(turn(close, 'A0', 't1'), /disarm/, 'the fists are nearly as good as the gun');
  const poor = scene([['A0', mk('Weak', { abilities: { Strength: 4, Fighting: 2 } }), 'brawler', 3], ['B0', gunman({ abilities: { Strength: 0, Fighting: 0 }, defenses: { Parry: 16 } }), 'gunner', 3]]);
  assert.doesNotMatch(turn(poor, 'A0', 't1'), /disarm/, 'about a 3% chance');
  const fists = scene([['A0', mk('Bruiser', { abilities: { Strength: 9 } }), 'brawler', 3], ['B0', gunman({ equipment: [{ ...gun, effect: 'Damage 1', attack: { kind: 'ranged', rank: 1, crit: 20 } }], abilities: { Strength: 9, Fighting: 8 } }), 'gunner', 3]]);
  assert.doesNotMatch(turn(fists, 'A0', 't1'), /disarm/, 'its best attack is its fists, not an item');
  const mob = scene([['A0', bruiser({ Fighting: 14 }), 'brawler', 3], ['B0', gunman({ abilities: { Strength: 0, Fighting: 0 } }), 'gunner', 3]]);
  assert.match(turn(mob, 'A0', 't1'), /tries to disarm/, 'the same scene against a standing hero');
  get(mob, 'B0').minion = true;
  assert.doesNotMatch(turn(mob, 'A0', 't1'), /disarm/);
});

test('AI smash: an item that cannot be disarmed (a built-in device) is smashed when breaking it beats a plain attack', () => {
  const armored = mk('Armored', { devices: [{ name: 'Cannon Arm', kind: 'none', powers: [blast(8)] }], abilities: { Strength: 0, Fighting: 0 }, powers: [{ name: 'Plate', effect: 'Protection', rank: 12, role: 'defense', extras: [{ name: 'Impervious' }], flaws: [] }] });
  const b = scene([['A0', mk('Plinker', { abilities: { Strength: 1, Fighting: 8 } }), 'duelist', 3], ['B0', armored, 'gunner', 3]]);
  assert.match(turn(b, 'A0', 't1'), /Plinker smashes at the Cannon Arm in Armored's grip at -5/);
  assert.doesNotMatch(turn(b, 'A0', 't1'), /disarm/);
});
