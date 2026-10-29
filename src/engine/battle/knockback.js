// Knockback: an optional community rule (b.options.knockback), built like the book's throwing rule where the
// distance rank is the thrower's Strength rank minus the thrown thing's mass rank (Hero's Handbook p11).
//
// A damaging attack that hits and beats the target's Toughness check by 2 or more degrees, or a slam attack that
// hits, throws the target back. Knockback rank = the attack's damage rank minus the target's mass rank. Below 0
// the target is only knocked prone. Rank 0 is 30 feet, one zone, and every rank doubles it. A cover piece in the
// way, or the wall of an enclosed arena, hurts the target (the lower of the knockback rank and the obstacle's
// Toughness) and takes a Toughness check of its own; if it is holed or destroyed the target flies on through.

import { log } from './util.js';
import { arenaOf } from './constants.js';
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

/** Which way a blow throws the target: away from the attacker, or toward its own side when they share a zone. */
function directionOf(b, c, t) {
  if (t.pos !== c.pos) return Math.sign(t.pos - c.pos);
  const teams = [...new Set(b.combatants.map((x) => x.team))].sort();
  const i = teams.indexOf(t.team);
  if (i === 0 || i === 1) return i === 0 ? -1 : 1;
  return t.pos < (arenaOf(b) - 1) / 2 ? -1 : 1;
}

// The wall of an enclosed arena is not cover, so it has no level.
const wallPiece = (zone) => ({ id: 'wall', ...ENCLOSURE_WALL, level: null, toughness: toughnessOf(ENCLOSURE_WALL.material, ENCLOSURE_WALL.inches), zone, state: 'intact' });

/** The target hits an obstacle: collision damage to it, a Toughness check for the obstacle. True when the target gets through. */
function collide(b, R, c, t, piece, rank, rng) {
  const hurt = Math.min(rank, piece.toughness);
  log(b, { kind: 'attack', actor: c.id, target: t.id, text: `${t.name} slams into the ${pieceLabel(piece)} at knockback rank ${rank}: collision Damage ${hurt}.`, important: true });
  const synthetic = { id: 'collision', name: 'collision', effect: 'Damage', rank: hurt, resistance: 'Toughness', descriptors: [] };
  applyEffect(b, R, c, synthetic, t, rng, { auto: true });
  damagePiece(b, c, piece, rank, rng);
  return piece.state !== 'intact';
}

/** Fly the target along its path, colliding with whatever stands in the way. Returns { at, moved, events }. */
function fly(b, R, c, t, dir, zones, rank, rng) {
  const arena = arenaOf(b);
  const events = [];
  let at = t.pos; let moved = 0;
  const meet = (piece) => {
    const through = collide(b, R, c, t, piece, rank, rng);
    events.push({ label: pieceLabel(piece), through });
    return through;
  };
  const own = piecesOf(b).find((p) => p.id === t.behind && p.zone === t.pos && p.state === 'intact');
  if (own && !meet(own)) return { at, moved, events };
  while (moved < zones) {
    const next = at + dir;
    if (next < 0 || next >= arena) {
      if (b.options.enclosed && !(meet(wallPiece(at)))) return { at, moved, events };
      break;
    }
    at = next; moved++;
    for (const p of piecesOf(b).filter((x) => x.zone === at && x.state === 'intact')) if (!meet(p)) return { at, moved, events };
  }
  return { at, moved, events };
}

/** One plain sentence for what happened to the target. */
function summary(t, moved, events) {
  const parts = events.map((e) => `${e.through ? 'smashes through' : 'slams into'} the ${e.label}`);
  const lead = moved > 0 ? `${t.name} is knocked back ${moved} zone${moved > 1 ? 's' : ''}` : `${t.name} is thrown to the ground`;
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
  const zones = rank < 0 ? 0 : Math.min(2 ** rank, arenaOf(b));
  const how = rank < 0 ? `enough to knock ${t.name} down` : `${zones} zone${zones > 1 ? 's' : ''} of flight${zones < 2 ** rank ? ' (the arena ends sooner)' : ''}`;
  log(b, { kind: 'note', actor: c.id, target: t.id, text: `Knockback: Damage ${res.rank} against mass rank ${massRank(t)}${t.defending ? ' (braced by the Defend action)' : ''} is knockback rank ${rank}, ${how}.` });
  knockProne(t, c);
  if (rank < 0) { log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${t.name} is knocked prone.` }); return; }
  const flight = fly(b, R, c, t, directionOf(b, c, t), zones, rank, rng);
  if (flight.moved > 0) { t.pos = flight.at; t.behind = null; releaseHolds(b, t); }
  log(b, { kind: 'condition', actor: c.id, target: t.id, text: summary(t, flight.moved, flight.events), important: true });
}
