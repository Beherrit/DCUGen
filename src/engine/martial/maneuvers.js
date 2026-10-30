// Buying combat maneuvers for a fighting style. A maneuver is a power marked `maneuver: true` and `style: <name>`,
// priced by its own cost formula (martial/price.js). Basic maneuvers are mundane: Nullify cannot touch them.
// The style also lists them (style.maneuvers = [{ name, rank?, detail?, price? }]) so the sheet can show them by style;
// the two lists stay in the same order, and a maneuver is found by its name and detail.
// `name` is the maneuver as the style names it ("Ranged Jab" is Jab, bought for ranged attacks).

import { knownStyle, maneuverDef } from './lookup.js';
import { maneuverPrice } from './price.js';

const same = (a, b) => a.name === b.name && (a.detail || '') === (b.detail || '');

/** The name shown for a maneuver: "Awesome Strike (Punch)" when the style buys it for one attack. */
export const maneuverLabel = (m) => (m.detail ? `${m.name} (${m.detail})` : m.name);

/** The smallest rank a maneuver can be bought at (1 when it is priced per rank, none when it is a flat price). */
export function firstRank(def) {
  const c = def?.cost;
  return c?.per_rank ? (c.min_rank ?? 1) : undefined;
}

function powerFor(styleName, def, item, n) {
  return {
    id: `m-${styleName}-${maneuverLabel(item)}-${n}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: maneuverLabel(item),
    effect: 'Feature',
    rank: item.rank ?? 1,
    role: 'maneuver',
    maneuver: true,
    maneuverName: def.name,
    ...(item.detail ? { detail: item.detail } : {}),
    style: styleName,
    tier: def.tier,
    mundane: !!def.mundane,
    ...(typeof item.price === 'number' ? { price: item.price } : {}),
    extras: [], flaws: [], descriptors: [], alternates: [],
  };
}

/** The maneuver powers that belong to one style. */
export const maneuverPowers = (ch, styleName) => (ch.powers || []).filter((p) => p.maneuver && p.style === styleName);

const powerOf = (ch, styleName, m) => (ch.powers || []).find((p) => p.maneuver && p.style === styleName && p.name === maneuverLabel(m));

/**
 * Buy a maneuver for a style the character knows. item: { name, rank?, detail?, price?, repeat? }; price is what the
 * style printed for it when that differs from the maneuver's own formula; repeat allows a second purchase of the same
 * name (a style can list Focused Strike more than once, each for a different maneuver).
 * Returns the new power, or null when the style or maneuver is unknown or the style already has it.
 */
export function addManeuver(ch, R, styleName, item) {
  const style = knownStyle(ch, styleName);
  const def = maneuverDef(R, item.name, item.detail);
  if (!style || !def) return null;
  const entry = { name: item.name, ...(item.detail ? { detail: item.detail } : {}) };
  const copies = style.maneuvers.filter((m) => same(m, entry)).length;
  if (copies && !item.repeat) return null;
  const rank = item.rank ?? firstRank(def);
  const listed = { ...entry, ...(rank != null ? { rank } : {}), ...(typeof item.price === 'number' ? { price: item.price } : {}) };
  style.maneuvers.push(listed);
  const power = powerFor(styleName, def, listed, copies + 1);
  ch.powers = ch.powers || [];
  ch.powers.push(power);
  return power;
}

export function removeManeuver(ch, styleName, name, detail) {
  const style = knownStyle(ch, styleName);
  const i = style ? style.maneuvers.findIndex((m) => same(m, { name, detail })) : -1;
  if (i < 0) return false;
  const power = powerOf(ch, styleName, style.maneuvers[i]);
  style.maneuvers.splice(i, 1);
  if (power) ch.powers.splice(ch.powers.indexOf(power), 1);
  return true;
}

/** Change the rank of a maneuver that is priced per rank; a printed price no longer applies. */
export function setManeuverRank(ch, R, styleName, name, detail, rank) {
  const style = knownStyle(ch, styleName);
  const m = style?.maneuvers.find((x) => same(x, { name, detail }));
  const def = maneuverDef(R, name, detail);
  if (!m || !def?.cost?.per_rank) return false;
  m.rank = Math.max(def.cost.min_rank ?? 1, rank);
  delete m.price;
  const p = powerOf(ch, styleName, m);
  if (p) { p.rank = m.rank; delete p.price; }
  return true;
}

/** What a maneuver costs at a rank, for the picker (null when the book leaves it to the player). */
export function priceAt(R, name, detail, rank) {
  return maneuverPrice(maneuverDef(R, name, detail), rank);
}
