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

function styleExtrasFlaws(ch, R) {
  let extras = 0; let flaws = 0;
  for (const s of stylesOf(ch)) {
    const def = styleDef(R, s.name);
    if (!def) continue;
    flaws += (def.style_flaws || []).reduce((t, f) => t + (f.cost || 0), 0);
    if (TIERS.indexOf(s.tier) >= 1) extras += (def.style_extras || []).reduce((t, e) => t + (e.cost || 0), 0);
  }
  return { extras, flaws };
}

/** The style costs that are not ordinary skills, advantages or powers, part by part. */
export function styleCostParts(ch, R) {
  const styles = stylesOf(ch);
  const ranks = tierRanks(ch);
  const tiers = ranks.initiate + ranks.student + ranks.master;
  const stances = styles.filter((s) => s.stances).length;
  const elements = styles.reduce((t, s) => t + (s.weaponElements || []).length, 0);
  const externals = styles.reduce((t, s) => t + (s.externals || []).reduce((u, a) => u + (a.rank || 1), 0), 0);
  const { extras, flaws } = styleExtrasFlaws(ch, R);
  return { tiers, stances, elements, externals, extras, flaws, total: tiers + stances + elements + externals + extras + flaws };
}

/** Power points spent on maneuver powers. */
export function maneuverPoints(ch, R) {
  return (ch.powers || []).filter((p) => p.maneuver).reduce((t, p) => t + maneuverPowerCost(p, R), 0);
}
