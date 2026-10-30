import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import {
  createBattle, addCombatant, makeCombatant, startBattle, addCover, squares, feet, inReach, reachSquares, squaresInMove, bandFrom, areaVictims,
  reachableFrom, pieceBetween,
} from '../src/engine/battle.js';
import { stepToward } from '../src/engine/battle/path.js';
import { interacts, inEarshot } from '../src/engine/battle/geometry.js';

// The grid itself: placement, scales, reach, moves, cover on the line, areas, ambush. Fighters are small hand-made
// characters so every number can be checked by hand.

const base = { pl: 10, skills: [], advantages: [], powers: [] };
const body = (name, powers = [], extra = {}) => ({ ...base, name, identity: { codename: name }, powers, abilities: { Strength: 4, Stamina: 4, Agility: 2, Dexterity: 3, Fighting: 6, Intellect: 0, Awareness: 0, Presence: 0 }, defenses: { Dodge: 4, Parry: 6, Fortitude: 5, Will: 3 }, ...extra });
const power = (name, effect, rank, extras = [], range = 'Ranged') => ({ name, effect, rank, range, role: effect === 'Damage' ? 'attack' : 'movement', extras, flaws: [] });
const get = (b, id) => b.combatants.find((c) => c.id === id);
function arena(opts = {}, fighters = [['A0', body('A0')], ['B0', body('B0')]]) {
  const b = createBattle({ seed: 'grid' });
  Object.assign(b.options, opts);
  for (const [id, ch, style] of fighters) addCombatant(b, makeCombatant(R, ch, { id, team: id[0], style }));
  return b;
}
const at = (c, x, y = 5) => { c.x = x; c.y = y; return c; };

test('teams start on their own edges, spread two squares apart along it, centered', () => {
  const ids = ['A0', 'A1', 'A2', 'B0', 'C0', 'C1', 'D0'];
  const b = arena({}, ids.map((id) => [id, body(id)]));
  const spots = (team) => b.combatants.filter((c) => c.team === team).map((c) => [c.x, c.y]);
  assert.deepEqual(spots('A'), [[1, 3], [1, 5], [1, 7]], 'west edge, rows two apart');
  assert.deepEqual(spots('B'), [[10, 5]], 'east edge');
  assert.deepEqual(spots('C'), [[4, 1], [6, 1]], 'north edge');
  assert.deepEqual(spots('D'), [[5, 10]], 'south edge');
  const crowd = arena({}, Array.from({ length: 8 }, (_, k) => [`A${k}`, body(`A${k}`)]).concat([['B0', body('B0')]]));
  assert.deepEqual(crowd.combatants.filter((c) => c.team === 'A').map((c) => c.y), [2, 3, 4, 5, 6, 7, 8, 9], 'one apart when two apart does not fit');
});

test('the scale picks the feet per square; an enclosed room is always 5 ft squares inside a ring of wall', () => {
  for (const [scale, ft] of [['street', 5], ['block', 30], ['district', 250], [undefined, 30], ['bogus', 30]]) assert.equal(arena({ scale }).grid.squareFt, ft, String(scale));
  const room = arena({ enclosed: true, scale: 'district' });
  assert.deepEqual([room.grid.squareFt, room.grid.walls.length, room.grid.play], [5, 44, { x0: 1, y0: 1, x1: 10, y1: 10 }]);
  assert.deepEqual(room.combatants.map((c) => [c.x, c.y]), [[1, 5], [10, 5]], 'the teams start on the room walls');
  const back = arena({ enclosed: true }); back.options.enclosed = false;
  startBattle(back, R);
  assert.equal(back.grid.walls.length, 0, 'leaving enclosed space removes the ring');
});

test('a move action covers the fighter\'s speed distance: rank 0 is 30 ft, Speed 3 is 240 ft, Leaping counts half its rank, Hindered halves it', () => {
  const squaresFor = (powers, scale, cond) => {
    const b = arena({ scale }, [['A0', body('A0', powers)], ['B0', body('B0')]]);
    if (cond) get(b, 'A0').conditions.push(cond);
    return squaresInMove(b, get(b, 'A0'));
  };
  const speed = (rank) => [power('Speed', 'Speed', rank, [], 'Personal')];
  assert.deepEqual(['street', 'block', 'district'].map((s) => squaresFor([], s)), [6, 1, 1], 'rank 0: 30 ft, but never fewer than one square');
  assert.deepEqual(['street', 'block', 'district'].map((s) => squaresFor(speed(3), s)), [48, 8, 1]);
  assert.equal(squaresFor([power('Leaping', 'Leaping', 6, [], 'Personal')], 'block'), 8, 'Leaping 6 counts as rank 3');
  assert.equal(squaresFor(speed(3), 'block', { name: 'Hindered', degree: 1, source: 'x', from: null }), 4);
  assert.equal(squaresFor(speed(3), 'block', { name: 'Immobile', degree: 1, source: 'x', from: null }), 0);
});

test('close reach is the same or an adjacent square, plus Elongation and Reach', () => {
  const b = arena({ scale: 'street' }, [['A0', body('A0', [power('Stretch', 'Elongation', 1, [], 'Personal'), power('Lance', 'Damage', 5, [{ name: 'Reach', steps: 2 }], 'Close')])], ['B0', body('B0')]]);
  const a = get(b, 'A0'); const lance = a.attacks.find((x) => x.name === 'Lance');
  assert.equal(a.elongFt, 60, 'Elongation 1 stretches 60 ft');
  assert.equal(lance.reachFt, 10, 'two ranks of Reach add 10 ft');
  assert.equal(reachSquares(b, a), 1 + 12, 'adjacent plus 60 ft of 5 ft squares');
  assert.equal(reachSquares(b, a, lance), 1 + 14);
  at(a, 0); const t = at(get(b, 'B0'), 13);
  assert.equal(inReach(b, a, t), true); assert.equal(inReach(b, a, at(t, 14)), false);
  const plain = arena({ scale: 'block' }); at(get(plain, 'A0'), 2); at(get(plain, 'B0'), 3);
  assert.equal(inReach(plain, get(plain, 'A0'), get(plain, 'B0')), true, 'an adjacent square, diagonals included');
  at(get(plain, 'B0'), 3, 6); assert.equal(inReach(plain, get(plain, 'A0'), get(plain, 'B0')), true);
  at(get(plain, 'B0'), 4); assert.equal(inReach(plain, get(plain, 'A0'), get(plain, 'B0')), false);
});

test('range bands come from the rank and Extended Range, measured in real feet between squares', () => {
  const gun = (extras) => body('G', [power('Blast', 'Damage', 4, extras)]);
  const b = arena({ scale: 'block' }, [['A0', gun([])], ['B0', body('B0')], ['A1', gun([{ name: 'Extended Range', steps: 1 }])]]);
  const [x, t, y] = [get(b, 'A0'), get(b, 'B0'), get(b, 'A1')];
  at(t, 5); at(x, 0); at(y, 0);
  assert.equal(squares(x, t), 5); assert.equal(feet(b, x, t), 150);
  const [blast, far] = [x, y].map((c) => c.attacks.find((a) => a.name === 'Blast'));
  assert.equal(far.ext, 1);
  const band = (c, atk) => { const r = bandFrom(b, c, atk, t); return [r.band, r.penalty]; };
  assert.deepEqual(band(x, blast), ['medium', -2], 'rank 4: short 100 ft, medium 200, long 400');
  at(t, 8); assert.deepEqual(band(x, blast), ['long', -5]); assert.deepEqual(band(y, far), ['medium', -2], 'Extended Range doubles them: 200, 400, 800');
  at(t, 11); assert.deepEqual(band(x, blast), ['long', -5]);
  const wide = arena({ scale: 'district' }, [['A0', gun([])], ['B0', body('B0')]]);
  at(get(wide, 'A0'), 0); at(get(wide, 'B0'), 1);
  assert.equal(bandFrom(wide, get(wide, 'A0'), get(wide, 'A0').attacks.find((a) => a.name === 'Blast'), get(wide, 'B0')).band, 'long', '250 ft');
  at(get(wide, 'B0'), 2);
  assert.equal(bandFrom(wide, get(wide, 'A0'), get(wide, 'A0').attacks.find((a) => a.name === 'Blast'), get(wide, 'B0')).band, 'out', '500 ft is beyond 400');
});

test('walls and pieces block walking: the path goes around, and a boxed-in fighter stays put', () => {
  const b = arena({ scale: 'block' });
  const a = at(get(b, 'A0'), 2); at(get(b, 'B0'), 8);
  for (let y = 1; y <= 9; y++) addCover(b, 'brick-wall', 5, y);
  const dest = stepToward(b, a, get(b, 'B0'), 4, 1);
  assert.equal(squares(dest, a) <= 4, true);
  assert.ok(!(dest.x === 5 && dest.y >= 1 && dest.y <= 9), 'never into a piece');
  const reach = reachableFrom(b, a, 12);
  assert.equal(reach.get('8,5')?.steps, 10, 'the long way round: five up, five down, not the straight six');
  assert.equal(reach.has('5,5'), false);
  for (const [x, y] of [[1, 1], [1, 2], [1, 3], [2, 1], [3, 1], [3, 3], [3, 2], [2, 3]]) { if (!(x === 2 && y === 2)) addCover(b, 'brick-wall', x, y); }
  const boxed = at(get(b, 'A0'), 2, 2);
  assert.deepEqual(stepToward(b, boxed, { x: 9, y: 9 }, 5), { x: 2, y: 2 }, 'nowhere to go');
});

test('cover counts only when a piece beside the target lies on the line from the attacker', () => {
  const b = arena({ scale: 'block' });
  const s = at(get(b, 'A0'), 0, 5); const t = at(get(b, 'B0'), 6, 5);
  const wall = addCover(b, 'brick-wall', 5, 5);
  assert.equal(pieceBetween(b, s, t), wall, 'beside the target and on the line');
  assert.equal(pieceBetween(b, t, s), null, 'from the other side the wall is behind the shooter, far from the one shot at');
  at(t, 7, 5); assert.equal(pieceBetween(b, s, t), null, 'a wall in the middle of the field two squares from the target is not cover');
  at(t, 6, 5); addCover(b, 'brick-wall', 5, 9);
  assert.equal(pieceBetween(b, s, t), wall, 'a piece off the line does not matter');
  at(s, 0, 9); assert.equal(pieceBetween(b, s, at(t, 6, 9)), b.cover[1], 'and a piece on a different row covers a target on that row');
  at(s, 6, 0); at(t, 6, 6); addCover(b, 'wooden-fence', 6, 5);
  assert.equal(pieceBetween(b, s, t).kind, 'wooden-fence', 'down a column');
});

test('area victims follow the template: a 30 ft burst, a 60 ft cone and a 5 ft wide line', () => {
  const b = arena({ scale: 'block' }, ['A0', 'B0', 'B1', 'B2', 'B3', 'B4'].map((id) => [id, body(id)]));
  const [a, ...foes] = ['A0', 'B0', 'B1', 'B2', 'B3', 'B4'].map((id) => get(b, id));
  const burst = { area: 'Burst', areaFt: 30, range: 'ranged', rank: 6 };
  at(a, 0, 5); at(foes[0], 6, 5); at(foes[1], 7, 5); at(foes[2], 7, 6); at(foes[3], 8, 5); at(foes[4], 6, 9);
  assert.deepEqual(areaVictims(b, a, burst, foes[0]).map((c) => c.id).sort(), ['B0', 'B1', 'B2'], 'radius 30 ft reaches the squares next to the center, diagonals included');
  assert.deepEqual(areaVictims(b, a, { ...burst, range: 'close' }, foes[0]).map((c) => c.id), [], 'a close burst is centered on the attacker, far from them all');
  const cone = { area: 'Cone', areaFt: 120, range: 'ranged', rank: 6 };
  at(foes[0], 2, 5); at(foes[1], 4, 5); at(foes[2], 4, 6); at(foes[3], 8, 5); at(foes[4], 2, 9);
  assert.deepEqual(areaVictims(b, a, cone, foes[0]).map((c) => c.id).sort(), ['B0', 'B1', 'B2'], 'four squares long, widening: not the one at 8 or far to the side');
  const lineAtk = { area: 'Line', areaFt: 120, range: 'ranged', rank: 6 };
  assert.deepEqual(areaVictims(b, a, lineAtk, foes[0]).map((c) => c.id).sort(), ['B0', 'B1'], 'a line one square wide');
  const street = arena({ scale: 'street' }, [['A0', body('A0')], ['B0', body('B0')], ['B1', body('B1')], ['B2', body('B2')]]);
  at(get(street, 'A0'), 0, 5); at(get(street, 'B0'), 3, 5); at(get(street, 'B1'), 9, 5); at(get(street, 'B2'), 10, 5);
  assert.deepEqual(areaVictims(street, get(street, 'A0'), burst, get(street, 'B0')).map((c) => c.id), ['B0', 'B1'], 'at 5 ft a 30 ft burst is six squares wide: nine columns on is in, ten is out');
});

test('ambush: melee fighters start next to their target, shooters at short range and not next to it, ideally beside cover', () => {
  const build = (cover) => {
    const b = createBattle({ seed: 'amb' }); b.options.ambush = 'A';
    addCombatant(b, makeCombatant(R, body('Brute'), { id: 'A0', team: 'A', style: 'brawler' }));
    addCombatant(b, makeCombatant(R, body('Gun', [power('Blast', 'Damage', 8, [])]), { id: 'A1', team: 'A', style: 'blaster' }));
    addCombatant(b, makeCombatant(R, body('Foe'), { id: 'B0', team: 'B' }));
    if (cover) addCover(b, 'brick-wall', 8, 3);
    startBattle(b, R);
    return b;
  };
  const b = build(false); const foe = get(b, 'B0');
  assert.equal(squares(get(b, 'A0'), foe), 1, 'next to the target');
  const gun = get(b, 'A1');
  assert.ok(squares(gun, foe) >= 2 && feet(b, gun, foe) <= 200, 'short range of a rank 8 Blast is 200 ft');
  const c = build(true);
  assert.ok(squares(get(c, 'A1'), c.cover[0]) <= 1, 'the shooter ends up beside the cover when there is some');
});

test('interaction range is the same or an adjacent square, or 30 ft, whichever is larger; earshot is 60 ft', () => {
  const street = arena({ scale: 'street' }); const block = arena({ scale: 'block' });
  const [s1, s2] = [get(street, 'A0'), get(street, 'B0')]; const [b1, b2] = [get(block, 'A0'), get(block, 'B0')];
  at(s1, 0); at(s2, 6); at(b1, 0); at(b2, 1);
  assert.equal(interacts(street, s1, s2), true, '30 ft is six 5 ft squares'); assert.equal(interacts(street, s1, at(s2, 7)), false);
  assert.equal(interacts(block, b1, b2), true, 'adjacent counts even though a 30 ft square is 30 ft'); assert.equal(interacts(block, b1, at(b2, 2)), false);
  assert.equal(inEarshot(block, b1, at(b2, 2)), true, '60 ft'); assert.equal(inEarshot(block, b1, at(b2, 3)), false);
});
