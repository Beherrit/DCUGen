// Advantage prerequisites ("requires" in data/advantages.json): "skill:Expertise (Magic)", "advantage:Trance".
// Fighting-style tier prerequisites ("advantage:(Style) Master") are checked with the styles (martial/limits.js).

import { advantageRank, skillRanks } from './derive.js';

/** The advantage's prerequisites, split into skills [{ name, spec, label }] and advantages [name]. Style tiers are left out. */
export function prerequisitesOf(def) {
  const skills = []; const advantages = [];
  for (const req of def?.requires || []) {
    const [kind, ...rest] = String(req).split(':');
    const what = rest.join(':');
    if (/\(Style\)/.test(what)) continue;
    if (kind === 'skill') {
      const m = /^(.*?)\s*\((.*)\)$/.exec(what);
      skills.push({ name: m ? m[1] : what, spec: m ? m[2] : null, label: what });
    } else if (kind === 'advantage') advantages.push(what);
  }
  return { skills, advantages };
}

/** Prerequisites of this advantage the character lacks: { skills, advantages }. */
export function missingPrerequisites(ch, R, name) {
  const { skills, advantages } = prerequisitesOf(R.advantage(name));
  return {
    skills: skills.filter((s) => skillRanks(ch, s.name, s.spec) <= 0),
    advantages: advantages.filter((a) => advantageRank(ch, a) <= 0 && !(a === 'Weapon Element' && styleWeaponElements(ch))),
  };
}

/** Weapon elements live on the fighting style (ch.styles[i].weaponElements), not in the advantage list. */
function styleWeaponElements(ch) {
  return (ch.styles || []).some((st) => (st.weaponElements || []).length > 0);
}

/** Plain-language list of what is missing, for a warning: ["the Expertise (Magic) skill", "the Trance advantage"]. */
export function missingPrerequisiteText(ch, R, name) {
  const m = missingPrerequisites(ch, R, name);
  return [...m.skills.map((s) => `the ${s.label} skill`), ...m.advantages.map((a) => `the ${a} advantage`)];
}

/**
 * Give the character what an advantage needs before it is added (false, with nothing changed, when it can't be): 1 rank of each missing prerequisite advantage
 * (and its own prerequisites, in turn) and 2 ranks of each missing prerequisite skill. `add(name, param)` and
 * `addSkill(name, spec, ranks)` do the adding, so callers can record what a style package brought.
 * A prerequisite that takes the same kind of parameter keeps it (Attack Mastery (Naginata) needs Attack Specialist (Naginata)).
 */
export function grantPrerequisites(ch, R, name, param, { add, addSkill }, depth = 0) {
  if (depth > 4) return false;
  const def = R.advantage(name);
  const missing = missingPrerequisites(ch, R, name);
  // A weapon element is chosen on the style (a weapon to wield), so it can't be handed out here.
  if (missing.advantages.some((a) => GRANTED_ELSEWHERE.has(a))) return false;
  for (const a of missing.advantages) {
    const reqDef = R.advantage(a);
    if (!reqDef) return false;
    const reqParam = reqDef.param && def?.param === reqDef.param ? param : undefined;
    if (!grantPrerequisites(ch, R, a, reqParam, { add, addSkill }, depth + 1)) return false;
  }
  for (const s of missing.skills) addSkill?.(s.name, s.spec, 2);
  for (const a of missing.advantages) {
    const reqDef = R.advantage(a);
    add(reqDef.name, reqDef.param && def?.param === reqDef.param ? param : undefined);
  }
  return true;
}
const GRANTED_ELSEWHERE = new Set(['Weapon Element']);

/**
 * What the character's advantages need: { advantages: Set of names, skills: Set of "Name|spec" }. Trimming a build
 * (to fit a budget) leaves the last rank of these alone, so it never strands an advantage without its prerequisite.
 */
export function heldPrerequisites(ch, R) {
  const advantages = new Set(); const skills = new Set();
  for (const a of ch.advantages || []) {
    const { skills: s, advantages: adv } = prerequisitesOf(R.advantage(a.name));
    for (const x of adv) advantages.add(x);
    for (const x of s) skills.add(`${x.name}|${x.spec || ''}`);
  }
  return { advantages, skills };
}

/** Would taking one rank from this skill or advantage leave another advantage without its prerequisite? */
export function isLastPrerequisite(ch, R, { skill, advantage }) {
  const held = heldPrerequisites(ch, R);
  if (advantage) {
    if (!held.advantages.has(advantage.name)) return false;
    const total = (ch.advantages || []).filter((a) => a.name === advantage.name).reduce((s, a) => s + (a.rank || 1), 0);
    return total <= 1;
  }
  if (skill) {
    const key = `${skill.name}|${skill.spec || ''}`;
    const any = `${skill.name}|`;
    if (!held.skills.has(key) && !(held.skills.has(any) && !skill.spec)) return false;
    return (skill.ranks || 0) <= 1;
  }
  return false;
}

/** Can grantPrerequisites satisfy this advantage? (False when it needs a weapon element the styles don't have.) */
export function prerequisitesGrantable(ch, R, name, depth = 0) {
  if (depth > 4) return false;
  const missing = missingPrerequisites(ch, R, name);
  return missing.advantages.every((a) => !GRANTED_ELSEWHERE.has(a) && R.advantage(a) && prerequisitesGrantable(ch, R, a, depth + 1));
}
