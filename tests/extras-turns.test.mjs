// Extras that come back later or change how an attack is made (Hero's Handbook p125-133, Martial Arts p91-94): Secondary
// Effect, Increased Duration, Contagious, Homing, Indirect, Ricochet (with Pinball, Recoverable and the Bad Bounce flaw), Split,
// and the Attack extra on a Teleport. Dice are scripted: the attack roll (19 hits Dodge 6 without a critical, 2 misses),
// then the target's resistance roll against DC 15 + rank for Damage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duel, fire, logOf, flaw, zap, HIT } from './helpers/flaw-kit.mjs';
import { powerArena, dice, R, who, text } from './helpers/power-arena.mjs';
import { runSecondary, freeHeld, concentrateHeld, spreadContagion, runHoming } from '../src/engine/battle/extra-run.js';
import { addCover } from '../src/engine/battle/cover.js';
import { coverPenalty, blocksDirect } from '../src/engine/battle/cover.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { splitPlan } from '../src/engine/battle/extra-split.js';
import { endOfTurn } from '../src/engine/battle/end-of-turn.js';

const x = (name, more = {}) => ({ name, ...more });
const MISS = 2;

// ---- Secondary Effect ----

test('Secondary Effect: it hits again at the end of the attacker\'s next turn, once, with its own resistance check', () => {
  const f = duel([], { extras: [x('Secondary Effect')] });
  fire(f, HIT, 12); // 16 against DC 23: two degrees
  assert.equal(f.t.bruises, 1);
  assert.equal(f.t.secondary.length, 1);
  runSecondary(f.b, R, f.u, dice()); // the same round: not yet
  assert.equal(f.t.bruises, 1);
  f.b.round++;
  runSecondary(f.b, R, f.u, dice(12)); // the following round: it hits again
  assert.equal(f.t.bruises, 2);
  assert.match(logOf(f), /Zap: Secondary Effect hits T again/);
  assert.equal(f.t.secondary.length, 0);
  f.b.round++;
  runSecondary(f.b, R, f.u, dice()); // and not a third time
  assert.equal(f.t.bruises, 2);
});

test('Secondary Effect does not stack: hitting again moves the second effect back a round', () => {
  const f = duel([], { extras: [x('Secondary Effect')] });
  fire(f, HIT, 12);
  f.b.round++;
  fire(f, HIT, 12);
  assert.equal(f.t.secondary.length, 1, 'one second effect waiting');
  runSecondary(f.b, R, f.u, dice()); // this round's hit has not had its following round
  assert.equal(f.t.bruises, 2);
});

test('Secondary Effect runs from the end of the attacker\'s turn', () => {
  const f = duel([], { extras: [x('Secondary Effect')] });
  fire(f, HIT, 12);
  f.b.round++;
  endOfTurn(f.b, f.u, dice(12), R);
  assert.equal(f.t.bruises, 2);
});

// ---- Increased Duration ----

test('Increased Duration (concentration): the effect is kept up with the standard action, with no attack check', () => {
  const f = duel([], { extras: [x('Increased Duration')] });
  fire(f, HIT, 12);
  assert.equal(f.u.lasting.length, 1);
  assert.equal(f.u.lasting[0].mode, 'concentration');
  const used = concentrateHeld(f.b, R, f.u, { plan: 'attack', ev: 0, utility: 0 }, dice(12));
  assert.equal(used, true, 'the standard action went on it');
  assert.equal(f.t.bruises, 2);
  assert.match(logOf(f), /keeps Zap on T \(Increased Duration, concentration\): no new attack check/);
});

test('Increased Duration (concentration): the user lets go when something else is worth more', () => {
  const f = duel([], { extras: [x('Increased Duration')] });
  fire(f, HIT, 12);
  const used = concentrateHeld(f.b, R, f.u, { plan: 'attack', ev: 99, utility: 99 }, dice());
  assert.equal(used, false);
  assert.equal(f.u.lasting.length, 0);
  assert.match(logOf(f), /lets go of Zap to do something better/);
});

test('Increased Duration (sustained or continuous): it is applied again at the start of each turn for free', () => {
  const f = duel([], { extras: [x('Increased Duration', { steps: 2 })] });
  fire(f, HIT, 12);
  assert.equal(f.u.lasting[0].mode, 'sustained');
  freeHeld(f.b, R, f.u, dice(12));
  assert.equal(f.t.bruises, 2);
  f.t.out = true; // the target is gone: the effect is let go
  freeHeld(f.b, R, f.u, dice());
  assert.equal(f.u.lasting.length, 0);
});

// ---- Contagious ----

test('Contagious: a carrier that ends its turn touching someone passes the effect on, and they resist it normally', () => {
  const afflict = { effect: 'Affliction', rank: 8, detail: 'Resisted by Fortitude; Dazed, Stunned, Incapacitated', extras: [x('Contagious')] };
  const b = powerArena([['U', 'A', { powers: [zap([], afflict)] }, { x: 0, y: 0 }], ['T', 'B', { hp: 0 }, { x: 2, y: 0 }], ['X', 'B', { hp: 0 }, { x: 3, y: 0 }], ['Far', 'B', { hp: 0 }, { x: 8, y: 0 }]]);
  const [u, t, xx, far] = ['U', 'T', 'X', 'Far'].map((id) => who(b, id));
  resolveAttack(b, R, u, u.attacks.find((a) => a.name === 'Zap'), t, dice(HIT, 12), {}); // one degree: dazed
  assert.equal(t.contagion.length, 1);
  spreadContagion(b, R, t, dice(12)); // X is next to T and fails its check too
  assert.ok(xx.conditions.some((c) => c.name === 'Dazed'));
  assert.equal(xx.contagion.length, 1, 'X carries it now');
  assert.equal(far.contagion, undefined, 'not touching: not exposed');
  assert.match(text(b), /X touches T and is exposed to it/);
  spreadContagion(b, R, t, dice()); // X already carries it: nothing more to roll
});

// ---- Homing ----

test('Homing: a miss tries again at the start of the next turn as a free action, one try per rank, then gives up', () => {
  const f = duel([], { extras: [x('Homing', { steps: 2 })] }, {}, { hp: 0 });
  fire(f, MISS);
  assert.equal(f.u.homing[0].left, 2);
  runHoming(f.b, R, f.u, dice(MISS)); // the first retry misses too
  assert.equal(f.u.homing[0].left, 1);
  runHoming(f.b, R, f.u, dice(MISS)); // and the second: no tries left
  assert.equal(f.u.homing.length, 0);
  assert.equal(f.u.stats.attacks, 3);
  assert.match(logOf(f), /Homing tries T again \(free action\)/);
});

test('Homing: a retry that hits lands the effect, and a target that is gone ends it', () => {
  const f = duel([], { extras: [x('Homing')] }, {}, { hp: 0 });
  fire(f, MISS);
  runHoming(f.b, R, f.u, dice(HIT, 2));
  assert.equal(f.t.out, true);
  const g = duel([], { extras: [x('Homing')] }, {}, { hp: 0 });
  fire(g, MISS);
  g.t.out = true;
  runHoming(g.b, R, g.u, dice());
  assert.equal(g.u.homing.length, 0);
});

test('Homing: a miss that concealment caused loses the lock', () => {
  const f = duel([], { extras: [x('Homing')] }, {}, { hp: 0 });
  f.t.concealment = 'total'; // -5: an 18 (20 in all) would have hit Dodge DC 20 without it
  fire(f, 18);
  assert.equal(f.u.homing, undefined);
  assert.match(logOf(f), /Homing loses its lock on T/);
});

// ---- Indirect and Ricochet ----

const behindFence = (extras, flaws = []) => {
  const f = duel(flaws, { extras });
  const piece = addCover(f.b, 'brick-wall', 1, 0); // total cover between U (x 0) and T (x 2)
  return { ...f, piece };
};

test('cover: a plain shot is stopped by total cover, an Indirect or Ricochet one is not', () => {
  const plain = behindFence([]);
  plain.b.options.shootThrough = false;
  assert.equal(blocksDirect(plain.b, plain.u, plain.atk, plain.t), true);
  assert.equal(coverPenalty(plain.b, plain.u, plain.t, plain.atk), 5);
  for (const name of ['Indirect', 'Ricochet']) {
    const f = behindFence([x(name)]);
    f.b.options.shootThrough = false;
    assert.equal(blocksDirect(f.b, f.u, f.atk, f.t), false, name);
    assert.equal(coverPenalty(f.b, f.u, f.t, f.atk), 0, name);
  }
});

test('Indirect: the first attack on each target is a surprise attack, so the target is vulnerable to it (house rule)', () => {
  const f = duel([], { extras: [x('Indirect')] }, {}, { hp: 0 });
  fire(f, 14, 30); // Dodge 6 halved is 3, so DC 13: 14 + 2 = 16 hits (it would miss DC 16 if not surprised)
  assert.match(logOf(f), /Indirect comes at T from an unexpected direction: a surprise attack/);
  assert.match(logOf(f), /surprise attack \(Indirect\): vulnerable to this attack/);
  assert.match(logOf(f), /hit/);
  f.b.log.length = 0;
  fire(f, 14, 30);
  assert.doesNotMatch(logOf(f), /surprise attack/);
  assert.match(logOf(f), /miss/, 'the second attack at the same roll misses: no longer vulnerable');
});

test('Ricochet: banking off the cover around a target behind it is a surprise attack too, and the log says it banked', () => {
  const f = behindFence([x('Ricochet')]);
  fire(f, 14, 30);
  assert.match(logOf(f), /Ricochet: it banks off the brick wall to get at T/);
  assert.match(logOf(f), /surprise attack \(Ricochet\)/);
});

test('Ricochet needs a surface to bounce off: an open field with nothing in it gives no cover to get around', () => {
  const f = duel([], { extras: [x('Ricochet')] });
  fire(f, HIT, 30);
  assert.doesNotMatch(logOf(f), /banks off/);
});

test('Bad Bounce: each bounce needs its own attack check against DC 10, and a failed one wastes the attack', () => {
  const miss = behindFence([x('Ricochet')], [flaw('Bad Bounce')]);
  fire(miss, 1); // the bounce check: 1 + 2 = 3 against DC 10
  assert.match(logOf(miss), /Bad Bounce: U must hit the brick wall first: d20 1 \+2 = 3 vs DC 10 — it ricochets the wrong way and is wasted/);
  assert.equal(miss.u.stats.hits, 0);
  const ok = behindFence([x('Ricochet')], [flaw('Bad Bounce')]);
  fire(ok, 12, 14, 30); // the bounce 12 + 2 = 14 passes; then the attack roll
  assert.match(logOf(ok), /it bounces true/);
  assert.match(logOf(ok), /U .* T: d20 14/);
});

test('Pinball: the bounce hits the cover with the effect too', () => {
  const f = behindFence([x('Ricochet'), x('Pinball')]);
  const before = f.piece.state;
  fire(f, 20, 1, 30, 30); // the Toughness roll for the wall (1), then the shot itself
  assert.match(logOf(f), /The brick wall .* resists Damage 8/);
  assert.equal(before, 'intact');
});

test('Recoverable: a spare bounce brings the attack back, and a catch that fails by two degrees turns it on the user', () => {
  const f = duel([], { extras: [x('Ricochet', { steps: 2 }), x('Recoverable')] });
  addCover(f.b, 'wooden-fence', 1, 1); // a surface to bounce off; the target is in the open
  f.b.options.shootThrough = true;
  fire(f, HIT, 30, 1, 30); // the shot is resisted; the catch roll 1 + Dexterity 2 against the attack total 21 fails by two degrees or more
  assert.match(logOf(f), /Recoverable: it comes back to U, who must catch it/);
});

// ---- Split ----

test('Split: one attack check compared against each target, and each gets its share of the rank', () => {
  const b = powerArena([
    ['U', 'A', { powers: [zap([], { rank: 8, extras: [x('Split')] })] }, { x: 0, y: 0 }],
    ['T', 'B', { abilities: { Stamina: 20 }, hp: 0 }, { x: 2, y: 0 }],
    ['E', 'B', { hp: 0 }, { x: 3, y: 0 }],
  ]);
  const [u, t, e] = ['U', 'T', 'E'].map((id) => who(b, id));
  const atk = u.attacks.find((a) => a.name === 'Zap');
  const plan = splitPlan(b, u, atk, t);
  assert.ok(plan, 'a tough first target and a soft second one: worth splitting');
  assert.equal(plan.first + plan.others[0].rank, 8, 'the ranks add up to the effect\'s rank');
  assert.ok(plan.first >= 1 && plan.others[0].rank >= 1);
  resolveAttack(b, R, u, atk, t, dice(HIT, 20, 1), {}); // the same 19 hits E too; E's check fails
  const log = text(b);
  assert.match(log, /Split: rank \d on T, rank \d on E/);
  assert.match(log, /U splits Zap onto E \(rank \d\): same d20 19/);
  assert.ok(e.bruises >= 1 || e.out, 'E took the damage');
});

test('Split: with one foe, or a rank too small, nothing is split', () => {
  const f = duel([], { extras: [x('Split')] });
  assert.equal(splitPlan(f.b, f.u, f.atk, f.t), null);
  const small = powerArena([['U', 'A', { powers: [zap([], { rank: 1, extras: [x('Split')] })] }, { x: 0, y: 0 }], ['T', 'B', { hp: 0 }, { x: 2, y: 0 }], ['E', 'B', { hp: 0 }, { x: 3, y: 0 }]]);
  const u = who(small, 'U');
  assert.equal(splitPlan(small, u, u.attacks.find((a) => a.name === 'Zap'), who(small, 'T')), null);
});

// ---- Attack (a Teleport made an attack) ----

test('Attack: a Teleport with the Attack extra is a close attack that sends the target away', () => {
  const tele = { name: 'Banish', effect: 'Teleport', rank: 5, range: 'Personal', role: 'movement', extras: [x('Attack')], flaws: [] };
  const b = powerArena([['U', 'A', { powers: [tele] }, { x: 0, y: 0 }], ['T', 'B', { hp: 0 }, { x: 1, y: 0 }]]);
  const [u, t] = [who(b, 'U'), who(b, 'T')];
  const atk = u.attacks.find((a) => a.name === 'Banish');
  assert.ok(atk, 'it is an attack');
  assert.equal(atk.range, 'close');
  assert.equal(atk.resistance, 'Will');
  assert.equal(atk.effect, 'Teleport');
  resolveAttack(b, R, u, atk, t, dice(HIT, 1), {}); // the Will check fails
  assert.ok(t.x > 4, `sent away from x 1 (now ${t.x})`);
  assert.match(text(b), /T is teleported away from B1 to .* \(Teleport Attack\)/);
  const without = powerArena([['U', 'A', { powers: [{ ...tele, extras: [] }] }, { x: 0, y: 0 }], ['T', 'B', { hp: 0 }, { x: 1, y: 0 }]]);
  assert.equal(who(without, 'U').attacks.some((a) => a.name === 'Banish'), false, 'without the extra it is only a movement');
});

test('Attack: an Attack extra on an effect the engine has no rule for leaves it out of the fight', () => {
  const shrink = { name: 'Shrink Ray', effect: 'Shrinking', rank: 5, range: 'Personal', role: 'utility', extras: [x('Attack')], flaws: [] };
  const b = powerArena([['U', 'A', { powers: [shrink] }, { x: 0, y: 0 }], ['T', 'B', { hp: 0 }, { x: 1, y: 0 }]]);
  assert.equal(who(b, 'U').attacks.some((a) => a.name === 'Shrink Ray'), false);
});

