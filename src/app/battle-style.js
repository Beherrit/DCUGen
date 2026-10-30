// The Battle Room fighter card's line for a martial artist: the style and its tier, the stance held now, and what that stance does,
// in one short line (Martial Arts 3e). Nothing for a fighter who practices no style.

import { h } from './dom.js';
import { TIER_LABEL } from '../engine/martial/lookup.js';

/** The stance's effect in a few words: its benefits and detriments from the book's stance list. */
function effectOf(c, name) {
  const def = c.ma.choices.find((x) => x.name === name)?.def;
  if (!def) return '';
  const bits = [def.benefits, def.detriments].filter((x) => x && !/^none\.?$/i.test(x));
  return bits.join(' ') || 'No bonuses or penalties.';
}

/** "Boabom (Student) · Kicker stance: +2 to attack and damage with foot attacks. -2 to ..." or null. */
export function styleLine(c) {
  if (!c.ma) return null;
  const styles = c.ma.styles.map((s) => `${s.name} (${TIER_LABEL[s.tier] || s.tier})`).join(', ');
  const name = c.stance?.name || 'Neutral';
  const stance = c.ma.choices.length > 1 ? ` · ${name} stance${name === 'Neutral' ? '' : `: ${effectOf(c, name)}`}` : '';
  return h('div', { class: 'bt-style', title: 'Fighting style, its tier and the stance held now (Martial Arts 3e)' }, `${styles}${stance}`);
}
