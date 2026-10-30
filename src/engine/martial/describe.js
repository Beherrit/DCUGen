// Plain-words descriptions of styles, stances and maneuvers, for the sheet, the print view and the exports.

import { TIERS, TIER_LABEL, stancesOfStyle } from './lookup.js';
import { maneuverPrice } from './price.js';

export const TIER_TEXT = {
  initiate: '+2 to skill checks that involve the style (not its Close Combat skill). Needs 1 rank in each style skill, all style flaws, one style advantage and one basic maneuver.',
  student: '+2 attack with the style\'s basic and advanced maneuvers. Also needs the Stances advantage, all extras and flaws, half the skills, advantages and basic maneuvers, and one advanced maneuver.',
  master: 'One free re-roll per session on style checks, per rank. Also needs everything the style lists, at the listed ranks.',
};

/** What a tier gives you, with the lower tiers it builds on. */
export function tierSummary(tier) {
  const upto = TIERS.indexOf(tier);
  return TIERS.slice(0, upto + 1).map((t) => `${TIER_LABEL[t]}: ${TIER_TEXT[t]}`);
}

/** Points the tier advantages cost for one style: Initiate 1, Student 2, Master 3. */
export const tierCost = (tier) => TIERS.indexOf(tier) + 1;

const dcText = (st) => (st.dc_per_rank ? `DC ${st.dc} + ${st.dc_per_rank} per rank` : st.dc ? `DC ${st.dc}` : 'no check');

/** "Blocking (DC 13): +2 to Parry. -2 to attack." One line for a stance. */
export function stanceLine(st) {
  const bits = [st.benefits, st.detriments].filter((x) => x && !/^none\.?$/i.test(x));
  return `${st.name} (${dcText(st)}): ${bits.join(' ') || 'No bonuses or penalties.'}${st.special && st.dc ? ` ${st.special}` : ''}`;
}

/** The stances a known style gives, as stance data (Neutral first). */
export function knownStances(R, style, def) {
  if (!style?.stances) return [];
  const list = stancesOfStyle(R, def);
  return [...list.filter((s) => s.name === 'Neutral'), ...list.filter((s) => s.name !== 'Neutral')];
}

/** A maneuver's numbers on one line: damage and attack for a basic one, type and action for an advanced one. */
export function maneuverLine(def, rank) {
  if (!def) return '';
  const bits = [];
  if (def.tier === 'basic') {
    if (def.damage) bits.push(`damage ${def.damage}`);
    if (def.attack_mod) bits.push(`attack ${def.attack_mod}`);
    if (def.defense_mod) bits.push(`defense ${def.defense_mod}`);
    if (def.crit && def.crit !== '20') bits.push(`crit ${def.crit}`);
  } else {
    bits.push([def.type, def.action && def.action !== 'None' ? `${def.action} action` : 'no action', def.range, def.duration].filter(Boolean).join(', '));
    if (rank) bits.push(`rank ${rank}`);
    if (def.resistance) bits.push(`resisted by ${def.resistance}`);
  }
  return bits.join(' · ');
}

/** The price text for a maneuver, "3 pp" or the formula when the book leaves it open. */
export function priceText(def, rank, printed) {
  if (typeof printed === 'number') return `${printed} pp`;
  const p = maneuverPrice(def, rank);
  return p == null ? (def?.cost?.text || 'varies') : `${p} pp`;
}
