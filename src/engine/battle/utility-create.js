// Create as a utility: a screen or wall put where it takes the shots meant for a fighter. The worth of a spot is the harm it
// keeps off the fighters it covers over the next rounds: each fighter's share of the enemy ranged attacks (cover does nothing
// against a close one) with the piece there, less what they would do now. A piece already standing is counted, so a second
// wall next to a first is worth nothing and a damaged piece is worth repairing only for the cover it has lost. Using the
// effect again dismisses the maker's earlier piece, which is how it moves or repairs one.

import { alliesOf } from './util.js';
import { canAct } from './conditions.js';
import { squares, feet } from './geometry.js';
import { isOpenSquare } from './path.js';
import { expectedValue } from './odds.js';
import { blocksDirect, piecesOf } from './cover.js';
import { createsOf, addCreated } from './create.js';

const HORIZON = 3;      // rounds a piece is counted over
const DURABLE = 0.7;    // it may be shot down before then
const RING = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

/** What the enemies' best attack would do to p now, counting cover (a shot blocked outright does nothing), shared among p's team. */
function harmTo(b, p, enemies) {
  const share = 1 / (1 + alliesOf(b, p).length);
  const worst = (e) => Math.max(0, ...e.attacks.map((a) => (blocksDirect(b, e, a, p) ? 0 : expectedValue(e, a, p, { dist: a.range === 'close' ? 0 : feet(b, e, p), b }))));
  return share * enemies.reduce((s, e) => s + worst(e), 0);
}

/** Run fn with the cover list swapped for another one. */
function withCover(b, list, fn) {
  const saved = b.cover;
  b.cover = list;
  try { return fn(); } finally { b.cover = saved; }
}

/** The harm kept off the fighters at and around a square if a piece of this kind stood there instead of the maker's earlier one. */
function worthAt(b, c, s, q, enemies, covered) {
  const fake = { id: 'cv-try', created: true, owner: c.id, power: s.name, x: q.x, y: q.y, level: s.level, toughness: s.toughness, state: 'intact' };
  const now = covered.map((p) => harmTo(b, p, enemies));
  const without = piecesOf(b).filter((p) => !(p.created && p.owner === c.id && p.power === s.name));
  const after = withCover(b, [...without, fake], () => covered.map((p) => harmTo(b, p, enemies)));
  return now.reduce((sum, v, i) => sum + Math.max(0, v - after[i]), 0);
}

/** The squares the maker could put a piece on: beside itself or an ally, open, nobody standing there, within its short range. */
function candidates(b, c, s, friends) {
  const seen = new Set();
  const out = [];
  const reach = Math.max(1, Math.floor((s.rank * 25) / b.grid.squareFt));
  for (const p of friends) {
    for (const [dx, dy] of RING) {
      const q = { x: p.x + dx, y: p.y + dy };
      const key = `${q.x},${q.y}`;
      if (seen.has(key) || !isOpenSquare(b, q.x, q.y) || squares(c, q) > reach) continue;
      if (b.combatants.some((o) => !o.out && !o.fled && o.x === q.x && o.y === q.y)) continue;
      seen.add(key);
      out.push(q);
    }
  }
  return out;
}

/** The best piece c could create this turn: { kind: 'create', u, run }, or null. */
export function createOption(b, c, enemies) {
  if (canAct(c) === 'none' || !enemies.length || !enemies.some((e) => e.attacks.some((a) => a.range !== 'close'))) return null;
  const friends = [c, ...alliesOf(b, c)];
  let best = null;
  for (const s of createsOf(c.ch)) {
    for (const q of candidates(b, c, s, friends)) {
      const covered = friends.filter((p) => squares(p, q) <= 1);
      const u = worthAt(b, c, s, q, enemies, covered) * HORIZON * DURABLE;
      if (u > 0 && (!best || u > best.u)) best = { kind: 'create', u, run: (bb, RR, cc) => { addCreated(bb, cc, s, q.x, q.y); } };
    }
  }
  return best;
}

