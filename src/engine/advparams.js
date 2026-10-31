// What an advantage applies to (its "param" in data/advantages.json): suggestions for the Forge's picker and the
// generator, and whether the advantage means anything without one.

import { attacks } from './derive.js';

const uniq = (xs) => [...new Set(xs.filter(Boolean))];

// Choices from the book's own examples (DCA ch. 5) where the character sheet can't supply them.
const FIXED = {
  environment: ['Aerial', 'Underwater', 'Urban', 'Wilderness', 'Night', 'Zero gravity', 'Arctic', 'Desert', 'Jungle', 'Mountains', 'Space'],
  benefit: ['Wealth', 'Status', 'Security Clearance', 'Alternate Identity', 'Ambidexterity', 'Cipher', 'Diplomatic Immunity', 'Fame', 'Equipment Access'],
  hazard: ['Mind control', 'Traps', 'Falling', 'Poison and disease', 'Fear', 'Illusions', 'Disarm attempts', 'Grabs'],
  foe: ['Criminals', 'Aliens', 'Robots', 'Magical creatures', 'Metahumans', 'Demons', 'Undead', 'Soldiers'],
  language: ['Spanish', 'French', 'German', 'Mandarin', 'Arabic', 'Russian', 'Japanese', 'Latin', 'Kryptonian', 'Sign language'],
  check: ['Will checks', 'Toughness checks', 'Fortitude checks', 'Dodge checks', 'Close attacks', 'Ranged attacks', 'Athletics checks', 'Persuasion checks'],
  option: ['Close, cover', 'Close, concealment', 'Ranged, cover', 'Ranged, concealment'],
  condition: ['Dazed', 'Stunned', 'Vulnerable', 'Defenseless', 'Prone', 'Hindered', 'Impaired', 'Disabled', 'Fatigued'],
  descriptor: ['Fire', 'Cold', 'Electricity', 'Magic', 'Psychic', 'Sonic', 'Radiation', 'Kinetic'],
  action: ['Standard action', 'Move action', 'Free action'],
};

// Skills an advantage is limited to by the book: Daze (Deception or Intimidation, DCA 73), Fascinate (DCA 74).
const SKILL_LIMITS = { Daze: ['Deception', 'Intimidation'], Fascinate: ['Deception', 'Intimidation', 'Persuasion'] };

/** Advantages whose ranks say what they buy (Languages, Precise Attack) or whose target is a companion's name: the detail is optional. */
const OPTIONAL = new Set(['Languages', 'Precise Attack', 'Minion', 'Sidekick']);

/** Does this advantage need to name what it applies to? Feature is handled on its own (its detail is its description). */
export function paramRequired(def) {
  return !!def?.param && def.name !== 'Feature' && !OPTIONAL.has(def.name);
}

/** Suggestions for an advantage's detail, best first: from the character where it can say (its skills, attacks...), else the book's examples. */
export function paramChoices(ch, R, def) {
  if (!def?.param) return [];
  const sheetSkills = (ch.skills || []).map((s) => (s.spec ? `${s.name} (${s.spec})` : s.name));
  switch (def.param) {
    case 'skill': return SKILL_LIMITS[def.name] || uniq([...sheetSkills, ...(R.raw.skills || []).map((s) => s.name)]);
    case 'attack': {
      let list = [];
      try { list = attacks(ch, R).map((a) => a.name); } catch { /* a sheet mid-edit */ }
      return uniq([...list, 'Unarmed']);
    }
    case 'style': return uniq([...(ch.styles || []).map((s) => s.name), ...(R.raw.styles || []).map((s) => s.name)]);
    case 'stance': return (R.raw.stances || []).map((s) => s.name);
    case 'maneuver': return (R.raw.maneuvers || []).map((m) => m.name);
    case 'weapon': return uniq([...(ch.equipment || []).filter((e) => e.attack).map((e) => e.name), ...(R.raw.equipment?.ma_weapons || []).map((w) => w.name)]);
    case 'vehicle': return uniq([...(ch.vehicles || []).map((v) => v.name), ...(R.raw.vehicles?.premade || []).map((v) => v.name)]);
    case 'advantage': return (R.raw.advantages || []).map((a) => a.name);
    case 'minion': case 'sidekick': return (ch.companions || []).map((c) => c.identity?.codename).filter(Boolean);
    default: return FIXED[def.param] || [];
  }
}
