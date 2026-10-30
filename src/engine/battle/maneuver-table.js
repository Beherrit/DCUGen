// Reading a combat maneuver's numbers for the fight (Martial Arts 3e, the basic maneuver table pp 137-138 and the advanced
// maneuvers pp 144-153). The table gives a basic maneuver its Damage (Strength plus a modifier), critical range, attack
// modifier and the change to Parry and Dodge until the fighter's next turn. Advanced attack maneuvers are built powers: the ones
// below are the plain Damage, Affliction and Weaken builds, which become attacks at the rank the fighter bought them at.

const num = (s) => { const m = /(-?\+?\d+)/.exec(String(s ?? '')); return m ? parseInt(m[1], 10) : 0; };

/** "Str+2" gives 2, "Str" 0, "Str-3" -3; null when the maneuver is not Strength-based Damage ("Base + 6", none). */
export function strengthMod(def) {
  const m = /^Str\s*([+-]\s*\d+)?$/.exec(String(def?.damage ?? '').trim());
  return m ? (m[1] ? parseInt(m[1].replace(/\s/g, ''), 10) : 0) : null;
}

/** The critical threat range start from the table ("19-20" gives 19). */
export function critFrom(def) {
  const m = /^(\d+)-20$/.exec(String(def?.crit ?? ''));
  return m ? parseInt(m[1], 10) : 20;
}

/** The change to Parry and Dodge from the table's Defense column ("-2 P&D", "-5 D", "+2 P"): { Parry, Dodge }. */
export function defenseChange(def) {
  const s = String(def?.defense_mod ?? '');
  const n = num(s);
  if (!n) return { Parry: 0, Dodge: 0 };
  return { Parry: /P/.test(s.replace(/[^PD&]/g, '')) ? n : 0, Dodge: /D/.test(s.replace(/[^PD&]/g, '')) ? n : 0 };
}

/** The table's attack modifier ("-4 *" gives -4). */
export const attackChange = (def) => num(def?.attack_mod);

/** Extras of the basic maneuvers the fight plays, read from the build text. */
export function maneuverExtras(def) {
  const text = String(def?.build || '');
  const extras = [];
  if (/\bPenetrating\b/.test(text)) extras.push({ name: 'Penetrating' });
  if (/\bMultiattack\b/.test(text)) extras.push({ name: 'Multiattack' });
  return extras;
}

// Basic maneuvers built as an Affliction rather than Damage (the book's build text), at the printed rank. Limited Degree
// keeps the last degree off, so Sweep trips in two degrees.
export const BASIC_AFFLICTIONS = {
  Sweep: { rank: 6, detail: 'Resisted by Dodge; Vulnerable, Prone', limited: true },
};

// Advanced attack maneuvers the fight plays. `kind` Damage uses the maneuver's rank as Damage ranks (`strength`: on top of
// Strength); Affliction and Weaken take their resistance and conditions from `detail`, as an Affliction power's detail does.
export const ADVANCED = {
  'Chi Strike': { kind: 'Damage', resist: 'Will' },
  'Cobra Strike': { kind: 'Damage', resist: 'Fortitude' },
  'Flaming Fists': { kind: 'Damage', strength: true, descriptors: ['fire'] },
  'Stunning Attack': { kind: 'Affliction', detail: 'Resisted by Fortitude; Impaired, Stunned, Incapacitated' },
  'Stone Touch': { kind: 'Affliction', detail: 'Resisted by Fortitude; Hindered, Immobilized, Paralyzed' },
  "Sleeper's Touch": { kind: 'Affliction', detail: 'Resisted by Fortitude; Dazed, Stunned, Incapacitated', extras: [{ name: 'Sleep' }] },
  'Withering Blow': { kind: 'Weaken', detail: 'Resisted by Fortitude; Strength' },
};

// Advanced maneuvers that add to the style's own close attacks instead of being attacks: ranks of Improved Critical,
// Penetrating or Multiattack (each is "Enhanced <advantage>" in the book's build).
export const ENHANCES = { 'Focused Strike': 'crit', 'Nerve Strike': 'penetrating', Flurry: 'multiattack' };
