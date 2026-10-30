// A character's fighting styles as plain data for the text stat block, the print view and the exports.

import { TIER_LABEL, stylesOf, styleDef, maneuverDef } from './lookup.js';
import { styleParts, maneuverPoints, maneuverPrice } from './price.js';
import { knownStances, stanceLine, maneuverLine } from './describe.js';
import { maneuverLabel } from './maneuvers.js';

/** [{ name, tier, tierLabel, skill, cost, stances: [{ name, dc, line }], weaponElements, maneuvers: [{ label, rank, cost, basic, line }] }] */
export function styleSummaries(ch, R) {
  return stylesOf(ch).map((s) => {
    const def = styleDef(R, s.name);
    const maneuvers = s.maneuvers.map((m) => {
      const md = maneuverDef(R, m.name, m.detail);
      const cost = typeof m.price === 'number' ? m.price : maneuverPrice(md, m.rank);
      return { label: maneuverLabel(m), rank: m.rank ?? null, cost, basic: md?.tier === 'basic', line: maneuverLine(md, m.rank) };
    });
    return {
      name: s.name, tier: s.tier, tierLabel: TIER_LABEL[s.tier] || s.tier, category: def?.category || '',
      skill: s.skill ? `${s.skill.name}: ${s.skill.spec}` : '',
      cost: styleParts(s, R).total + maneuverPoints(ch, R, s.name),
      stances: knownStances(R, s, def || {}).map((st) => ({ name: st.name, dc: st.dc, line: stanceLine(st) })),
      weaponElements: s.weaponElements || [],
      maneuvers,
    };
  });
}

/** One line per style for a plain-text stat block. */
export function styleTextLines(ch, R) {
  return styleSummaries(ch, R).map((s) => {
    const stances = s.stances.filter((x) => x.name !== 'Neutral').map((x) => `${x.name} (DC ${x.dc})`).join(', ');
    const man = s.maneuvers.map((m) => `${m.label}${m.rank != null ? ` ${m.rank}` : ''}${m.cost != null ? ` (${m.cost})` : ''}`).join(', ');
    return `${s.name} (${s.tierLabel}, ${s.cost} points): ${[stances ? `Stances: ${stances}` : null, s.weaponElements.length ? `Weapons: ${s.weaponElements.join(', ')}` : null, man ? `Maneuvers: ${man}` : null].filter(Boolean).join('. ') || 'no stances or maneuvers yet'}.`;
  });
}
