// How completely a condition stops a fighter from acting, from 0 (not at all) to 1 (out of the action), for judging controls,
// and how many of its own turns a fighter loses to it.

const STOPS = { Incapacitated: 1, Asleep: 1, Paralyzed: 1, Stunned: 1, Controlled: 1, Bound: 1, Entranced: 1, Transformed: 0.8, Compelled: 0.6, Defenseless: 0.5, Immobile: 0.4, Unaware: 0.8 };

/**
 * Turns lost per application, measured over 300 seeded fights (conditions followed from the hit that caused them until they
 * wore off): stunned 1.67, entranced 1.30, unaware 1.88, paralyzed 2.0, controlled 0.14 lost and 1.69 spent against its own
 * side. A half turn (a standard action only) counts for HALF_TURN (half) of a turn, measured by dazing the most dangerous enemy: dazed took 1.49 half turns, compelled 1.35.
 * Incapacitated and asleep are taken as long as paralyzed (too rare to measure). The rest cost no turns and keep their old weights.
 */
export const TURNS_LOST = { Incapacitated: 2, Asleep: 2, Paralyzed: 2, Unaware: 1.88, Stunned: 1.67, Entranced: 1.3, Controlled: 2, Compelled: 0.75, Dazed: 0.79 };

/** How much the conditions of one degree stop a fighter. */
export const stopOfNames = (names) => Math.max(0, ...(names || []).map((n) => STOPS[n] || 0));

/** The turns a tier of conditions costs the target: the worst of its conditions. */
export const turnsOfNames = (names) => Math.max(0, ...(names || []).map((n) => TURNS_LOST[n] || 0));

/** How much a control attack stops its target when it lands at two degrees (the second tier). Nullify counts as a half stop. */
export function stopOf(atk) {
  if (atk.effect === 'Nullify') return 0.5;
  if (!atk.tiers || atk.effect === 'Damage' || atk.effect === 'Weaken') return 0;
  const tier = atk.tiers[Math.min(1, atk.tiers.length - 1)];
  return (atk.maxDegree || atk.tiers.length) >= 2 ? stopOfNames(tier) : 0;
}
