// Create (Hero's Handbook p91): solid objects formed out of nowhere. "You can create an object with a maximum volume rank equal
// to your effect rank and Toughness equal to your effect rank." They are cover (an opaque object blocks attacks both ways and
// is damaged like any object), stay where they are put, and vanish if you stop maintaining them (a sustained effect) unless
// the power is Continuous or Permanent. Using the effect again repairs or replaces an object.
//
// A created object is a piece of cover (cover.js) with `created: true`, so movement, line of fire, damage to scenery and the
// AI shooting cover all treat it like any other piece. Extras read: Continuous, Permanent (it stays when the maker is down),
// Impervious (damage of half its Toughness or less does nothing). Flaws read: Feedback (feedback.js), Proportional (volume
// and Toughness share the rank, so the wall has less Toughness).
// house rule: the book gives a created object no size on the grid, so one use makes one piece that fills one square: it
// needs volume rank 4 (about 24 cubic feet, a screen to crouch behind) for partial cover and volume rank 7 (about 190 cubic
// feet, a wall) for total cover. With Proportional the wall takes volume rank 7 and what is left of the rank is its Toughness.

import { allPowers } from '../derive.js';
import { hasExtra, log, byId } from './util.js';
import { piecesOf } from './cover.js';
import { clampToPlay, spotName } from './grid.js';
import { canAct } from './conditions.js';

export const MIN_COVER_RANK = 4;
export const WALL_RANK = 7;

/** Every Create power c has, with what it can make: { power, name, rank, toughness, level, continuous, ... }; null for ranks too low to make cover. */
export function createsOf(ch) {
  const out = [];
  for (const { power: p } of allPowers(ch, { includeAlternates: true })) {
    if (p.effect !== 'Create' || !(p.rank >= MIN_COVER_RANK) || p.role === 'defense') continue;
    const proportional = (p.flaws || []).some((f) => /^proportional/i.test(f.name));
    const volume = proportional ? Math.min(p.rank, WALL_RANK) : p.rank;
    out.push({
      power: p, name: p.name, rank: p.rank, volume, toughness: proportional ? Math.max(0, p.rank - volume) : p.rank,
      level: volume >= WALL_RANK ? 'total' : 'partial', continuous: hasExtra(p, 'Continuous') || (p.flaws || []).some((f) => /^permanent/i.test(f.name)),
      impervious: hasExtra(p, 'Impervious'), feedback: (p.flaws || []).some((f) => /^feedback/i.test(f.name)),
    });
  }
  return out;
}

/** The created pieces of this maker, standing or not. */
export const madeBy = (b, c) => piecesOf(b).filter((p) => p.created && p.owner === c.id);

/** Put a created piece on a square, dismissing the maker's earlier piece of the same power (a free action). Returns the piece. */
export function addCreated(b, c, s, x, y) {
  b.cover ||= [];
  for (const old of madeBy(b, c).filter((p) => p.power === s.name)) b.cover = b.cover.filter((p) => p !== old);
  const next = 1 + Math.max(0, ...b.cover.map((p) => Number(String(p.id).replace(/\D/g, '')) || 0));
  const at = clampToPlay(b, Math.round(x), Math.round(y));
  const piece = {
    id: `cv${next}`, kind: 'created', name: s.name, material: 'created', inches: 0, toughness: s.toughness, level: s.level,
    x: at.x, y: at.y, state: 'intact', created: true, owner: c.id, power: s.name, rank: s.rank, continuous: s.continuous, impervious: s.impervious, feedback: s.feedback,
  };
  b.cover.push(piece);
  log(b, { kind: 'note', actor: c.id, text: `${c.name} uses ${s.name} (rank ${s.rank}) and forms ${piece.name} at ${spotName(piece)}: Toughness ${piece.toughness}, ${piece.level} cover, blocking shots both ways, standing while ${c.name} keeps it up.`, important: true });
  return piece;
}

/** A created object lasts while its maker can keep it up. Called before every end check, with the summons. */
export function createUpkeep(b) {
  const gone = piecesOf(b).filter((p) => {
    if (!p.created || p.continuous) return false;
    const owner = byId(b, p.owner);
    return !owner || owner.out || owner.fled || canAct(owner) === 'none';
  });
  if (!gone.length) return;
  b.cover = b.cover.filter((p) => !gone.includes(p));
  for (const c of b.combatants) if (gone.some((p) => p.id === c.behind)) c.behind = null;
  for (const p of gone) log(b, { kind: 'note', actor: p.owner, text: `The ${p.name} at ${spotName(p)} vanishes: ${byId(b, p.owner)?.name || 'its maker'} can no longer keep it up.` });
}

/** The pieces with this maker's marks removed when a new battle starts (created objects do not outlast a fight). */
export const withoutCreated = (b) => { b.cover = piecesOf(b).filter((p) => !p.created); };
