// Deflect (Hero's Handbook p95): the Defend action for other characters at a distance, the range penalties, what it
// cannot stop, the Reaction extra, Reflect and Redirect, and when the AI takes the action. Source:
// src/engine/battle/deflect.js, deflect-plan.js, reflect.js and the hook in attack-roll.js. Dice are scripted.
// SOFT has Parry 6 (a flat defense of 16) and Toughness 4; STRIKER is SOFT with Unarmed +8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, dice, deflect, powerArena, who, unarmed, text } from './helpers/power-arena.mjs';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { deflectTurn, deflectHarm } from '../src/engine/battle/deflect-plan.js';
import { deflectOf } from '../src/engine/battle/deflect.js';
import { takeTurn } from '../src/engine/battle/turn.js';
import { makeRng } from '../src/engine/rng.js';

const SOFT = { abilities: { Fighting: 0 } };
const STRIKER = { abilities: { Fighting: 0 }, skills: [{ name: 'Close Combat', spec: 'Unarmed', ranks: 8 }] };
const NO_HEROES = { heroPoints: false };

/** atk (0,0) swings at ally (1,0); the guard (rank, extras) stands at `at`. `held` is the Defend action. */
function setup({ rank = 5, extras = [], at = { x: 3, y: 0 }, held = true, scale = 'street', extra = [], guard = SOFT } = {}) {
  const b = powerArena([
    ['atk', 'A', STRIKER, { x: 0, y: 0 }], ['ally', 'B', SOFT, { x: 1, y: 0 }],
    ['guard', 'B', { ...guard, powers: [deflect(rank, extras)] }, at], ...extra,
  ], { ...NO_HEROES, scale });
  who(b, 'guard').deflecting = held;
  return b;
}
const swing = (b, rolls, target = 'ally') => { const d = dice(...rolls); resolveAttack(b, R, who(b, 'atk'), unarmed(who(b, 'atk')), who(b, target), d); return d; };

test('Deflect is read from the power: rank and the Reaction, Reflect and Redirect extras (Redirect needs Reflect)', () => {
  assert.deepEqual(deflectOf({ powers: [deflect(5, ['Reaction'])] }), { name: 'Guard', rank: 5, reaction: true, reflect: false, redirect: false, only: null });
  assert.equal(deflectOf({ powers: [deflect(3, ['Reflect', 'Redirect'])] }).redirect, true);
  assert.equal(deflectOf({ powers: [deflect(3, ['Redirect'])] }).redirect, false);
  assert.equal(deflectOf({ powers: [] }), null);
});

test('a Defend that deflects for an ally at short range: d20 (11 minimum) plus the rank stands against the flat defense', () => {
  const b = setup();
  const d = swing(b, [12, 8]);                       // deflect 12 + 5 = 17 beats the flat 16; the attack's 8 + 8 = 16 misses
  assert.equal(d.left(), 0);
  assert.match(text(b), /atk .*d20 8 \+8 = 16 vs Parry DC 17 — miss/);
  assert.match(text(b), /guard deflects the attack on ally: d20 12 \+ 5 = 17 vs attack total 16\./);
  const control = setup({ held: false });            // without the Defend the same roll hits the flat 16
  swing(control, [8, 3]);
  assert.match(text(control), /vs Parry DC 16 — hit/);
});

test('a deflection roll of 10 or less counts +10 (a minimum of 11)', () => {
  const b = setup();
  swing(b, [2, 8]);                                  // 2 counts +10: 12 + 5 = 17, and the 8 + 8 = 16 does not beat it
  assert.match(text(b), /guard deflects the attack on ally: d20 2 \(\+10\) \+ 5 = 17 vs attack total 16\./);
});

test('the attacker must beat the better of the deflection and the flat defense', () => {
  const b = setup();
  swing(b, [1, 8, 3]);                               // 11 + 5 = 16 only ties the flat 16: no change, the 8 + 8 hits
  assert.match(text(b), /guard tries to deflect for ally: d20 1 \(\+10\) \+ 5 = 16/);
  assert.match(text(b), /vs Parry DC 16 — hit/);
  assert.doesNotMatch(text(b), /guard deflects the attack/);
});

// Rank 2 on 30 ft squares: short range 50 ft, medium 100 ft, long 200 ft, measured from the guard to the protected ally.
test('medium range costs 2 and long range 5, measured from the deflector to the protected fighter', () => {
  const medium = setup({ rank: 2, scale: 'block', at: { x: 4, y: 0 } });     // 3 squares = 90 ft
  swing(medium, [19, 10]);
  assert.match(text(medium), /d20 19 \+ 2 − 2 \(medium range\) = 19 vs attack total 18\./);
  const long = setup({ rank: 2, scale: 'block', at: { x: 6, y: 0 } });      // 5 squares = 150 ft
  swing(long, [20, 8]);
  assert.match(text(long), /d20 20 \+ 2 − 5 \(long range\) = 17 vs attack total 16\./);
});

test('beyond long range the deflector cannot help, and no die is thrown for it', () => {
  const b = setup({ rank: 2, scale: 'block', at: { x: 9, y: 0 } });         // 8 squares = 240 ft
  const d = swing(b, [8, 3]);
  assert.equal(d.left(), 0);
  assert.doesNotMatch(text(b), /deflect/);
});

test('a deflector that could not beat the number needed does not roll at all', () => {
  const b = setup({ rank: 1 });                      // 20 + 1 = 21 beats 16, so it would roll; against a flat 26 it cannot
  who(b, 'ally').defMod = 10;
  const d = swing(b, [8]);
  assert.equal(d.left(), 0);
  assert.doesNotMatch(text(b), /deflect/);
});

test('Deflect does not work against an area effect (Dodge for half instead) or a perception range attack', () => {
  const area = { name: 'Boom', effect: 'Damage', rank: 5, range: 'Ranged', role: 'attack', extras: [{ name: 'Area', option: 'Burst' }], flaws: [] };
  const b = powerArena([['atk', 'A', { powers: [area] }, { x: 0, y: 0 }], ['ally', 'B', SOFT, { x: 1, y: 0 }], ['guard', 'B', { powers: [deflect(5)] }, { x: 11, y: 0 }]], NO_HEROES);
  who(b, 'guard').deflecting = true;
  const d = dice(10, 2);                             // the ally's Dodge check, then its Toughness check
  resolveAttack(b, R, who(b, 'atk'), who(b, 'atk').attacks.find((a) => a.name === 'Boom'), who(b, 'ally'), d);
  assert.equal(d.left(), 0);
  assert.doesNotMatch(text(b), /deflect/);
  const gaze = { name: 'Gaze', effect: 'Damage', rank: 5, range: 'Perception', role: 'attack', extras: [], flaws: [] };
  const p = powerArena([['atk', 'A', { powers: [gaze] }, { x: 0, y: 0 }], ['ally', 'B', SOFT, { x: 1, y: 0 }], ['guard', 'B', { powers: [deflect(5)] }, { x: 3, y: 0 }]], NO_HEROES);
  who(p, 'guard').deflecting = true;
  const q = dice(2);
  resolveAttack(p, R, who(p, 'atk'), who(p, 'atk').attacks.find((a) => a.name === 'Gaze'), who(p, 'ally'), q);
  assert.equal(q.left(), 0);
  assert.doesNotMatch(text(p), /deflect/);
});

test('a Defend that deflects covers the deflector too, with its rank in place of its defense when that is higher', () => {
  const b = setup({ at: { x: 1, y: 1 } });
  const g = who(b, 'guard'); g.defending = true;    // a Defend with Deflect rolls once: d20 plus the better of Parry and the rank
  swing(b, [14, 8], 'guard');
  assert.match(text(b), /guard is defending: d20 14 \+ 6 = 20/);              // Parry 6 beats Deflect 5: the rank adds nothing
  g.d.defenses.Parry = 0;
  const d = swing(b, [14, 8], 'guard');
  assert.equal(d.left(), 0);
  assert.match(text(b), /guard is defending: d20 14 \+ 5 \(Deflect\) = 19/);
});

test('a Reaction deflect needs no Defend, works once a round, and covers the fighter and allies within short range only', () => {
  const b = setup({ extras: ['Reaction'], held: false });
  swing(b, [12, 8]);
  assert.match(text(b), /guard deflects the attack on ally: d20 12 \+ 5 = 17/);
  assert.equal(who(b, 'guard').deflectRound, b.round);
  const again = swing(b, [8, 3]);                    // the reaction is spent this round: the next attack meets the flat 16
  assert.equal(again.left(), 0);
  assert.match(b.log.at(-2).text, /vs Parry DC 16 — hit/);
  b.round += 1;
  swing(b, [12, 8]);                                 // a new round: it can deflect again
  assert.match(b.log.at(-1).text, /guard deflects the attack on ally/);
  const far = setup({ rank: 2, scale: 'block', extras: ['Reaction'], held: false, at: { x: 4, y: 0 } });   // 90 ft: medium range
  const d = swing(far, [8, 3]);
  assert.equal(d.left(), 0);
  assert.doesNotMatch(text(far), /deflect/);
});

test('a Reaction deflect for itself rolls against an attack on the deflector', () => {
  const b = setup({ extras: ['Reaction'], held: false, at: { x: 1, y: 1 } });
  swing(b, [12, 8], 'guard');
  assert.match(text(b), /guard deflects the attack on guard: d20 12 \+ 5 = 17 vs attack total 16\./);
});

test('a Defend held by one deflector is used before another deflector spends its reaction', () => {
  const b = setup({ extra: [['rx', 'B', { ...SOFT, powers: [deflect(9, ['Reaction'])] }, { x: 4, y: 0 }]] });
  swing(b, [13, 8]);
  assert.match(text(b), /guard deflects the attack on ally/);
  assert.equal(who(b, 'rx').deflectRound, null);
});

test('Reflect: a deflected attack is made back at the attacker with the deflector\'s own attack bonus', () => {
  const b = setup({ extras: ['Reflect'], at: { x: 1, y: 1 }, guard: STRIKER });
  const d = swing(b, [12, 8, 15, 2]);                // deflect 17 stops the 16; reflect 15 + 8 = 23 hits Parry 6; Toughness check 2 + 4 fails
  assert.equal(d.left(), 0);
  assert.match(text(b), /guard reflects the attack back at atk\./);
  assert.match(text(b), /guard .*: d20 15 \+8 = 23 vs Parry DC 16 — hit/);
  assert.equal(who(b, 'atk').staggered, true);       // Damage 4 against DC 19: a 6 is 13 short, three degrees
});

test('without Reflect a deflected attack is only turned aside', () => {
  const b = setup({ at: { x: 1, y: 1 }, guard: STRIKER });
  const d = swing(b, [12, 8]);
  assert.equal(d.left(), 0);
  assert.doesNotMatch(text(b), /reflect/);
});

test('a reflected attack cannot be deflected again', () => {
  const b = setup({ extras: ['Reflect'], at: { x: 1, y: 1 }, guard: STRIKER, extra: [['mate', 'A', { ...SOFT, powers: [deflect(9)] }, { x: 0, y: 1 }]] });
  who(b, 'mate').deflecting = true;
  const d = swing(b, [12, 8, 15, 2]);
  assert.equal(d.left(), 0);
  assert.doesNotMatch(text(b), /mate/);              // the deflector's ally on the attacker's side stays out of it
  assert.equal(who(b, 'atk').staggered, true);       // and the reflected hit lands
});

test('Redirect sends the attack at the enemy it would hurt most instead of the attacker', () => {
  const soft = { abilities: { Fighting: 0 }, defenses: { Parry: 0 } };
  const b = setup({ extras: ['Reflect', 'Redirect'], at: { x: 1, y: 1 }, guard: STRIKER, extra: [['soft', 'A', soft, { x: 2, y: 1 }]] });
  const d = swing(b, [12, 8, 15, 2]);
  assert.equal(d.left(), 0);
  assert.match(text(b), /guard reflects the attack at soft\./);
  assert.match(text(b), /vs Parry DC 10 — hit/);
});

// The AI: a Defend that deflects is chosen only when it is worth more than the fighter's own best attack.
const rush = (opts = {}, guard = {}) => powerArena([
  ['hit', 'A', { abilities: { Strength: 9 } }, { x: 1, y: 0 }], ['ally', 'B', { abilities: { Fighting: 0 }, defenses: { Parry: 0 } }, { x: 2, y: 0 }],
  ['guard', 'B', { powers: [deflect(6)], ...guard }, { x: 3, y: 0 }]], opts);
const plan = (b, ev, mode = 'full', id = 'guard') => deflectTurn(b, who(b, id), { plan: 'attack', ev }, [who(b, 'hit')], mode);

test('the AI takes the Defend to deflect when its own attack is worth less than the harm to its allies', () => {
  const b = rush();
  assert.equal(plan(b, 0.01), true);
  const g = who(b, 'guard');
  assert.deepEqual([g.defending, g.deflecting], [true, true]);
  assert.match(text(b), /guard takes the Defend action to deflect \(Deflect 6\)/);
});

test('the AI attacks instead when its own attack is worth more, and a Reaction deflector never uses the action', () => {
  const b = rush();
  assert.equal(plan(b, 99), false);
  assert.equal(plan(b, 0.01, 'controlled'), false);
  const rx = rush({}, { powers: [deflect(6, ['Reaction'])] });
  assert.equal(plan(rx, 0), false);
});

test('Bodyguard asks a deflector to protect the VIP even when its own attack is better', () => {
  const b = rush({ teamTactics: { B: 'bodyguard' }, vip: { B: 'ally' } });
  assert.equal(plan(b, 99), true);
  assert.equal(plan(rush(), 99), false);             // the same fight without the tactic: the attack is worth more
});

test('Hold the Line asks a fighter behind the line to deflect', () => {
  const back = { abilities: { Fighting: 0, Stamina: 0 }, style: 'support' };
  const line = rush({ teamTactics: { B: 'line' } }, back);
  assert.equal(plan(line, 99), true);
  assert.equal(plan(rush({}, back), 99), false);
});

test('in a real turn the guard takes the Defend, and it ends when the guard\'s next turn begins', () => {
  const b = rush({}, { abilities: { Fighting: 0, Strength: 0 } });
  who(b, 'guard').x = 4;
  b.status = 'running';
  takeTurn(b, R, who(b, 'guard'), makeRng('turn'));
  assert.deepEqual([who(b, 'guard').defending, who(b, 'guard').deflecting], [true, true]);
  who(b, 'hit').out = true;                           // nobody left to fight: the next turn still clears the Defend first
  takeTurn(b, R, who(b, 'guard'), makeRng('turn2'));
  assert.deepEqual([who(b, 'guard').defending, who(b, 'guard').deflecting], [false, false]);
});

/** A guard whose Deflect is limited the way Ballista's Psionic Defense is. */
const psionicOnly = (extras = [], rank = 5) => ({ ...deflect(rank, extras), descriptors: ['resistance to psionic'] });
function limitedSetup(extras, held, rank = 5) {
  const b = powerArena([
    ['atk', 'A', STRIKER, { x: 0, y: 0 }],
    ['guard', 'B', { ...SOFT, powers: [psionicOnly(extras, rank)] }, { x: 1, y: 0 }],
  ], NO_HEROES);
  who(b, 'guard').deflecting = held;
  return b;
}
const psionic = (c) => ({ ...unarmed(c), descriptors: ['psychic'] });

test('a Deflect limited by its descriptor reads the limit: "resistance to psionic", a Limited flaw, or none at all', () => {
  assert.deepEqual(deflectOf({ powers: [psionicOnly()] }).only, ['psychic']);
  assert.deepEqual(deflectOf({ powers: [{ ...deflect(5), flaws: [{ name: 'Limited', option: 'to fire attacks' }] }] }).only, ['fire']);
  assert.equal(deflectOf({ powers: [{ ...deflect(5), descriptors: ['force field'] }] }).only, null, 'a descriptor that only says what it looks like is no limit');
});

test('Psionic Defense as a Reaction stops a psionic attack but never rolls against fists', () => {
  const b = limitedSetup(['Reaction'], false);
  const fists = dice(8, 15);                         // no deflection roll: 8 + 8 = 16 hits the flat Parry 16, then the Toughness check
  resolveAttack(b, R, who(b, 'atk'), unarmed(who(b, 'atk')), who(b, 'guard'), fists);
  assert.match(text(b), /d20 8 \+8 = 16 vs Parry DC 16 — hit/);
  assert.doesNotMatch(text(b), /deflect/i);

  const c = limitedSetup(['Reaction'], false);
  const mind = dice(12, 8);                          // deflect 12 + 5 = 17 beats the flat 16; the attack's 8 + 8 = 16 misses
  resolveAttack(c, R, who(c, 'atk'), psionic(who(c, 'atk')), who(c, 'guard'), mind);
  assert.equal(mind.left(), 0);
  assert.match(text(c), /vs Parry DC 17 — miss/);
  assert.match(text(c), /deflect/i);
});

test('a held Defend with a limited Deflect uses its rank only against what it covers', () => {
  const defend = (attack) => {
    const b = limitedSetup([], true, 9);             // rank 9 beats Parry 6, so the rank shows in the Defend roll when it applies
    const guard = who(b, 'guard'); guard.defending = true;
    resolveAttack(b, R, who(b, 'atk'), attack(who(b, 'atk')), guard, dice(14, 1, 15));
    return text(b);
  };
  assert.match(defend(unarmed), /Guard is defending: d20 14 \+ 6 = 20|defending: d20 14 \+ 6 = 20/, 'fists meet the plain Defend, Parry 6');
  assert.match(defend(psionic), /defending: d20 14 \+ 9 \(Deflect\) = 23/, 'a psionic attack meets the Deflect rank');
});

test('the AI weighs a limited Deflect only against attacks it covers', () => {
  const b = limitedSetup([], false);
  const guard = who(b, 'guard'); const foe = who(b, 'atk');
  assert.equal(deflectHarm(b, guard, [foe]), 0, 'fists are not psionic, so there is nothing to deflect');
  foe.attacks = foe.attacks.map((a) => ({ ...a, descriptors: ['psychic'] }));
  assert.ok(deflectHarm(b, guard, [foe]) > 0, 'a psionic attack is');
});
