// The checks the maneuvers share: the attack check and the opposed check (the rules for it are in checks.js).

import { sign, d20 } from './util.js';
import { opposedCheck, opposedNote } from './checks.js';
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

/** An opposed check of the first side's bonus against the second's: `won` is true when the first side wins. */
export function contest(rng, mine, theirs) {
  const res = opposedCheck(rng, { bonus: mine }, { bonus: theirs });
  const [r1, r2] = res.rolls;
  return {
    won: res.winner === 'a',
    degrees: res.degrees,
    text: `d20 ${r1} ${sign(mine)} = ${res.totals.a} against d20 ${r2} ${sign(theirs)} = ${res.totals.b}${opposedNote(res)}`,
    dice: [{ label: 'Opposed check', roll: r1, mod: mine, total: res.totals.a, dc: res.totals.b }],
  };
}
