// Power level limits and other legality checks (DC Adventures Hero's Handbook ch. 2, 5, 6).
//
//   Skill modifier (ability + ranks + bonuses)  <= PL + 10   (untrained skills too)
//   Attack bonus + effect rank                  <= 2 x PL
//   Effect rank with no attack check            <= PL
//   Dodge + Toughness, Parry + Toughness        <= 2 x PL
//   Fortitude + Will                            <= 2 x PL

import { ABILITIES } from './rules.js';
import { deriveAll, allPowers } from './derive.js';
import { costBreakdown, alternateOwnCost, primaryOwnCost, equipmentPoints } from './costs.js';
import { EP_PER_EQUIPMENT_RANK } from './rules.js';
import { powerTags } from './powersmith.js';
function issue(rule, message, severity = 'error') {
  return { rule, message, severity };
}

export function checkLimits(ch, R) {
  const pl = ch.pl;
  const out = [];
  const d = deriveAll(ch, R);

  // Attack & effect
  for (const atk of d.attacks) {
    if (atk.roll) {
      if (atk.bonus + atk.rank > 2 * pl) {
        out.push(issue('attack', `${atk.name}: attack +${atk.bonus} plus rank ${atk.rank} is ${atk.bonus + atk.rank}; the limit is ${2 * pl}.`));
      }
    } else if (atk.rank > pl) {
      out.push(issue('attack', `${atk.name}: ${atk.kind} effects have no attack check, so rank ${atk.rank} may not exceed PL ${pl}.`));
    }
  }

  // Defenses
  const def = d.defenses;
  const pairs = [['Dodge', 'Toughness'], ['Parry', 'Toughness'], ['Fortitude', 'Will']];
  for (const [a, b] of pairs) {
    if (def.immune?.[a] || def.immune?.[b]) continue; // an immune defense has no rank to pair
    if (def[a] + def[b] > 2 * pl) {
      out.push(issue('defense', `${a} ${def[a]} + ${b} ${def[b]} = ${def[a] + def[b]}; the limit is ${2 * pl}.`));
    }
  }

  // Skills need the ability they're based on (constructs lack some abilities)
  for (const sk of ch.skills || []) {
    const ability = R.skillAbility(sk.name);
    if (ability && ch.abilities?.[ability] === null) out.push(issue('skill', `${sk.name} is based on ${ability}, which this character lacks.`));
  }

  // Skills (trained and untrained)
  for (const s of d.skills) {
    if (s.bonus > pl + 10) out.push(issue('skill', `${s.name}${s.spec ? ` (${s.spec})` : ''} +${s.bonus} exceeds PL + 10 (${pl + 10}).`));
  }
  for (const a of ABILITIES) {
    if (a === 'Stamina') continue; // no skills use Stamina
    const v = d.abilities[a];
    if (v != null && v > pl + 10) out.push(issue('skill', `${a} ${v} makes untrained skills exceed PL + 10 (${pl + 10}).`));
  }

  // Advantages
  for (const adv of ch.advantages || []) {
    const def = R.advantage(adv.name);
    if (!def) { out.push(issue('data', `Unknown advantage "${adv.name}".`)); continue; }
    const rank = adv.rank || 1;
    if (!def.ranked && rank > 1) out.push(issue('advantage', `${adv.name} is not a ranked advantage.`));
    const max = def.max_rank === 'half_pl' ? Math.floor(pl / 2) : def.max_rank;
    if (max != null && rank > max) out.push(issue('advantage', `${adv.name} ${rank} exceeds its maximum of ${max}.`));
  }
  const eqRanks = (ch.advantages || []).filter((a) => a.name === 'Equipment').reduce((s, a) => s + (a.rank || 1), 0);
  const ep = equipmentPoints(ch);
  if (ep > eqRanks * EP_PER_EQUIPMENT_RANK) {
    out.push(issue('equipment', `Equipment costs ${ep} points but Equipment ${eqRanks} only provides ${eqRanks * EP_PER_EQUIPMENT_RANK}.`));
  }

  // Powers
  for (const { power: p, alternateOf } of allPowers(ch)) {
    let eff;
    try { eff = R.effect(p.effect); } catch (e) { out.push(issue('data', e.message)); continue; }
    if (eff.max_rank != null && p.rank > eff.max_rank) {
      out.push(issue('power', `${p.name}: ${eff.name} has a maximum rank of ${eff.max_rank}.`));
    }
    if (!eff.fixed_cost && !(p.rank > 0)) out.push(issue('power', `${p.name} needs at least rank 1.`));
    const tags = powerTags(p, R);
    for (const [kind, list] of [['extra', p.extras], ['flaw', p.flaws]]) {
      for (const m of list || []) {
        let mdef;
        try { mdef = R.modifier(kind, m.name, p.effect); } catch (e) { out.push(issue('data', e.message)); continue; }
        for (const req of mdef.requires || []) {
          if (!tags.has(req)) out.push(issue('power', `${p.name}: ${m.name} needs an effect that is "${req}".`, 'warning'));
        }
        if (mdef.max_steps != null && (m.steps ?? 1) > mdef.max_steps) {
          out.push(issue('power', `${p.name}: ${m.name} can only be applied ${mdef.max_steps} time(s).`));
        }
      }
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

  return out;
}

/** Supporting characters, minions and creatures: built as stat blocks, so the point budget is advisory. */
export function isNpc(ch) {
  return !!(ch.npc || ch.minion || ch.catalogId || /^npc-/.test(ch.archetype?.id || '') || ['creature', 'animal', 'monster', 'construct'].includes(String(ch.kind || '').toLowerCase()));
}

export function isLegal(ch, R) {
  return checkLimits(ch, R).every((i) => i.severity !== 'error');
}
