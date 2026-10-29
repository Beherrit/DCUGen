// The checks the maneuvers share: the attack check, the opposed check and their odds.

import { sign, d20 } from './util.js';
import { feintedBy, defenseVs } from './conditions.js';

/** The bonus for a close maneuver such as a grab or a trip: the unarmed attack, else Fighting. */
export function closeBonus(c) {
  return c.attacks.find((a) => a.unarmed)?.bonus ?? c.d.abilities.Fighting ?? 0;
}

/** An attack check against Parry or Dodge. `mod` is everything on the roll except the die. A feint is used up. */
export function attackCheck(c, t, rng, which, mod) {
  const feinted = feintedBy(t, c);
  const dc = 10 + defenseVs(t, which, c);
  if (feinted) t.feinted = null;
  const roll = d20(rng);
  const total = roll + mod;
  const hit = roll === 20 || (roll !== 1 && total >= dc);
  return { hit, roll, total, dc, dice: [{ label: 'Attack', roll, mod, total, dc }], text: `d20 ${roll} ${sign(mod)} = ${total} vs ${which} DC ${dc}${feinted ? ' (feinted: vulnerable)' : ''}` };
}

/** An opposed check: `won` is true when the first side beats the second (a tie goes to the second). */
export function opposedCheck(rng, mine, theirs) {
  const r1 = d20(rng); const r2 = d20(rng);
  return {
    won: r1 + mine > r2 + theirs,
    text: `d20 ${r1} ${sign(mine)} = ${r1 + mine} against d20 ${r2} ${sign(theirs)} = ${r2 + theirs}`,
    dice: [{ label: 'Opposed check', roll: r1, mod: mine, total: r1 + mine, dc: r2 + theirs }],
  };
}

/** The chance that the first side beats the second in an opposed check. */
export function opposedOdds(mine, theirs) {
  let wins = 0;
  for (let a = 1; a <= 20; a++) for (let b = 1; b <= 20; b++) if (a + mine > b + theirs) wins++;
  return wins / 400;
}
