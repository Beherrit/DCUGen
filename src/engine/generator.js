// Random character generator that builds to the power level limits instead of retrying.
//
// 1. Pick PL, archetype, power theme (and sometimes a second theme for spice).
// 2. Set targets at the caps using the archetype's trade-offs: attack vs. effect,
//    Toughness vs. Dodge/Parry, Fortitude vs. Will.
// 3. Build abilities, the signature attack (with an Alternate Effect array), toughness source,
//    movement, senses, utility powers, skills, advantages and equipment.
// 4. Repair anything over a limit, then spend or trim points until the total is exactly 15 x PL.

import { makeRng, randomSeed } from './rng.js';
import { ABILITIES, BUYABLE_DEFENSES, PP_PER_PL, EP_PER_EQUIPMENT_RANK } from './rules.js';
import { costBreakdown, powerCost, alternateOwnCost, primaryOwnCost, effectCost, equipmentPoints } from './costs.js';
import { deriveAll, advantageRank, attackKind, allPowers } from './derive.js';
import { checkLimits } from './limits.js';
import { rollSpec, rangeOf, evalExpr } from './expr.js';
import { makeIdentity } from './flavor.js';
import { generateBio } from './lifepath.js';
export const ENGINE_VERSION = 1;

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Effects whose rank can grow without changing what the power means. */
const GROWABLE = new Set(['Flight', 'Speed', 'Leaping', 'Swimming', 'Burrowing', 'Teleport', 'Quickness', 'Move Object',
  'Create', 'Elongation', 'Regeneration', 'Mind Reading', 'Remote Sensing', 'Healing', 'Illusion', 'Summon', 'Environment',
  'Communication', 'Immortality', 'Transform', 'Power-Lifting', 'Variable', 'Luck Control', 'Deflect']);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const newId = (rng) => `p${Math.floor(rng.next() * 2 ** 40).toString(36)}`;

// ---------------------------------------------------------------------------------------------
// Templates

export function templateKind(tpl, R) {
  const eff = R.effect(tpl.effect);
  if ((tpl.extras || []).some((m) => m.name === 'Area')) return 'area';
  const range = tpl.range || eff.range;
  if (range === 'Perception') return 'perception';
  if (range === 'Ranged') return 'ranged';
  if (range === 'Close') return 'close';
  return 'other';
}

export function templateRolls(tpl, R) {
  const eff = R.effect(tpl.effect);
  const kind = templateKind(tpl, R);
  return (kind === 'close' || kind === 'ranged') && (eff.attack === true || eff.type === 'Attack');
}

function isAttackTemplate(tpl, R) {
  const eff = R.effect(tpl.effect);
  return tpl.role === 'attack' || (tpl.role !== 'utility' && tpl.role !== 'movement' && (eff.attack || eff.type === 'Attack'));
}

/** Turn a template into a concrete power at a given rank. */
export function instantiate(tpl, rank, theme, rng) {
  const p = {
    id: newId(rng),
    name: rng.pick(tpl.names || [tpl.name || tpl.effect]),
    effect: tpl.effect,
    rank,
    role: tpl.role,
    extras: clone(tpl.extras || []),
    flaws: clone(tpl.flaws || []),
    descriptors: theme ? [rng.pick(theme.descriptors)] : [],
  };
  if (tpl.range) p.range = tpl.range;
  if (tpl.option) p.option = tpl.option;
  if (tpl.detail) p.detail = tpl.detail;
  if (tpl.strengthBased) p.strengthBased = true;
  if (theme?.attack_skill) p.attackSkill = theme.attack_skill;
  p.alternates = [];
  return p;
}

// ---------------------------------------------------------------------------------------------
// Small helpers on the character

function total(ch, R) { return costBreakdown(ch, R).total; }
/** Rule violations, not counting the budget (balance() handles points). */
function errors(ch, R) { return checkLimits(ch, R).filter((i) => i.severity === 'error' && i.rule !== 'budget'); }
function legal(ch, R) { return errors(ch, R).length === 0; }

function addSkill(ch, name, ranks, spec) {
  if (ranks <= 0) return;
  const s = ch.skills.find((x) => x.name === name && (x.spec || null) === (spec || null));
  if (s) s.ranks += ranks;
  else ch.skills.push(spec ? { name, spec, ranks } : { name, ranks });
}

function addAdvantage(ch, name, rank = 1, param) {
  const a = ch.advantages.find((x) => x.name === name && (x.param || null) === (param || null));
  if (a) a.rank = (a.rank || 1) + rank;
  else ch.advantages.push(param ? { name, rank, param } : { name, rank });
}

function powerLists(ch) {
  const lists = [ch.powers];
  for (const d of ch.devices) lists.push(d.powers);
  return lists;
}

function findPower(ch, pred) {
  for (const list of powerLists(ch)) for (const p of list) if (pred(p)) return p;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Repair: bring every limit back in line by trimming purchases.

function repair(ch, R, budgetRng) {
  for (let guard = 0; guard < 300; guard++) {
    const errs = errors(ch, R);
    if (errs.length === 0) return true;
    const d = deriveAll(ch, R);
    const pl = ch.pl;
    let fixed = false;

    // Defense pairs
    const pairs = [['Dodge', 'Toughness'], ['Parry', 'Toughness'], ['Fortitude', 'Will']];
    for (const [a, b] of pairs) {
      if (d.defenses[a] + d.defenses[b] <= 2 * pl) continue;
      for (const def of b === 'Will' ? ['Will', 'Fortitude'] : [a]) {
        if ((ch.defenses[def] || 0) > 0) { ch.defenses[def]--; fixed = true; break; }
      }
      if (fixed) break;
      const enh = findPower(ch, (p) => p.effect === 'Enhanced Trait' && (p.option === a || p.option === b) && p.rank > 0);
      if (enh) { enh.rank--; if (enh.rank === 0) removePower(ch, enh); fixed = true; break; }
      if (b === 'Toughness') {
        const prot = findPower(ch, (p) => (p.effect === 'Protection' || p.effect === 'Force Field') && p.rank > 0);
        if (prot) { prot.rank--; if (prot.rank === 0) removePower(ch, prot); fixed = true; break; }
        const roll = ch.advantages.find((x) => x.name === 'Defensive Roll');
        if (roll) { roll.rank--; if (roll.rank <= 0) ch.advantages.splice(ch.advantages.indexOf(roll), 1); fixed = true; break; }
        const armor = ch.equipment.find((x) => x.protection);
        if (armor) { ch.equipment.splice(ch.equipment.indexOf(armor), 1); fixed = true; break; }
      }
      const abil = { Dodge: 'Agility', Parry: 'Fighting', Toughness: 'Stamina', Fortitude: 'Stamina', Will: 'Awareness' };
      const target = abil[a] && ch.abilities[abil[a]] > 0 ? abil[a] : abil[b];
      if (ch.abilities[target] > 0) { ch.abilities[target]--; fixed = true; break; }
    }
    if (fixed) continue;

    // Attacks
    for (const atk of d.attacks) {
      if (atk.roll ? atk.bonus + atk.rank <= 2 * pl : atk.rank <= pl) continue;
      if (!atk.roll && atk.power) { atk.power.rank = Math.max(1, atk.power.rank - (atk.rank - pl)); fixed = true; break; }
      const spec = atk.name === 'Unarmed' ? 'Unarmed' : (atk.power?.attackSkill || atk.name);
      const skillName = atk.kind === 'ranged' ? 'Ranged Combat' : 'Close Combat';
      const sk = ch.skills.find((s) => s.name === skillName && s.spec === spec && s.ranks > 0);
      if (sk && budgetRng.chance(0.6)) { sk.ranks--; if (!sk.ranks) ch.skills.splice(ch.skills.indexOf(sk), 1); fixed = true; break; }
      if (atk.power && atk.power.rank > 1) { atk.power.rank--; fixed = true; break; }
      if (sk) { sk.ranks--; if (!sk.ranks) ch.skills.splice(ch.skills.indexOf(sk), 1); fixed = true; break; }
      const acc = atk.power?.extras?.find((m) => m.name === 'Accurate');
      if (acc) { acc.steps = (acc.steps || 1) - 1; if (acc.steps <= 0) atk.power.extras.splice(atk.power.extras.indexOf(acc), 1); fixed = true; break; }
      const advName = atk.kind === 'ranged' ? 'Ranged Attack' : 'Close Attack';
      const adv = ch.advantages.find((x) => x.name === advName);
      if (adv) { adv.rank--; if (adv.rank <= 0) ch.advantages.splice(ch.advantages.indexOf(adv), 1); fixed = true; break; }
      if (atk.equipment) { const it = ch.equipment.find((x) => x.name === atk.name); if (it) { ch.equipment.splice(ch.equipment.indexOf(it), 1); fixed = true; break; } }
      const ab = atk.name === 'Unarmed'
        ? (ch.abilities.Strength > ch.abilities.Fighting ? 'Strength' : 'Fighting')
        : atk.kind === 'ranged' ? 'Dexterity' : 'Fighting';
      if (ch.abilities[ab] > -5) { ch.abilities[ab]--; fixed = true; break; }
    }
    if (fixed) continue;

    // Skills based on an absent ability
    const orphan = ch.skills.find((x) => ch.abilities[R.skillAbility(x.name)] === null);
    if (orphan) { ch.skills.splice(ch.skills.indexOf(orphan), 1); continue; }

    // Skills and abilities over PL + 10
    for (const s of d.skills) {
      if (s.bonus <= pl + 10) continue;
      const sk = ch.skills.find((x) => x.name === s.name && x.spec === s.spec);
      if (sk && sk.ranks > 0) { sk.ranks -= Math.min(sk.ranks, s.bonus - pl - 10); if (!sk.ranks) ch.skills.splice(ch.skills.indexOf(sk), 1); fixed = true; break; }
    }
    if (fixed) continue;
    for (const a of ABILITIES) {
      if (a !== 'Stamina' && d.abilities[a] > pl + 10) { ch.abilities[a] -= d.abilities[a] - pl - 10; fixed = true; break; }
    }
    if (fixed) continue;

    // Advantage caps, power caps, alternate-effect costs, equipment
    for (const adv of ch.advantages) {
      const def = R.advantage(adv.name);
      if (!def) { ch.advantages.splice(ch.advantages.indexOf(adv), 1); fixed = true; break; }
      const max = def.max_rank === 'half_pl' ? Math.floor(pl / 2) : def.max_rank ?? (def.ranked ? null : 1);
      if (max != null && adv.rank > max) { adv.rank = max; if (adv.rank <= 0) ch.advantages.splice(ch.advantages.indexOf(adv), 1); fixed = true; break; }
    }
    if (fixed) continue;
    for (const { power: p, alternateOf } of allPowers(ch)) {
      const eff = R.effect(p.effect);
      if (eff.max_rank != null && p.rank > eff.max_rank) { p.rank = eff.max_rank; fixed = true; break; }
      if (alternateOf && alternateOwnCost(p, R) > primaryOwnCost(alternateOf, R)) {
        if (p.rank > 1) p.rank--;
        else alternateOf.alternates.splice(alternateOf.alternates.indexOf(p), 1);
        fixed = true; break;
      }
    }
    if (fixed) continue;
    const ep = equipmentPoints(ch);
    const eqRank = advantageRank(ch, 'Equipment');
    if (ep > eqRank * EP_PER_EQUIPMENT_RANK) {
      const need = Math.ceil(ep / EP_PER_EQUIPMENT_RANK);
      const adv = ch.advantages.find((a) => a.name === 'Equipment');
      if (adv) adv.rank = need; else addAdvantage(ch, 'Equipment', need);
      continue;
    }
    return false; // something we don't know how to fix
  }
  return legal(ch, R);
}

function removePower(ch, target) {
  for (const list of powerLists(ch)) {
    const i = list.indexOf(target);
    if (i >= 0) {
      const [removed] = list.splice(i, 1);
      // promote the first alternate so the array survives
      if (removed.alternates?.length) {
        const [first, ...rest] = removed.alternates;
        first.alternates = rest;
        list.splice(i, 0, first);
      }
      return;
    }
    for (const p of list) {
      const j = (p.alternates || []).indexOf(target);
      if (j >= 0) { p.alternates.splice(j, 1); return; }
    }
  }
  for (const d of ch.devices.slice()) if (!d.powers.length) ch.devices.splice(ch.devices.indexOf(d), 1);
}

// ---------------------------------------------------------------------------------------------
// Budget: spend or trim, one small legal step at a time, until total = 15 x PL.

function tryStep(ch, R, budget, fn) {
  const snapshot = clone(ch);
  const ok = fn();
  if (ok === false || !legal(ch, R) || total(ch, R) > budget) {
    Object.assign(ch, snapshot);
    return false;
  }
  return true;
}

function balance(ch, R, ctx) {
  const { rng, arch, themes, budget } = ctx;
  const skillWeights = Object.entries(arch.skills || {}).map(([name, weight]) => ({ name, weight }));
  const advWeights = advantagePool(ctx);

  const powered = !arch.powerless;
  const spenders = [
    { weight: powered ? 3 : 6, fn: () => { // skill ranks
      const pick = rng.chance(arch.minion || arch.automaton ? 1 : 0.75) && skillWeights.length ? rng.weighted(skillWeights).name : rng.pick(R.raw.skills).name;
      if (ch.abilities[R.skillAbility(pick)] === null) return false;
      const existing = ch.skills.filter((s) => s.name === pick);
      if (existing.length) existing[0].ranks += 1;
      else addSkill(ch, pick, rng.int(1, 3), pick === 'Expertise' ? expertiseSpec(ctx) : pick === 'Close Combat' || pick === 'Ranged Combat' ? null : undefined);
      return !(pick === 'Close Combat' || pick === 'Ranged Combat') || existing.length > 0;
    } },
    { weight: arch.automaton ? 1 : 3, fn: () => { // a new advantage
      const pick = rng.weighted(advWeights);
      if (!pick) return false;
      if (ch.advantages.some((a) => a.name === pick.name) && !R.advantage(pick.name)?.ranked) return false;
      return grantAdvantage(ch, R, pick.name, ctx, pick.param);
    } },
    { weight: 2, fn: () => { // another Alternate Effect for the signature array
      const main = ch.powers.find((p) => p.role === 'attack') || ch.devices[0]?.powers.find((p) => p.role === 'attack');
      if (!main || (main.alternates || []).length >= 6) return false;
      return addAlternate(ch, R, main, ctx);
    } },
    { weight: powered ? 3 : 0, fn: () => { // raise a utility or movement power
      const ps = ch.powers.concat(...ch.devices.map((d) => d.powers)).filter((p) => ['movement', 'utility', 'sense', 'control', 'support'].includes(p.role) && GROWABLE.has(p.effect));
      const p = rng.pick(ps);
      if (!p) return false;
      p.rank += 1;
      return true;
    } },
    { weight: powered ? 3 : 0, fn: () => addUtilityPower(ch, R, ctx, budget - total(ch, R)) },
    { weight: 2, fn: () => { // buy a defense up toward its cap
      const d = rng.pick(BUYABLE_DEFENSES.filter((x) => !(x === 'Fortitude' && ch.abilities.Stamina === null) && !(x === 'Will' && ch.abilities.Intellect === null)));
      ch.defenses[d] = (ch.defenses[d] || 0) + 1;
      return true;
    } },
    { weight: 1, fn: () => { // raise a mental or social ability
      const a = rng.pick(['Intellect', 'Awareness', 'Presence'].filter((x) => ch.abilities[x] !== null));
      if (!a) return false;
      ch.abilities[a] += 1;
      return true;
    } },
  ];

  const trimmers = [
    { weight: 4, fn: () => {
      const s = rng.pick(ch.skills.filter((x) => x.ranks > 0 && x.name !== 'Close Combat' && x.name !== 'Ranged Combat'));
      if (!s) return false;
      s.ranks -= 1;
      if (!s.ranks) ch.skills.splice(ch.skills.indexOf(s), 1);
      return true;
    } },
    { weight: 3, fn: () => {
      const a = rng.pick(ch.advantages.filter((x) => !['Equipment', 'Defensive Roll', 'Close Attack', 'Ranged Attack'].includes(x.name)));
      if (!a) return false;
      a.rank -= 1;
      if (a.rank <= 0) ch.advantages.splice(ch.advantages.indexOf(a), 1);
      return true;
    } },
    { weight: 3, fn: () => {
      const owner = ch.powers.concat(...ch.devices.map((d) => d.powers)).find((p) => (p.alternates || []).length > 0);
      if (!owner) return false;
      owner.alternates.pop();
      return true;
    } },
    { weight: 3, fn: () => {
      const ps = ch.powers.concat(...ch.devices.map((d) => d.powers)).filter((p) => ['movement', 'utility', 'sense', 'control', 'support'].includes(p.role));
      const p = rng.pick(ps);
      if (!p) return false;
      if (p.rank > 1 && !R.effect(p.effect).fixed_cost) p.rank -= 1; else removePower(ch, p);
      return true;
    } },
    { weight: 2, fn: () => {
      const a = rng.pick(['Intellect', 'Presence', 'Awareness', 'Dexterity', 'Strength'].filter((x) => ch.abilities[x] > 0));
      if (!a) return false;
      ch.abilities[a] -= 1;
      return true;
    } },
    { weight: 2, fn: () => {
      const d = rng.pick(BUYABLE_DEFENSES.filter((x) => ch.defenses[x] > 0));
      if (!d) return false;
      ch.defenses[d] -= 1;
      return true;
    } },
    { weight: 1, fn: () => {
      const p = ch.powers.concat(...ch.devices.map((d) => d.powers)).find((x) => x.role === 'attack' && x.rank > 2);
      if (!p) return false;
      p.rank -= 1;
      return true;
    } },
  ];

  for (let i = 0; i < 600; i++) {
    const diff = budget - total(ch, R);
    if (diff === 0) return true;
    if (diff > 0) {
      tryStep(ch, R, budget, rng.weighted(spenders).fn);
    } else {
      // trimming can't overshoot downward into illegality, but must not exceed the budget either way
      const snapshot = clone(ch);
      const ok = rng.weighted(trimmers).fn();
      if (ok === false || !legal(ch, R)) Object.assign(ch, snapshot);
    }
  }
  // Final top-up: any skill rank that stays legal.
  for (let i = 0; i < 200 && total(ch, R) < budget; i++) {
    const s = rng.pick(R.raw.skills);
    tryStep(ch, R, budget, () => { addSkill(ch, s.name, 1, s.name === 'Expertise' ? expertiseSpec(ctx) : s.specialized ? 'Improvised' : undefined); return true; });
  }
  return total(ch, R) === budget;
}

// ---------------------------------------------------------------------------------------------
// Pieces

function expertiseSpec(ctx) {
  const { rng, arch, theme } = ctx;
  const byArch = {
    mystic: ['Magic', 'Magic', 'History', 'Occult'], gadgeteer: ['Science', 'Engineering', 'Robotics'],
    battlesuit: ['Engineering', 'Science'], crimefighter: ['Criminology', 'Streetwise', 'Detective Work', 'Forensics'],
    mastermind: ['Science', 'Business', 'Politics', 'Magic'], psychic: ['Psychology', 'Philosophy'],
    healer: ['Medicine', 'Biology'], sizechanger: ['Physics', 'Science'],
  };
  const pool = byArch[arch.id] || ['Current Events', 'Streetwise', 'Popular Culture', 'History', 'Science', 'Art', 'Law', 'Business', 'Journalism', 'Military', 'Sports', 'Music', 'Medicine', 'Theology', 'Mythology'];
  if (theme?.id === 'magic' && rng.chance(0.5)) return 'Magic';
  return rng.pick(pool);
}

function advantagePool(ctx) {
  const { arch, style } = ctx;
  const pool = Object.entries(arch.advantages || {}).map(([name, weight]) => ({ name, weight }));
  if (style) for (const s of style.advantages || []) {
    const parsed = parseStyleAdvantage(s);
    if (!parsed) continue;
    const found = pool.find((p) => p.name === parsed.name && !parsed.param);
    if (found) found.weight += 3; else pool.push({ ...parsed, weight: 3 });
  }
  if (!arch.minion && !arch.automaton) {
    for (const generic of ['Improved Initiative', 'Fearless', 'Teamwork', 'Diehard', 'Great Endurance', 'Languages', 'Luck', 'Benefit', 'Attractive', 'Contacts', 'Well-informed']) {
      if (!pool.some((p) => p.name === generic)) pool.push({ name: generic, weight: 0.4 });
    }
  }
  return pool;
}

/** "Improved Critical (Unarmed) 2" -> {name, param, rank}; skips entries needing a free-text choice. */
export function parseStyleAdvantage(text) {
  const m = /^([^()]+?)(?:\s*\(([^)]*)\))?(?:\s+(\d+))?$/.exec(String(text).trim());
  if (!m || /select|choose/i.test(m[2] || '')) return null;
  return { name: m[1].trim(), param: m[2] || undefined, rank: m[3] ? Number(m[3]) : 1 };
}

const BENEFITS = [
  { param: 'Wealth', max: 3 }, { param: 'Status', max: 1 }, { param: 'Security Clearance', max: 1 },
  { param: 'Alternate Identity', max: 1 }, { param: 'Ambidexterity', max: 1 }, { param: 'Cipher', max: 1 },
  { param: 'Diplomatic Immunity', max: 1 },
];

/** Add an advantage with a sensible parameter and prerequisite skills. Returns false if not possible. */
function grantAdvantage(ch, R, name, ctx, fixedParam) {
  const { rng, theme } = ctx;
  const def = R.advantage(name);
  if (!def) return false;
  const existing = ch.advantages.find((a) => a.name === name);
  if (existing && !def.ranked) return false;
  let param = fixedParam;
  if (fixedParam) { if (existing && existing.param === fixedParam) return false; addAdvantage(ch, name, 1, fixedParam); return true; }
  switch (name) {
    case 'Benefit': {
      const b = rng.pick(BENEFITS);
      const have = ch.advantages.find((a) => a.name === 'Benefit' && a.param === b.param);
      if (have) { if (have.rank >= b.max) return false; have.rank++; return true; }
      param = b.param; break;
    }
    case 'Improved Critical': {
      const atk = ch.powers.find((p) => p.role === 'attack');
      param = atk ? atk.name : 'Unarmed';
      break;
    }
    case 'Skill Mastery': {
      const s = rng.pick(ch.skills.filter((x) => !x.spec));
      if (!s) return false;
      param = s.name;
      if (ch.advantages.some((a) => a.name === name && a.param === param)) return false;
      break;
    }
    case 'Favored Environment': param = theme?.environment || rng.pick(['Urban', 'Aerial', 'Underwater', 'Night']); break;
    case 'Favored Foe': param = rng.pick(['Criminals', 'Aliens', 'Robots', 'Magical creatures', 'Metahumans', 'Demons']); break;
    case 'Daze': param = rng.pick(['Deception', 'Intimidation']); break;
    case 'Fascinate': param = rng.pick(['Deception', 'Intimidation', 'Persuasion']); break;
    case 'Languages': break;
    case 'Ritualist': addSkill(ch, 'Expertise', 0, 'Magic'); if (!ch.skills.some((s) => s.name === 'Expertise' && s.spec === 'Magic')) addSkill(ch, 'Expertise', rng.int(2, 6), 'Magic'); break;
    case 'Inventor': if (!ch.skills.some((s) => s.name === 'Technology')) addSkill(ch, 'Technology', rng.int(2, 6)); break;
    case 'Artificer': if (!ch.skills.some((s) => s.name === 'Expertise' && s.spec === 'Magic')) addSkill(ch, 'Expertise', rng.int(2, 6), 'Magic'); break;
    case 'Luck': {
      const max = Math.floor(ch.pl / 2);
      if ((existing?.rank || 0) >= max) return false;
      break;
    }
    case 'Minion': case 'Sidekick': param = rng.pick(['Henchman', 'Robot assistant', 'Loyal hound', 'Apprentice', 'Drone']); break;
    default: break;
  }
  if (existing && def.ranked && (param == null || existing.param === param)) { existing.rank++; return true; }
  addAdvantage(ch, name, 1, param);
  return true;
}

function themeTemplates(themes, pred) {
  const out = [];
  for (const t of themes) for (const tpl of t.powers || []) if (pred(tpl)) out.push({ tpl, theme: t, weight: (tpl.weight ?? 1) * (t === themes[0] ? 1 : 0.5) });
  return out;
}

function rankFor(tpl, ctx, R, purpose) {
  const { pl, targets, rng } = ctx;
  if (tpl.rank === 'attack') {
    return templateRolls(tpl, R) ? targets.effect : pl;
  }
  if (tpl.rank === 'pl') return pl;
  if (tpl.rank === 'toughness') return Math.max(1, targets.toughGap);
  const v = rollSpec(tpl.rank, pl, rng);
  return Math.max(1, purpose === 'utility' ? v : v);
}

function usedNames(ch) {
  const names = new Set();
  for (const { power } of allPowers(ch)) names.add(power.name);
  return names;
}

function usedTemplates(ch) {
  const set = new Set();
  for (const { power } of allPowers(ch)) if (power.tpl) set.add(power.tpl);
  return set;
}

function addAlternate(ch, R, main, ctx) {
  const { rng, themes, pl } = ctx;
  const used = usedTemplates(ch);
  const names = usedNames(ch);
  const choices = themeTemplates(themes, (t) => (t.role === 'attack' || t.role === 'control') && !used.has(tplKey(t)));
  const pick = rng.weighted(choices);
  if (!pick) return false;
  const alt = instantiate(pick.tpl, 1, pick.theme, rng);
  if (names.has(alt.name)) alt.name = rng.pick(pick.tpl.names.filter((n) => !names.has(n))) || `${alt.name} II`;
  alt.tpl = tplKey(pick.tpl);
  delete alt.alternates;
  const d = deriveAll(ch, R);
  let rank = rankFor(pick.tpl, ctx, R, 'alt');
  if (templateRolls(pick.tpl, R)) {
    const kind = templateKind(pick.tpl, R);
    const bonus = kind === 'ranged'
      ? (d.abilities.Dexterity ?? 0) + advantageRank(ch, 'Ranged Attack') + skillRanksOf(ch, 'Ranged Combat', alt.attackSkill)
      : (d.abilities.Fighting ?? 0) + advantageRank(ch, 'Close Attack') + skillRanksOf(ch, 'Close Combat', alt.attackSkill);
    rank = Math.min(rank, 2 * pl - bonus - (alt.strengthBased ? d.abilities.Strength ?? 0 : 0));
  } else if (isAttackTemplate(pick.tpl, R)) {
    rank = Math.min(rank, pl);
  }
  const primary = primaryOwnCost(main, R);
  alt.rank = Math.max(1, rank);
  while (alt.rank > 1 && alternateOwnCost(alt, R) > primary) alt.rank--;
  if (alternateOwnCost(alt, R) > primary) return false;
  main.alternates = main.alternates || [];
  main.alternates.push(alt);
  return true;
}

function skillRanksOf(ch, name, spec) {
  return ch.skills.filter((s) => s.name === name && s.spec === spec).reduce((t, s) => t + s.ranks, 0);
}

function tplKey(tpl) {
  return `${tpl.effect}|${(tpl.names || [])[0]}`;
}

function addUtilityPower(ch, R, ctx, room) {
  const { rng, themes } = ctx;
  if (ctx.arch.powerless) return false;
  const used = usedTemplates(ch);
  const choices = themeTemplates(themes, (t) => ['utility', 'sense', 'support', 'movement', 'control'].includes(t.role) && t.rank !== 'toughness' && !used.has(tplKey(t)));
  const pick = rng.weighted(choices);
  if (!pick) return false;
  const p = instantiate(pick.tpl, rankFor(pick.tpl, ctx, R, 'utility'), pick.theme, rng);
  p.tpl = tplKey(pick.tpl);
  if (p.role === 'control' && R.effect(p.effect).type === 'Attack') p.role = 'utility';
  if (room != null) while (p.rank > 1 && powerCost(p, R) > room) p.rank--;
  if (room != null && powerCost(p, R) > room) return false;
  const target = ctx.device && rng.chance(0.7) ? ctx.device.powers : ch.powers;
  target.push(p);
  return true;
}

// Equipment ------------------------------------------------------------------------------------

// Real equipment-point cost of each utility belt item when it is the array's primary item (DCA 150-154).
const BELT_ITEM_COST = {
  'Tear Gas Pellets': 16, 'Flash-Bangs': 16, Explosives: 15, 'Sleep Gas Pellets': 12, 'Smoke Pellets': 12,
  Bolos: 6, 'Power Knuckles': 5, Boomerangs: 2, 'Cutting Torch': 2, 'Pepper Spray': 2,
};

/** Utility belts are an equipment array: the costliest item at full cost, +1 per other item. */
export function utilityBeltCost(contents) {
  if (!contents.length) return 0;
  const top = Math.max(...contents.map((c) => BELT_ITEM_COST[c.name] ?? c.cost ?? 1));
  return top + contents.length - 1;
}

export function parseItem(item, kind) {
  const out = { name: item.name, cost: item.cost, effect: item.effect, source: item.source };
  const effect = String(item.effect || '');
  if (kind === 'armor') {
    const m = /Protection (\d+)/.exec(effect);
    if (m) out.protection = Number(m[1]);
  }
  if (kind === 'weapon' && !/Area/.test(effect)) {
    const m = /(Ranged )?(?:Multiattack )?Damage (\d+)/.exec(effect);
    if (m) {
      out.attack = { kind: m[1] || /Thrown/.test(item.category) ? 'ranged' : 'close', rank: Number(m[2]), strengthBased: !!item.strength_based, crit: item.crit };
    }
  }
  return out;
}

function buildEquipment(ch, R, ctx, ranks) {
  const { rng } = ctx;
  const eq = R.raw.equipment || {};
  let points = ranks * EP_PER_EQUIPMENT_RANK;
  const take = (item, kind) => {
    if (!item || item.cost > points || ch.equipment.some((x) => x.name === item.name)) return false;
    ch.equipment.push(parseItem(item, kind));
    points -= item.cost;
    return true;
  };
  // Archetype kit first (soldiers get rifles, thugs get pistols and knives...).
  const all = [...(eq.weapons || []).map((x) => [x, 'weapon']), ...(eq.armor || []).map((x) => [x, 'armor']), ...(eq.gear || []).map((x) => [x, 'gear'])];
  for (const entry of ctx.arch?.gear || []) {
    const options = String(entry).split('|');
    const name = rng.pick(options);
    const found = all.find(([x]) => x.name === name);
    if (found && rng.chance(0.85)) take(found[0], found[1]);
  }
  if (ctx.arch?.gear) return;
  // A utility belt is the classic crime-fighter kit.
  const belt = (eq.gear || []).find((g) => /Utility Belt/.test(g.name));
  if (belt && points >= 10 && rng.chance(0.7)) {
    const contents = rng.sample(belt.contents || [], rng.int(3, Math.min(8, (belt.contents || []).length)));
    while (contents.length > 1 && utilityBeltCost(contents) > points) contents.splice(contents.indexOf(contents.reduce((a, b) => ((BELT_ITEM_COST[a.name] ?? 1) >= (BELT_ITEM_COST[b.name] ?? 1) ? a : b))), 1);
    const cost = utilityBeltCost(contents);
    if (cost <= points) ch.equipment.push({ name: 'Utility Belt', cost, effect: contents.map((c) => `${c.name} (${c.effect})`).join('; '), contents, source: belt.source });
    if (cost <= points) points -= cost;
  }
  if (rng.chance(0.6)) take(rng.pick((eq.armor || []).filter((a) => /Modern/.test(a.category))), 'armor');
  const weapons = (eq.weapons || []).filter((w) => /Thrown|Melee/.test(w.category) && /Damage/.test(w.effect));
  if (rng.chance(0.5)) take(rng.pick(weapons), 'weapon');
  const gear = (eq.gear || []).filter((g) => g.cost <= 2 && /Electronics|Surveillance|Survival|Criminal/.test(g.category));
  for (let i = 0; i < 6 && points > 0; i++) take(rng.pick(gear), 'gear');
}

// ---------------------------------------------------------------------------------------------
// Main build

function chooseMode(arch, themes, R, rng) {
  const modes = Object.entries(arch.offense?.modes || { ranged: 1 }).map(([mode, weight]) => ({ mode, weight }));
  const available = modes.filter(({ mode }) => {
    if (mode === 'strength' || mode === 'equipment') return true;
    if (arch.powerless) return false;
    return themeTemplates(themes, (t) => t.role === 'attack' && templateKind(t, R) === mode).length > 0;
  });
  return (rng.weighted(available) || { mode: 'strength' }).mode;
}

function buildMechanics(R, ctx) {
  const { pl, arch, themes, rng, chaos } = ctx;
  const theme = themes[0];
  const budget = pl * PP_PER_PL;
  const spread = Math.round(2 * chaos);
  const jitter = (v) => v + (spread ? rng.int(-spread, spread) : 0);

  const ch = {
    pl,
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, 0])),
    defenses: { Dodge: 0, Parry: 0, Fortitude: 0, Will: 0 },
    skills: [], advantages: [], powers: [], devices: [], equipment: [],
  };

  // Targets ---------------------------------------------------------------------------------
  const mode = chooseMode(arch, themes, R, rng);
  const skew = jitter(rollSpec(arch.offense?.skew || '0', pl, rng));
  const attackT = clamp(pl + skew, 0, 2 * pl);
  const effectT = clamp(pl - skew, 1, 2 * pl);
  const tough = clamp(pl + jitter(rollSpec(arch.defense?.tough || '0', pl, rng)), 1, 2 * pl - 1);
  const slack = () => (rng.chance(0.12 + 0.3 * chaos) ? rng.int(1, 2) : 0);
  const dodgeT = Math.max(0, 2 * pl - tough - slack());
  const parryT = Math.max(0, 2 * pl - tough - slack());
  // Constructs are immune to Fortitude effects; automatons (no Intellect or Presence) also to Will effects.
  const fortT = arch.construct ? 0 : clamp(pl + jitter(rollSpec(arch.defense?.fort || '0', pl, rng)), 0, 2 * pl);
  const willT = arch.automaton ? 0
    : arch.construct ? clamp(pl + jitter(rollSpec(arch.defense?.will || '-2..1', pl, rng)), 0, 2 * pl)
      : Math.max(0, 2 * pl - fortT - slack());
  ctx.targets = { attack: attackT, effect: effectT, tough, dodge: dodgeT, parry: parryT, fort: fortT, will: willT, mode };

  // Abilities -------------------------------------------------------------------------------
  for (const a of ABILITIES) {
    const spec = arch.abilities?.[a] ?? '0..2';
    ch.abilities[a] = Math.max(-2, rollSpec(spec, pl, rng) + (chaos > 0.5 ? rng.int(-1, 1) : 0));
  }
  const ab = ch.abilities;
  ab.Stamina = Math.min(ab.Stamina, tough, fortT);
  ab.Agility = Math.min(ab.Agility, dodgeT);
  ab.Fighting = Math.min(ab.Fighting, parryT);
  ab.Awareness = Math.min(ab.Awareness, willT);
  for (const a of ABILITIES) if (a !== 'Stamina') ab[a] = Math.min(ab[a], pl + 10);
  if (mode === 'strength') {
    ab.Strength = clamp(effectT, 1, pl + 10);
    ab.Fighting = Math.min(ab.Fighting, 2 * pl - ab.Strength);
  } else {
    ab.Strength = Math.min(ab.Strength, Math.max(0, 2 * pl - ab.Fighting));
  }
  if (mode === 'close') ab.Fighting = Math.min(ab.Fighting, attackT);
  if (mode === 'ranged') ab.Dexterity = Math.min(ab.Dexterity, attackT);
  if (rng.chance(0.04 + 0.2 * chaos)) {
    const dump = rng.pick(['Intellect', 'Presence', 'Dexterity', 'Awareness'].filter((x) => ab[x] <= 1));
    if (dump) ab[dump] = -1;
  }
  if (arch.construct) {
    ab.Stamina = null; // DCA ch. 7: constructs have no Stamina
    if (arch.automaton) { ab.Intellect = null; ab.Presence = null; }
    ch.powers.push({ id: newId(rng), name: arch.automaton ? 'Automaton Body' : 'Construct Body', effect: 'Immunity', rank: 30, detail: 'Fortitude effects', role: 'defense', extras: [], flaws: [], descriptors: [], fixedRank: true });
  }

  // Signature attack -------------------------------------------------------------------------
  let main = null;
  if (!arch.powerless && ['ranged', 'close', 'area', 'perception'].includes(mode)) {
    const pick = rng.weighted(themeTemplates([theme], (t) => t.role === 'attack' && templateKind(t, R) === mode))
      || rng.weighted(themeTemplates(themes, (t) => t.role === 'attack' && templateKind(t, R) === mode));
    if (pick) {
      main = instantiate(pick.tpl, rankFor(pick.tpl, ctx, R, 'main'), pick.theme, rng);
      main.tpl = tplKey(pick.tpl);
      if (main.strengthBased) {
        const bonus = rng.int(1, Math.max(1, Math.min(5, effectT - 1)));
        ab.Strength = clamp(Math.min(ab.Strength, effectT - bonus), 0, pl + 10);
        main.rank = Math.max(1, effectT - ab.Strength);
      }
      ch.powers.push(main);
    }
  }
  if (!main && !arch.powerless && mode === 'strength') {
    // Paragons and powerhouses still get a ranged or area trick from their theme.
    const pick = rng.weighted(themeTemplates([theme], (t) => t.role === 'attack' && !t.strengthBased));
    if (pick && rng.chance(0.75)) {
      main = instantiate(pick.tpl, rankFor(pick.tpl, ctx, R, 'main'), pick.theme, rng);
      main.tpl = tplKey(pick.tpl);
      ch.powers.push(main);
    }
  }

  // Accuracy: close the gap between the ability and the attack target.
  const fillAccuracy = (kind, spec, abilityValue, target) => {
    let gap = target - abilityValue;
    if (gap <= 0) return;
    const advName = kind === 'ranged' ? 'Ranged Attack' : 'Close Attack';
    if (rng.chance(0.3)) {
      const a = Math.min(gap, rng.int(1, 3));
      addAdvantage(ch, advName, a);
      gap -= a;
    }
    const fillFraction = 0.75 + 0.25 * rng.next();
    addSkill(ch, kind === 'ranged' ? 'Ranged Combat' : 'Close Combat', Math.round(gap * fillFraction), spec);
  };
  if (main && templateRolls(main, R)) {
    const kind = attackKind(main, R);
    if (kind === 'ranged' && rng.chance(0.15) && attackT - ab.Dexterity >= 4) {
      main.extras.push({ name: 'Accurate', steps: 1 });
      fillAccuracy('ranged', main.attackSkill, ab.Dexterity + 2, attackT);
    } else {
      fillAccuracy(kind, main.attackSkill, kind === 'ranged' ? ab.Dexterity : ab.Fighting, attackT);
    }
  }
  if (mode === 'strength' || arch.powerless) {
    fillAccuracy('close', 'Unarmed', ab.Fighting, Math.min(attackT, 2 * pl - ab.Strength));
  }

  // Device (battlesuits, weapon masters, gadgeteers, masterminds)
  const deviceKind = arch.powers?.device;
  if (deviceKind) {
    const names = { battlesuit: ['Battlesuit', 'Power Armor', 'Exo-Frame'], weaponmaster: ['Signature Weapon', 'Trick Bow', 'Weapon Rig'], gadgeteer: ['Gadget Harness', 'Gizmo Kit', 'Utility Gauntlets'], mastermind: ['Doomsday Arsenal', 'Command Gauntlet', 'Battle Throne'] };
    const nm = rng.pick(names[arch.id] || ['Device']);
    ctx.device = { name: nm, kind: deviceKind, powers: [] };
    ch.devices.push(ctx.device);
    if (main) { ch.powers.splice(ch.powers.indexOf(main), 1); ctx.device.powers.push(main); }
  }

  // Alternate Effects
  if (main) {
    const nAlts = rollSpec(arch.powers?.alts || '0', pl, rng) + (rng.chance(chaos * 0.5) ? 1 : 0);
    for (let i = 0; i < nAlts; i++) addAlternate(ch, R, main, ctx);
    if (rng.chance(0.08 + 0.12 * chaos) && main.alternates.length >= 2) main.dynamic = true;
  }

  // Toughness ---------------------------------------------------------------------------------
  ctx.targets.toughGap = Math.max(0, tough - (ab.Stamina ?? 0));
  if (ctx.targets.toughGap > 0) {
    const sources = Object.entries(arch.toughness || { protection: 1 }).map(([source, weight]) => ({ source, weight }));
    let gap = ctx.targets.toughGap;
    const choice = rng.weighted(sources)?.source || 'protection';
    if (choice === 'defensive_roll' || (arch.powerless && choice !== 'armor')) {
      const roll = rng.chance(0.25 * chaos) ? rng.int(1, gap) : gap;
      if (roll > 0) addAdvantage(ch, 'Defensive Roll', roll);
      gap -= roll;
    }
    if (gap > 0 && (choice === 'armor' || arch.powerless)) {
      ctx.wantArmor = gap; // filled when equipment is bought
    } else if (gap > 0) {
      const pick = rng.weighted(themeTemplates(themes, (t) => t.role === 'defense' && t.rank === 'toughness'));
      const prot = pick
        ? instantiate(pick.tpl, gap, pick.theme, rng)
        : { id: newId(rng), name: rng.pick(arch.id === 'battlesuit' ? ['Armor Plating', 'Reinforced Shell'] : ['Tough Hide', 'Durability', 'Armored Costume', 'Resilient Body']), effect: 'Protection', rank: gap, role: 'defense', extras: [], flaws: [], descriptors: [] };
      prot.rank = gap;
      if (pick) prot.tpl = tplKey(pick.tpl);
      (ctx.device && arch.powers?.defense_in_device ? ctx.device.powers : ch.powers).push(prot);
    }
  }

  // Movement, senses, utilities ---------------------------------------------------------------
  if (!arch.powerless) {
    const placeIn = () => (ctx.device && rng.chance(arch.id === 'battlesuit' ? 0.95 : 0.5) ? ctx.device.powers : ch.powers);
    const addRole = (role) => {
      const used = usedTemplates(ch);
      const pick = rng.weighted(themeTemplates(themes, (t) => t.role === role && t.rank !== 'toughness' && !used.has(tplKey(t))));
      if (!pick) return;
      const p = instantiate(pick.tpl, rankFor(pick.tpl, ctx, R, role), pick.theme, rng);
      p.tpl = tplKey(pick.tpl);
      placeIn().push(p);
    };
    if (rng.chance(arch.powers?.movement ?? 0.5)) addRole('movement');
    if (rng.chance(arch.powers?.sense ?? 0.3)) addRole('sense');
    if (arch.powers?.support) addRole('support');
    const nUtil = rollSpec(arch.powers?.utility || '0..1', pl, rng);
    for (let i = 0; i < nUtil; i++) addUtilityPower(ch, R, ctx, null);
    // A pinch of chaos: a power from somewhere unexpected.
    if (ctx.themes.length > 1 && rng.chance(0.6)) addUtilityPower(ch, R, { ...ctx, themes: [ctx.themes[1]] }, null);
  }

  // Equipment ----------------------------------------------------------------------------------
  const eqRanks = arch.equipment ? rollSpec(arch.equipment, pl, rng) : (rng.chance(0.15) ? 1 : 0);
  if (eqRanks > 0) {
    addAdvantage(ch, 'Equipment', eqRanks);
    buildEquipment(ch, R, ctx, eqRanks);
    const used = equipmentPoints(ch);
    const adv = ch.advantages.find((a) => a.name === 'Equipment');
    adv.rank = Math.max(1, Math.ceil(used / EP_PER_EQUIPMENT_RANK));
  }
  if (mode === 'equipment' || arch.gear) {
    const weapons = ch.equipment.filter((e) => e.attack).sort((a, b) => b.attack.rank - a.attack.rank);
    const w = weapons.find((x) => x.attack.kind === 'ranged') || weapons[0];
    if (w) {
      const abil = w.attack.kind === 'ranged' ? ab.Dexterity : ab.Fighting;
      const rank = w.attack.rank + (w.attack.strengthBased ? ab.Strength : 0);
      fillAccuracy(w.attack.kind, w.name, abil, Math.min(attackT, 2 * pl - rank));
    }
  }
  if (ctx.wantArmor) {
    const d0 = deriveAll(ch, R);
    const left = tough - d0.defenses.Toughness;
    if (left > 0) addAdvantage(ch, 'Defensive Roll', left);
  }

  // Defenses up to their targets ---------------------------------------------------------------
  const d = deriveAll(ch, R);
  ch.defenses.Dodge = Math.max(0, dodgeT - d.defenses.Dodge);
  ch.defenses.Parry = Math.max(0, parryT - d.defenses.Parry);
  ch.defenses.Fortitude = Math.max(0, fortT - d.defenses.Fortitude);
  ch.defenses.Will = Math.max(0, willT - d.defenses.Will);

  // Skills ------------------------------------------------------------------------------------
  const skillWeights = Object.entries(arch.skills || {}).map(([name, weight]) => ({ name, weight }));
  const nSkills = rollSpec(arch.skill_count || '3..5', pl, rng);
  const scale = Math.max(0.4, pl / 10);
  const chosen = new Set();
  for (let i = 0; i < nSkills && skillWeights.length; i++) {
    const s = rng.weighted(skillWeights.filter((x) => !chosen.has(x.name)));
    if (!s) break;
    chosen.add(s.name);
    const ranks = Math.max(1, Math.round(rollSpec(arch.skill_ranks || '2..6', pl, rng) * scale));
    const ability = R.skillAbility(s.name);
    if (ab[ability] === null) continue; // no skills based on an absent ability
    const cap = pl + 10 - (ab[ability] ?? 0);
    addSkill(ch, s.name, Math.min(ranks, cap), s.name === 'Expertise' ? expertiseSpec(ctx) : undefined);
  }
  if (arch.styles && ctx.style) {
    for (const s of ctx.style.skills || []) {
      const m = /^([A-Za-z ]+?)(?: \((.+)\))?$/.exec(s);
      if (m && R.skill(m[1]) && !ch.skills.some((x) => x.name === m[1] && (x.spec || null) === (m[2] || null))) {
        if (m[1] === 'Close Combat' || m[1] === 'Ranged Combat') continue;
        addSkill(ch, m[1], rng.int(1, 4), m[2]);
      }
    }
  }

  // Advantages --------------------------------------------------------------------------------
  const pool = advantagePool(ctx);
  const nAdv = rollSpec(arch.advantage_count || '2..4', pl, rng);
  for (let i = 0, tries = 0; i < nAdv && tries < 40; tries++) {
    const pick = rng.weighted(pool);
    if (pick && grantAdvantage(ch, R, pick.name, ctx, pick.param)) i++;
  }

  // Repair, then balance to the exact budget ---------------------------------------------------
  const fail = (why) => { ctx.failReason = why; return null; };
  if (!repair(ch, R, rng)) return fail(`repair: ${errors(ch, R).map((e) => e.message).join('; ')}`);
  balance(ch, R, { ...ctx, budget });
  if (!repair(ch, R, rng)) return fail(`repair2: ${errors(ch, R).map((e) => e.message).join('; ')}`);
  if (total(ch, R) !== budget) balance(ch, R, { ...ctx, budget });
  if (total(ch, R) !== budget || !legal(ch, R)) return fail(`budget ${total(ch, R)}/${budget}: ${errors(ch, R).map((e) => e.message).join('; ')}`);
  return ch;
}

// ---------------------------------------------------------------------------------------------
// Public API

const PL_WEIGHTS = [
  { pl: 4, weight: 1 }, { pl: 6, weight: 2 }, { pl: 7, weight: 2 }, { pl: 8, weight: 4 }, { pl: 9, weight: 3 },
  { pl: 10, weight: 5 }, { pl: 11, weight: 3 }, { pl: 12, weight: 3 }, { pl: 13, weight: 1 }, { pl: 14, weight: 2 }, { pl: 15, weight: 1 },
];

/**
 * Generate a complete, legal character.
 * opts: { seed, pl, archetype, theme, alignment: 'hero'|'villain'|'random', chaos: 0..1, gender }
 */
export function generateCharacter(R, opts = {}) {
  const seed = opts.seed || randomSeed();
  const rng = makeRng(seed);
  const chaos = clamp(opts.chaos ?? 0.35, 0, 1);
  const pick = rng.fork('choices');

  const alignment = opts.alignment && opts.alignment !== 'random'
    ? opts.alignment
    : (pick.chance(0.3) ? 'villain' : 'hero');
  let pl = opts.pl ? clamp(Number(opts.pl), 1, 20) : pick.weighted(PL_WEIGHTS, (x) => x.weight).pl;

  const archetypes = R.raw.archetypes;
  const themesAll = R.raw.themes;
  let arch = archetypes.find((a) => a.id === opts.archetype);
  if (!arch) {
    const visible = archetypes.filter((a) => !a.hidden);
    const compatible = opts.theme ? visible.filter((a) => a.themes?.[opts.theme]) : visible;
    arch = pick.weighted(compatible.length ? compatible : visible, (a) => (alignment === 'villain' ? a.villain_weight ?? a.weight : a.weight));
  }
  if (arch.min_pl && pl < arch.min_pl) pl = arch.min_pl;
  let theme = themesAll.find((t) => t.id === opts.theme);
  if (!theme) {
    const weights = Object.entries(arch.themes || {}).map(([id, weight]) => ({ id, weight }));
    const wild = pick.chance(0.1 * chaos);
    const id = wild ? pick.pick(themesAll).id : pick.weighted(weights)?.id;
    theme = themesAll.find((t) => t.id === id) || pick.pick(themesAll);
  }
  const themes = [theme];
  if (!arch.powerless && pick.chance(0.08 + 0.35 * chaos)) {
    const other = pick.pick(themesAll.filter((t) => t.id !== theme.id && t.id !== 'martial'));
    if (other) themes.push(other);
  }
  const styles = R.raw.styles || [];
  const style = arch.styles && styles.length ? pick.pick(styles) : null;

  let ch = null;
  for (let attempt = 0; attempt < 8 && !ch; attempt++) {
    const ctx = { pl, arch, themes, theme, style, chaos, rng: rng.fork(`build-${attempt}`) };
    ch = buildMechanics(R, ctx);
    if (!ch && globalThis.DCUGEN_DEBUG) console.log(`  [${arch.id} PL${pl} try ${attempt}] ${ctx.failReason}`);
  }
  if (!ch) throw new Error(`Could not build a legal ${arch.name} at PL ${pl} (seed ${seed}).`);

  ch.id = `c-${seed}`;
  ch.version = ENGINE_VERSION;
  ch.seed = seed;
  ch.options = { pl: opts.pl || null, archetype: opts.archetype || null, theme: opts.theme || null, alignment: opts.alignment || 'random', chaos, gender: opts.gender || 'random' };
  ch.archetype = { id: arch.id, name: arch.name };
  if (arch.construct) ch.construct = arch.automaton ? 'automaton' : 'construct';
  if (arch.minion) ch.minion = true;
  ch.theme = { id: theme.id, name: theme.name, color: theme.color, secondary: themes[1] ? { id: themes[1].id, name: themes[1].name } : null };
  if (style) ch.style = { name: style.name, summary: style.summary };
  ch.alignment = alignment;
  Object.assign(ch, makeIdentity(R, ch, { arch, theme, themes, rng: rng.fork('identity'), gender: opts.gender }));
  // A full life story (family, timeline, people, personality, hooks) for every rolled character.
  try { ch.bio = generateBio(R, ch, { seed: `${seed}::bio` }); } catch { /* the bio is optional */ }
  ch.createdAt = new Date().toISOString();
  return ch;
}

/** Re-roll just the name and story, keeping the build. */
export function rerollIdentity(R, ch, seed = randomSeed()) {
  const arch = R.raw.archetypes.find((a) => a.id === ch.archetype?.id) || R.raw.archetypes[0];
  const theme = R.raw.themes.find((t) => t.id === ch.theme?.id) || R.raw.themes[0];
  const themes = [theme];
  const out = clone(ch);
  Object.assign(out, makeIdentity(R, out, { arch, theme, themes, rng: makeRng(`${seed}::identity`) }));
  try { out.bio = generateBio(R, out, { seed: `${seed}::bio` }); } catch { delete out.bio; }
  return out;
}

export function generateTeam(R, opts = {}) {
  const seed = opts.seed || randomSeed();
  const rng = makeRng(seed);
  const size = clamp(opts.size || 4, 2, 8);
  const archetypes = rng.shuffle(R.raw.archetypes.filter((a) => !a.hidden).map((a) => a.id));
  const members = [];
  for (let i = 0; i < size; i++) {
    members.push(generateCharacter(R, {
      ...opts,
      seed: `${seed}-${i + 1}`,
      archetype: opts.archetype || archetypes[i % archetypes.length],
    }));
  }
  const story = R.raw.flavor.story;
  const pattern = rng.pick(story.team_names);
  const name = pattern.replace('{adj}', rng.pick(story.team_adjectives)).replace('{noun}', rng.pick(story.team_nouns));
  return { name, seed, members };
}

/** Trim a character until it meets every PL limit (used by the workshop for creature variants). */
export function repairCharacter(ch, R, seed = 'repair') {
  return repair(ch, R, makeRng(seed));
}

export { evalExpr, rangeOf };
