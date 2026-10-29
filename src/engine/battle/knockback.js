// Knockback: an optional community rule (b.options.knockback), built like the book's throwing rule where the
// distance rank is the thrower's Strength rank minus the thrown thing's mass rank (Hero's Handbook p11).
//
// A damaging attack that hits and beats the target's Toughness check by 2 or more degrees, or a slam attack that
// hits, throws the target back. Knockback rank = the attack's damage rank minus the target's mass rank. Below 0
// the target is only knocked prone. Rank 0 is 30 feet and every rank doubles it; the flight runs square by square along
// the line from the attacker through the target. A cover piece in the way, or the wall of an enclosed room, hurts the
// target (the lower of the knockback rank and the obstacle's Toughness) and takes a Toughness check of its own; if
// it is holed or destroyed the target flies on through (a wall still stops it, the room ends there).

import { log } from './util.js';
import { fmtFt, rankFt } from '../range.js';
import { GRID_SIZE, isWall, isPlayable, spotName } from './grid.js';
import { teamsOf } from './placement.js';
import { allPowers } from '../derive.js';
import { applyEffect } from './attack-effects.js';
import { releaseHolds } from './maneuvers.js';
import { piecesOf, pieceLabel } from './cover.js';
import { damagePiece } from './cover-damage.js';
import { toughnessOf, ENCLOSURE_WALL } from './materials.js';
import { makeProne } from './prone.js';

const powerRanks = (c, effect) => allPowers(c.ch, { includeAlternates: false }).map((x) => x.power).filter((p) => !p.pool && p.effect === effect).reduce((s, p) => s + p.rank, 0);

/** Mass rank: 2 for a normal adult, plus Growth, minus half of Shrinking; 2 more for a fighter braced by the Defend action. */
export function massRank(c) {
  const own = c.ch?.massRank ?? c.ch?.mass;
  const base = typeof own === 'number' ? own : 2 + powerRanks(c, 'Growth') - Math.floor(powerRanks(c, 'Shrinking') / 2);
  return base + (c.defending ? 2 : 0);
}

/** Which way a blow throws the target: along the line from the attacker, or toward its own team's edge when they share a square. */
function directionOf(b, c, t) {
  const dx = t.x - c.x; const dy = t.y - c.y;
  if (dx || dy) return { dx, dy };
  const home = [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }][teamsOf(b).indexOf(t.team)];
  return home || { dx: t.x * 2 < GRID_SIZE - 1 ? -1 : 1, dy: 0 };
}
// The wall of an enclosed room is not cover, so it has no level.
const wallPiece = (x, y) => ({ id: 'wall', ...ENCLOSURE_WALL, level: null, toughness: toughnessOf(ENCLOSURE_WALL.material, ENCLOSURE_WALL.inches), x, y, state: 'intact' });
/** The target hits an obstacle: collision damage to it, a Toughness check for the obstacle. True when the target gets through. */
function collide(b, R, c, t, piece, rank, rng) {
  const hurt = Math.min(rank, piece.toughness);
  log(b, { kind: 'attack', actor: c.id, target: t.id, text: `${t.name} slams into the ${pieceLabel(piece)} at knockback rank ${rank}: collision Damage ${hurt}.`, important: true });
  const synthetic = { id: 'collision', name: 'collision', effect: 'Damage', rank: hurt, resistance: 'Toughness', descriptors: [] };
  applyEffect(b, R, c, synthetic, t, rng, { auto: true });
  damagePiece(b, c, piece, rank, rng);
  return piece.state !== 'intact';
}

/** Fly the target along its path, square by square, colliding with whatever stands in the way. Returns { at, moved, events }. */
function fly(b, R, c, t, dir, squares, rank, rng) {
  const events = [];
  const path = [{ x: t.x, y: t.y }];
  const m = Math.max(Math.abs(dir.dx), Math.abs(dir.dy));
  const meet = (piece) => {
    const through = collide(b, R, c, t, piece, rank, rng);
    events.push({ label: pieceLabel(piece), through });
    return through;
  };
  for (let i = 1; i <= squares; i++) {
    const x = t.x + Math.round((dir.dx * i) / m); const y = t.y + Math.round((dir.dy * i) / m);
    if (isWall(b, x, y)) { meet(wallPiece(x, y)); break; } // the room ends there, through the wall or not
    if (!isPlayable(b, x, y)) break;
    if (piecesOf(b).filter((p) => p.x === x && p.y === y && p.state === 'intact').some((p) => !meet(p))) break;
    path.push({ x, y });
  }
  // A flight cannot end inside a piece that is still standing (holed): it comes to rest in the square before.
  while (path.length > 1 && piecesOf(b).some((p) => p.x === path.at(-1).x && p.y === path.at(-1).y && p.state !== 'destroyed')) path.pop();
  return { at: path.at(-1), moved: path.length - 1, events };
}
/** One plain sentence for what happened to the target. */
function summary(b, t, moved, events) {
  const parts = events.map((e) => `${e.through ? 'smashes through' : 'slams into'} the ${e.label}`);
  const lead = moved > 0 ? `${t.name} is knocked back ${moved} square${moved > 1 ? 's' : ''} (${fmtFt(moved * b.grid.squareFt)}) to ${spotName(t)}` : `${t.name} is thrown to the ground`;
  return `${lead}${parts.length ? ` and ${parts.join(' and ')}` : ''}.`;
}

/** The target falls prone, if it is not down already. It gets up on its own turn if it wants to move or fight up close (stand.js). */
export function knockProne(t, c) {
  makeProne(t, c, 'knockback', 'knocked prone');
}

/** After a damaging hit: throw the target back if the rule is on and the blow was hard enough (or was a slam). */
export function maybeKnockback(b, R, c, atk, t, res, rng, { slam = false } = {}) {
  if (!b.options.knockback || atk.effect !== 'Damage' || res?.rank === undefined) return;
  if (!(slam || (res.degrees || 0) >= 2)) return;
  const rank = res.rank - massRank(t);
  const flightFt = rank < 0 ? 0 : rankFt(rank);
  const flightSq = Math.min(Math.floor(flightFt / b.grid.squareFt), GRID_SIZE - 1);
  const how = rank < 0 ? `enough to knock ${t.name} down` : `${fmtFt(flightFt)} of flight (${flightSq} square${flightSq === 1 ? '' : 's'} here)`;
  log(b, { kind: 'note', actor: c.id, target: t.id, text: `Knockback: Damage ${res.rank} against mass rank ${massRank(t)}${t.defending ? ' (braced by the Defend action)' : ''} is knockback rank ${rank}, ${how}.` });
  knockProne(t, c);
  if (rank < 0) { log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${t.name} is knocked prone.` }); return; }
  const flight = fly(b, R, c, t, directionOf(b, c, t), flightSq, rank, rng);
  if (flight.moved > 0) { t.x = flight.at.x; t.y = flight.at.y; releaseHolds(b, t); }
  log(b, { kind: 'condition', actor: c.id, target: t.id, text: summary(b, t, flight.moved, flight.events), important: true });
}
