// Fighting styles for rolled characters (Martial Arts 3e). A martial artist, weapon master or crime fighter knows a real
// style: its Close Combat skill, its stances and some of its maneuvers, bought at the prices the book gives. Student
// is tried first at PL 9 and up (half the style's skills, advantages and basic maneuvers, and an advanced maneuver),
// then Initiate. A style small enough is bought whole at Master. The package costs about 14% of the budget, and the
// generator's balancing trims or spends the rest, so the character still lands on exactly 15 points per power level.

import { costBreakdown } from './costs.js';
import { checkLimits } from './limits.js';
import { advantageDef, knownStyle, parseStyleSkill } from './martial/lookup.js';
import { addStyle, setTier, addSkillRanks, addAdvantageRanks } from './martial/styles.js';
import { addManeuver, removeManeuverPower } from './martial/maneuvers.js';
import { listedManeuver, buyWholeStyle } from './martial/template.js';
import { maneuverOverLimit } from './martial/limits.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const SHARE = 0.14; // of the point budget

/** Styles a rolled hero may know: the traditional and cinematic ones, and the kind (unarmed or weapon) the archetype fights with. */
export function styleChoices(R, arch) {
  const all = (R.raw.styles || []).filter((s) => s.category === 'Traditional' || s.category === 'Cinematic');
  const want = arch.id === 'weaponmaster' ? (s) => /^Weapon/.test(s.type) : arch.id === 'martialartist' ? (s) => s.type === 'Unarmed' : () => true;
  const fit = all.filter(want);
  return fit.length ? fit : all;
}

/** The style's priced maneuvers of one list that need no choice from the player, as addManeuver arguments. */
function priced(R, list) {
  return (list || []).filter((it) => it.cost != null && !/select/i.test(it.detail || '')).map((it) => listedManeuver(R, it)).filter(Boolean);
}

function pickSome(rng, list, n) {
  return rng.shuffle([...list]).slice(0, Math.max(0, n));
}

/** Each of the style's skills to a fraction of its listed ranks (at least 1); its own Close Combat skill a bit higher, for the stance check. */
function raiseSkills(c, R, entry, def, fraction, cap, own) {
  for (const k of def.skill_list || []) {
    const sk = parseStyleSkill(k.name);
    if (!R.skill(sk.name)) continue;
    const isOwn = sk.name === entry.skill.name && sk.spec === entry.skill.spec;
    const want = Math.min(cap, Math.max(1, Math.ceil(k.ranks * fraction), isOwn ? Math.min(k.ranks, own) : 0));
    const have = (c.skills || []).filter((s) => s.name === sk.name && (s.spec || null) === (sk.spec || null)).reduce((t, s) => t + s.ranks, 0);
    addSkillRanks(c, entry, sk, want - have);
  }
}

function buyBasics(c, R, entry, def, rng, n) {
  for (const args of pickSome(rng, priced(R, def.basic_maneuvers), n)) {
    const p = addManeuver(c, R, def.name, args);
    if (p && maneuverOverLimit(c, R, p)) removeManeuverPower(c, p);
  }
}

function buyAdvanced(c, R, def, rng, n) {
  for (const args of pickSome(rng, priced(R, def.advanced_maneuvers), n)) addManeuver(c, R, def.name, args);
}

/** The shared first steps: the style, its stances, and its own skill. */
function learn(c, R, def, tier) {
  addStyle(c, R, def.name);
  setTier(c, def.name, tier);
  const entry = knownStyle(c, def.name);
  entry.stances = true;
  return entry;
}

function initiatePackage(c, R, def, rng, pl) {
  const entry = learn(c, R, def, 'initiate');
  raiseSkills(c, R, entry, def, 0, pl + 2, 2 + Math.floor(pl / 3));
  buyBasics(c, R, entry, def, rng, 2 + (rng.chance(0.5) ? 1 : 0));
}

function studentPackage(c, R, def, rng, pl) {
  const entry = learn(c, R, def, 'student');
  raiseSkills(c, R, entry, def, 0.5, pl + 2, 2 + Math.floor(pl / 3));
  const basics = priced(R, def.basic_maneuvers);
  buyBasics(c, R, entry, def, rng, Math.ceil(basics.length / 2));
  buyAdvanced(c, R, def, rng, 1);
  const ads = (def.advantage_list || []).filter((a) => !a.external && !/ Stances$/.test(a.name) && advantageDef(R, a.name) && !/select/i.test(a.detail || ''));
  for (const a of pickSome(rng, ads, Math.ceil(ads.length / 2))) {
    const name = advantageDef(R, a.name).name;
    const have = (c.advantages || []).filter((x) => x.name === name && (x.param || null) === (a.detail || null)).reduce((t, x) => t + (x.rank || 1), 0);
    addAdvantageRanks(c, entry, { name, param: a.detail }, (a.rank ?? 1) - have);
  }
}

const problems = (c, R) => checkLimits(c, R).filter((x) => x.severity === 'error' && x.rule !== 'budget').map((x) => x.message);

/**
 * Drop maneuvers that break the power level limit, then say whether the package added any problem. Problems the
 * character already had (the generator trims them in its repair step) do not count against it.
 */
function settle(c, R, before) {
  for (let i = 0; i < 20; i++) {
    const over = (c.powers || []).find((p) => p.maneuver && maneuverOverLimit(c, R, p));
    if (!over) break;
    removeManeuverPower(c, over);
  }
  return problems(c, R).every((m) => before.has(m));
}

const KEEP = new Set(['Equipment', 'Defensive Roll', 'Close Attack', 'Ranged Attack']);

// What the battle engine uses (tools/battle-coverage): given up only once nothing else is left, so a styled fighter
// keeps its fighting edge.
const FIGHT_ADVANTAGES = new Set(['Accurate Attack', 'All-out Attack', 'Chokehold', 'Defensive Attack', 'Evasion',
  'Fast Grab', 'Grabbing Finesse', 'Improved Aim', 'Improved Critical', 'Improved Defense', 'Improved Disarm',
  'Improved Grab', 'Improved Hold', 'Improved Initiative', 'Improved Smash', 'Improved Trip', 'Move-by Action',
  'Power Attack', 'Precise Attack', 'Prone Fighting', 'Set-up', 'Takedown', 'Throwing Mastery', 'Uncanny Dodge',
  'Inspire', 'Leadership', 'Luck', 'Seize Initiative', 'Ultimate Effort', 'Fearless', 'Instant Up', 'Interpose',
  'Teamwork', 'Agile Feint', 'Daze', 'Startle', 'Taunt']);
const FIGHT_SKILLS = new Set(['Close Combat', 'Ranged Combat', 'Acrobatics', 'Athletics', 'Deception', 'Insight',
  'Intimidation', 'Sleight of Hand']);

/**
 * Pay for the style by giving up filler first: single skill ranks and advantages the style did not bring, so the
 * attacks, powers, defenses and abilities the archetype was built around stay as they were. Skills and advantages
 * that matter in a fight go last.
 */
function fund(ch, R, target, rng) {
  const own = new Set((ch.styles || []).flatMap((s) => (s.added?.advantages || []).map((a) => a.name)));
  for (let i = 0; i < 200 && costBreakdown(ch, R).total > target; i++) {
    const allSkills = (ch.skills || []).filter((k) => k.ranks > 0 && k.name !== 'Close Combat' && k.name !== 'Ranged Combat');
    const allAdvs = (ch.advantages || []).filter((a) => !KEEP.has(a.name) && !own.has(a.name));
    const softSkills = allSkills.filter((k) => !FIGHT_SKILLS.has(k.name));
    const softAdvs = allAdvs.filter((a) => !FIGHT_ADVANTAGES.has(a.name));
    const soft = softSkills.length || softAdvs.length;
    const skills = soft ? softSkills : allSkills;
    const advs = soft ? softAdvs : allAdvs;
    if (!skills.length && !advs.length) return;
    if (skills.length && (!advs.length || rng.chance(4 / 7))) {
      const k = rng.pick(skills);
      k.ranks -= 1;
      if (k.ranks <= 0) ch.skills.splice(ch.skills.indexOf(k), 1);
    } else {
      const a = rng.pick(advs);
      a.rank = (a.rank || 1) - 1;
      if (a.rank <= 0) ch.advantages.splice(ch.advantages.indexOf(a), 1);
    }
  }
}

/** The package that fits, best first: the whole style, Student, Initiate, and at worst the bare style. */
function applyBest(ch, R, def, rng, slice) {
  const pl = ch.pl;
  const base = costBreakdown(ch, R).total;
  const before = new Set(problems(ch, R));
  const attempts = [];
  if (pl >= 8) attempts.push({ run: (c) => buyWholeStyle(c, R, def.name), max: slice * 1.2 });
  if (pl >= 9) attempts.push({ run: (c) => studentPackage(c, R, def, rng, pl), max: slice * 1.5 });
  attempts.push({ run: (c) => initiatePackage(c, R, def, rng, pl), max: slice * 1.5 });
  for (const a of attempts) {
    const c = clone(ch);
    a.run(c);
    const spent = costBreakdown(c, R).total - base;
    const fits = settle(c, R, before);
    if (spent > a.max || !fits) continue;
    Object.assign(ch, c);
    return true;
  }
  const c = clone(ch);
  learn(c, R, def, 'initiate');
  if (!settle(c, R, before)) return false;
  Object.assign(ch, c);
  return true;
}

/** Spend what is left (the style's flaws can pay back more than it costs) on single skill ranks, the style's own first. */
function topUp(ch, R, target, rng, own) {
  for (let i = 0; i < 100 && costBreakdown(ch, R).total < target; i++) {
    const row = i % 3 === 0 ? ch.skills.find((k) => k.name === own.name && k.spec === own.spec) : rng.pick(ch.skills.filter((k) => k.ranks > 0));
    if (!row) continue;
    row.ranks += 1;
    if (problems(ch, R).length) row.ranks -= 1;
  }
}

/**
 * Give the finished character a fighting style, paid for out of its filler so the exact build (powers, attacks,
 * defenses, abilities) stays as rolled and the total stays on the budget. Returns the style's name, or null when it
 * did not fit; then the character is left exactly as it was.
 * Needs ctx.arch, ctx.style (the style rolled for the archetype), ctx.budget and ctx.rng.
 */
export function grantStyle(ch, R, ctx) {
  const rng = ctx.rng.fork('style');
  // The style rolled for the archetype lends its skills and advantages; the one granted is that one when it suits an
  // everyday hero (traditional or cinematic, unarmed or armed as the archetype is), else another drawn from its own stream.
  const fit = styleChoices(R, ctx.arch);
  const rolled = ctx.style && fit.find((s) => s.name === ctx.style.name);
  const def = rolled || (fit.length ? rng.fork('pick').pick(fit) : null);
  if (!def) return null;
  const orig = clone(ch);
  const restore = () => { for (const k of Object.keys(ch)) delete ch[k]; Object.assign(ch, orig); return null; };
  // Tiers, stances and weapon elements belong to the style itself now; a hand-picked copy would be paid twice.
  ch.advantages = (ch.advantages || []).filter((a) => !/^\(Style\)/.test(a.name) && a.name !== 'Weapon Element');
  const target = ctx.budget;
  if (!applyBest(ch, R, def, rng, Math.round(target * SHARE))) return restore();
  fund(ch, R, target, rng.fork('fund'));
  topUp(ch, R, target, rng.fork('top'), knownStyle(ch, def.name).skill);
  if (costBreakdown(ch, R).total !== target || problems(ch, R).length) return restore();
  return def.name;
}
