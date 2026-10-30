// Prone: falling down, and what it does to attack checks (Hero's Handbook p26, p177, p78).
// Close attackers get +5 against a prone fighter and ranged attackers -5; a prone fighter has -5 on its own close
// attacks. Prone Fighting removes the fighter's own penalty and the +5 that close attackers would get.

import { activeConditions } from './conditions.js';

/** Where a prone condition can come from and still be stood up from on the fighter's own turn. */
export const STAND_SOURCES = ['knockback', 'trip', 'drop'];

export const isProne = (c) => activeConditions(c).has('Prone');

/** The prone conditions c can end by standing (an Affliction's Prone only ends when the Affliction does). */
export const standableProne = (c) => c.conditions.filter((x) => x.name === 'Prone' && STAND_SOURCES.includes(x.source));

/** The change to the attack check from prone: c attacking t with an attack of this kind. */
export function proneMod(c, t, atk) {
  let mod = 0;
  if (activeConditions(t).has('Prone')) mod += atk.kind === 'close' ? (t.adv['Prone Fighting'] ? 0 : 5) : -5;
  if (activeConditions(c).has('Prone') && atk.kind === 'close' && !c.adv['Prone Fighting'] && !c.slithers) mod -= 5; // Slithering: no penalty for attacks while prone (p110)
  return mod;
}

/** Put the fighter on the ground. Returns false when it was down already. */
export function makeProne(t, from, source, label) {
  if (t.conditions.some((x) => x.name === 'Prone')) return false;
  t.conditions.push({ name: 'Prone', degree: 1, from: from?.id ?? t.id, source, label });
  return true;
}
