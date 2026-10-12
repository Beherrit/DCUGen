// House rules: how strict the app is, set per table (Rules > House rules, kept in preferences).
//
//   plLimits      'error' (by the book) | 'warning' (shown, not counted against legality) | 'off'
//   budget        'error' | 'warning' | 'off'   (spending more power points than the PL allows)
//   weaken        'margin'  (lose as many power points as the check missed by; the app's reading of DCA 122)
//                 'degrees' (lose 1 point per degree of failure)
//   poolWarnings  true | false (warn when placed pool points push a defense pair over the limit)

export const HOUSE_DEFAULTS = Object.freeze({ plLimits: 'error', budget: 'error', weaken: 'margin', poolWarnings: true });
let house = { ...HOUSE_DEFAULTS };

export function setHouseRules(h) { house = { ...HOUSE_DEFAULTS, ...(h || {}) }; }
export function houseRules() { return house; }
export function isByTheBook() { return Object.entries(HOUSE_DEFAULTS).every(([k, v]) => house[k] === v); }

/** Power points a Weaken drains when the target missed by `missedBy`. */
export function weakenPoints(missedBy) {
  const m = Math.max(0, Math.floor(missedBy));
  if (!m) return 0;
  return house.weaken === 'degrees' ? 1 + Math.floor((m - 1) / 5) : m;
}
