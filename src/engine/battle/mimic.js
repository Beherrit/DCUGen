// Mimic (Hero's Handbook p107): "You can duplicate the traits of another character you can perceive, requiring a standard action
// to scan them. You gain (Mimic rank x 5) power points worth of traits the target has, up to a maximum of the target's rank."
// In a fight the trait worth copying is the foe's best attack: the copy has the foe's effect at the lower of the foe's rank and what
// the points buy at the effect's price per rank, made with the mimic's own attack check. A new scan replaces the old copy, and the
// copy lasts while the mimic can keep it up (sustained). A Mimic Limited to touch (the detail says so) needs the foe within reach.
// Not modelled: copying defenses, abilities, skills and advantages, and mixing traits from several foes within the points.

import { allPowers } from '../derive.js';
import { log } from './util.js';
import { addMods, dropMods } from './mods.js';

/** The Mimic powers of a character: [{ power, name, rank, points, touch }]. */
export function mimicsOf(ch) {
  return allPowers(ch, { includeAlternates: true }).filter(({ power: p }) => p.effect === 'Mimic' && p.rank > 0 && p.role !== 'defense').map(({ power: p }) => ({
    power: p, name: p.name, rank: p.rank, points: p.rank * 5, touch: /touch|contact|close/i.test(`${p.detail || ''} ${(p.flaws || []).map((f) => f.detail || '').join(' ')}`),
  }));
}

/** The points one rank of an attack's effect costs (Damage 1, Affliction 2...), at least 1. */
function priceOf(R, atk) {
  try { return Math.max(1, R.effect(atk.effect).cost || 1); } catch { return 1; }
}

/** What the mimic would have of foe e's attack: the copied attack object, or null when the points buy nothing of it. */
export function copyOf(R, c, s, e, atk) {
  if (atk.unarmed || atk.stunt || atk.alternate || atk.rank < 1) return null;
  const rank = Math.min(atk.rank, Math.floor(s.points / priceOf(R, atk)));
  if (rank < 1) return null;
  const close = atk.range === 'close';
  const bonus = atk.roll ? (close ? c.attacks.find((a) => a.unarmed)?.bonus ?? c.d.abilities.Fighting ?? 0 : c.d.abilities.Dexterity ?? 0) : null;
  return { ...atk, id: `mimic|${e.id}|${atk.id}`, name: `${atk.name} (copied from ${e.name})`, rank, bonus, equipment: false, device: false, item: null, alternate: false, flaws: null };
}

/** Scan foe e and take the copy of its attack (a standard action). */
export function scan(b, c, s, e, copy) {
  dropMods(c, 'mimic'); // a new scan replaces the old copy
  addMods(c, 'mimic', copy.id, [{ kind: 'attack', attack: copy }]);
  log(b, { kind: 'note', actor: c.id, target: e.id, text: `${c.name} scans ${e.name} with ${s.name} (rank ${s.rank}, ${s.points} points) and copies ${e.name}'s ${copy.name.replace(/ \(copied.*$/, '')} at rank ${copy.rank}.`, important: true });
}
