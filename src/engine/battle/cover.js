// Cover on the battlefield: the pieces, how much cover each gives, who stands behind one, and what it does to an
// attack. A piece is { id, kind, name, material, inches, toughness, level, zone, state }; its state is 'intact',
// 'holed' or 'destroyed'. Nothing here costs a random roll, and a battle with no pieces sees no change at all.

import { log } from './util.js';
import { arenaOf } from './constants.js';
import { coverKind, toughnessOf, materialOf } from './materials.js';

export const COVER_PENALTY = { none: 0, partial: 2, total: 5 };
const LOWER = { total: 'partial', partial: 'none', none: 'none' };

export const piecesOf = (b) => b?.cover || [];

/** "brick wall (stone, 8 in, Toughness 8)" */
export function pieceLabel(p) {
  return `${p.name} (${materialOf(p.material)?.name || p.material}, ${p.inches} in, Toughness ${p.toughness})`;
}

/** Put a piece of cover in a zone. Returns the piece. */
export function addCover(b, kindId, zone) {
  const kind = coverKind(kindId);
  if (!kind) throw new Error(`Unknown kind of cover: ${kindId}`);
  b.cover ||= [];
  const next = 1 + Math.max(0, ...b.cover.map((p) => Number(String(p.id).replace(/\D/g, '')) || 0));
  const z = Math.max(0, Math.min(arenaOf(b) - 1, Math.round(Number(zone) || 0)));
  const piece = { id: `cv${next}`, kind: kind.id, name: kind.name, material: kind.material, inches: kind.inches, toughness: toughnessOf(kind.material, kind.inches), level: kind.level, zone: z, state: 'intact' };
  b.cover.push(piece);
  return piece;
}

export function removeCover(b, id) {
  b.cover = piecesOf(b).filter((p) => p.id !== id);
  for (const c of b.combatants || []) if (c.behind === id) c.behind = null;
}

/** A battle is starting: every piece is whole again and the optional-rule notes reset. */
export function resetScenery(b) {
  for (const p of piecesOf(b)) p.state = 'intact';
  b.noted = {};
}

/** How much cover the piece gives now: a holed piece gives one level less, a destroyed one none. */
export function coverLevel(p) {
  if (p.state === 'destroyed') return 'none';
  return p.state === 'holed' ? LOWER[p.level] : p.level;
}

/** The piece c stands behind, or null (it must still be in c's zone and standing). */
export function shelterOf(b, c) {
  if (!c.behind) return null;
  const p = piecesOf(b).find((x) => x.id === c.behind);
  return p && p.zone === c.pos && p.state !== 'destroyed' ? p : null;
}

/** Cover does nothing against a close attack or one made from the target's own zone. */
export function shieldFor(b, c, atk, t) {
  if (!piecesOf(b).length || atk.kind === 'close' || c.pos === t.pos) return null;
  const p = shelterOf(b, t);
  return p && coverLevel(p) !== 'none' ? p : null;
}

/** Precise Attack ignores cover or concealment penalties for close or ranged attacks, one pairing per rank (DCA 77). */
export function preciseIgnores(c, atk, what) {
  const kind = atk?.kind === 'close' ? 'close' : 'ranged';
  return (c.precise || []).some((p) => p.includes(kind) && p.includes(what));
}

/** The attack-check penalty cover puts on a direct attack: 2 for partial, 5 for total. */
export function coverPenalty(b, c, t, atk) {
  const p = shieldFor(b, c, atk, t);
  if (!p || preciseIgnores(c, atk, 'cover')) return 0;
  return COVER_PENALTY[coverLevel(p)];
}

/** Total cover stops a direct attack that needs a target, unless the optional shoot-through rule is on and there is a roll. */
export function blocksDirect(b, c, atk, t) {
  if (atk.area) return false;
  const p = shieldFor(b, c, atk, t);
  if (!p || coverLevel(p) !== 'total') return false;
  return !(b.options?.shootThrough && atk.roll);
}

/** Cover adds its penalty to a Dodge check against an area effect that starts on the other side of it. */
export function coverDodgeBonus(b, c, v) {
  const p = piecesOf(b).length ? shelterOf(b, v) : null;
  return p && c.pos !== v.pos ? COVER_PENALTY[coverLevel(p)] : 0;
}

/** A fighter takes cover behind a piece in its own zone. */
export function takeCoverBehind(b, c, piece) {
  c.behind = piece.id;
  log(b, { kind: 'note', actor: c.id, text: `${c.name} takes cover behind the ${pieceLabel(piece)}.` });
}

/** Nobody stands behind a destroyed piece. */
export function uncoverBehind(b, piece) {
  for (const c of b.combatants) {
    if (c.behind !== piece.id) continue;
    c.behind = null;
    log(b, { kind: 'note', actor: c.id, text: `${c.name} has no cover left: the ${piece.name} is gone.` });
  }
}
