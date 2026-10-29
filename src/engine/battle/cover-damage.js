// Hurting cover (Hero's Handbook p94). Objects are defenseless: an attack check against DC 10 that hits is an
// automatic critical, and the piece rolls Toughness against the damage. Two degrees of failure punch a hole in it
// (it gives one level less cover), three or more destroy it. Also: shooting through cover (an optional rule),
// area attacks hitting the scenery, and the AI shooting a piece that shields its best target.

import { sign, d20, log } from './util.js';
import { rollCheck, critNote } from './checks.js';
import { checkPenalty } from './conditions.js';
import { rangePenalty } from './odds.js';
import { attackVerb } from './attack-roll.js';
import { piecesOf, coverLevel, pieceLabel, uncoverBehind } from './cover.js';
import { feet, areaPieces } from './geometry.js';

const ORDER = ['intact', 'holed', 'destroyed'];

/** What a piece's Toughness check came to, in words, and the state it ends in. */
function outcome(piece, fails) {
  const worse = (state) => (ORDER.indexOf(state) > ORDER.indexOf(piece.state) ? state : piece.state);
  if (fails >= 3) return { state: 'destroyed', text: `destroyed (${fails} degrees)` };
  if (fails === 2) return { state: worse('holed'), text: piece.state === 'holed' ? 'the hole widens (2 degrees)' : 'a hole is punched through it (2 degrees)' };
  return { state: piece.state, text: fails === 1 ? 'scarred but standing (1 degree)' : 'holds' };
}

/** The piece's Toughness check against damage of this rank. Updates its state and the log. Returns the degrees of failure. */
export function damagePiece(b, c, piece, rank, rng, { crit = false } = {}) {
  const dc = 15 + rank + (crit ? 5 : 0);
  const r = rollCheck(rng, piece.toughness, dc);
  const { roll, total, fails } = r;
  const out = outcome(piece, fails);
  const changed = out.state !== piece.state;
  piece.state = out.state;
  const left = piece.level ? coverLevel(piece) : 'none';
  const after = changed && piece.level ? `, now ${left === 'none' ? 'no cover at all' : `${left} cover`}` : '';
  log(b, { kind: changed ? 'condition' : 'resist', actor: c?.id, text: `The ${pieceLabel(piece)} resists Damage ${rank}: Toughness d20 ${roll} ${sign(piece.toughness)} = ${total} vs DC ${dc}${crit ? ' (+5, defenseless object)' : ''}${critNote(r)} — ${out.text}${after}.`, dice: [{ label: 'Toughness check', roll, mod: piece.toughness, total, dc }], important: changed });
  if (piece.state === 'destroyed' && changed) uncoverBehind(b, piece);
  return fails;
}

/** The to-hit modifier for a shot at scenery: the attack bonus, trade-offs, range and conditions (no cover or concealment). */
export function pieceMod(c, atk, m, dist, aimed = 0) {
  return atk.bonus - m.trade + m.allOut - m.defensive - checkPenalty(c) - rangePenalty(atk, dist) - (m.charge ? 2 : 0) + aimed;
}

/** An attack on a piece of cover: the check against DC 10, then the piece's Toughness check. Returns { hit, fails }. */
export function hitPiece(b, c, atk, piece, rng, { mod, rankShift = 0 }) {
  const roll = d20(rng);
  const total = roll + mod;
  const hit = roll === 20 || (roll !== 1 && total >= 10);
  const target = { name: `the ${pieceLabel(piece)}` };
  const text = `${c.name} ${attackVerb(c, atk, target, rng)}: d20 ${roll} ${sign(mod)} = ${total} vs DC 10 (objects are defenseless)`;
  const dice = [{ label: 'Attack', roll, mod, total, dc: 10 }];
  if (!hit) { log(b, { kind: 'miss', actor: c.id, text: `${text} — ${roll === 1 ? 'natural 1, a clean miss' : 'miss'}.`, dice }); return { hit: false, fails: 0 }; }
  log(b, { kind: 'crit', actor: c.id, text: `${text} — hit, an automatic critical against an object.`, dice });
  return { hit: true, fails: damagePiece(b, c, piece, atk.rank + rankShift, rng, { crit: true }) };
}

/** Optional rule: a direct attack on a target behind total cover goes through the cover first. Returns { go, rankShift }. */
export function shootThrough(b, c, atk, piece, rng, { mod, rankShift }) {
  b.noted ||= {};
  if (!b.noted.shootThrough) {
    b.noted.shootThrough = true;
    log(b, { kind: 'note', text: 'Optional rule (shoot through cover): an attack at a target behind total cover must breach the cover first, and loses half the cover\'s Toughness in rank when it gets through.' });
  }
  const before = piece.state;
  const r = hitPiece(b, c, atk, piece, rng, { mod, rankShift });
  if (!r.hit || piece.state === before) {
    if (r.hit) log(b, { kind: 'note', actor: c.id, text: `The ${piece.name} stops the shot.` });
    return { go: false, rankShift };
  }
  const next = rankShift - Math.floor(piece.toughness / 2);
  log(b, { kind: 'note', actor: c.id, text: `The shot goes through the ${piece.name} and carries on at Damage ${Math.max(0, atk.rank + next)}.` });
  return { go: true, rankShift: next };
}

/** An area Damage attack also hits every intact piece of scenery inside its template: a Toughness check, no attack roll. */
export function areaOnPieces(b, c, atk, target, rank, rng) {
  if (atk.effect !== 'Damage') return;
  for (const p of areaPieces(b, c, atk, target, piecesOf(b).filter((x) => x.state === 'intact'))) damagePiece(b, c, p, Math.max(0, rank), rng);
}

/** The AI shoots the piece that shields its best target (the plan chosen in cover-plan.js). */
export function shootCover(b, c, { target, attack, piece }, rng) {
  c.lastAttackId = attack.id;
  c.stats.attacks++;
  const m = { trade: 0, allOut: 0, defensive: 0, charge: false };
  log(b, { kind: 'note', actor: c.id, target: target.id, text: `${c.name} can't see a clean shot at ${target.name}, who is behind total cover, and goes for the ${piece.name} instead.` });
  hitPiece(b, c, attack, piece, rng, { mod: pieceMod(c, attack, m, feet(b, c, target)) });
}
