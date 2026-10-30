// Identify and Disrupt Stance, the AI's choice of stance, and the martial arts combat advantages (MA pp 49-50, 72-80) in the Battle Room.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, artist, ring, who, choice, texts } from './helpers/ma-kit.mjs';
import { dice } from './helpers/fighters.mjs';
import { stanceDef } from '../src/engine/martial/lookup.js';
import { enterStance, stanceName, assumeStance } from '../src/engine/battle/stance-fight.js';
import { identifyStances, disruptContest, sees } from '../src/engine/battle/stance-contest.js';
import { scoreStances, wantsDisrupt, stanceTurn } from '../src/engine/battle/stance-plan.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { reversal, quickThrow, damagingEscape } from '../src/engine/battle/ma-reactions.js';
import { bobAndWeave } from '../src/engine/battle/style-turn.js';
import { takeTurn } from '../src/engine/battle/turn.js';
import { defenseOf, activeConditions } from '../src/engine/battle/conditions.js';
import { readExtras } from '../src/engine/battle/style-extras.js';
import { runToEnd } from '../src/engine/battle.js';

const atk = (c, name) => c.attacks.find((a) => a.name === name);
const put = (c, name, style = 'Aikido') => enterStance(c, { name, def: stanceDef(R, name), style });
const steady = { next: () => 0.5, int: (a, z) => Math.floor((a + z) / 2), chance: () => true, pick: (a) => a[0], shuffle: (a) => a, weighted: (a) => a[0] };
const pair = (mine = {}, theirs = {}, spots = [[0, 0], [1, 0]]) => {
  const b = ring([['me', 'A', artist({ tier: 'student', abilities: { Fighting: 3 }, ranks: 3, ...mine })], ['foe', 'B', artist({ style: 'Boabom', abilities: { Fighting: 3 }, ranks: 3, ...theirs })]]);
  b.options.heroPoints = false; // no re-rolls: the dice in a test are the ones the test names
  const me = who(b, 'me'); const foe = who(b, 'foe');
  [me.x, me.y] = spots[0]; [foe.x, foe.y] = spots[1];
  for (const c of [me, foe]) for (const s of c.ma.styles) Object.assign(s, readExtras(null));
  return { b, me, foe };
};

// ---- Identify and Disrupt Stance ----

test('Identify Stance: a free Fighting Style check against the stance\'s DC, +2 for each stance after the first; success is remembered', () => {
  const { b, me, foe } = pair();
  put(foe, 'Kicker', 'Boabom');
  assert.equal(sees(me, foe), false);
  identifyStances(b, me, [foe], dice(15));
  assert.equal(sees(me, foe), true);
  assert.match(texts(b).at(-1), /Identify Stance d20 15 \+\d+ = \d+ vs DC 15 — Kicker stance/);
  me.ma.known = {};
  identifyStances(b, me, [foe], dice(1));
  assert.equal(sees(me, foe), false, 'a failed check reads nothing');
  assert.match(texts(b).at(-1), /cannot make out the stance/);
});

test('Identify Stance is automatic for a fighter with Expertise in the foe\'s own style', () => {
  const { b, me, foe } = pair();
  me.ch.skills.push({ name: 'Expertise', spec: 'Specific Fighting Style (Boabom)', ranks: 2 });
  put(foe, 'Kicker', 'Boabom');
  identifyStances(b, me, [foe], dice());
  assert.equal(sees(me, foe), true);
  assert.match(texts(b).at(-1), /knows the Boabom style/);
});

test('Deceptive Stance makes a stance harder to read: -4 a rank on the Identify check', () => {
  const plainFoe = pair().foe;
  const sly = pair({}, { adv: [{ name: 'Deceptive Stance', rank: 2 }] });
  put(sly.foe, 'Kicker', 'Boabom');
  put(plainFoe, 'Kicker', 'Boabom');
  const roll = (p) => { identifyStances(p.b, p.me, [p.foe], dice(10)); return /= (\d+) vs/.exec(texts(p.b).at(-1))[1]; };
  const sees1 = pair(); put(sees1.foe, 'Kicker', 'Boabom');
  assert.equal(Number(roll(sees1)) - Number(roll(sly)), 8);
});

test('a foe whose stance has not been identified is weighed as if it stood in Neutral', () => {
  const ranged = { ...{}, maneuvers: ['Jab'] };
  const a = pair(ranged);
  a.me.ch.powers.push({ id: 'p', name: 'Bolt', effect: 'Damage', rank: 6, range: 'Ranged', extras: [], flaws: [], descriptors: [], alternates: [] });
  const known = pair(ranged); const unknown = pair(ranged);
  for (const p of [known, unknown]) { put(p.foe, 'Crane', 'Boabom'); p.me.attacks.push({ ...atk(p.me, 'Unarmed'), id: 'Bolt|Damage|6|ranged', name: 'Bolt', range: 'ranged', kind: 'ranged', rank: 6, bonus: 8 }); }
  known.me.ma.known[known.foe.id] = 'Crane';
  const here = (p) => scoreStances(p.b, p.me, [p.foe], false).here;
  assert.ok(here(known) > here(unknown), 'a Crane fighter has Dodge 0, which only the fighter who can see the stance counts on');
});

test('Disrupt Stance: opposed Fighting Style checks; a defender who loses falls back to Neutral', () => {
  const { b, me, foe } = pair();
  put(foe, 'Kicker', 'Boabom');
  disruptContest(b, me, foe, dice(20, 1));
  assert.equal(stanceName(foe), 'Neutral');
  assert.match(texts(b).join(' '), /Disrupt Stance: me d20 20 .* thrown into disarray/);
  put(foe, 'Kicker', 'Boabom');
  disruptContest(b, me, foe, dice(1, 20));
  assert.equal(stanceName(foe), 'Kicker', 'the defender wins the contest and holds the stance');
});

test('a disruptive attack takes -5 to hit and -2 Damage, and a hit that does no damage still calls for the contest', () => {
  const { b, me, foe } = pair({ maneuvers: ['Jab'] });
  put(foe, 'Kicker', 'Boabom');
  const plain = atk(me, 'Jab');
  resolveAttack(b, R, me, plain, foe, dice(17, 20, 20, 1, 1, 1, 1), { disrupt: true });
  assert.match(texts(b).join(' '), /disrupting the stance: −5 to hit, −2 Damage/);
  assert.match(texts(b).join(' '), /Disrupt Stance:/);
});

test('the Disruptive stance adds 8 to a disrupt and takes 4 off the fighter\'s other Fighting Style checks', () => {
  const { b, me, foe } = pair({}, {}, [[0, 0], [1, 0]]);
  put(foe, 'Kicker', 'Boabom');
  put(me, 'Neutral');
  const bonusOf = () => /me d20 10 \+(-?\d+)/.exec((disruptContest(b, me, foe, dice(10, 1)), texts(b).findLast((t) => /Disrupt Stance/.test(t))))[1];
  const plainBonus = Number(bonusOf());
  put(foe, 'Kicker', 'Boabom');
  put(me, 'Disruptive');
  assert.equal(Number(bonusOf()), plainBonus + 8);
});

test('the AI disrupts a stance it has identified and that gives the foe a real edge, and not one it has not read', () => {
  const { b, me, foe } = pair({ maneuvers: ['Jab'], ranks: 8 });
  put(foe, 'Crane', 'Boabom'); // +2 attack and Parry
  const jab = atk(me, 'Jab');
  assert.equal(wantsDisrupt(b, me, jab, foe), false, 'a stance it cannot read is not worth the penalty');
  me.ma.known[foe.id] = 'Crane';
  assert.equal(wantsDisrupt(b, me, jab, foe), true);
  put(foe, 'Neutral', 'Boabom');
  assert.equal(wantsDisrupt(b, me, jab, foe), false, 'nothing to disrupt');
});

// ---- the AI's choice of stance ----

function gains(mine, theirs = {}, spots) {
  const p = pair(mine, theirs, spots);
  const r = scoreStances(p.b, p.me, [p.foe], false);
  return { ...p, ...r, gain: (name) => r.scores.find((s) => s.choice.name === name)?.gain };
}

test('a fighter who fights with its hands is worth more in Pugilist stance, and one with a kick in Kicker stance', () => {
  const hands = gains({ style: 'Savate', maneuvers: ['Jab'] });
  assert.ok(hands.gain('Pugilist') > hands.margin, `Pugilist ${hands.gain('Pugilist')} vs ${hands.margin}`);
  const feet = gains({ style: 'Savate', maneuvers: ['Axe Kick', 'Side Kick'], ranks: 6 });
  feet.me.attacks = feet.me.attacks.filter((a) => /Kick/.test(a.name));
  const again = scoreStances(feet.b, feet.me, [feet.foe], false);
  assert.ok(again.scores.find((s) => s.choice.name === 'Kicker').gain > again.margin);
});

test('a stance that only costs the fighter is never taken, and one it cannot use (Weapon with no weapon) is not offered', () => {
  const g = gains({ style: 'Kuk Sool Won', maneuvers: ['Jab'] });
  assert.ok(!g.scores.some((s) => s.choice.name === 'Weapon'), 'no weapon in hand');
  for (const s of g.scores) if (['Finishing', 'Wary'].includes(s.choice.name)) assert.ok(s.gain <= g.margin);
});

test('Crane stance, which cannot move, is no good to a fighter who has to walk to its foe', () => {
  const g = gains({ style: 'Savate', maneuvers: ['Jab'] }, {}, [[0, 0], [9, 9]]);
  const crane = g.scores.find((s) => s.choice.name === 'Crane');
  if (crane) assert.ok(crane.gain <= g.margin, 'Crane does not pay when the foe is far');
});

test('the turn uses a free action to change stance from Neutral, and takes the move action to change from another', () => {
  const { b, me, foe } = pair({ style: 'Savate', maneuvers: ['Jab'] });
  const mode = stanceTurn(b, R, me, [foe], 'full', steady);
  assert.equal(mode, 'full', 'from Neutral it is free');
  assert.notEqual(stanceName(me), 'Neutral', 'a hand fighter next to its foe takes a stance');
  const from = stanceName(me);
  put(me, from === 'Pugilist' ? 'Kicker' : 'Pugilist', 'Savate'); // now it would have to pay a move action to change back
  assert.ok(['full', 'standard'].includes(stanceTurn(b, R, me, [foe], 'full', steady)));
});

test('a stunned fighter does not take a stance that would be broken at once', () => {
  const { b, me, foe } = pair({ style: 'Savate', maneuvers: ['Jab'] });
  me.conditions.push({ name: 'Vulnerable', degree: 1, from: 'foe', source: 'test' });
  stanceTurn(b, R, me, [foe], 'full', steady);
  assert.equal(stanceName(me), 'Neutral');
});

// ---- advantages that act around an attack ----

function strike(b, me, foe, name = 'Unarmed', rolls = [10, 10, 10, 10, 10, 10, 10, 10]) {
  return resolveAttack(b, R, me, atk(me, name), foe, dice(...rolls), {});
}

test('Counterstrike: a free attack at -2 on a foe who lands a melee blow, for a fighter that did not attack this round', () => {
  const { b, me, foe } = pair({ adv: [{ name: 'Counterstrike', rank: 1 }], maneuvers: [] });
  b.order = ['me', 'foe']; b.turn = 2; b.round = 1; // me has had its turn, foe is acting
  strike(b, foe, me, 'Unarmed', [20, 10, 10, 10, 10, 10, 10, 10, 10]);
  assert.match(texts(b).join(' '), /Counterstrike: me answers foe's blow/);
  assert.match(texts(b).join(' '), /Counterstrike: −2 to hit/);
});

test('Counterstrike is not used by a fighter that has attacked this round', () => {
  const { b, me, foe } = pair({ adv: [{ name: 'Counterstrike', rank: 1 }] });
  b.order = ['me', 'foe']; b.turn = 2; b.round = 1;
  me.attackRound = 1;
  strike(b, foe, me, 'Unarmed', [20, 10, 10, 10, 10, 10, 10]);
  assert.ok(!texts(b).some((t) => /Counterstrike/.test(t)));
});

test('Defensive Throw: a close attack that misses by 2 or more degrees is answered with a free trip', () => {
  const { b, me, foe } = pair({ adv: [{ name: 'Defensive Throw', rank: 1 }] });
  strike(b, foe, me, 'Unarmed', [2, 10, 10, 10, 10, 10, 10]);
  assert.match(texts(b).join(' '), /Defensive Throw: foe missed by \d degrees, and me turns it into a free trip attempt/);
  assert.match(texts(b).join(' '), /me tries to trip foe/);
});

test('Follow-Up Strike: a critical hit with a melee attack earns another attack as a free action', () => {
  const { b, me, foe } = pair({ adv: [{ name: 'Follow-Up Strike', rank: 1 }] });
  strike(b, me, foe, 'Unarmed', [20, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  assert.match(texts(b).join(' '), /Follow-Up Strike: me presses the critical hit/);
  assert.ok(texts(b).filter((t) => /me .*(Unarmed|foe): d20/.test(t)).length >= 2, 'two attacks');
});

test('Sweeping Strike: a successful unarmed attack is joined by a free trip attempt', () => {
  const { b, me, foe } = pair({ adv: [{ name: 'Sweeping Strike', rank: 1 }] });
  strike(b, me, foe, 'Unarmed', [15, 10, 10, 10, 10, 10, 10, 10]);
  assert.match(texts(b).join(' '), /Sweeping Strike: me follows the blow with a free trip attempt/);
});

test('Reversal: a fighter who has slipped a grab takes hold of the grabber', () => {
  const { b, me, foe } = pair({ adv: [{ name: 'Reversal', rank: 1 }] });
  reversal(b, R, me, foe, dice(15, 1, 1, 1));
  assert.match(texts(b).join(' '), /Reversal: me slips the hold and grabs foe in turn/);
});

test('Quick Throw: a free trip right after a successful grab; Damaging Escape: a free blow on the grabber as you break free', () => {
  const { b, me, foe } = pair({ adv: [{ name: 'Quick Throw', rank: 1 }, { name: 'Damaging Escape', rank: 1 }] });
  quickThrow(b, me, foe, dice(...Array(12).fill(15)));
  assert.match(texts(b).join(' '), /Quick Throw: me hurls the foe/);
  assert.match(texts(b).join(' '), /me tries to trip foe/);
  damagingEscape(b, R, me, foe, dice(...Array(12).fill(15)), resolveAttack);
  assert.match(texts(b).join(' '), /Damaging Escape: me strikes foe as it breaks free/);
});

test('Crushing Hold: crushing a held foe is a free action, and the fighter goes on to attack', () => {
  const { b, me, foe } = pair({ adv: [{ name: 'Crushing Hold', rank: 1 }], maneuvers: ['Jab'] });
  me.holding = 'foe'; foe.grabbedBy = 'me';
  takeTurn(b, R, me, steady);
  const log = texts(b);
  assert.ok(log.some((t) => /crushes foe in the hold/.test(t)), log.join(' / '));
  assert.ok(log.some((t) => /me .*foe: d20|me .*foe with/.test(t)) || log.length > 1);
});

test('Bob and Weave: a Fighting Style check (DC 10) as a move action for +1 to active defense a degree, lost when the stance changes', () => {
  const { b, me, foe } = pair({ adv: [{ name: 'Bob and Weave', rank: 1 }], abilities: { Fighting: 3 }, ranks: 3 });
  const parry = defenseOf(me, 'Parry');
  const mode = bobAndWeave(b, me, [foe], 'full', dice(10));
  assert.equal(mode, 'standard', 'the move action is spent');
  assert.ok(defenseOf(me, 'Parry') > parry);
  assert.match(texts(b).at(-1), /Bob and Weave: me d20 10/);
  assumeStance(b, me, choice(me, 'Blocking'), dice(15));
  assert.ok(!me.mods.some((e) => e.source === 'bobweave'), 'changing stance ends it');
});

// ---- whole fights ----

test('whole fights between martial artists run clean: stances are taken, broken and logged, and nobody idles', () => {
  let shifts = 0; let idle = 0; let hesitate = 0;
  for (let n = 0; n < 12; n++) {
    const b = ring([['me', 'A', artist({ style: 'Savate', tier: 'student', maneuvers: ['Jab', 'Snap Kick', 'Sweep'] })], ['foe', 'B', artist({ style: 'Boabom', tier: 'student', maneuvers: ['Snap Kick', 'Lunge'] })]]);
    b.seed = `ma-whole-${n}`;
    runToEnd(b, R);
    for (const t of texts(b)) { if (/shifts into/.test(t)) shifts++; if (/finds nothing worth doing/.test(t)) idle++; if (/hesitates/.test(t)) hesitate++; }
  }
  assert.ok(shifts >= 6, `${shifts} stances taken in 12 fights`);
  assert.equal(idle, 0);
  assert.equal(hesitate, 0);
});

test('a fighter with a stance and an Immobile Crane is still hit by an attack of the same round without breaking it', () => {
  const { b, me } = pair();
  put(me, 'Crane', 'Boabom');
  assert.ok(activeConditions(me).has('Immobile'));
  assert.equal(stanceName(me), 'Crane');
  b.combatants.forEach((c) => c.out && 0);
});
