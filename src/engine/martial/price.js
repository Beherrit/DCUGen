// What a fighting style costs (Martial Arts 3e, pp 78-80 and 125-128).
//
//   (Style) Initiate, Student and Master are ranked advantages: one point per rank, and a rank covers one style.
//     A Student also has Initiate, a Master has both.
//   (Style) Stances: one rank per style whose stances you use.   Weapon Element: one rank per extra weapon.
//   Style extras and flaws are flat costs printed with the style. Flaws apply from Initiate (its prerequisites
//     say "all style flaws at their full value"); extras from Student.
//   Advantages from Better Mousetrap (listed on the style, not in advantages.json) cost a point per rank too.
//   Skills, other advantages and the maneuvers are bought as ordinary traits and priced where they live.
//   A maneuver is a power priced by its own formula: flat + ceil(rank x per_rank / ranks_per).

import { stylesOf, styleDef, maneuverDef, TIERS } from './lookup.js';

/** Cost of a maneuver at a rank from its cost formula, or null when the book leaves it open. */
export function maneuverPrice(def, rank) {
  const c = def?.cost;
  if (!c || c.varies) return null;
  const r = rank ?? c.min_rank ?? 1;
  return c.flat + (c.per_rank ? Math.ceil((r * c.per_rank) / (c.ranks_per || 1)) : 0);
}

/** What a maneuver power costs: the price a style printed for it, else its own formula. */
export function maneuverPowerCost(power, R) {
  if (typeof power.price === 'number') return power.price;
  const def = maneuverDef(R, power.maneuverName || power.name, power.detail);
  return maneuverPrice(def, power.rank) ?? 0;
}

/** How many ranks of each tier advantage the character holds. */
export function tierRanks(ch) {
  const styles = stylesOf(ch);
  const at = (n) => styles.filter((s) => TIERS.indexOf(s.tier) >= n).length;
  return { initiate: at(0), student: at(1), master: at(2) };
}

/** What one style costs apart from its skills, advantages and maneuvers, part by part. */
export function styleParts(s, R) {
  const def = styleDef(R, s.name);
  const t = TIERS.indexOf(s.tier);
  const tiers = t + 1; // Initiate 1, Student 2, Master 3
  const stances = s.stances ? 1 : 0;
  const elements = (s.weaponElements || []).length;
  const externals = (s.externals || []).reduce((u, a) => u + (a.rank || 1), 0);
  const flaws = (def?.style_flaws || []).reduce((n, f) => n + (f.cost || 0), 0);
  const extras = t >= 1 ? (def?.style_extras || []).reduce((n, e) => n + (e.cost || 0), 0) : 0;
  return { tiers, stances, elements, externals, extras, flaws, total: tiers + stances + elements + externals + extras + flaws };
}

/** The style costs that are not ordinary skills, advantages or powers, added up over every style. */
export function styleCostParts(ch, R) {
  const sum = { tiers: 0, stances: 0, elements: 0, externals: 0, extras: 0, flaws: 0, total: 0 };
  for (const s of stylesOf(ch)) {
    const p = styleParts(s, R);
    for (const k of Object.keys(sum)) sum[k] += p[k];
  }
  return sum;
}

/** Power points spent on maneuver powers (of one style when a name is given). */
export function maneuverPoints(ch, R, styleName) {
  return (ch.powers || []).filter((p) => p.maneuver && (!styleName || p.style === styleName)).reduce((t, p) => t + maneuverPowerCost(p, R), 0);
}
