// Buy a style exactly as the book lists it (Martial Arts 3e chapter 7): every skill, advantage, weapon element and
// maneuver on the style's entry, at the listed ranks. Used by the Forge's "Buy the whole style" button and the
// generator. The tier advantages come on top of the style's printed points, since the book prices a style without them.

import { TIERS, styleDef, maneuverDef, advantageDef, knownStyle, parseStyleSkill } from './lookup.js';
import { maneuverPrice } from './price.js';
import { addManeuver } from './maneuvers.js';
import { addStyle, setTier, addSkillRanks, addAdvantageRanks } from './styles.js';

const GENERIC_BASIC = /^Basic .*(Attacks?|Strikes|Slam)$|^Basic Unarmed$/;

function buySkills(ch, R, entry, def) {
  for (const k of def.skill_list || []) {
    const sk = parseStyleSkill(k.name);
    if (!R.skill(sk.name)) continue;
    const have = (ch.skills || []).filter((s) => s.name === sk.name && (s.spec || null) === (sk.spec || null)).reduce((t, s) => t + s.ranks, 0);
    addSkillRanks(ch, entry, sk, k.ranks - have);
  }
}

function buyAdvantages(ch, R, entry, def) {
  const wanted = new Map(); // a style may list the same advantage twice (Attack Specialist for two different kicks)
  for (const a of def.advantage_list || []) {
    if (/ Stances$/.test(a.name)) continue; // the stances flag pays for this one
    const known = a.external ? null : advantageDef(R, a.name);
    if (!known) { entry.externals.push({ name: a.name, ...(a.rank ? { rank: a.rank } : {}), ...(a.detail ? { detail: a.detail } : {}) }); continue; }
    const key = `${known.name}|${a.detail || ''}`;
    wanted.set(key, { name: known.name, param: a.detail, rank: (wanted.get(key)?.rank || 0) + (a.rank ?? 1) });
  }
  for (const w of wanted.values()) {
    const have = (ch.advantages || []).filter((x) => x.name === w.name && (x.param || null) === (w.param || null)).reduce((t, x) => t + (x.rank || 1), 0);
    addAdvantageRanks(ch, entry, { name: w.name, param: w.param }, w.rank - have);
  }
}

/** A maneuver item from a style's list as the arguments for addManeuver (null for the plain attacks every style has). */
export function listedManeuver(R, it) {
  if (GENERIC_BASIC.test(it.name)) return null;
  const m = maneuverDef(R, it.name, it.detail);
  if (!m) return null;
  const price = it.cost != null && it.cost !== maneuverPrice(m, it.rank) ? it.cost : undefined;
  return { name: it.name, rank: it.rank, detail: it.detail, price, repeat: true };
}

function buyManeuvers(ch, R, entry, def, withVarying) {
  for (const it of [...(def.basic_maneuvers || []), ...(def.advanced_maneuvers || [])]) {
    if (it.cost == null && !withVarying) continue; // no printed price: the player sets it
    const args = listedManeuver(R, it);
    if (args) addManeuver(ch, R, entry.name, args);
  }
}

/**
 * Learn a style and buy everything it lists. opts.tier (default master), opts.varying: also buy the basic maneuvers the
 * book prices "by your Strength" (left out by default, as the book leaves them out of the style's points).
 * Returns false for an unknown style.
 */
export function buyWholeStyle(ch, R, name, { tier = 'master', varying = false } = {}) {
  const def = styleDef(R, name);
  if (!def) return false;
  if (!knownStyle(ch, def.name)) addStyle(ch, R, def.name);
  const entry = knownStyle(ch, def.name);
  if (TIERS.indexOf(tier) >= 1) setTier(ch, def.name, tier); else entry.tier = tier;
  entry.stances = (def.advantage_list || []).some((a) => / Stances$/.test(a.name)); // a few styles list none, and are priced without
  for (const w of def.weapon_elements || []) if (!entry.weaponElements.includes(w)) entry.weaponElements.push(w);
  buySkills(ch, R, entry, def);
  buyAdvantages(ch, R, entry, def);
  buyManeuvers(ch, R, entry, def, varying);
  return true;
}
