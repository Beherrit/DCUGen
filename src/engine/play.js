// At the table: the state of a character in play (damage, conditions, hero points, fatigue) and what it
// does to the numbers. Kept on the character as ch.play, so it survives a reload and travels with it.
//
// Damage (DCA, Toughness vs DC 15 + rank): fail by 1-5 = a bruise (-1 Toughness); by 6-10 = a bruise and
// dazed; by 11-15 = a bruise and staggered; more = incapacitated. Staggered twice = incapacitated.

export const DAMAGE_STATES = ['none', 'dazed', 'staggered', 'incapacitated'];
export const FATIGUE = ['none', 'fatigued', 'exhausted', 'incapacitated'];
export const QUICK_CONDITIONS = ['Prone', 'Vulnerable', 'Defenseless', 'Hindered', 'Impaired', 'Disabled', 'Immobile', 'Stunned', 'Surprised', 'Entranced', 'Compelled', 'Controlled', 'Blind', 'Deaf', 'Unaware', 'Asleep', 'Bound', 'Restrained', 'Paralyzed', 'Transformed', 'Weakened'];

/**
 * The play state with its defaults. Anything else kept on it (afflictions to recover from, how long a daze
 * lasts, weakened traits) is carried along.
 */
export function playState(ch) {
  const p = ch.play || {};
  return { ...p, bruises: p.bruises || 0, damage: DAMAGE_STATES.includes(p.damage) ? p.damage : 'none', heroPoints: p.heroPoints ?? 1, conditions: p.conditions || [], fatigue: FATIGUE.includes(p.fatigue) ? p.fatigue : 'none' };
}

const has = (s, c) => s.conditions.includes(c);

/** Penalty on checks from conditions and damage. */
export function checkPenalty(s) {
  if (has(s, 'Disabled') || s.fatigue === 'exhausted') return -5;
  if (has(s, 'Impaired')) return -2;
  return 0;
}

/** Defenses as they stand right now. */
export function effectiveDefenses(d, s) {
  const active = (v) => (has(s, 'Defenseless') || s.damage === 'incapacitated' || has(s, 'Asleep') || has(s, 'Paralyzed') ? 0 : has(s, 'Vulnerable') || has(s, 'Stunned') || has(s, 'Surprised') || has(s, 'Bound') ? Math.ceil(v / 2) : v);
  return {
    Dodge: active(d.defenses.Dodge),
    Parry: active(d.defenses.Parry),
    Toughness: d.defenses.Toughness - s.bruises,
    Fortitude: d.defenses.immune?.Fortitude ? null : d.defenses.Fortitude,
    Will: d.defenses.immune?.Will ? null : d.defenses.Will,
  };
}

/** Apply a failed (or passed) Toughness check: returns the new play state and what happened. */
export function applyDamage(s, { total, dc, roll }) {
  const out = { ...s, conditions: [...s.conditions] };
  // A natural 20 is a critical success: one degree better (Hero's Handbook p10), so one degree of failure is none.
  const degrees = (total >= dc ? 0 : 1 + Math.floor((dc - total - 1) / 5)) - (roll === 20 ? 1 : 0);
  if (degrees <= 0) return { state: out, text: roll === 20 && total < dc ? 'no damage (natural 20: +1 degree)' : 'no damage' };
  out.bruises += 1;
  let text = 'a bruise (−1 Toughness)';
  const worse = (st) => { if (DAMAGE_STATES.indexOf(st) > DAMAGE_STATES.indexOf(out.damage)) out.damage = st; };
  // Dazed by damage lasts until the end of the character's next turn (engine/turns.js counts it down).
  if (degrees === 2) { worse('dazed'); if (out.damage === 'dazed') out.dazedTurns = 1; text += ', dazed'; }
  if (degrees === 3) { if (out.damage === 'staggered') { worse('incapacitated'); text += ', staggered again: incapacitated'; } else { worse('staggered'); text += ', staggered'; } }
  if (degrees >= 4) { worse('incapacitated'); text = 'incapacitated'; }
  return { state: out, text: `${degrees} degree${degrees > 1 ? 's' : ''} of failure: ${text}` };
}

/** End of the scene: damage and conditions clear, hero points stay. */
export function endScene(s) {
  const out = { ...s, bruises: 0, damage: 'none', conditions: [], fatigue: 'none' };
  delete out.afflictions; delete out.dazedTurns; delete out.weakened;
  return out;
}
