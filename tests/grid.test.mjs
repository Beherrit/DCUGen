import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandFor, rankFt } from '../src/engine/range.js';
import { step, serializeBattle, reviveBattle, createBattle, GRID_SIZE } from '../src/engine/battle.js';
import { isPlayable } from '../src/engine/battle/grid.js';
import { rangePenalty } from '../src/engine/battle/odds.js';
import { buildFight, R } from './helpers/grid-fights.mjs';

// Invariants over seeded fights at every scale. Each fight records its attacks and moves (b.trace) and the checks
// below recompute the geometry from the recorded squares, not from the engine's own helpers.
const FIGHTS = 300;
const SQUARE = { street: 5, block: 30, district: 250 };

function playOut(b) {
  const bad = [];
  let guard = 0;
  while (b.status !== 'over' && guard++ < 5000) {
    step(b, R);
    for (const c of b.combatants) if (!isPlayable(b, c.x, c.y)) bad.push(`${c.name} stands on ${c.x},${c.y} in round ${b.round}`);
  }
  return bad;
}

function checkAttack(b, e, sq) {
  const who = b.combatants.find((c) => c.id === e.actor);
  const atk = who.attacks.find((a) => a.name === e.name);
  const squares = Math.max(Math.abs(e.from.x - e.to.x), Math.abs(e.from.y - e.to.y));
  assert.equal(e.ft, squares * sq, `${who.name}: feet are squares times ${sq}`);
  if (e.range === 'ranged') {
    const longest = 100 * Math.max(1, e.rank) * 2 ** e.ext;
    assert.ok(e.ft <= longest, `${who.name} used ${e.name} (rank ${e.rank}) at ${e.ft} ft, beyond long range ${longest}`);
  } else if (e.range === 'close' && !e.area) {
    const reach = 1 + Math.floor(((who.elongFt || 0) + (atk?.reachFt || 0)) / sq);
    assert.ok(squares <= reach, `${who.name} made a close attack from ${squares} squares away (reach ${reach})`);
  }
}

function checkMove(b, e, sq) {
  const who = b.combatants.find((c) => c.id === e.actor);
  const perMove = Math.max(1, Math.floor(rankFt(who.moveRank) / sq));
  assert.ok(e.budget <= perMove, `${who.name}: engine budget ${e.budget} is over ${perMove} squares per move`);
  assert.ok(e.squares <= 2 * perMove, `${who.name} moved ${e.squares} squares, over two moves of ${perMove}`);
}

for (const scale of Object.keys(SQUARE)) {
  test(`${FIGHTS} seeded fights at ${scale} scale keep every attack, move and position legal`, () => {
    let attacks = 0; let moves = 0;
    for (let n = 0; n < FIGHTS; n++) {
      const b = buildFight(n, scale);
      const sq = b.options.enclosed ? 5 : SQUARE[scale];
      const bad = playOut(b);
      assert.deepEqual(bad.slice(0, 3), [], `fight ${n} at ${scale}`);
      assert.equal(b.grid.squareFt, sq);
      const perTurn = {};
      for (const e of b.trace) {
        if (e.kind === 'attack') { checkAttack(b, e, sq); attacks++; } else {
          checkMove(b, e, sq); moves++;
          const k = `${e.actor}|${e.round}|${e.tick}`;
          perTurn[k] = (perTurn[k] || 0) + e.squares;
          const who = b.combatants.find((c) => c.id === e.actor);
          assert.ok(perTurn[k] <= 2 * Math.max(1, Math.floor(rankFt(who.moveRank) / sq)), `${who.name} moved ${perTurn[k]} squares in one turn`);
        }
      }
    }
    assert.ok(attacks > 500 && moves > 500, `the fights should exercise attacks and moves (${attacks}, ${moves})`);
  });
}

test('range bands are rank x 25, 50 and 100 ft, doubled per Extended Range, at every scale', () => {
  for (const [scale, sq] of Object.entries(SQUARE)) {
    for (const rank of [1, 2, 3, 5, 8, 12]) {
      for (const ext of [0, 1, 2]) {
        const atk = { range: 'ranged', kind: 'ranged', rank, ext };
        for (let squares = 0; squares <= GRID_SIZE - 1; squares++) {
          const ft = squares * sq;
          const m = 2 ** ext;
          const want = ft <= 25 * rank * m ? 0 : ft <= 50 * rank * m ? 2 : ft <= 100 * rank * m ? 5 : 99;
          assert.equal(rangePenalty(atk, ft), want, `${scale} rank ${rank} ext ${ext} at ${ft} ft`);
          assert.equal(bandFor(ft, rank, ext).band === 'out', want === 99);
        }
      }
    }
  }
});

test('a fight saves and loads with its grid, positions and scenery intact, at every scale', () => {
  for (const scale of Object.keys(SQUARE)) {
    for (const n of [2, 6, 10, 14]) {
      const b = buildFight(n, scale);
      for (let i = 0; i < 12 && b.status !== 'over'; i++) step(b, R);
      const back = reviveBattle(R, JSON.parse(JSON.stringify(serializeBattle(b))));
      assert.deepEqual(back.grid, b.grid);
      assert.deepEqual(back.cover, b.cover);
      assert.deepEqual(back.combatants.map((c) => [c.id, c.x, c.y]), b.combatants.map((c) => [c.id, c.x, c.y]));
      assert.equal(back.options.scale, scale);
    }
  }
});

test('an old save with zones converts: zone z to column round(z * 11 / 7) on the middle row', () => {
  const b = buildFight(0, 'block');
  const old = JSON.parse(JSON.stringify(serializeBattle(b)));
  old.combatants.forEach((c, i) => { delete c.x; delete c.y; c.pos = [1, 5][i % 2]; });
  old.cover = [{ id: 'cv1', kind: 'brick-wall', name: 'brick wall', material: 'stone', inches: 8, toughness: 8, level: 'total', state: 'intact', zone: 4 }];
  delete old.grid;
  const back = reviveBattle(R, old);
  assert.deepEqual(back.combatants.map((c) => [c.x, c.y]), old.combatants.map((c, i) => [Math.round([1, 5][i % 2] * 11 / 7), 5]));
  assert.deepEqual([back.cover[0].x, back.cover[0].y], [6, 5]);
  assert.equal(back.grid.squareFt, 30);
  assert.equal(createBattle().grid.w, 12);
});
