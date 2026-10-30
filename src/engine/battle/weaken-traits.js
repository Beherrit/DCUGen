// What a Weaken effect takes away. The trait is read from the power's detail text (combatant.js) as one of: Toughness,
// Strength, Dodge, Parry, Will, Fortitude, Fighting (close attack checks and Parry), Dexterity (ranged attack checks),
// an attack power by a word of its name ("Power:blast", lowers that attack's rank), or All (every defense, half as hard).

const DEFENSES = ['Toughness', 'Dodge', 'Parry', 'Fortitude', 'Will'];

/** The trait a Weaken's detail text names. Falls back to Toughness. */
export function parseWeakenTrait(detail) {
  const d = String(detail || '').replace(/resisted by [a-z]+/i, '');
  if (/\ball (traits|abilities|defenses)\b|\bany trait\b|^\s*all\b/i.test(d)) return 'All';
  if (/tough/i.test(d)) return 'Toughness';
  if (/strength/i.test(d)) return 'Strength';
  if (/fighting|close combat|melee/i.test(d)) return 'Fighting';
  if (/dexterity|ranged combat/i.test(d)) return 'Dexterity';
  if (/parry/i.test(d)) return 'Parry';
  if (/will|intellect|awareness|presence/i.test(d)) return 'Will';
  if (/dodge|agility/i.test(d)) return 'Dodge';
  if (/fort/i.test(d)) return 'Fortitude';
  const power = /\b(blast|bolt|beam|ray|strike|damage|weapon)s?\b/i.exec(d) || /\b(fire|ice|lightning|energy)s?\b/i.exec(d);
  return power ? `Power:${power[1].toLowerCase()}` : 'Toughness';
}

/** Take `lost` ranks of the trait off the fighter. Returns how much of it is now lost (the first trait's total for All). */
export function weakenTraits(t, trait, lost) {
  const keys = trait === 'All' ? DEFENSES : [trait];
  const each = trait === 'All' ? Math.max(1, Math.ceil(lost / 2)) : lost;
  for (const k of keys) t.weakened[k] = (t.weakened[k] || 0) + each;
  return t.weakened[keys[0]];
}

/** The trait as it reads in the log. */
export function traitLabel(trait) {
  if (trait === 'All') return 'every defense';
  return trait.startsWith('Power:') ? `${trait.slice(6)} attacks` : trait;
}
