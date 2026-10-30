// The points a fighter can spend on a re-roll: hero points and Luck. Kept apart from fortune.js so that Luck Control
// (luck.js) can ask who can pay without a loop between the two files.

export const fortuneOn = (b) => !!b.options?.heroPoints;
export const hasPoint = (b, c) => fortuneOn(b) && (c.heroPoints || 0) > 0;
export const luckReady = (b, c) => fortuneOn(b) && (c.luck || 0) > 0 && c.luckRound !== b.round;
export const canReroll = (b, c) => luckReady(b, c) || hasPoint(b, c);

/** Pay for one Improve Roll: Luck first (once a round), else a hero point. Returns 'Luck', 'hero point', or null when neither is there. */
export function payReroll(b, c) {
  if (luckReady(b, c)) { c.luck--; c.luckRound = b.round; return 'Luck'; }
  if (hasPoint(b, c)) { c.heroPoints--; return 'hero point'; }
  return null;
}
