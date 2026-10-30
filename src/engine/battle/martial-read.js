// Reading a fighter's martial arts for the fight (Martial Arts 3e, pp 72-80 and 125-136): the styles it practices and their tier, the
// stances it can assume with the check for each, and the style advantages that change a stance (Flowing Form, Deceptive Stance,
// Preferred Stance, Kata). Read once when the fighter is built; `c.ma` is null for a fighter with no style, so fights without
// martial artists never touch any of it. What the fighter is doing right now (its stance) is state on the combatant (stance-fight.js).

import { advantageRank } from '../derive.js';
import { stylesOf, styleDef } from '../martial/lookup.js';
import { stanceChoices } from '../martial/stance.js';
import { readExtras } from './style-extras.js';

const TIER_RANK = { initiate: 0, student: 1, master: 2 };

/** The param of an advantage the character has, if any ("Preferred Stance (Crane)" gives "Crane"). */
const paramsOf = (ch, name) => (ch.advantages || []).filter((a) => a.name === name).map((a) => String(a.param || ''));

/** Does the advantage name this style (or name nothing, which covers the character's only style)? */
const forStyle = (params, style, only) => params.some((p) => !p || p.toLowerCase().includes(style.toLowerCase())) && (params.length > 0 || only);

/** The martial arts of a combatant, or null when it practices no style. */
export function readMartial(c, R, d) {
  const styles = stylesOf(c.ch);
  if (!styles.length) return null;
  const kata = paramsOf(c.ch, 'Kata');
  const out = {
    styles: styles.map((s) => {
      const def = styleDef(R, s.name);
      return { name: s.name, tier: s.tier, rank: TIER_RANK[s.tier] ?? 0, def, stances: !!s.stances, skill: s.skill, kata: kata.length > 0 && forStyle(kata, s.name, styles.length === 1), ...readExtras(def) };
    }),
    choices: stanceChoices(c.ch, R, d), // Neutral first, then each stance with its DC and the check bonus [{ name, def, dc, bonus, style }]
    flowing: advantageRank(c.ch, 'Flowing Form') > 0,       // MA 76: stance DCs 5 lower, always a free action
    deceptive: advantageRank(c.ch, 'Deceptive Stance'),      // MA 74: foes' disrupt and identify checks -4 a rank, our stance DC +2 a rank
    preferred: paramsOf(c.ch, 'Preferred Stance').filter(Boolean).map((s) => s.toLowerCase()),
    rerolls: styles.filter((s) => s.tier === 'master').length, // MA 78: a free re-roll of a style check per Master style
    known: {},     // foes' stances we have identified: { foeId: stanceName } (stance-contest.js)
  };
  out.student = out.styles.some((s) => s.rank >= 1);
  return out;
}

/** The style a stance belongs to for this fighter (the one whose check is best), as an entry of `ma.styles`. */
export const styleOfStance = (ma, name) => ma?.styles.find((s) => s.name === ma.choices.find((x) => x.name === name)?.style) || null;
