import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle, step, addCover, massRank, serializeBattle, reviveBattle } from '../src/engine/battle.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { makeRng } from '../src/engine/rng.js';
import { scenarios, play } from '../tools/battle-golden.mjs';

// Knockback, an optional community rule built like the throwing rule (p11): knockback rank = damage rank - mass rank.
// Rolls are scripted: a hit is [attack roll, Toughness roll, ...]. The target's Toughness is 0, so a low roll fails by 2+ degrees.
// The fights are on row 6 of the grid at 30 ft squares, so knockback rank 0 (30 ft) is one square and every rank doubles it.

const base = { pl: 10, skills: [], advantages: [], powers: [] };
const bruiser = (powers = []) => ({ ...base, name: 'Bruiser', identity: { codename: 'Bruiser' }, powers, abilities: { Strength: 8, Stamina: 8, Agility: 2, Dexterity: 0, Fighting: 8, Intellect: 0, Awareness: 0, Presence: 0 }, defenses: { Dodge: 2, Parry: 6, Fortitude: 6, Will: 2 } });
const blast = (rank, extras = []) => ({ name: 'Blast', effect: 'Damage', rank, range: 'Ranged', role: 'attack', extras, flaws: [] });
const shooter = (rank, extras) => ({ ...base, name: 'Shooter', identity: { codename: 'Shooter' }, abilities: { Strength: 0, Stamina: 4, Agility: 6, Dexterity: 6, Fighting: 2, Intellect: 0, Awareness: 0, Presence: 0 }, defenses: { Dodge: 6, Parry: 2, Fortitude: 4, Will: 2 }, skills: [{ name: 'Ranged Combat', spec: 'Blast', ranks: 4 }], powers: [blast(rank, extras)] });

/** Shooter S (team A) in column A with Damage `rank`, Bruiser B (team B) in column C of row 6 with Toughness 0. Hero points off. */
function scene(rank, opts = {}, { powers, extras } = {}) {
  const b = createBattle({ seed: 'kb' });
  Object.assign(b.options, { heroPoints: false, knockback: true }, opts);
  addCombatant(b, makeCombatant(R, shooter(rank, extras), { id: 'S', team: 'A', style: 'blaster' }));
  addCombatant(b, makeCombatant(R, bruiser(powers), { id: 'B', team: 'B', style: 'brawler' }));
  startBattle(b, R);
  b.log = [];
  put(b, 'S', 0); put(b, 'B', 2);
  get(b, 'B').d.defenses.Toughness = 0;
  return b;
}
const get = (b, id) => b.combatants.find((c) => c.id === id);
/** Stand a fighter in a column of row 6. */
const put = (b, id, x, y = 5) => { get(b, id).x = x; get(b, id).y = y; };
const scripted = (rolls) => { const r = makeRng('x'); const q = [...rolls]; return { ...r, int: (lo, hi) => (q.length ? q.shift() : r.int(lo, hi)) }; };
const lines = (b) => b.log.map((e) => e.text);
const prone = (c) => c.conditions.some((x) => x.name === 'Prone');
/** Shooter hits Bruiser (attack 15) and Bruiser rolls `tough` on Toughness; then any further rolls (collisions) in `more`. */
function hit(b, tough = 1, more = [], opts = {}) {
  const s = get(b, 'S');
  resolveAttack(b, R, s, s.attacks[0], get(b, 'B'), scripted([15, tough, ...more]), opts);
}
const note = (b) => lines(b).find((t) => t.startsWith('Knockback:'));
const flightLine = (b) => lines(b).find((t) => /knocked back|thrown to the ground|knocked prone/.test(t));

test('knockback is off by default: the same hard hit throws nobody', () => {
  const off = scene(4, { knockback: createBattle({ seed: 'd' }).options.knockback }); hit(off);
  assert.equal(createBattle({ seed: 'd' }).options.knockback, false);
  assert.equal(get(off, 'B').x, 2);
  assert.ok(!prone(get(off, 'B')));
  assert.ok(!lines(off).some((t) => /Knockback|knocked/.test(t)));
  const on = scene(4); hit(on);
  assert.equal(get(on, 'B').x, 6);
});

test('knockback rank is damage rank minus mass rank 2; distance doubles per rank, rank 0 is 30 ft, one square here (p11)', () => {
  const cases = [[1, -1, 2], [2, 0, 3], [3, 1, 4], [4, 2, 6], [5, 3, 10]];
  for (const [dmg, kb, end] of cases) {
    const b = scene(dmg); hit(b);
    assert.equal(get(b, 'B').x, end, `Damage ${dmg}`);
    assert.equal(get(b, 'B').y, 5, 'straight along the row');
    assert.match(note(b), new RegExp(`^Knockback: Damage ${dmg} against mass rank 2 is knockback rank ${kb}, `));
    assert.ok(prone(get(b, 'B')), `Damage ${dmg} leaves the target prone`);
  }
  const flight = (n) => { const b = scene(n); hit(b); return flightLine(b); };
  assert.equal(flight(1), 'Bruiser is knocked prone.', 'below rank 0 is prone only');
  assert.equal(flight(2), 'Bruiser is knocked back 1 square (30 ft) to D6.');
  assert.equal(flight(3), 'Bruiser is knocked back 2 squares (60 ft) to E6.');
  assert.equal(flight(4), 'Bruiser is knocked back 4 squares (120 ft) to G6.');
});

test('the flight is in feet: rank 0 is 30 ft at any scale, so a 5 ft square takes it six squares and a 250 ft square none', () => {
  const street = scene(2, { scale: 'street' }); hit(street);
  assert.equal(get(street, 'B').x, 2 + 6, 'rank 0 is 30 ft: six 5 ft squares');
  assert.match(note(street), /30 ft of flight \(6 squares here\)/);
  const district = scene(3, { scale: 'district' }); put(district, 'B', 1); hit(district); // 250 ft apart, inside the Blast's long range
  assert.equal(get(district, 'B').x, 1, '60 ft is less than one 250 ft square');
  assert.equal(flightLine(district), 'Bruiser is thrown to the ground.');
  assert.ok(prone(get(district, 'B')));
});

test('knockback flies along the line from the attacker, diagonals included', () => {
  const b = scene(3); put(b, 'S', 0, 0); put(b, 'B', 3, 3); hit(b);
  assert.deepEqual([get(b, 'B').x, get(b, 'B').y], [5, 5], 'two squares down the diagonal');
  const up = scene(3); put(up, 'S', 3, 9); put(up, 'B', 3, 6); hit(up);
  assert.deepEqual([get(up, 'B').x, get(up, 'B').y], [3, 4], 'straight up the column');
});

test('knockback needs a failed Toughness check by 2+ degrees; 1 degree is not enough', () => {
  const run = (tough) => { const b = scene(4); hit(b, tough); return b; };
  // Damage 4 is DC 19 against Toughness 0: a 14 fails by 5 (1 degree), a 13 by 6 (2 degrees)
  assert.equal(get(run(14), 'B').x, 2);
  assert.ok(!lines(run(14)).some((t) => /Knockback/.test(t)));
  assert.equal(get(run(13), 'B').x, 6);
  assert.equal(get(run(20), 'B').x, 2, 'a passed check throws nobody');
});

test('a slam attack that hits throws the target even when its Toughness check holds', () => {
  const b = scene(4); get(b, 'B').d.defenses.Toughness = 30;
  hit(b, 10, [], { slam: 5 });
  assert.match(note(b), /^Knockback: Damage 5 against mass rank 2 is knockback rank 3/);
  assert.equal(get(b, 'B').x, 10);
  const plain = scene(5); get(plain, 'B').d.defenses.Toughness = 30; hit(plain, 10);
  assert.equal(get(plain, 'B').x, 2, 'the same Damage 5 without a slam does nothing');
});

test('only damaging attacks throw the target', () => {
  const b = scene(4); const s = get(b, 'S');
  resolveAttack(b, R, s, { ...s.attacks[0], effect: 'Affliction' }, get(b, 'B'), scripted([15, 1]), {});
  assert.ok(!lines(b).some((t) => /Knockback/.test(t)));
});

test('Power Attack counts: the final damage rank sets the knockback rank', () => {
  const b = scene(3); hit(b, 1, [], { trade: 2 });
  assert.match(note(b), /^Knockback: Damage 5 against mass rank 2 is knockback rank 3/);
});

test('the target is thrown away from the attacker, and toward its own side from the same square', () => {
  const left = scene(3); put(left, 'S', 6); put(left, 'B', 5); hit(left);
  assert.equal(get(left, 'B').x, 3, 'shot from the right, flung left (2 squares)');
  const same = scene(2); put(same, 'S', 3); put(same, 'B', 3); hit(same);
  assert.equal(get(same, 'B').x, 4, 'team B is thrown toward the east');
  const back = scene(2); put(back, 'S', 3); put(back, 'B', 3);
  const b2 = get(back, 'B'); resolveAttack(back, R, b2, b2.attacks.find((a) => a.kind === 'close'), get(back, 'S'), scripted([15, 1]), {});
  assert.equal(get(back, 'S').x, 0, 'team A is thrown toward the west (a Strength 8 punch is rank 6: to the edge)');
});

test('the edge of the grid stops the flight; at the edge the target is only thrown to the ground', () => {
  const near = scene(6); put(near, 'S', 8); put(near, 'B', 10); hit(near);
  assert.equal(get(near, 'B').x, 11);
  assert.match(note(near), /480 ft of flight \(11 squares here\)/);
  assert.equal(flightLine(near), 'Bruiser is knocked back 1 square (30 ft) to L6.');
  const edge = scene(4); put(edge, 'S', 9); put(edge, 'B', 11); hit(edge);
  assert.equal(get(edge, 'B').x, 11);
  assert.equal(flightLine(edge), 'Bruiser is thrown to the ground.');
  assert.ok(prone(get(edge, 'B')));
});

test('mass rank: 2 for an adult, + Growth, - half of Shrinking rounded down, +2 when braced by Defend', () => {
  const mass = (powers, c = {}) => { const b = scene(2, {}, { powers }); Object.assign(get(b, 'B'), c); return massRank(get(b, 'B')); };
  const power = (name, rank) => ({ name, effect: name, rank, range: 'Personal', role: 'utility', extras: [], flaws: [] });
  assert.equal(mass([]), 2);
  assert.equal(mass([power('Growth', 4)]), 6);
  assert.equal(mass([power('Shrinking', 5)]), 0, 'floor(5 / 2) = 2 off');
  assert.equal(mass([power('Shrinking', 4)]), 0);
  assert.equal(mass([power('Shrinking', 3)]), 1, 'floor(3 / 2) = 1 off');
  assert.equal(mass([], { defending: true }), 4, 'Defend braces for +2');
  assert.equal(mass([power('Growth', 2)], { defending: true }), 6);
});

test('a fighter who took the Defend action is braced: +2 mass, so less knockback', () => {
  const loose = scene(5); hit(loose);
  assert.equal(get(loose, 'B').x, 10);
  const braced = scene(5); get(braced, 'B').defending = true;
  // a defending target rolls its defense first (11), then the attack (18), then Toughness (1)
  const s = get(braced, 'S');
  resolveAttack(braced, R, s, s.attacks[0], get(braced, 'B'), scripted([11, 18, 1]), {});
  assert.match(note(braced), /^Knockback: Damage 5 against mass rank 4 \(braced by the Defend action\) is knockback rank 1, 60 ft of flight \(2 squares here\)\./);
  assert.equal(get(braced, 'B').x, 4);
});

test('a target who slams into a wall takes the lower of knockback rank and Toughness; an intact wall stops it', () => {
  const b = scene(4); addCover(b, 'brick-wall', 4, 5);
  hit(b, 1, [10, 20]);
  const t = lines(b);
  assert.ok(t.includes('Bruiser slams into the brick wall (stone, 8 in, Toughness 8) at knockback rank 2: collision Damage 2.'), 'min(2, 8) = 2');
  assert.match(t.find((x) => /^The brick wall/.test(x)), /resists Damage 2: Toughness d20 20 \+8 = 28 vs DC 17 — holds/);
  assert.equal(flightLine(b), 'Bruiser is knocked back 1 square (30 ft) to D6 and slams into the brick wall (stone, 8 in, Toughness 8).');
  assert.equal(get(b, 'B').x, 3, 'it stops in the square before the wall, not 4 squares away');
});

test('collision damage is capped by the obstacle Toughness when that is lower', () => {
  const b = scene(10); addCover(b, 'wooden-fence', 4, 5);
  hit(b, 1, [10, 20]);
  assert.ok(lines(b).some((t) => /at knockback rank 8: collision Damage 3\./.test(t)), 'min(8, 3) = 3');
});

test('smashing through a holed or destroyed obstacle keeps the target flying', () => {
  const run = (pieceRoll) => {
    const b = scene(10); const fence = addCover(b, 'wooden-fence', 4, 5);
    hit(b, 1, [10, pieceRoll]);
    return { b, fence };
  };
  // knockback rank 8: the fence is checked at DC 23 with Toughness 3. A 13 is 16: 2 degrees, holed. A 8 is 11: 3 degrees.
  for (const [roll, state] of [[13, 'holed'], [8, 'destroyed']]) {
    const { b, fence } = run(roll);
    assert.equal(fence.state, state);
    assert.equal(get(b, 'B').x, 11, 'on through to the far edge');
    assert.equal(flightLine(b), 'Bruiser is knocked back 9 squares (270 ft) to L6 and smashes through the wooden fence (wood, 1 in, Toughness 3).');
  }
  const held = run(18);
  assert.equal(held.fence.state, 'intact');
  assert.equal(get(held.b, 'B').x, 3, '1 degree of damage leaves the fence standing, so it stops the flight');
});

test('obstacles behind the target, beyond the flight, or already holed do not stop it', () => {
  const behindIt = scene(3); addCover(behindIt, 'brick-wall', 1, 5); hit(behindIt);
  assert.equal(get(behindIt, 'B').x, 4);
  const far = scene(2); addCover(far, 'brick-wall', 5, 5); hit(far);
  assert.equal(get(far, 'B').x, 3, 'a one-square flight never reaches column F');
  const holed = scene(3); addCover(holed, 'brick-wall', 3, 5).state = 'holed'; hit(holed);
  assert.equal(get(holed, 'B').x, 4);
  const aside = scene(4); addCover(aside, 'brick-wall', 4, 4); hit(aside);
  assert.equal(get(aside, 'B').x, 6, 'a wall one row off the flight path is not in the way');
  for (const b of [behindIt, far, holed, aside]) assert.ok(!lines(b).some((t) => /slams into/.test(t)));
});

test('a flight cannot end inside a piece that still stands: a holed wall in the last square stops it one square short', () => {
  const b = scene(3); addCover(b, 'brick-wall', 4, 5).state = 'holed'; hit(b);
  assert.equal(get(b, 'B').x, 3, 'two squares would end in the wall, so it rests in front of it');
  assert.ok(!lines(b).some((t) => /slams into/.test(t)), 'a holed wall is passed, not hit');
});

test('in an enclosed room the wall stops the flight; outside one the edge does not hurt', () => {
  const room = scene(4, { enclosed: true }); put(room, 'S', 8); put(room, 'B', 10);
  hit(room, 1, [10, 20]);
  assert.ok(lines(room).includes('Bruiser slams into the wall (reinforced concrete, 8 in, Toughness 11) at knockback rank 2: collision Damage 2.'));
  assert.equal(get(room, 'B').x, 10);
  const open = scene(4); put(open, 'B', 11); hit(open);
  assert.ok(!lines(open).some((t) => /slams into/.test(t)));
  const wallShot = scene(18, { enclosed: true }); put(wallShot, 'S', 8); put(wallShot, 'B', 10);
  hit(wallShot, 1, [10, 1]);
  assert.match(flightLine(wallShot), /smashes through the wall \(reinforced concrete, 8 in, Toughness 11\)\.$/);
  assert.equal(get(wallShot, 'B').x, 10, 'nothing lies beyond the wall');
});

test('area attacks throw the targets they hurt hard enough', () => {
  const b = scene(9, {}, { extras: [{ name: 'Area', option: 'Burst' }] });
  const s = get(b, 'S');
  resolveAttack(b, R, s, s.attacks.find((a) => a.area), get(b, 'B'), scripted([5, 1]), {});
  assert.match(note(b), /^Knockback: Damage \d+ against mass rank 2/);
  assert.ok(get(b, 'B').x > 2);
});

test('knocked-down targets are Prone from knockback', () => {
  const b = scene(2); hit(b);
  assert.deepEqual(get(b, 'B').conditions.filter((c) => c.name === 'Prone').map((c) => c.source), ['knockback']);
});

test('save and load keep the scenery, who is behind it, its damage and both options', () => {
  const b = scene(4, { shootThrough: true });
  const wall = addCover(b, 'brick-wall', 4, 5); wall.state = 'holed'; get(b, 'B').behind = wall.id;
  const back = reviveBattle(R, JSON.parse(JSON.stringify(serializeBattle(b))));
  assert.deepEqual(back.cover, b.cover);
  assert.equal(back.cover[0].state, 'holed');
  assert.equal(back.combatants.find((c) => c.id === 'B').behind, wall.id);
  assert.deepEqual([back.options.knockback, back.options.shootThrough], [true, true]);
  assert.notEqual(back.cover[0], b.cover[0], 'the loaded pieces are copies');
  assert.deepEqual(reviveBattle(R, { seed: 's', combatants: [] }).cover, [], 'an old save has no scenery');
});

test('scenery with both options off still never logs a knockback or shoot-through line', () => {
  const fight = (on) => {
    const b = createBattle({ seed: 'quiet' });
    Object.assign(b.options, { knockback: on, shootThrough: on });
    addCombatant(b, makeCombatant(R, shooter(10), { id: 'S', team: 'A', style: 'blaster' }));
    addCombatant(b, makeCombatant(R, bruiser(), { id: 'B', team: 'B', style: 'brawler' }));
    addCover(b, 'concrete-pillar', 2, 5); addCover(b, 'wooden-fence', 5, 5);
    startBattle(b, R);
    for (let i = 0; i < 80 && b.status === 'running'; i++) step(b, R);
    return lines(b).filter((t) => /Knockback|knocked|Optional rule/.test(t));
  };
  assert.deepEqual(fight(false), []);
  assert.ok(fight(true).length > 0, 'the same fight with the options on does log them');
});

test('golden fights: without scenery and with both options off, no cover or knockback line is ever logged', () => {
  const marks = /takes cover behind|Optional rule|Knockback|knocked back|knocked prone|slams into|smashes through|stops the shot|resists Damage \d+: Toughness|total cover|has no cover left/;
  const all = scenarios().map(play);
  assert.equal(all.length, 40);
  const madeCover = (f) => f.log.some((l) => /blocking shots both ways/.test(l)); // a fighter who forms its own cover (create.js) is not scenery
  assert.deepEqual(all.filter((f) => !madeCover(f)).flatMap((f) => f.log.filter((l) => marks.test(l)).map((l) => `${f.name}: ${l}`)), []);
});
