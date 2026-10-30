// Stances in play (Martial Arts 3e, pp 128-131). Everyone starts in Neutral. Changing stance is a Close Combat or
// Ranged Combat: Fighting Style check against the stance's DC: a move action, or free from Neutral. Failing it
// leaves you in Neutral. A stance is held until you change it or it is disrupted: being asleep, defenseless,
// immobile, incapacitated, paralyzed, prone, stunned or vulnerable puts you back in Neutral, and so does the
// end of the scene. The stance is kept on the play state as `stance` (a name; none means Neutral).

import { stylesOf, styleDef, stanceDef } from './lookup.js';
import { knownStances } from './describe.js';

export const DISRUPTING = ['Asleep', 'Defenseless', 'Immobile', 'Paralyzed', 'Prone', 'Stunned', 'Vulnerable'];

/** Does something in the play state break a held stance? (Incapacitated by damage or fatigue counts too.) */
export function stanceDisrupted(s) {
  return (s.conditions || []).some((c) => DISRUPTING.includes(c)) || s.damage === 'incapacitated' || s.fatigue === 'incapacitated';
}

/** The stance the character is in right now. */
export function currentStance(s) {
  return !s.stance || stanceDisrupted(s) ? 'Neutral' : s.stance;
}

/** Drop a held stance that has been disrupted (call after the play state changes). */
export function dropBrokenStance(s) {
  if (s.stance && stanceDisrupted(s)) delete s.stance;
  return s;
}

/** A move action to change stance, or a free action from Neutral. */
export const stanceAction = (s) => (currentStance(s) === 'Neutral' ? 'free' : 'move');

/** The DC to assume a stance: the stance's DC, plus a point per rank for (Named). */
export const stanceDc = (def, rank = 1) => (def.dc ? def.dc + (def.dc_per_rank || 0) * rank : 0);

/** The skill row for a style's own check (Close Combat or Ranged Combat: <style>), from deriveAll's skills. */
function checkBonus(d, style) {
  const sk = style.skill;
  if (!sk) return 0;
  const row = d.skills.find((k) => k.name === sk.name && (k.spec || null) === (sk.spec || null));
  if (row) return row.bonus;
  const ability = sk.name === 'Ranged Combat' ? 'Dexterity' : 'Fighting';
  return d.abilities[ability] ?? 0;
}

/**
 * The stances this character can assume, Neutral first: [{ name, def, dc, bonus, style }]. A stance several of the
 * character's styles teach uses the style that gives the best check.
 */
export function stanceChoices(ch, R, d) {
  const out = new Map();
  out.set('Neutral', { name: 'Neutral', def: stanceDef(R, 'Neutral'), dc: 0, bonus: 0, style: null });
  for (const style of stylesOf(ch)) {
    if (!style.stances) continue;
    const bonus = checkBonus(d, style);
    for (const def of knownStances(R, style, styleDef(R, style.name))) {
      const have = out.get(def.name);
      if (!have || bonus > have.bonus) out.set(def.name, { name: def.name, def, dc: stanceDc(def), bonus, style: style.name });
    }
  }
  return [...out.values()];
}

/**
 * Settle an Assume Stance check. `total` is the check result (d20 + bonus). Neutral needs no check. Returns
 * { stance, ok, action, text } and does not change the state: the caller stores `stance` (Neutral clears it).
 */
export function assumeStance(s, choice, total) {
  const action = stanceAction(s);
  const how = action === 'free' ? 'free action' : 'move action';
  if (choice.name === 'Neutral') return { stance: 'Neutral', ok: true, action, text: 'Neutral stance (no check needed)' };
  const ok = total >= choice.dc;
  return {
    stance: ok ? choice.name : 'Neutral', ok, action,
    text: ok ? `${choice.name} stance assumed (${how})` : `failed, back to Neutral (${how} spent)`,
  };
}
