// Items a fighter carries: which attacks belong to one, whether it can be knocked loose (Disarm), how tough it is
// (Smash), and what happens to a fighter's attacks when the item is lost. An item is { key, name, kind, held, toughness }.

import { deviceCost } from '../costs.js';
import { toughnessOf } from './materials.js';

// Hero's Handbook p94: a device has Toughness equal to its points divided by 5 (at least 1); equipment is made of a
// material. Bows and staves are wood, everything else (guns, blades, armor) is steel.
const WOODEN = /\b(bow|crossbow|staff|staves|quarterstaff|club)\b/i;
export const equipmentToughness = (name) => toughnessOf(WOODEN.test(name) ? 'wood' : 'steel');

/** The device of the character that holds this power (or has it as an alternate), or null. */
export function deviceOf(ch, p) {
  return (ch.devices || []).find((d) => d.powers.includes(p) || d.powers.some((q) => (q.alternates || []).includes(p))) || null;
}

const easilyRemovable = (p) => (p?.flaws || []).some((f) => /Easily Removable/i.test(`${f.name} ${f.option || ''}`));

/** The item an attack comes from, or null for a power of the fighter's own. Equipment weapons count as held. */
export function itemFor(ch, a, p, R) {
  if (a.equipment) return { key: `equipment:${a.name}`, name: a.name, kind: 'equipment', held: true, toughness: equipmentToughness(a.name) };
  const dev = p ? deviceOf(ch, p) : null;
  if (!dev) return null;
  const name = dev.name || 'device';
  return { key: `device:${name}`, name, kind: 'device', held: dev.kind === 'easily' || easilyRemovable(p), toughness: Math.max(1, Math.floor(deviceCost(dev, R).total / 5)) };
}

/** The distinct items behind a fighter's attacks. */
export function itemsOf(c) {
  const seen = new Map();
  for (const a of c.attacks) if (a.item && !seen.has(a.item.key)) seen.set(a.item.key, a.item);
  return [...seen.values()];
}

/** The fighter loses an item (dropped, broken or destroyed): its attacks are gone for the rest of the fight. */
export function loseItem(c, item) {
  c.dropped = [...(c.dropped || []), item.key];
  c.attacks = c.attacks.filter((a) => a.item?.key !== item.key);
}
