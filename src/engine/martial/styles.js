// Learning and dropping fighting styles on a character (Martial Arts 3e, pp 125-128).
// ch.styles = [{ name, tier, skill, stances, weaponElements, maneuvers, externals, added }]
//   tier: 'initiate' | 'student' | 'master'      skill: the style's own { name, spec } (Close Combat or Ranged Combat)
//   stances: has the (Style) Stances advantage
//   weaponElements: weapons added with the Weapon Element advantage (the style's own type is free)
//   maneuvers: see martial/maneuvers.js          externals: advantages from Better Mousetrap, a point per rank
//   added: what learning the style put on the sheet ({ skills, advantages }), so dropping the style takes it back off
// Every function changes the character it is given (callers pass a copy) and returns true when something changed.

import { TIERS, stylesOf, knownStyle, styleDef, parseStyleSkill } from './lookup.js';
import { grantPrerequisites } from '../prereqs.js';
import { paramRequired } from '../advparams.js';

const dropEmpty = (ch, key) => { ch[key] = (ch[key] || []).filter((x) => (x.ranks ?? x.rank ?? 1) > 0); };

/** The style's own skill as the style lists it, "Close Combat: Aikido" (or Ranged Combat); Close Combat: <style> if none. */
export function styleSkill(def) {
  const raw = (def.skill_list || []).find((k) => /^(Close|Ranged) Combat/.test(k.name));
  const sk = raw ? parseStyleSkill(raw.name) : { name: 'Close Combat' };
  return { name: sk.name, spec: sk.spec || def.name };
}

/** Add ranks to a skill and remember it on the style, so dropping the style takes the same ranks back. */
export function addSkillRanks(ch, entry, skill, ranks) {
  if (ranks <= 0) return;
  ch.skills = ch.skills || [];
  const row = ch.skills.find((s) => s.name === skill.name && (s.spec || null) === (skill.spec || null));
  if (row) row.ranks += ranks; else ch.skills.push(skill.spec ? { name: skill.name, spec: skill.spec, ranks } : { name: skill.name, ranks });
  const rec = entry.added.skills.find((s) => s.name === skill.name && (s.spec || null) === (skill.spec || null));
  if (rec) rec.ranks += ranks; else entry.added.skills.push({ ...skill, ranks });
}

export function addAdvantageRanks(ch, entry, adv, ranks, R) {
  if (ranks <= 0) return;
  ch.advantages = ch.advantages || [];
  // An advantage that has to name an attack names the style's own (its maneuvers are attacks with the style skill).
  if (R && !adv.param && paramRequired(R.advantage(adv.name)) && R.advantage(adv.name).param === 'attack' && entry?.name) adv = { ...adv, param: entry.name };
  // An advantage the style lists can need another first (Improved Joint Lock needs Joint Lock, MA 66): the style brings it too.
  // A prerequisite that can't be handed out (a weapon element is picked on the style) is left for the limits to flag.
  if (R) grantPrerequisites(ch, R, adv.name, adv.param, {
    add: (name, param) => addAdvantageRanks(ch, entry, { name, param }, 1),
    addSkill: (name, spec, n) => addSkillRanks(ch, entry, spec ? { name, spec } : { name }, n),
  });
  const row = ch.advantages.find((a) => a.name === adv.name && (a.param || null) === (adv.param || null));
  if (row) row.rank = (row.rank || 1) + ranks; else ch.advantages.push({ name: adv.name, rank: ranks, ...(adv.param ? { param: adv.param } : {}) });
  const rec = entry.added.advantages.find((a) => a.name === adv.name && (a.param || null) === (adv.param || null));
  if (rec) rec.rank += ranks; else entry.added.advantages.push({ name: adv.name, rank: ranks, ...(adv.param ? { param: adv.param } : {}) });
}

/** Learn a style at Initiate (or another tier). Adds the style's skill at 1 rank. False if unknown or already known. */
export function addStyle(ch, R, name, { tier = 'initiate' } = {}) {
  const def = styleDef(R, name);
  if (!def || knownStyle(ch, def.name) || !TIERS.includes(tier)) return false;
  const skill = styleSkill(def);
  const entry = { name: def.name, tier, skill, stances: TIERS.indexOf(tier) >= 1, weaponElements: [], maneuvers: [], externals: [], added: { skills: [], advantages: [] } };
  ch.styles = [...stylesOf(ch), entry];
  addSkillRanks(ch, entry, skill, 1);
  return true;
}

/** Forget a style and take back everything learning it put on the sheet: skill ranks, advantages and maneuvers. */
export function removeStyle(ch, name) {
  const entry = knownStyle(ch, name);
  if (!entry) return false;
  for (const s of entry.added?.skills || []) {
    const row = (ch.skills || []).find((k) => k.name === s.name && (k.spec || null) === (s.spec || null));
    if (row) row.ranks -= s.ranks;
  }
  for (const a of entry.added?.advantages || []) {
    const row = (ch.advantages || []).find((k) => k.name === a.name && (k.param || null) === (a.param || null));
    if (row) row.rank = (row.rank || 1) - a.rank;
  }
  dropEmpty(ch, 'skills');
  dropEmpty(ch, 'advantages');
  ch.powers = (ch.powers || []).filter((p) => !(p.maneuver && p.style === name));
  ch.styles = stylesOf(ch).filter((s) => s.name !== name);
  if (!ch.styles.length) delete ch.styles;
  return true;
}

/** Student and Master need the (Style) Stances advantage, so a higher tier turns stances on. */
export function setTier(ch, name, tier) {
  const entry = knownStyle(ch, name);
  if (!entry || !TIERS.includes(tier) || entry.tier === tier) return false;
  entry.tier = tier;
  if (TIERS.indexOf(tier) >= 1) entry.stances = true;
  return true;
}

/** Turning stances off drops a Student or Master back to Initiate, since those tiers require them. */
export function setStances(ch, name, on) {
  const entry = knownStyle(ch, name);
  if (!entry || entry.stances === !!on) return false;
  entry.stances = !!on;
  if (!on) entry.tier = 'initiate';
  return true;
}

export function toggleWeaponElement(ch, name, weapon, on) {
  const entry = knownStyle(ch, name);
  const have = entry?.weaponElements.includes(weapon);
  if (!entry || !weapon || have === !!on) return false;
  entry.weaponElements = on ? [...entry.weaponElements, weapon] : entry.weaponElements.filter((w) => w !== weapon);
  return true;
}
