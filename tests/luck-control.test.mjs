// Luck Control (Hero's Handbook p106): each rank buys one capability (grant a re-roll, bestow a luck point, negate a re-roll,
// force a worse re-roll), as reactions that hook into the re-roll code, and a power limited to "against me" works only on
// rolls aimed at its owner. Source: src/engine/battle/luck.js, luck-attack.js and the hooks in attack-roll.js, fortune.js and
// checks.js. Dice are scripted. SOFT has Parry 6 (flat defense 16) and Toughness 4; STRIKER is SOFT with Unarmed +8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { R, dice, luckControl, powerArena, who, unarmed, text } from './helpers/power-arena.mjs';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { luckControlOf } from '../src/engine/battle/luck.js';
import { rollCheck } from '../src/engine/battle/checks.js';
import { plainFx } from '../src/engine/battle/fortune.js';

const ballista = () => JSON.parse(readFileSync(new URL('./fixtures/ballista.json', import.meta.url), 'utf8'));
const SOFT = { abilities: { Fighting: 0 } };
const skill = [{ name: 'Close Combat', spec: 'Unarmed', ranks: 8 }];
const STRIKER = { abilities: { Fighting: 0 }, skills: skill };
const STRONG = { abilities: { Fighting: 0, Strength: 8 }, skills: skill };   // Damage 8: DC 23 against Toughness 4

/** Back to a fighter who has taken no harm, so the next hit meets the same Toughness. */
const fresh = (c) => Object.assign(c, { out: false, bruises: 0, staggered: false, dazed: false, conditions: [] });
const swing = (b, from, to, rolls) => { const d = dice(...rolls); resolveAttack(b, R, who(b, from), unarmed(who(b, from)), who(b, to), d); return d; };
/** atk (STRONG) swings at t, with ctl (Luck Control with `detail`, `hp` points, `luck` Luck) on t's side. */
const forcing = ({ detail = 'force', hp = 1, luck = 0, atk = { hp: 0 } } = {}) => powerArena([
  ['atk', 'A', { ...STRONG, ...atk }, { x: 0, y: 0 }], ['t', 'B', { ...SOFT, hp: 0 }, { x: 1, y: 0 }],
  ['ctl', 'B', { ...SOFT, powers: [luckControl(1, detail)], hp, luck }, { x: 3, y: 0 }]]);

test('the capabilities come from the text of the power; with none named a rank N power has the first N in order', () => {
  const caps = (rank, detail) => luckControlOf({ powers: [luckControl(rank, detail)] }).caps;
  assert.deepEqual(caps(2, ''), ['grant', 'bestow']);
  assert.deepEqual(caps(4, ''), ['grant', 'bestow', 'negate', 'force']);
  assert.deepEqual(caps(2, 'Grant a re-roll or force a worse one'), ['grant', 'force']);
  assert.deepEqual(caps(3, 'negate only'), ['negate']);
  assert.deepEqual(caps(1, 'force and bestow'), ['bestow']);
  assert.equal(luckControlOf({ powers: [] }), null);
});

test('Ballista\'s Bad luck is rank 4 with all four capabilities, limited to rolls against him', () => {
  const lc = luckControlOf(ballista());
  assert.deepEqual([lc.name, lc.rank, lc.caps, lc.mineOnly], ['Bad luck', 4, ['grant', 'bestow', 'negate', 'force'], true]);
  assert.equal(luckControlOf({ powers: [luckControl(2, 'Works on any roll')] }).mineOnly, false);
  assert.equal(luckControlOf({ powers: [luckControl(2, 'only against you')] }).mineOnly, true);
});

test('force: an enemy hit that would often stagger is re-rolled, and the worse of the two rolls stands', () => {
  const b = forcing();
  const d = swing(b, 'atk', 't', [8, 3]);              // 8 + 8 = 16 hits the flat 16; the forced second roll of 3 is worse and misses
  assert.equal(d.left(), 0);
  assert.match(text(b), /ctl spends a hero point to force atk to re-roll the attack roll with Fate \(Luck Control\): d20 8, then 3 — takes the worse, 3\./);
  assert.match(text(b), /d20 3 \+8 = 11 vs Parry DC 16 — miss/);
  assert.equal(who(b, 'ctl').heroPoints, 0);
});

test('force: the worse of the two is the first roll when the second is better, and the hit stands', () => {
  const b = forcing();
  swing(b, 'atk', 't', [8, 18, 2]);
  assert.match(text(b), /takes the worse, 8\./);
  assert.match(text(b), /d20 8 \+8 = 16 vs Parry DC 16 — hit/);
});

test('force: the target of it may spend a point to avoid the re-roll', () => {
  const b = forcing({ luck: 1, atk: { hp: 1 } });      // the controller has Luck to spare; the attacker has a hero point
  swing(b, 'atk', 't', [8, 2]);
  assert.match(text(b), /ctl spends Luck to force atk to re-roll the attack roll with Fate \(Luck Control\), but atk spends a hero point to avoid it\./);
  assert.match(text(b), /d20 8 \+8 = 16 vs Parry DC 16 — hit/);
  assert.equal(who(b, 'atk').heroPoints, 0);
});

test('force: a controller with only a hero point does not force a roller who could simply avoid it', () => {
  const b = forcing({ atk: { hp: 1 } });
  const d = swing(b, 'atk', 't', [8, 2]);
  assert.equal(d.left(), 0);
  assert.doesNotMatch(text(b), /force/);
});

test('force: not worth it when the hit would rarely stagger, and not on an attack that was barely likely to land', () => {
  const weak = powerArena([['atk', 'A', { ...STRIKER, hp: 0 }, { x: 0, y: 0 }], ['t', 'B', { ...SOFT, hp: 0 }, { x: 1, y: 0 }], ['ctl', 'B', { ...SOFT, powers: [luckControl(1, 'force')] }, { x: 3, y: 0 }]]);
  const d = swing(weak, 'atk', 't', [8, 2]);            // Damage 4 against DC 19: only a 20% chance of three degrees
  assert.equal(d.left(), 0);
  const sure = powerArena([['atk', 'A', { ...STRONG, skills: [{ name: 'Close Combat', spec: 'Unarmed', ranks: 20 }], hp: 0 }, { x: 0, y: 0 }], ['t', 'B', { ...SOFT, hp: 0 }, { x: 1, y: 0 }], ['ctl', 'B', { ...SOFT, powers: [luckControl(1, 'force')] }, { x: 3, y: 0 }]]);
  const e = swing(sure, 'atk', 't', [10, 2]);           // +20 against 16: a second die would nearly always hit too
  assert.equal(e.left(), 0);
  assert.doesNotMatch(text(sure), /force/);
});

test('a controller makes one Luck Control reaction a round, however many points it has', () => {
  const b = forcing({ hp: 3 });
  swing(b, 'atk', 't', [8, 3]);                          // forced, misses
  fresh(who(b, 't'));
  const second = swing(b, 'atk', 't', [8, 2]);           // same round: no second force; the hit is resisted with the 2
  assert.equal(second.left(), 0);
  assert.equal(who(b, 'ctl').heroPoints, 2);
  b.round += 1; fresh(who(b, 't'));
  const third = swing(b, 'atk', 't', [8, 3]);            // a new round: forced again
  assert.equal(third.left(), 0);
  assert.equal(who(b, 'ctl').heroPoints, 1);
});

test('"against me": a limited power forces only rolls aimed at its owner, an unlimited one forces them for any ally', () => {
  const mk = (detail) => powerArena([['atk', 'A', { ...STRONG, hp: 0 }, { x: 0, y: 0 }], ['t', 'B', { ...SOFT, hp: 0 }, { x: 1, y: 0 }], ['ctl', 'B', { ...SOFT, hp: 1, powers: [luckControl(1, detail)] }, { x: 3, y: 0 }]]);
  const ally = mk('force, only against me');
  const a = swing(ally, 'atk', 't', [8, 2]);             // the roll is aimed at t, not at ctl: not used
  assert.equal(a.left(), 0);
  assert.doesNotMatch(text(ally), /Luck Control/);
  const own = mk('force, only against me');
  const o = swing(own, 'atk', 'ctl', [8, 3]);            // the same roll aimed at ctl itself: used
  assert.equal(o.left(), 0);
  assert.match(text(own), /ctl spends a hero point to force atk to re-roll the attack roll/);
  const free = mk('force');
  swing(free, 'atk', 't', [8, 3]);
  assert.match(text(free), /ctl spends a hero point to force atk/);
});

test('Ballista\'s Bad luck forces a barely-landing hit on him to be re-rolled, and does nothing for his ally', () => {
  const weakHitter = { abilities: { Fighting: 0, Strength: 16 }, skills: [{ name: 'Close Combat', spec: 'Unarmed', ranks: 2 }], hp: 0 };
  const mk = () => powerArena([['atk', 'A', weakHitter, { x: 0, y: 0 }], ['ballista', 'B', { ch: ballista() }, { x: 1, y: 0 }], ['pal', 'B', { ...SOFT, hp: 0 }, { x: 2, y: 0 }]]);
  const b = mk();
  const d = swing(b, 'atk', 'ballista', [17, 2]);        // fists are not psionic, so his Psionic Defense does not roll; 17 + 2 = 19 hits Parry 18; the forced second roll of 2 is worse
  assert.equal(d.left(), 0);
  assert.match(text(b), /ballista spends Luck to force atk to re-roll the attack roll with Bad luck \(Luck Control\): d20 17, then 2 — takes the worse, 2\./);
  assert.match(text(b), /Luck Control forced the roll from 17 to 2/);
  assert.equal(who(b, 'ballista').luck, 3);
  const pal = mk();
  const e = swing(pal, 'atk', 'pal', [14, 2]);           // no deflect roll against fists here either; 14 + 2 = 16 hits the ally's 16; Bad luck is only for rolls against Ballista
  assert.equal(e.left(), 0);
  assert.doesNotMatch(text(pal), /Bad luck/);
});

test('negate: an enemy controller wastes the re-roll, and the roller has still paid for it', () => {
  const mk = (withCtl) => powerArena([['atk', 'A', { ...STRIKER, hp: 1 }, { x: 0, y: 0 }], ['t', 'B', { ...SOFT, hp: 0 }, { x: 1, y: 0 }],
    ...(withCtl ? [['ctl', 'B', { ...SOFT, powers: [luckControl(1, 'negate')], hp: 1 }, { x: 3, y: 0 }]] : [])]);
  const b = mk(true);
  const d = swing(b, 'atk', 't', [5]);                   // 5 + 8 = 13 misses; the hero point re-roll is negated before any die is thrown
  assert.equal(d.left(), 0);
  assert.match(text(b), /ctl spends a hero point to negate atk's re-roll of the attack roll with Fate \(Luck Control\): it is wasted\./);
  assert.match(text(b), /atk spends a hero point to re-roll, but it is negated/);
  assert.deepEqual([who(b, 'atk').heroPoints, who(b, 'ctl').heroPoints], [0, 0]);
  const control = mk(false);
  swing(control, 'atk', 't', [5, 15, 2]);                // without the controller the re-roll of 15 hits
  assert.match(text(control), /spends a hero point to re-roll: 15 \+8 = 23/);
});

test('grant: an ally gives a fighter with no points a re-roll, paid for by the ally (Luck first)', () => {
  const b = powerArena([['atk', 'A', { ...STRIKER, hp: 0 }, { x: 0, y: 0 }], ['pal', 'A', { ...SOFT, powers: [luckControl(1, 'grant')], hp: 1, luck: 1 }, { x: 1, y: 1 }],
    ['t', 'B', { ...SOFT, hp: 0 }, { x: 1, y: 0 }]]);
  who(b, 't').staggered = true;                          // the miss matters
  const d = swing(b, 'atk', 't', [5, 12, 2]);
  assert.equal(d.left(), 0);
  assert.match(text(b), /pal spends Luck to grant atk a re-roll of the attack roll with Fate \(Luck Control\)\./);
  assert.match(text(b), /atk takes the granted re-roll to re-roll: 12 \+8 = 20/);
  assert.deepEqual([who(b, 'pal').luck, who(b, 'pal').heroPoints, who(b, 'atk').heroPoints], [0, 1, 0]);
});

test('grant is not used when the miss does not matter, and not when the fighter has a re-roll of its own', () => {
  const b = powerArena([['atk', 'A', { ...STRIKER, hp: 0 }, { x: 0, y: 0 }], ['pal', 'A', { ...SOFT, powers: [luckControl(1, 'grant')], hp: 1 }, { x: 1, y: 1 }], ['t', 'B', { ...SOFT, hp: 0 }, { x: 1, y: 0 }]]);
  const d = swing(b, 'atk', 't', [5]);                   // an unhurt target on a first miss: not worth a point
  assert.equal(d.left(), 0);
  assert.equal(who(b, 'pal').heroPoints, 1);
  const own = powerArena([['atk', 'A', { ...STRIKER, hp: 1 }, { x: 0, y: 0 }], ['pal', 'A', { ...SOFT, powers: [luckControl(1, 'grant')], hp: 1 }, { x: 1, y: 1 }], ['t', 'B', { ...SOFT, hp: 0 }, { x: 1, y: 0 }]]);
  swing(own, 'atk', 't', [5, 15, 2]);
  assert.equal(who(own, 'pal').heroPoints, 1);
  assert.equal(who(own, 'atk').heroPoints, 0);
});

test('bestow: a luck point for an ally with none, once per ally per round, at no cost to the controller', () => {
  const b = powerArena([['atk', 'A', { ...STRIKER, hp: 0 }, { x: 0, y: 0 }], ['pal', 'A', { ...SOFT, powers: [luckControl(1, 'bestow')], hp: 1 }, { x: 1, y: 1 }], ['t', 'B', { ...SOFT, hp: 0 }, { x: 1, y: 0 }]]);
  who(b, 't').staggered = true;
  const d = swing(b, 'atk', 't', [5, 12, 2]);
  assert.equal(d.left(), 0);
  assert.match(text(b), /pal bestows a luck point on atk with Fate \(Luck Control\) for the attack roll\./);
  assert.match(text(b), /atk uses Luck to re-roll: 12 \+8 = 20/);
  assert.deepEqual([who(b, 'pal').heroPoints, who(b, 'atk').luck, who(b, 'atk').bestowedRound], [1, 0, b.round]);
  who(b, 'pal').luckCtlRound = null;                     // even with the controller ready again, the same ally gets no second point this round
  fresh(who(b, 't')); who(b, 't').staggered = true;
  const again = swing(b, 'atk', 't', [5]);
  assert.equal(again.left(), 0);
  assert.equal(who(b, 'atk').luck, 0);                  // no second luck point was handed over
  assert.equal(who(b, 'pal').luckCtlRound, null);
});

test('a re-roll of any check can be granted: the same hook serves resistance, escape and the other checks', () => {
  const b = powerArena([['roller', 'A', { ...SOFT, hp: 0 }, { x: 0, y: 0 }], ['pal', 'A', { ...SOFT, powers: [luckControl(1, 'grant')], hp: 1 }, { x: 1, y: 0 }], ['foe', 'B', SOFT, { x: 2, y: 0 }]]);
  const r = rollCheck(dice(3, 14), 5, 12, plainFx(b, who(b, 'roller'), 'escape check'));
  assert.equal(r.success, true);                         // 3 + 5 = 8 fails; the granted re-roll of 14 gives 19
  assert.match(text(b), /pal spends a hero point to grant roller a re-roll of the escape check/);
  assert.match(text(b), /roller takes the granted re-roll to re-roll the escape check: d20 3, then 14 — takes 14 \(granted by Luck Control\)\./);
  const none = powerArena([['roller', 'A', { ...SOFT, hp: 0 }, { x: 0, y: 0 }], ['foe', 'B', SOFT, { x: 2, y: 0 }]]);
  assert.equal(plainFx(none, who(none, 'roller'), 'escape check'), null);
});

test('force on a resistance check: an enemy passed it against the team\'s best attack, and a worse roll makes it fail', () => {
  const b = powerArena([['atk', 'A', { ...STRONG, hp: 0 }, { x: 0, y: 0 }], ['ctl', 'A', { ...SOFT, powers: [luckControl(1, 'force')], hp: 1 }, { x: 0, y: 1 }], ['t', 'B', { ...SOFT, hp: 0 }, { x: 1, y: 0 }]]);
  const d = swing(b, 'atk', 't', [12, 19, 2]);           // hit; Toughness 19 + 4 = 23 passes DC 23; the forced second roll of 2 fails by four degrees
  assert.equal(d.left(), 0);
  assert.match(text(b), /ctl spends a hero point to force t to re-roll the Toughness check with Fate \(Luck Control\): d20 19, then 2 — takes the worse, 2\./);
  assert.equal(who(b, 't').out, true);
});

test('force on a resistance check is kept for the team\'s best attack, not for any attack', () => {
  const b = powerArena([['atk', 'A', { ...SOFT, skills: skill, hp: 0 }, { x: 0, y: 0 }], ['ctl', 'A', { ...STRONG, powers: [luckControl(1, 'force')], hp: 1 }, { x: 0, y: 1 }], ['t', 'B', { ...SOFT, hp: 0 }, { x: 1, y: 0 }]]);
  const d = swing(b, 'atk', 't', [12, 19]);              // atk's Damage 4 is below ctl's 8: the team's best attack is someone else's
  assert.equal(d.left(), 0);
  assert.doesNotMatch(text(b), /force/);
});
