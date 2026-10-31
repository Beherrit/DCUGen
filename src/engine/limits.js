// Power level limits and other legality checks (DC Adventures Hero's Handbook ch. 2, 5, 6).
//
//   Skill modifier (ability + ranks + bonuses)  <= PL + 10   (untrained skills too)
//   Attack bonus + effect rank                  <= 2 x PL
//   Effect rank with no attack check            <= PL
//   Dodge + Toughness, Parry + Toughness        <= 2 x PL
//   Fortitude + Will                            <= 2 x PL

import { ABILITIES, traitKind } from './rules.js';
import { deriveAll, allPowers, enhancedAdvantageRank, durationOf } from './derive.js';
import { missingPrerequisiteText } from './prereqs.js';
import { costBreakdown, alternateOwnCost, primaryOwnCost, equipmentPoints, effectCost } from './costs.js';
import { EP_PER_EQUIPMENT_RANK } from './rules.js';
import { powerTags } from './powersmith.js';
import { withoutPlaced, hasPlaced, poolPowers, poolSpent, poolAvailable, fmtPoints } from './pools.js';
import { houseRules } from './house.js';
import { checkStyleLimits } from './martial/limits.js';
function issue(rule, message, severity = 'error', extra = {}) {
  return { rule, message, severity, ...extra };
}

/** Apply the table's house rules to the list of issues. */
function house(out) {
  const hr = houseRules();
  const soften = (i, mode) => (mode === 'off' ? null : mode === 'warning' && i.severity === 'error' ? { ...i, severity: 'warning', message: `${i.message} (house rule: allowed)` } : i);
  return out.map((i) => {
    if (i.pl) return soften(i, hr.plLimits);
    if (i.rule === 'budget' && i.severity === 'error') return soften(i, hr.budget);
    if (i.rule === 'pool' && i.severity === 'warning' && !hr.poolWarnings) return null;
    return i;
  }).filter(Boolean);
}

export function checkLimits(ch, R) {
  const pl = ch.pl;
  const out = [];
  // Limits apply to the build. Points placed from a pool right now are checked separately, as warnings.
  const d = deriveAll(withoutPlaced(ch), R);
  for (const { power: p } of poolPowers(ch)) {
    const spent = poolSpent(ch, p, R); const avail = poolAvailable(ch, p, R);
    if (spent > avail + 1e-9) out.push(issue('pool', `${p.name}: ${fmtPoints(spent)} power points placed, but the pool has ${fmtPoints(avail)}.`));
  }
  if (hasPlaced(ch)) {
    const now = deriveAll(ch, R);
    for (const [a, b] of [['Dodge', 'Toughness'], ['Parry', 'Toughness'], ['Fortitude', 'Will']]) {
      if (now.defenses.immune?.[a] || now.defenses.immune?.[b]) continue;
      const sum = now.defenses[a] + now.defenses[b];
      if (sum > 2 * pl && d.defenses[a] + d.defenses[b] <= 2 * pl) out.push(issue('pool', `With the pool points placed now, ${a} ${now.defenses[a]} + ${b} ${now.defenses[b]} = ${sum}, over the limit of ${2 * pl}. Fine if your GM allows it while it lasts.`, 'warning'));
    }
  }

  // Attack & effect
  for (const atk of d.attacks) {
    if (atk.roll) {
      if (atk.bonus + atk.rank > 2 * pl) {
        out.push(issue('attack', `${atk.name}: attack +${atk.bonus} plus rank ${atk.rank} is ${atk.bonus + atk.rank}; the limit is ${2 * pl}.`, 'error', { pl: true }));
      }
    } else if (atk.rank > pl) {
      out.push(issue('attack', `${atk.name}: ${atk.kind} effects have no attack check, so rank ${atk.rank} may not exceed PL ${pl}.`, 'error', { pl: true }));
    }
  }

  // Defenses
  const def = d.defenses;
  const pairs = [['Dodge', 'Toughness'], ['Parry', 'Toughness'], ['Fortitude', 'Will']];
  for (const [a, b] of pairs) {
    if (def.immune?.[a] || def.immune?.[b]) continue; // an immune defense has no rank to pair
    if (def[a] + def[b] > 2 * pl) {
      out.push(issue('defense', `${a} ${def[a]} + ${b} ${def[b]} = ${def[a] + def[b]}; the limit is ${2 * pl}.`, 'error', { pl: true }));
    }
  }

  // Skills need the ability they're based on (constructs lack some abilities)
  for (const sk of ch.skills || []) {
    const ability = R.skillAbility(sk.name);
    if (ability && ch.abilities?.[ability] === null) out.push(issue('skill', `${sk.name} is based on ${ability}, which this character lacks.`));
  }

  // Skills (trained and untrained)
  for (const s of d.skills) {
    if (s.bonus > pl + 10) out.push(issue('skill', `${s.name}${s.spec ? ` (${s.spec})` : ''} +${s.bonus} exceeds PL + 10 (${pl + 10}).`, 'error', { pl: true }));
  }
  // A skill bought only through Enhanced Trait (Enhanced Perception 12) has no entry in the skill list, but its bonus
  // is limited all the same.
  const listed = new Set(d.skills.map((s) => (s.spec ? `${s.name} (${s.spec})` : s.name)));
  const enhancedSkills = new Map();
  for (const { power: p, alternateOf } of allPowers(ch)) {
    if (alternateOf || p.pool || p.effect !== 'Enhanced Trait' || !p.option || listed.has(p.option)) continue;
    if (traitKind(p.option, R) !== 'skill') continue;
    enhancedSkills.set(p.option, (enhancedSkills.get(p.option) || 0) + (p.rank || 0));
  }
  for (const [label, ranks] of enhancedSkills) {
    const ability = R.skillAbility(label.replace(/\s*\(.*\)$/, ''));
    const bonus = (d.abilities[ability] ?? 0) + ranks;
    if (bonus > pl + 10) out.push(issue('skill', `${label} +${bonus} (Enhanced ${label} ${ranks}) exceeds PL + 10 (${pl + 10}).`, 'error', { pl: true }));
  }
  for (const a of ABILITIES) {
    if (a === 'Stamina') continue; // no skills use Stamina
    const v = d.abilities[a];
    if (v != null && v > pl + 10) out.push(issue('skill', `${a} ${v} makes untrained skills exceed PL + 10 (${pl + 10}).`, 'error', { pl: true }));
  }

  // Advantages. Ranks from Enhanced Trait powers count toward the advantage's maximum (Enhanced Luck is still Luck).
  const seenAdv = new Set();
  for (const adv of ch.advantages || []) {
    const def = R.advantage(adv.name);
    if (!def) { out.push(issue('data', `Unknown advantage "${adv.name}".`)); continue; }
    const rank = adv.rank || 1;
    const enhanced = seenAdv.has(adv.name) ? 0 : enhancedAdvantageRank(ch, adv.name);
    seenAdv.add(adv.name);
    if (!def.ranked && rank > 1) out.push(issue('advantage', `${adv.name} is not a ranked advantage.`, 'error', { source: def.source }));
    const max = def.max_rank === 'half_pl' ? Math.floor(pl / 2) : def.max_rank;
    if (max != null && rank + enhanced > max) out.push(issue('advantage', `${adv.name} ${rank + enhanced}${enhanced ? ` (${enhanced} from Enhanced ${adv.name})` : ''} exceeds its maximum of ${max}.`, 'error', { source: def.source }));
    for (const req of missingPrerequisiteText(ch, R, def.name)) out.push(issue('advantage', `${adv.name} requires ${req}.`, 'warning', { source: def.source }));
  }
  // Advantages bought only as Enhanced Trait powers follow the same caps and prerequisites.
  for (const { power: p, alternateOf } of allPowers(ch)) {
    if (alternateOf || p.pool || p.effect !== 'Enhanced Trait' || !p.option || seenAdv.has(p.option)) continue;
    const def = R.advantage(p.option);
    if (!def) continue;
    seenAdv.add(p.option);
    const rank = enhancedAdvantageRank(ch, p.option);
    if (!def.ranked && rank > 1) out.push(issue('advantage', `${p.name}: ${p.option} is not a ranked advantage, so Enhanced ${p.option} ${rank} buys nothing past rank 1.`, 'warning', { source: def.source }));
    const max = def.max_rank === 'half_pl' ? Math.floor(pl / 2) : def.max_rank;
    if (max != null && rank > max) out.push(issue('advantage', `${p.name}: Enhanced ${p.option} ${rank} exceeds its maximum of ${max}.`, 'error', { source: def.source }));
    for (const req of missingPrerequisiteText(ch, R, def.name)) out.push(issue('advantage', `${p.option} requires ${req}.`, 'warning', { source: def.source }));
  }
  const eqRanks = (ch.advantages || []).filter((a) => a.name === 'Equipment').reduce((s, a) => s + (a.rank || 1), 0);
  const ep = equipmentPoints(ch);
  if (ep > eqRanks * EP_PER_EQUIPMENT_RANK) {
    out.push(issue('equipment', `Equipment costs ${ep} points but Equipment ${eqRanks} only provides ${eqRanks * EP_PER_EQUIPMENT_RANK}.`));
  }

  // Fighting styles and their maneuvers (Martial Arts 3e)
  out.push(...checkStyleLimits(ch, R, issue));

  // Powers
  for (const { power: p, alternateOf } of allPowers(ch)) {
    let eff;
    try { eff = R.effect(p.effect); } catch (e) { out.push(issue('data', e.message)); continue; }
    if (eff.max_rank != null && p.rank > eff.max_rank) {
      out.push(issue('power', `${p.name}: ${eff.name} has a maximum rank of ${eff.max_rank}.`, 'error', { source: eff.source }));
    }
    if (!eff.fixed_cost && !(p.rank > 0)) out.push(issue('power', `${p.name} needs at least rank 1.`));
    const tags = powerTags(p, R);
    for (const [kind, list] of [['extra', p.extras], ['flaw', p.flaws]]) {
      for (const m of list || []) {
        let mdef;
        try { mdef = R.modifier(kind, m.name, p.effect); } catch (e) { out.push(issue('data', e.message)); continue; }
        for (const req of mdef.requires || []) {
          if (!tags.has(req)) out.push(issue('power', `${p.name}: ${m.name} needs an effect that is "${req}".`, 'warning', { source: mdef.source }));
        }
        if (mdef.max_steps != null && (m.steps ?? 1) > mdef.max_steps) {
          out.push(issue('power', `${p.name}: ${m.name} can only be applied ${mdef.max_steps} time(s).`, 'error', { source: mdef.source }));
        }
      }
    }
    // Fractional costs: "as a general rule, 1:5 (five ranks per power point) should be the lowest" (DCA 124).
    if (!eff.fixed_cost) {
      try {
        const c = effectCost(p, R);
        if (c.perRank < -3) out.push(issue('power', `${p.name} costs 1 point per ${2 - c.perRank} ranks; the book's guideline is no cheaper than 1 per 5 (GM's call).`, 'warning', { source: 'DCA 124' }));
      } catch { /* reported as data issues */ }
    }
    // "Permanent effects cannot have Alternate Effects, nor can they be Alternate Effects" (DCA 125).
    if (alternateOf || (p.alternates || []).length) {
      if (durationOf(p, R, { withFlaws: true }) === 'Permanent') out.push(issue('power', `${p.name}: ${eff.name} is permanent, and permanent effects can't be in an array (they can't be switched off). Add Sustained or move it out of the array.`, 'warning', { source: 'DCA 125' }));
    }
    if (alternateOf) {
      const own = alternateOwnCost(p, R);
      const primary = primaryOwnCost(alternateOf, R);
      if (own > primary) out.push(issue('power', `Alternate Effect ${p.name} costs ${own}, more than ${alternateOf.name} (${primary}).`));
    }
  }

  // Budget
  const cost = costBreakdown(ch, R);
  // PL 0 is for ordinary people: anything up to 14 points is fine, and nothing is "unspent".
  if (pl === 0 && !ch.advancement) {
    if (cost.total > 14) out.push(issue('budget', `Spent ${cost.total} power points; an ordinary person (PL 0) has 14 or fewer. Raise the power level or trim the build.`));
  } else if (cost.total > cost.budget && isNpc(ch)) {
    // Supporting characters and creatures are stat blocks, not player builds: points over PL x 15 are fine (DCA 194).
    out.push(issue('budget', `${cost.total} power points for a PL ${pl} supporting character (player characters get ${cost.budget}).`, 'info'));
  } else if (cost.total > cost.budget) out.push(issue('budget', ch.advancement ? `Spent ${cost.total} power points; starting points plus GM awards give ${cost.budget}.` : `Spent ${cost.total} power points; PL ${pl} allows ${cost.budget}.`));
  else if (cost.total < cost.budget) out.push(issue('budget', `${cost.budget - cost.total} power points unspent.`, 'info'));

  return house(out);
}

/** Supporting characters, minions and creatures: built as stat blocks, so the point budget is advisory. */
export function isNpc(ch) {
  return !!(ch.npc || ch.minion || ch.catalogId || /^npc-/.test(ch.archetype?.id || '') || ['creature', 'animal', 'monster', 'construct'].includes(String(ch.kind || '').toLowerCase()));
}

export function isLegal(ch, R) {
  return checkLimits(ch, R).every((i) => i.severity !== 'error');
}
