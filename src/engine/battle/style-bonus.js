// What practising a fighting style adds to the style's own attacks, built into them when the fighter is built (Martial Arts 3e):
//   (Style) Student, p79: +2 attack with the style's basic and advanced maneuvers, including its basic attack (unarmed, or the weapon
//     elements). Initiate and Master add no attack bonus. The bonus does not compound across styles that share a maneuver.
//   Aggressive, p131: +1 to all attacks with the style's combat maneuvers.
//   Focused Strike, Nerve Strike and Flurry, pp 147-148: Improved Critical, Penetrating and Multiattack on the style's close attacks.
// Each bonus is named on the attack (`bn`), and the fight log shows it beside the roll.

import { rankFt } from '../range.js';
import { advantageRank, skillRanks } from '../derive.js';
import { ENHANCES } from './maneuver-table.js';
import { anyFits } from './style-extras.js';

/** Does a weapon element ("Sword (including the Urumi)", "Dagger/Knife") fit this attack's name? */
export function elementFits(element, name) {
  const words = String(element).toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z]+/).filter((w) => w.length >= 3);
  const n = String(name).toLowerCase();
  return words.some((w) => n.includes(w) || (n.length >= 4 && w.includes(n)));
}

/** The weapons a style is used with: its Weapon Elements, and the weapon its type names ("Weapon (Staff)"). */
export function elementsOf(def) {
  const typed = /^Weapon ((?!Select)(.+))/.exec(def?.type || '')?.[1];
  return [...(def?.weapon_elements || []), ...(typed ? [typed] : [])];
}

/** The styles of a fighter that an attack belongs to: a maneuver to its own style, the unarmed attack and weapons to the styles that use them. */
export function ownersOf(ma, a) {
  if (a.maneuver) return ma.styles.filter((s) => s.name === a.styleName);
  if (a.unarmed) return ma.styles.filter((s) => !s.fl.weapon && (s.def?.type === 'Unarmed' || (s.def?.weapon_elements || []).includes('Unarmed')));
  if (a.item?.kind === 'equipment') return ma.styles.filter((s) => elementsOf(s.def).some((e) => elementFits(e, a.name)));
  return [];
}

/** The style's own skill on an attack it owns: Close Combat (or Ranged Combat): <style> in place of the sheet's skill when it is higher (MA 48). */
function skillBonus(c, style, a) {
  const ranged = style.skill?.name === 'Ranged Combat';
  if (ranged !== (a.range === 'ranged') || (a.range !== 'close' && a.range !== 'ranged')) return 0;
  const ab = c.d.abilities;
  const base = ranged ? (ab.Dexterity ?? 0) + advantageRank(c.ch, 'Ranged Attack') : (ab.Fighting ?? 0) + advantageRank(c.ch, 'Close Attack');
  return base + skillRanks(c.ch, style.skill.name, style.skill.spec) - a.bonus;
}

function name(a, label, n) {
  a.bonus += n;
  a.bn = { ...(a.bn || {}), [label]: n };
}

/** The Focused Strike, Nerve Strike and Flurry maneuvers a fighter bought: [{ kind, rank, style }]. */
function enhancers(c) {
  return (c.ch.powers || []).filter((p) => p.maneuver && ENHANCES[p.maneuverName || p.name]).map((p) => ({ kind: ENHANCES[p.maneuverName || p.name], rank: p.rank || 1, style: p.style }));
}

/**
 * What the style does to the whole fighter: Listless takes 4 off initiative a rank (p135), Slow a speed rank a rank (p136),
 * Defensive forbids All-Out Attack and a charge (p131), Aggressive forbids Defensive Attack and the Defend action (p131).
 * They hold whenever the fighter practices the style (the book says "while using the fighting style").
 */
function wholeFighter(c) {
  const sum = (key, group) => c.ma.styles.reduce((t, s) => t + (s[group][key] || 0), 0);
  c.initBonus -= 4 * sum('listless', 'fl');
  const slow = sum('slow', 'fl');
  if (slow) { c.moveRank = (c.moveRank ?? 0) - slow; c.moveFt = rankFt(c.moveRank); }
  c.noAllOut = c.noCharge = c.ma.styles.some((s) => s.ex.defensive);
  c.noDefensive = c.noDefend = c.ma.styles.some((s) => s.ex.aggressive);
  const skilled = new Set(c.ma.styles.flatMap((s) => (s.def?.skill_list || []).map((k) => k.name.split(':')[0].trim())));
  for (const k of skilled) if (typeof c.skills[k] === 'number') c.skills[k] += 2; // (Style) Initiate: +2 to the style's skills but its Close Combat (MA 78)
}

/** Finesse Attack (MA, Combat advantages): a chosen Strength-based melee attack uses Dexterity for its Damage when that is higher. */
function finesse(c) {
  const dex = c.d.abilities.Dexterity ?? 0; const str = c.d.abilities.Strength ?? 0;
  for (const adv of (c.ch.advantages || []).filter((a) => a.name === 'Finesse Attack' && a.param)) {
    for (const a of c.attacks) {
      if (a.range !== 'close' || a.effect !== 'Damage' || !(a.unarmed || a.maneuver || a.power?.strengthBased) || !anyFits([String(adv.param).toLowerCase()], a)) continue;
      a.rank = Math.min(a.rank + Math.max(0, dex - str), Math.max(a.rank, 2 * (c.pl || 10) - (a.bonus ?? 0)));
    }
  }
}

/** Opposing Style (MA 77): +2 to attack against a foe who practices a style the fighter has named. The foe's style is read from what it practices. */
export function opposingBonus(c, t) {
  if (!t.ma) return { n: 0 };
  const hit = (c.ch.advantages || []).filter((a) => a.name === 'Opposing Style' && a.param).find((a) => t.ma.styles.some((s) => s.name.toLowerCase() === String(a.param).toLowerCase()));
  return hit ? { n: 2, style: hit.param } : { n: 0 };
}

/** Add the style bonuses to the fighter's attacks. Call once, after the attacks are built. */
export function styleBonuses(c) {
  if (!c.ma) return;
  wholeFighter(c);
  finesse(c);
  const enh = enhancers(c);
  for (const a of c.attacks) {
    const owners = ownersOf(c.ma, a);
    if (!owners.length) continue;
    a.styleOwner = owners[0].name;
    if (a.roll && !a.maneuver) {
      const best = owners.map((st) => ({ st, n: skillBonus(c, st, a) })).sort((x, y) => y.n - x.n)[0];
      if (best.n > 0) name(a, `${best.st.skill.name}: ${best.st.skill.spec}`, best.n);
    }
    if (a.roll && owners.some((s) => s.rank >= 1)) name(a, 'Student', 2);
    if (a.roll && owners.some((s) => s.ex.aggressive)) name(a, 'Aggressive style', 1);
    if (a.range !== 'close') continue;
    for (const e of enh.filter((x) => owners.some((s) => s.name === x.style))) {
      if (e.kind === 'crit') a.crit = Math.max(16, a.crit - e.rank);
      else if (e.kind === 'penetrating') a.penetrating = true;
      else a.multiattack = true;
    }
  }
}
