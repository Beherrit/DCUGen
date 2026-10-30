// Debilitated abilities (Hero's Handbook p49): an ability pushed below -5, by Weaken. The engine keeps what Weaken took
// off Strength, Dexterity, Fighting and Stamina under those names (weaken-traits.js), so those four can be debilitated;
// Agility, Intellect, Awareness and Presence are folded into Dodge and Will by the Weaken reader and cannot be told apart.
//
// - Strength or Dexterity: the fighter collapses, defenseless, immobile and stunned (still conscious).
// - Fighting: dazed and defenseless, and cannot make close attacks.
// - Stamina: dying (dying.js), with a -5 on the Fortitude checks to avoid death.

const TRACKED = ['Strength', 'Dexterity', 'Fighting', 'Stamina'];

/** The tracked abilities that are below -5 right now: { Strength: true, ... }. */
export function debilitated(c) {
  const out = {};
  const w = c.weakened || {};
  // Weaken Stamina takes the same ranks off Toughness and Fortitude (weaken-traits.js), so what both have lost is Stamina
  const lost = { Strength: w.Strength || 0, Dexterity: w.Dexterity || 0, Fighting: w.Fighting || 0, Stamina: Math.min(w.Toughness || 0, w.Fortitude || 0) };
  for (const a of TRACKED) {
    const base = c.d?.abilities?.[a];
    if (typeof base === 'number' && lost[a] && base - lost[a] < -5) out[a] = true;
  }
  return out;
}

/** The extra penalty on the Fortitude checks to avoid death while Stamina is debilitated (p49). */
export const stabilizePenalty = (c) => (debilitated(c).Stamina ? 5 : 0);

/** The basic conditions debilitated abilities add. */
export function debilitatedConditions(c) {
  const deb = debilitated(c);
  const out = [];
  if (deb.Strength || deb.Dexterity) out.push('Defenseless', 'Immobile', 'Stunned');
  if (deb.Fighting) out.push('Dazed', 'Defenseless');
  return out;
}

/** Can the fighter make close attacks (not with Fighting debilitated)? */
export const canFight = (c) => !debilitated(c).Fighting;
