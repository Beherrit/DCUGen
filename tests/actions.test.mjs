// Weapon Bind and Weapon Break (Hero's Handbook p79), Quick Draw (p77), Trick and Redirect (p58, p77), Assessment (p70),
// Triggered traps (p132) and crawling (p175). Dice are scripted; fighters are small hand-built characters on 5 ft squares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerArena, dice, text, R, who } from './helpers/power-arena.mjs';
import { zap } from './helpers/flaw-kit.mjs';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { weaponReaction, weaponDefends, fetchWeapon } from '../src/engine/battle/weapon-reactions.js';
import { disarm } from '../src/engine/battle/disarm.js';
import { trick, redirect, trickTurn } from '../src/engine/battle/trick.js';
import { assess, assessTurn, assessBias } from '../src/engine/battle/assessment.js';
import { setTrap, trapTurn } from '../src/engine/battle/trap.js';
import { moveTo } from '../src/engine/battle/movement.js';
import { squaresInMove } from '../src/engine/battle/geometry.js';
import { makeProne } from '../src/engine/battle/prone.js';

const sword = { name: 'Sword', cost: 4, effect: 'Damage 6', attack: { kind: 'close', rank: 6, strengthBased: false, crit: 20 } };
const spear = { name: 'Spear', cost: 4, effect: 'Damage 4', attack: { kind: 'close', rank: 4, strengthBased: false, crit: 20 } };

/** Attacker A (team A) with a sword next to defender D (team B) with Weapon Bind or Break and the Defend action up. */
function swordFight(advantages, extra = {}) {
  const b = powerArena([
    ['A', 'A', { hp: 0, equipment: [sword] }, { x: 0, y: 0 }],
    ['D', 'B', { hp: 0, advantages, ...extra }, { x: 1, y: 0 }],
  ]);
  const [a, d] = [who(b, 'A'), who(b, 'D')];
  d.defending = true;
  return { b, a, d, atk: a.attacks.find((x) => x.name === 'Sword') };
}

test('Weapon Bind: a defender who held off a weapon attack makes a disarm attempt as a reaction', () => {
  const f = swordFight([{ name: 'Weapon Bind', rank: 1 }]);
  weaponReaction(f.b, f.a, f.atk, f.d, dice(20, 5, 20, 1));
  assert.match(text(f.b), /D defended against the Sword and uses Weapon Bind: a disarm attempt as a reaction/);
  assert.match(text(f.b), /D tries to disarm A of the Sword/);
});

test('Weapon Break: the same Defend action answers with an attack on the weapon', () => {
  const f = swordFight([{ name: 'Weapon Break', rank: 1 }]);
  weaponReaction(f.b, f.a, f.atk, f.d, dice(20, 1));
  assert.match(text(f.b), /uses Weapon Break: an attack on the weapon as a reaction/);
  assert.match(text(f.b), /D smashes at the Sword/);
});

test('neither fires without the Defend action, against a ranged attack, or an unarmed one', () => {
  const f = swordFight([{ name: 'Weapon Bind', rank: 1 }]);
  f.d.defending = false;
  weaponReaction(f.b, f.a, f.atk, f.d, dice());
  const unarmed = swordFight([{ name: 'Weapon Bind', rank: 1 }]);
  weaponReaction(unarmed.b, unarmed.a, unarmed.a.attacks.find((x) => x.unarmed), unarmed.d, dice());
  assert.equal(text(f.b), '');
  assert.equal(text(unarmed.b), '');
});

test('the AI takes the Defend action against a foe\'s weapon when it has Weapon Bind and nothing better to do', () => {
  const f = swordFight([{ name: 'Weapon Bind', rank: 1 }]);
  f.d.defending = false;
  assert.equal(weaponDefends(f.b, f.d, { plan: 'attack', ev: 0.2 }, [f.a]), true);
  assert.equal(f.d.defending, true);
  f.d.defending = false;
  assert.equal(weaponDefends(f.b, f.d, { plan: 'attack', ev: 2 }, [f.a]), false, 'a strong attack beats digging in');
  const plain = swordFight([]);
  plain.d.defending = false;
  assert.equal(weaponDefends(plain.b, plain.d, { plan: 'move' }, [plain.a]), false, 'no advantage');
});

test('a disarmed fighter gets its weapon back: a move action, or free with Quick Draw', () => {
  for (const [adv, free] of [[[], false], [[{ name: 'Quick Draw', rank: 1 }], true]]) {
    const b = powerArena([['A', 'A', { hp: 0, equipment: [spear], advantages: adv }, { x: 0, y: 0 }], ['T', 'B', { hp: 0, abilities: { Strength: 12, Fighting: 12 } }, { x: 1, y: 0 }]]);
    const [a, t] = [who(b, 'A'), who(b, 'T')];
    const unarmed = t.attacks.find((x) => x.unarmed);
    disarm(b, t, unarmed, a, a.attacks.find((x) => x.name === 'Spear').item, dice(19, 20, 1), 0);
    assert.equal(a.attacks.some((x) => x.name === 'Spear'), false, 'the spear is gone');
    assert.equal(a.disarmed.length, 1);
    fetchWeapon(b, R, a, 'full');
    assert.equal(a.attacks.some((x) => x.name === 'Spear'), true, 'and back');
    assert.equal(a.noMove, !free, free ? 'Quick Draw: no move action spent' : 'the move action went on picking it up');
    assert.match(text(b), free ? /gets its weapon back as a free action \(Quick Draw\)/ : /gets its weapon back with its move action/);
  }
});

test('a fighter with one action cannot pick its weapon up, but Quick Draw does it free', () => {
  const b = powerArena([['A', 'A', { hp: 0, equipment: [spear] }, { x: 0, y: 0 }], ['T', 'B', { hp: 0 }, { x: 1, y: 0 }]]);
  const a = who(b, 'A');
  a.disarmed = ['equipment:Spear']; a.dropped = ['equipment:Spear'];
  fetchWeapon(b, R, a, 'standard');
  assert.equal(a.disarmed.length, 1, 'dazed: one action, kept for the attack');
});

// ---- Trick and Redirect ----

function trickFight(advantages) {
  const b = powerArena([
    ['C', 'A', { hp: 0, advantages, skills: [{ name: 'Deception', ranks: 8 }] }, { x: 2, y: 0 }],
    ['F', 'B', { hp: 0, equipment: [spear] }, { x: 1, y: 0 }],
    ['G', 'B', { hp: 0 }, { x: 2, y: 1 }], // next to C, and within F's reach
  ]);
  return { b, c: who(b, 'C'), f: who(b, 'F'), g: who(b, 'G') };
}

test('Trick: Deception against Deception or Insight; a win leaves the foe heedless, more than a degree short leaves the trickster vulnerable', () => {
  const f = trickFight([]);
  assert.equal(trick(f.b, f.c, f.f, dice(20, 1)), true);
  assert.equal(f.f.tricked.by, 'C');
  assert.match(text(f.b), /C tricks F: Deception d20 20 \+10 = 30 vs d20 1 \+2 = 3/);
  const lost = trickFight([]);
  assert.equal(trick(lost.b, lost.c, lost.f, dice(1, 20)), false);
  assert.equal(lost.c.distracted, true, 'a bad position: vulnerable until its next turn');
  assert.match(text(lost.b), /it backfires/);
});

test('Redirect: a tricked foe\'s missed attack turns on another foe next to the fighter, with a new check at the same modifier', () => {
  const f = trickFight([{ name: 'Redirect', rank: 1 }]);
  trick(f.b, f.c, f.f, dice(20, 1));
  const atk = f.f.attacks.find((x) => x.name === 'Spear');
  resolveAttack(f.b, R, f.f, atk, f.c, dice(2, 19, 2), {}); // the first attack misses C; the redirected one hits G, who fails its check
  const log = text(f.b);
  assert.match(log, /C redirects the missed Spear onto G \(Redirect\)/);
  assert.equal(f.f.tricked, null, 'used up');
  assert.ok(f.g.bruises >= 1 || f.g.out, 'G took the blow');
});

test('Redirect needs the Trick first, the advantage, and another foe next to the fighter', () => {
  const noTrick = trickFight([{ name: 'Redirect', rank: 1 }]);
  resolveAttack(noTrick.b, R, noTrick.f, noTrick.f.attacks.find((x) => x.name === 'Spear'), noTrick.c, dice(2), {});
  assert.doesNotMatch(text(noTrick.b), /Redirect/);
  const other = trickFight([{ name: 'Redirect', rank: 1 }]);
  other.f.tricked = { by: 'someone-else', round: other.b.round }; // tricked, but not by C
  resolveAttack(other.b, R, other.f, other.f.attacks.find((x) => x.name === 'Spear'), other.c, dice(2), {});
  assert.doesNotMatch(text(other.b), /redirects/);
  const noAdv = trickFight([]);
  trick(noAdv.b, noAdv.c, noAdv.f, dice(20, 1));
  resolveAttack(noAdv.b, R, noAdv.f, noAdv.f.attacks.find((x) => x.name === 'Spear'), noAdv.c, dice(2), {});
  assert.doesNotMatch(text(noAdv.b), /redirects/);
  assert.equal(redirect(noAdv.b, noAdv.f, noAdv.f.attacks[0], noAdv.c, { mod: 0 }, dice(), () => {}), false);
});

test('the AI tricks only to set up a Redirect: with the advantage and a second foe next to it', () => {
  const f = trickFight([{ name: 'Redirect', rank: 1 }]);
  assert.equal(trickTurn(f.b, f.c, { plan: 'move' }, [f.f, f.g], 'full', dice(20, 1)), true);
  const none = trickFight([]);
  assert.equal(trickTurn(none.b, none.c, { plan: 'move' }, [none.f, none.g], 'full', dice()), false);
});

// ---- Assessment ----

test('Assessment: an Insight win says whether the foe\'s bonuses are higher or lower; more degrees give them exactly', () => {
  const b = powerArena([['A', 'A', { hp: 0, advantages: [{ name: 'Assessment', rank: 1 }], skills: [{ name: 'Insight', ranks: 8 }] }, { x: 0, y: 0 }], ['T', 'B', { hp: 0, abilities: { Fighting: 14 } }, { x: 3, y: 0 }]]);
  const [a, t] = [who(b, 'A'), who(b, 'T')];
  const got = assess(b, a, t, dice(20, 1));
  assert.equal(got.attack, 'higher');
  assert.ok(got.exact.length >= 1, 'a wide win gives a bonus exactly');
  assert.match(text(b), /A sizes up T \(Assessment\)/);
  b.log.length = 0;
  assert.equal(assess(b, a, t, dice(1, 20)), null);
  assert.match(text(b), /it learns nothing|bluffs/);
});

test('Assessment is made once per foe, and a foe whose defense is lower is a little more wanted', () => {
  const b = powerArena([['A', 'A', { hp: 0, advantages: [{ name: 'Assessment', rank: 1 }], skills: [{ name: 'Insight', ranks: 8 }] }, { x: 0, y: 0 }], ['T', 'B', { hp: 0, abilities: { Agility: -4, Fighting: -4 } }, { x: 3, y: 0 }]]);
  const [a, t] = [who(b, 'A'), who(b, 'T')];
  assert.equal(assessBias(a, t), 1, 'not yet sized up');
  assessTurn(b, a, [t], dice(20, 1));
  assert.equal(a.assessed[t.id].defense, 'lower');
  assert.equal(assessBias(a, t), 1.1);
  assessTurn(b, a, [t], dice()); // no dice: it does not do it again
  const plain = powerArena([['P', 'A', { hp: 0 }, { x: 0, y: 0 }], ['T', 'B', { hp: 0 }, { x: 3, y: 0 }]]);
  assessTurn(plain.b || plain, who(plain, 'P'), [who(plain, 'T')], dice());
  assert.equal(who(plain, 'P').assessed, null);
});

// ---- Triggered ----

const bolt = (extras) => ({ ...zap([], { rank: 8, extras }), name: 'Snare Bolt' });

test('Triggered: a set effect goes off when a foe crosses its square, once per rank, and the foe resists it as usual', () => {
  const b = powerArena([['S', 'A', { hp: 0, powers: [bolt([{ name: 'Triggered', steps: 2 }])] }, { x: 0, y: 0 }], ['T', 'B', { hp: 0 }, { x: 8, y: 0 }]]);
  const [s, t] = [who(b, 'S'), who(b, 'T')];
  const atk = s.attacks.find((a) => a.name === 'Snare Bolt');
  setTrap(b, s, atk, { x: 4, y: 0 });
  assert.match(text(b), /S sets Snare Bolt as a trap on E1 \(Triggered: 2 uses/);
  moveTo(b, t, { x: 6, y: 0 }, 'toward S'); // stops short of the square: nothing
  assert.equal(b.traps.length, 1);
  moveTo(b, t, { x: 3, y: 0 }, 'toward S'); // crosses E1
  assert.match(text(b), /T crosses E1 and sets off S's Snare Bolt \(Triggered, 1 use left\)/);
  assert.equal(b.traps[0].left, 1);
  moveTo(b, t, { x: 6, y: 0 }, 'back'); // crosses again: the second use
  assert.equal(b.traps.length, 0, 'spent');
  moveTo(b, t, { x: 2, y: 0 }, 'again');
  assert.equal(b.log.filter((e) => /sets off/.test(e.text)).length, 2);
});

test('Triggered: a trap does not catch its owner\'s own side, and the AI sets one on the way a foe is coming', () => {
  const b = powerArena([['S', 'A', { hp: 0, powers: [bolt([{ name: 'Triggered' }])] }, { x: 0, y: 0 }], ['Ally', 'A', { hp: 0 }, { x: 8, y: 1 }], ['T', 'B', { hp: 0 }, { x: 10, y: 0 }]]);
  const [s, ally, t] = [who(b, 'S'), who(b, 'Ally'), who(b, 'T')];
  assert.equal(trapTurn(b, s, { plan: 'move' }, [t], 'full'), true);
  assert.equal(b.traps.length, 1);
  const spot = b.traps[0];
  assert.ok(spot.x >= 1 && spot.x <= 2, 'one or two squares in front of the setter');
  moveTo(b, ally, { x: spot.x, y: 0 }, 'across it');
  assert.equal(b.traps.length, 1, 'an ally walks over it safely');
  assert.equal(trapTurn(b, s, { plan: 'move' }, [t], 'full'), false, 'one trap at a time');
});

// ---- Crawl ----

test('Crawl: a prone fighter can only crawl, at half speed', () => {
  const b = powerArena([['U', 'A', { hp: 0 }, { x: 0, y: 0 }], ['T', 'B', { hp: 0 }, { x: 5, y: 0 }]]);
  const u = who(b, 'U');
  const stand = squaresInMove(b, u);
  makeProne(u, u, 'drop');
  assert.equal(squaresInMove(b, u), Math.floor(stand / 2));
});
