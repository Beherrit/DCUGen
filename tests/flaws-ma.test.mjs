// Martial Arts (3e) flaws (MA p94-98) and the AI's view of flawed attacks: Chained, Momentum-Based, Diluted, Dulled,
// Inexact, Uncertain, Bad Bounce, and Removable (Hero's Handbook p136). Dice are scripted (helpers/flaw-kit.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duel, fire, logOf, zap, flaw, who, dice, R, HIT } from './helpers/flaw-kit.mjs';
import { powerArena } from './helpers/power-arena.mjs';
import { body } from './helpers/fighters.mjs';
import { expectedValue, dcOf } from '../src/engine/battle/odds.js';
import { flawsOf } from '../src/engine/battle/flaws.js';
import { bounceDc } from '../src/engine/battle/flaw-odds.js';
import { bestAttackVs } from '../src/engine/battle/plan.js';
import { flawedAction } from '../src/engine/battle/flaw-turn.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';

const ev = (f, t = f.t) => expectedValue(f.u, f.atk, t, { b: f.b });

/** U has a plain Prime and a Chain that needs Prime to have worked last turn. */
function chained() {
  const b = powerArena([['U', 'A', { powers: [zap([], { name: 'Prime' }), zap([flaw('Chained', { detail: 'Prime' })], { name: 'Chain' })] }, { x: 0, y: 0 }], ['T', 'B', { hp: 0 }, { x: 2, y: 0 }]], { heroPoints: true });
  const u = who(b, 'U');
  return { b, u, t: who(b, 'T'), prime: u.attacks.find((a) => a.name === 'Prime'), chain: u.attacks.find((a) => a.name === 'Chain') };
}

test('Chained: it works only if the prerequisite worked in the fighter\'s previous turn', () => {
  const f = chained();
  const use = (atk, ...rolls) => resolveAttack(f.b, R, f.u, atk, f.t, dice(...rolls), {});
  assert.equal(expectedValue(f.u, f.chain, f.t, { b: f.b }), 0, 'the AI uses Prime first');
  use(f.chain);
  assert.match(f.b.log.map((e) => e.text).join('\n'), /Chained to Prime: U did not use Prime with success last turn/);
  use(f.prime, HIT, 1);
  assert.equal(f.u.flaw.done.Prime, f.b.round);
  assert.equal(expectedValue(f.u, f.chain, f.t, { b: f.b }), 0, 'the same turn is not the previous turn');
  f.b.round += 1;
  assert.ok(expectedValue(f.u, f.chain, f.t, { b: f.b }) > 0);
  use(f.chain, HIT, 1);
  assert.equal(f.t.bruises, 2);
});

test('Chained: a prerequisite that missed does not count', () => {
  const f = chained();
  f.u.heroPoints = 0;
  resolveAttack(f.b, R, f.u, f.prime, f.t, dice(2), {});
  assert.equal(f.u.flaw.done.Prime, undefined);
  f.b.round += 1;
  assert.equal(expectedValue(f.u, f.chain, f.t, { b: f.b }), 0);
});

test('Momentum-Based: it needs a move this turn behind it, or it has no effect', () => {
  const f = duel([flaw('Momentum-Based')]);
  fire(f);
  assert.match(logOf(f), /Momentum-Based: U has not moved this turn, so there is no speed behind it/);
  f.u.squaresMoved = 2;
  fire(f, HIT, 1);
  assert.equal(f.t.bruises, 1);
});

test('Momentum-Based: the fighter runs first, keeping the target in range, then the effect works', () => {
  const f = duel([flaw('Momentum-Based')]);
  assert.equal(flawedAction(f.b, f.u, f.atk, f.t, 'full', dice()), false);
  assert.ok(f.u.squaresMoved > 0);
  assert.match(logOf(f), /moves to build speed \(Momentum-Based\)/);
  fire(f, HIT, 1);
  assert.equal(f.t.bruises, 1);
  const dazed = duel([flaw('Momentum-Based')]);
  assert.equal(flawedAction(dazed.b, dazed.u, dazed.atk, dazed.t, 'standard', dice()), true, 'one action: no run');
  assert.match(logOf(dazed), /no room or no move left to build speed/);
});

test('Diluted: the resistance DC is 1 lower per rank, and never below 10', () => {
  const f = duel([flaw('Diluted', { steps: 6 })]);
  assert.equal(dcOf(f.atk), 15 + 8 - 6);
  assert.equal(dcOf(duel([flaw('Diluted', { steps: 20 })]).atk), 10);
  fire(f, HIT, 1);
  assert.match(logOf(f), /vs DC 17/);
});

test('Dulled: the effect loses ranks while its condition holds, but not its other aspects; completely dulled to 0 does nothing', () => {
  const dulled = (extra = {}) => duel([flaw('Dulled', { steps: 3, detail: 'machines', ...extra })], {}, { abilities: { Stamina: null } });
  const f = dulled();
  fire(f, HIT, 1);
  assert.match(logOf(f), /Dulled takes 3 ranks off: rank 5/);
  assert.match(logOf(f), /vs DC 20/, 'DC 15 + 5');
  const living = duel([flaw('Dulled', { steps: 3, detail: 'machines' })]);
  fire(living, HIT, 1);
  assert.doesNotMatch(logOf(living), /Dulled/);
  assert.match(logOf(living), /vs DC 23/);
  const all = duel([flaw('Dulled', { steps: 8, detail: 'machines', option: '-2' })], {}, { abilities: { Stamina: null } });
  fire(all, HIT);
  assert.match(logOf(all), /Completely Dulled down to rank 0 is nullified/);
  const half = duel([flaw('Dulled', { steps: 8, detail: 'machines' })], {}, { abilities: { Stamina: null } });
  fire(half, HIT, 1);
  assert.match(logOf(half), /vs DC 15/, 'a Dulled effect at rank 0 keeps the base DC');
  const weak = duel([flaw('Dulled', { steps: 7, detail: 'machines' })], {}, { abilities: { Stamina: null } });
  assert.ok(ev(weak) < ev(duel([], {}, { abilities: { Stamina: null } })), 'the AI sees the lost ranks');
});

test('Inexact: each target in the area needs its own attack check first', () => {
  const area = { extras: [{ name: 'Area', option: 'Burst' }, { name: 'Selective' }] };
  const hit = duel([flaw('Inexact')], area);
  fire(hit, HIT, 1, 1);                   // the attack check, the Dodge check for half, the Toughness check
  assert.match(logOf(hit), /Inexact: attack check on T d20 19 \+2 = 21 vs Dodge DC 20 — it catches them/);
  assert.equal(hit.t.bruises, 1);
  const miss = duel([flaw('Inexact')], area);
  fire(miss, 2);
  assert.match(logOf(miss), /it misses them/);
  assert.equal(miss.t.bruises, 0);
  const plain = duel([], area);
  fire(plain, 1, 1);                      // no attack check: the Dodge check and the Toughness check
  assert.equal(plain.t.bruises, 1);
});

test('Uncertain: the critical miss range grows by one natural number per rank', () => {
  const run = (flaws) => { const f = duel(flaws, {}, {}, { hp: 0 }); f.atk.bonus = 30; fire(f, 2, 1); return f; };
  assert.equal(run([]).t.bruises, 1, 'a natural 2 with a big bonus hits');
  const f = run([flaw('Uncertain')]);
  assert.equal(f.t.bruises, 0);
  assert.match(logOf(f), /Uncertain: a natural 2 is a critical miss/);
});

test('Bad Bounce: read onto the attack, with the check DC of each bounce ready for the Ricochet extra', () => {
  assert.equal(flawsOf(zap([flaw('Bad Bounce', { steps: 2 })])).badBounce, 2);
  assert.equal(bounceDc(10, 0), 20);
  assert.equal(bounceDc(10, 2), 24, '+2 for each earlier bounce');
  assert.equal(bounceDc(10, 1, true), 12, 'a surface that does not move: DC 10');
});

// ---- Removable (Hero's Handbook p136) ----

test('Removable: a device with the flaw stays in hand during a fight; Easily Removable can be disarmed', () => {
  const mk = (flaws) => powerArena([['U', 'A', { ch: { ...body(), devices: [{ name: 'Ray Gun', kind: 'none', powers: [zap(flaws)] }] } }, { x: 0, y: 0 }], ['T', 'B', {}, { x: 2, y: 0 }]]);
  const held = (flaws) => who(mk(flaws), 'U').attacks.find((a) => a.name === 'Zap').item.held;
  assert.equal(held([flaw('Removable', { option: 'Removable' })]), false);
  assert.equal(held([flaw('Removable', { option: 'Easily Removable' })]), true);
});

// ---- the AI ----

test('the AI prefers the unflawed attack when two are close, and a flawed one only when it is worth more', () => {
  const pair = (flaws, rank) => {
    const b = powerArena([['U', 'A', { powers: [zap([], { name: 'Bolt' }), zap(flaws, { name: 'Flawed', rank })] }, { x: 0, y: 0 }], ['T', 'B', { hp: 0, abilities: { Stamina: 14 } }, { x: 2, y: 0 }]], { heroPoints: true });
    return bestAttackVs(b, who(b, 'U'), who(b, 'T'), dice(), { full: true }).attack.name;
  };
  for (const flaws of [[flaw('Unreliable')], [flaw('Tiring')], [flaw('Side Effect', { option: 'Always' })], [flaw('Activation', { option: 'Standard action' })], [flaw('Inaccurate', { steps: 2 })], [flaw('Distracting')]]) {
    assert.equal(pair(flaws, 8), 'Bolt', flaws[0].name);
  }
  assert.equal(pair([flaw('Unreliable')], 14), 'Flawed', 'a much stronger Unreliable attack is still worth it');
});
