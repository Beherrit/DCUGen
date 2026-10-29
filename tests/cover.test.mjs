import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import {
  createBattle, addCombatant, makeCombatant, startBattle, step, addCover, removeCover, coverLevel, pieceLabel,
  MATERIALS, COVER_KINDS, toughnessOf, TEAM_TACTICS,
} from '../src/engine/battle.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { damagePiece, hitPiece } from '../src/engine/battle/cover-damage.js';
import { blocksDirect } from '../src/engine/battle/cover.js';
import { expectedValue } from '../src/engine/battle/odds.js';
import { makeRng } from '../src/engine/rng.js';

// Cover, materials, breaking cover, shoot-through and Take Cover (Hero's Handbook p94 and p173; spec-cover.md).

const base = { pl: 10, skills: [], advantages: [], powers: [] };
const bruiser = () => ({ ...base, name: 'Bruiser', identity: { codename: 'Bruiser' }, abilities: { Strength: 8, Stamina: 8, Agility: 2, Dexterity: 0, Fighting: 8, Intellect: 0, Awareness: 0, Presence: 0 }, defenses: { Dodge: 2, Parry: 6, Fortitude: 6, Will: 2 } });
const blast = (extras = [], rank = 10) => ({ name: 'Blast', effect: 'Damage', rank, range: 'Ranged', role: 'attack', extras, flaws: [] });
const shooter = (advantages = [], powers = [blast()]) => ({ ...base, name: 'Shooter', identity: { codename: 'Shooter' }, abilities: { Strength: 0, Stamina: 4, Agility: 6, Dexterity: 6, Fighting: 2, Intellect: 0, Awareness: 0, Presence: 0 }, defenses: { Dodge: 6, Parry: 2, Fortitude: 4, Will: 2 }, skills: [{ name: 'Ranged Combat', spec: 'Blast', ranks: 4 }], advantages, powers });

/** Shooter S (team A, blaster) against Bruiser B (team B, brawler); hero points off so rolls are not re-rolled. */
function scene(seed, opts = {}, sh = shooter()) {
  const b = createBattle({ seed });
  Object.assign(b.options, { heroPoints: false }, opts);
  addCombatant(b, makeCombatant(R, sh, { id: 'S', team: 'A', style: 'blaster' }));
  addCombatant(b, makeCombatant(R, bruiser(), { id: 'B', team: 'B', style: 'brawler' }));
  startBattle(b, R);
  b.log = [];
  return b;
}
const get = (b, id) => b.combatants.find((c) => c.id === id);
/** A seeded rng whose next d20 rolls are the given numbers; after those it carries on seeded. */
const scripted = (rolls, seed = 'x') => { const r = makeRng(seed); const q = [...rolls]; return { ...r, int: (lo, hi) => (q.length ? q.shift() : r.int(lo, hi)) }; };
const fire = (b, from, to, rolls, opts = {}) => {
  const c = get(b, from);
  resolveAttack(b, R, c, c.attacks[0], get(b, to), scripted(rolls), opts);
};
const dice = (b, label) => b.log.flatMap((e) => e.dice || []).find((d) => d.label === label);
const lines = (b) => b.log.map((e) => e.text);
const behind = (b, kind, zone, who = 'B') => { const p = addCover(b, kind, zone); get(b, who).behind = p.id; return p; };

test('materials: every material in the book table has its one-inch Toughness (p94)', () => {
  const book = { paper: 0, soil: 0, glass: 1, ice: 1, rope: 1, wood: 3, stone: 5, iron: 7, concrete: 8, steel: 9, titanium: 15, prometheum: 20 };
  assert.deepEqual(Object.fromEntries(Object.keys(MATERIALS).map((k) => [k, toughnessOf(k, 1)])), book);
  assert.equal(MATERIALS.concrete.name, 'reinforced concrete');
  assert.equal(toughnessOf('reinforced concrete', 1), 8, 'a material can be found by its book name');
});

test('materials: one inch is the base, +1 per doubling, -1 per halving, a foot of stone is 8', () => {
  assert.equal(toughnessOf('stone', 1), 5);
  assert.deepEqual([2, 4, 8, 12].map((i) => toughnessOf('stone', i)), [6, 7, 8, 8]);
  assert.deepEqual([0.5, 0.25, 0.125].map((i) => toughnessOf('stone', i)), [4, 3, 2]);
  assert.equal(toughnessOf('stone', 3), 6, 'partial doublings round down');
  assert.throws(() => toughnessOf('cheese', 1), /Unknown material/);
});

test('materials: each preset works its Toughness out from material and thickness', () => {
  const got = Object.fromEntries(COVER_KINDS.map((k) => [k.id, [k.material, k.inches, toughnessOf(k.material, k.inches), k.level]]));
  assert.deepEqual(got, {
    'wooden-fence': ['wood', 1, 3, 'partial'], 'brick-wall': ['stone', 8, 8, 'total'], 'concrete-pillar': ['concrete', 12, 11, 'partial'],
    'concrete-wall': ['concrete', 8, 11, 'total'], 'parked-car': ['steel', 0.125, 6, 'partial'], 'steel-door': ['steel', 2, 10, 'total'],
    'glass-storefront': ['glass', 0.5, 0, 'partial'], 'ice-wall': ['ice', 12, 4, 'total'], 'titanium-bulkhead': ['titanium', 2, 16, 'total'],
  });
});

test('addCover builds a piece with computed Toughness and a plain label; removeCover frees the fighter behind it', () => {
  const b = scene('store');
  const wall = behind(b, 'brick-wall', 4);
  assert.deepEqual([wall.toughness, wall.level, wall.state, wall.zone], [8, 'total', 'intact', 4]);
  assert.equal(pieceLabel(wall), 'brick wall (stone, 8 in, Toughness 8)');
  assert.equal(pieceLabel(addCover(b, 'concrete-wall', 99)), 'concrete wall (reinforced concrete, 8 in, Toughness 11)');
  assert.equal(b.cover[1].zone, 7, 'a zone past the arena is clamped to its last zone');
  removeCover(b, wall.id);
  assert.deepEqual(b.cover.map((p) => p.kind), ['concrete-wall']);
  assert.equal(get(b, 'B').behind, null);
  assert.throws(() => addCover(b, 'moat', 1), /Unknown kind of cover/);
});

test('cover level: a holed piece gives one level less, a destroyed piece none (p173)', () => {
  const b = scene('levels');
  const wall = addCover(b, 'brick-wall', 3); const fence = addCover(b, 'wooden-fence', 3);
  const seen = [];
  for (const state of ['intact', 'holed', 'destroyed']) { wall.state = fence.state = state; seen.push([coverLevel(wall), coverLevel(fence)]); }
  assert.deepEqual(seen, [['total', 'partial'], ['partial', 'none'], ['none', 'none']]);
});

const PRECISE = (param) => [{ name: 'Precise Attack', param, rank: 1 }];
/** The Attack-die modifier of one shot (or swing, if close) at a target behind `kind` in zone 4, and the log line. */
function attackMod(kind, { state, close, sameZone, adv } = {}) {
  const b = scene('mod', {}, shooter(adv)); const [from, to] = close ? ['B', 'S'] : ['S', 'B'];
  get(b, to).pos = 4; get(b, from).pos = sameZone ? 4 : 0;
  if (kind) { const p = behind(b, kind, 4, to); if (state) p.state = state; }
  const c = get(b, from);
  resolveAttack(b, R, c, c.attacks.find((a) => (a.kind === 'close') === !!close), get(b, to), scripted([12, 5]), {});
  return { mod: dice(b, 'Attack').mod, text: lines(b)[0] };
}

test('partial cover is -2 and total -5 to a ranged attack from another zone (p173)', () => {
  const open = attackMod(null).mod; const fence = attackMod('wooden-fence'); const wall = attackMod('brick-wall');
  assert.deepEqual([open - fence.mod, open - wall.mod], [2, 5]);
  assert.match(fence.text, /\(partial cover: −2\)\.$/);
  assert.match(wall.text, /\(total cover: −5\)\.$/);
});

test('cover does not count against a close attack, or a shot from the same zone', () => {
  assert.equal(attackMod('brick-wall', { close: true }).mod, attackMod(null, { close: true }).mod);
  assert.equal(attackMod('brick-wall', { sameZone: true }).mod, attackMod(null, { sameZone: true }).mod);
});

test('a holed wall gives only partial cover (-2), a destroyed one none', () => {
  const open = attackMod(null).mod;
  assert.deepEqual(['holed', 'destroyed'].map((state) => open - attackMod('brick-wall', { state }).mod), [2, 0]);
});

test('Precise Attack bought for cover removes the penalty; the wrong pairing does not', () => {
  const none = attackMod('wooden-fence').mod;
  assert.equal(attackMod('wooden-fence', { adv: PRECISE('Ranged, Cover') }).mod, none + 2, 'the -2 is gone');
  assert.equal(attackMod('wooden-fence', { adv: PRECISE('Close, Cover') }).mod, none, 'close cover does nothing for a ranged shot');
  assert.equal(attackMod('wooden-fence', { adv: PRECISE('Ranged, Concealment') }).mod, none, 'concealment is not cover');
});

test('the AI sees cover in its expected value, and Precise Attack lifts it', () => {
  const ev = (kind, adv = []) => {
    const b = scene('ev', {}, shooter(adv)); get(b, 'S').pos = 0; get(b, 'B').pos = 4;
    if (kind) behind(b, kind, 4);
    return expectedValue(get(b, 'S'), get(b, 'S').attacks[0], get(b, 'B'), { b, dist: 4 });
  };
  const [open, partial, total] = [ev(null), ev('wooden-fence'), ev('brick-wall')];
  assert.ok(open > partial && partial > total, `${open} > ${partial} > ${total}`);
  assert.equal(ev('wooden-fence', PRECISE('Ranged, Cover')), open);
});

test('area attacks give the target a Dodge bonus equal to the cover penalty, only from another zone', () => {
  const bomb = shooter([], [blast([{ name: 'Area', option: 'Burst' }], 8)]);
  const dodge = (kind, atZone) => {
    const b = scene('area', {}, bomb); get(b, 'S').pos = atZone; get(b, 'B').pos = 3;
    if (kind) behind(b, kind, 3);
    resolveAttack(b, R, get(b, 'S'), get(b, 'S').attacks.find((a) => a.area), get(b, 'B'), scripted([10, 10]), {});
    return dice(b, 'Dodge');
  };
  const open = dodge(null, 0).mod;
  assert.equal(dodge('wooden-fence', 0).mod - open, 2);
  assert.equal(dodge('brick-wall', 0).mod - open, 5);
  assert.equal(dodge('brick-wall', 3).mod - open, 0, 'blast from the same zone ignores the wall');
});

test('total cover: the target cannot be picked directly, and the AI shoots the cover instead', () => {
  const b = scene('cov2'); b.order = ['S', 'B']; b.turn = 0;
  get(b, 'S').pos = 0; get(b, 'B').pos = 4; behind(b, 'brick-wall', 4);
  const s = get(b, 'S'); const atk = s.attacks[0];
  assert.equal(blocksDirect(b, s, atk, get(b, 'B')), true);
  assert.equal(blocksDirect(b, s, { ...atk, area: 'Burst' }, get(b, 'B')), false, 'area attacks need no direct target');
  b.cover[0].state = 'holed';
  assert.equal(blocksDirect(b, s, atk, get(b, 'B')), false, 'a holed wall is only partial cover');
  b.cover[0].state = 'intact'; b.options.shootThrough = true;
  assert.equal(blocksDirect(b, s, atk, get(b, 'B')), false, 'shoot-through lets the shot try');
  b.options.shootThrough = false;
  step(b, R);
  assert.match(lines(b)[0], /Shooter can't see a clean shot at Bruiser, who is behind total cover, and goes for the brick wall instead/);
  assert.equal(dice(b, 'Attack').dc, 10, 'the check is against DC 10');
  assert.ok(!lines(b).some((t) => /at Bruiser:/.test(t)), 'nobody shoots Bruiser directly');
});

test('attacking cover: DC 10, a hit is an automatic critical against a defenseless object', () => {
  const run = (rolls, mod) => {
    const b = scene('hit'); const piece = addCover(b, 'wooden-fence', 4);
    const r = hitPiece(b, get(b, 'S'), { ...get(b, 'S').attacks[0], rank: 5 }, piece, scripted(rolls), { mod });
    return { r, piece, b };
  };
  assert.equal(run([5, 10], 5).r.hit, true, '5 + 5 = 10 meets DC 10');
  assert.equal(run([4, 10], 5).r.hit, false, '9 misses');
  assert.equal(run([1, 10], 30).r.hit, false, 'a natural 1 misses');
  assert.equal(run([20, 10], -30).r.hit, true, 'a natural 20 hits');
  const { b } = run([5, 10], 5);
  assert.match(lines(b)[0], /vs DC 10 \(objects are defenseless\) — hit, an automatic critical against an object/);
  assert.match(lines(b)[1], /resists Damage 5: Toughness d20 10 \+3 = 13 vs DC 25 \(\+5, defenseless object\)/);
  assert.equal(dice(run([1, 10], 30).b, 'Toughness check'), undefined, 'a miss does not roll the object');
});

test('cover Toughness check: 2 degrees of failure hole it, 3 or more destroy it', () => {
  // fence Toughness 3, Damage 5 as a critical is DC 25: totals 20 (1 degree), 19 (2), 15 (2), 14 (3)
  const after = (roll, kind = 'wooden-fence') => {
    const b = scene('deg'); const piece = addCover(b, kind, 4); get(b, 'B').behind = piece.id; get(b, 'B').pos = 4;
    const fails = damagePiece(b, get(b, 'S'), piece, 5, scripted([roll]), { crit: true });
    return { state: piece.state, level: coverLevel(piece), fails, behind: get(b, 'B').behind, text: lines(b).join('\n') };
  };
  assert.deepEqual([17, 16, 12, 11, 2].map((r) => after(r).state), ['intact', 'holed', 'holed', 'destroyed', 'destroyed']);
  assert.match(after(17).text, /scarred but standing \(1 degree\)/);
  assert.match(after(16).text, /a hole is punched through it \(2 degrees\), now no cover at all/);
  assert.equal(after(10, 'brick-wall').level, 'partial', 'a total wall that is holed gives partial cover');
  assert.equal(after(20).fails, 0, 'a natural 20 takes a degree off');
  assert.equal(after(11).behind, null, 'nobody stays behind a destroyed piece');
  assert.equal(after(16).behind, 'cv1', 'a holed piece still shelters its fighter');
});

test('the AI shooting cover: a destroyed fence leaves the target open, a holed total fence drops to partial', () => {
  const run = (seed) => {
    const b = scene(seed); b.order = ['S', 'B']; b.turn = 0; get(b, 'S').pos = 0; get(b, 'B').pos = 4;
    const p = behind(b, 'wooden-fence', 4); p.level = 'total';
    step(b, R);
    return { p, b };
  };
  const gone = run('cov3b');
  assert.equal(gone.p.state, 'destroyed');
  assert.equal(get(gone.b, 'B').behind, null);
  assert.ok(lines(gone.b).includes('Bruiser has no cover left: the wooden fence is gone.'));
  const holed = run('cov3e');
  assert.equal(holed.p.state, 'holed');
  assert.equal(coverLevel(holed.p), 'partial');
  assert.equal(get(holed.b, 'B').behind, holed.p.id);
});

test('area attacks roll Toughness against every intact piece in the zone, and only that zone', () => {
  const bomb = shooter([], [blast([{ name: 'Area', option: 'Burst' }], 8)]);
  const b = scene('ar2', {}, bomb); get(b, 'S').pos = 0; get(b, 'B').pos = 3;
  const fence = behind(b, 'wooden-fence', 3); const car = addCover(b, 'parked-car', 3);
  const wall = addCover(b, 'brick-wall', 5); const old = addCover(b, 'wooden-fence', 3); old.state = 'destroyed';
  resolveAttack(b, R, get(b, 'S'), get(b, 'S').attacks.find((a) => a.area), get(b, 'B'), scripted([10, 10, 8, 8]), {});
  const rolled = lines(b).filter((t) => /^The .* resists Damage 8/.test(t));
  assert.equal(rolled.length, 2);
  assert.match(rolled[0], /^The wooden fence \(wood, 1 in, Toughness 3\) resists Damage 8: Toughness d20 8 \+3 = 11 vs DC 23 — destroyed/);
  assert.match(rolled[1], /^The parked car \(steel, 0\.125 in, Toughness 6\)/);
  assert.deepEqual([fence.state, car.state, wall.state], ['destroyed', 'holed', 'intact']);
});

test('shoot-through is off by default: no cover roll, no optional-rule note', () => {
  const b = scene('st1'); get(b, 'S').pos = 0; get(b, 'B').pos = 4;
  const wall = behind(b, 'brick-wall', 4);
  fire(b, 'S', 'B', [15, 5]);
  assert.equal(wall.state, 'intact');
  assert.ok(!lines(b).some((t) => /Optional rule|brick wall/.test(t.replace(/\(partial cover/, ''))), lines(b).join('\n'));
  assert.match(lines(b)[0], /Shooter .* Bruiser: d20 15 .* vs Dodge DC 14/);
});

test('shoot-through on: the shot breaks the cover, then carries on at the rank minus half its Toughness', () => {
  const b = scene('st1', { shootThrough: true }); get(b, 'S').pos = 0; get(b, 'B').pos = 4;
  const wall = behind(b, 'brick-wall', 4);
  fire(b, 'S', 'B', [15, 5, 18, 1]);
  const t = lines(b);
  assert.match(t[0], /^Optional rule \(shoot through cover\)/);
  assert.match(t[2], /brick wall .* Toughness d20 5 \+8 = 13 vs DC 30 .* destroyed/);
  assert.ok(t.includes('The shot goes through the brick wall and carries on at Damage 6.'), 'Damage 10 - floor(8 / 2) = 6');
  assert.match(t.at(-1), /Bruiser resists with Toughness: d20 1 .* vs DC 21/);
  assert.equal(wall.state, 'destroyed');
  assert.ok(!t.some((x) => /cover: −/.test(x)), 'the destroyed wall no longer penalises the follow-up');
  b.log = []; fire(b, 'S', 'B', [15, 5, 18, 1]);
  assert.ok(!lines(b).some((x) => /Optional rule/.test(x)), 'the note is only shown the first time');
});

test('shoot-through on: a wall that holds stops the shot', () => {
  const b = scene('st2', { shootThrough: true }); get(b, 'S').pos = 0; get(b, 'B').pos = 4;
  const wall = behind(b, 'brick-wall', 4);
  fire(b, 'S', 'B', [15, 20]);
  assert.equal(wall.state, 'intact');
  assert.ok(lines(b).includes('The brick wall stops the shot.'));
  assert.ok(!lines(b).some((x) => /Bruiser resists/.test(x)), 'Bruiser is untouched');
});

test('shoot-through on: a holed wall passes the shot with the cover level it has left', () => {
  const b = scene('st3', { shootThrough: true }); get(b, 'S').pos = 0; get(b, 'B').pos = 4;
  const wall = behind(b, 'brick-wall', 4);
  fire(b, 'S', 'B', [15, 16, 18, 1]);
  assert.equal(wall.state, 'holed');
  assert.ok(lines(b).includes('The shot goes through the brick wall and carries on at Damage 6.'));
  assert.match(lines(b).find((x) => /Shooter .* at Bruiser/.test(x)), /partial cover: −2/);
});

/** One turn for Shooter (zone 3, speed 1) with these pieces (kind, zone) on the field, and the team tactic if given. */
function turnWith(pieces, tactic) {
  const b = scene('tc1', tactic ? { teamTactics: { A: tactic } } : {}); b.order = ['S', 'B']; b.turn = 0;
  get(b, 'S').pos = 3; get(b, 'B').pos = 6;
  const made = pieces.map(([kind, zone]) => addCover(b, kind, zone));
  step(b, R);
  return { b, s: get(b, 'S'), made };
}

test('Take Cover: shooters move behind the best piece in reach, total before partial, then tougher', () => {
  // brick wall (total, T8) beats the pillar in the shooter's zone (partial, T11); the steel door (total, T10) beats the brick wall
  const { b, s, made } = turnWith([['concrete-pillar', 3], ['brick-wall', 2], ['steel-door', 4]], 'cover');
  assert.deepEqual([s.pos, s.behind], [4, made[2].id]);
  assert.ok(lines(b).includes('Shooter takes cover behind the steel door (steel, 2 in, Toughness 10).'));
  const total = turnWith([['concrete-pillar', 3], ['brick-wall', 2]], 'cover');
  assert.deepEqual([total.s.pos, total.s.behind], [2, total.made[1].id], 'total cover beats a tougher partial piece');
  const far = turnWith([['concrete-wall', 0], ['parked-car', 3]], 'cover');
  assert.equal(far.s.behind, far.made[1].id, 'a wall out of reach loses to the car beside the shooter');
});

test('a blaster with no tactic uses cover in its own zone but does not go looking for it', () => {
  const own = turnWith([['brick-wall', 3]]);
  assert.equal(own.s.behind, own.made[0].id);
  const away = turnWith([['brick-wall', 4]]);
  assert.deepEqual([away.s.pos, away.s.behind ?? null], [3, null]);
});

test('Take Cover: with nothing worth shooting the fighter digs in with the Defend action', () => {
  const b = scene('tc3', { teamTactics: { A: 'cover' } }); b.order = ['S', 'B']; b.turn = 0;
  get(b, 'S').pos = 3; get(b, 'B').pos = 7; addCover(b, 'concrete-wall', 3);
  Object.assign(get(b, 'B').d.defenses, { Dodge: 30, Parry: 30, Toughness: 40 });
  step(b, R);
  assert.equal(get(b, 'S').defending, true);
  assert.ok(lines(b).includes('Shooter keeps their head down and defends: attackers must beat a rolled defense until their next turn.'));
});

test('Take Cover is a team tactic added after No Retreat', () => {
  const ids = Object.keys(TEAM_TACTICS);
  assert.equal(ids[ids.indexOf('noretreat') + 1], 'cover');
  assert.equal(TEAM_TACTICS.cover.label, 'Take Cover');
});
