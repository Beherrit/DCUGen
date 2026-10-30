// Legality checks for fighting styles: known names, the tiers' stance requirement, and the power level limit on
// maneuvers that hit with your Strength ("Str+2": attack bonus plus damage rank may not pass 2 x PL).

import { abilityTotals, advantageRank, skillRanks } from '../derive.js';
import { TIERS, TIER_LABEL, stylesOf, styleDef, maneuverDef } from './lookup.js';
import { styleParts, maneuverPoints } from './price.js';

/** The damage and attack numbers of a basic maneuver that is plain Strength damage: { plus, mod } or null. */
export function strengthManeuver(def) {
  const d = /^Str(?:\+(\d+))?$/.exec(String(def?.damage || '').trim());
  const mod = /^[+-]\d+$/.test(String(def?.attack_mod || '')) ? Number(def.attack_mod) : 0;
  return d ? { plus: Number(d[1] || 0), mod } : null;
}

/** Attack bonus and damage rank of a Strength maneuver for this character: the same numbers the PL limit uses. */
export function strengthManeuverNumbers(ch, R, power, abil = abilityTotals(ch, R)) {
  const def = maneuverDef(R, power.maneuverName || power.name, power.detail);
  const shape = strengthManeuver(def);
  const style = stylesOf(ch).find((s) => s.name === power.style);
  if (!shape || !style || /^Ranged/.test(power.name)) return null;
  const student = TIERS.indexOf(style.tier) >= 1 ? 2 : 0; // Student and Master: +2 attack with the style's maneuvers
  const bonus = (abil.Fighting ?? 0) + advantageRank(ch, 'Close Attack') + skillRanks(ch, 'Close Combat', style.skill?.spec ?? style.name) + shape.mod + student;
  return { bonus, rank: (abil.Strength ?? 0) + shape.plus };
}

/** Is this maneuver power over the power level limit for the character as built? */
export function maneuverOverLimit(ch, R, power) {
  const n = strengthManeuverNumbers(ch, R, power);
  return !!n && n.bonus + n.rank > 2 * ch.pl;
}

/**
 * MA 134: the points spent on a style's advantages, maneuvers and the rest must surpass its style flaws, so a style
 * never costs nothing or pays points back. Counts the tier, stances, weapon elements, extras, outside advantages,
 * maneuvers, and the skills and advantages the style added. Returns { spent, flaws } when it falls short, else null.
 */
export function flawsUncovered(ch, R, s) {
  const parts = styleParts(s, R);
  const flaws = -parts.flaws;
  if (flaws <= 0) return null;
  const added = s.added || {};
  const skills = (added.skills || []).reduce((t, k) => t + (k.ranks || 0), 0) / 2;
  const advantages = (added.advantages || []).reduce((t, a) => t + (a.rank || 1), 0);
  const spent = parts.total - parts.flaws + maneuverPoints(ch, R, s.name) + skills + advantages;
  return spent > flaws ? null : { spent, flaws };
}

export function checkStyleLimits(ch, R, issue) {
  const out = [];
  const abil = abilityTotals(ch, R);
  const seen = new Set();
  for (const s of stylesOf(ch)) {
    if (!styleDef(R, s.name)) { out.push(issue('data', `Unknown fighting style "${s.name}".`)); continue; }
    if (seen.has(s.name)) out.push(issue('style', `${s.name} is listed twice; use one rank of the tier advantages per style.`));
    seen.add(s.name);
    if (!TIERS.includes(s.tier)) out.push(issue('style', `${s.name}: "${s.tier}" is not a tier (Initiate, Student or Master).`));
    else if (TIERS.indexOf(s.tier) >= 1 && !s.stances) out.push(issue('style', `${s.name}: ${TIER_LABEL[s.tier]} needs the ${s.name} Stances advantage (MA 79).`, 'warning', { source: 'MA 79' }));
    const flawed = flawsUncovered(ch, R, s);
    if (flawed) out.push(issue('style', `${s.name}: ${flawed.spent} pp spent on the style does not surpass its ${flawed.flaws} pp of style flaws; buy more of the style.`, 'error', { source: 'MA 134' }));
  }
  for (const p of ch.powers || []) {
    if (!p.maneuver) continue;
    if (!maneuverDef(R, p.maneuverName || p.name, p.detail)) { out.push(issue('data', `Unknown combat maneuver "${p.name}".`)); continue; }
    const n = strengthManeuverNumbers(ch, R, p, abil);
    if (n && n.bonus + n.rank > 2 * ch.pl) {
      out.push(issue('attack', `${p.name}: attack +${n.bonus} plus damage rank ${n.rank} is ${n.bonus + n.rank}; the limit is ${2 * ch.pl}.`, 'error', { pl: true }));
    }
  }
  return out;
}
