// Conditions: Afflictions parsed into condition names, what is in force on a fighter, and the checks they change.

import { hasExtra } from './util.js';

// Composite conditions break down into the basic ones (DCA 19-21).
const COMPOSITE = {
  Staggered: ['Dazed', 'Hindered'], Incapacitated: ['Defenseless', 'Stunned', 'Unaware', 'Prone'], Asleep: ['Defenseless', 'Stunned', 'Unaware'],
  Paralyzed: ['Defenseless', 'Immobile', 'Stunned'], Bound: ['Defenseless', 'Immobile', 'Impaired'], Restrained: ['Hindered', 'Vulnerable'],
  Exhausted: ['Impaired', 'Hindered'], Fatigued: ['Hindered'], Blind: ['Hindered', 'Vulnerable', 'Blinded'], Surprised: ['Stunned', 'Vulnerable'],
  Entranced: ['Stunned'], Prone: ['Prone', 'Hindered'],
};
const KNOWN = ['Asleep', 'Blind', 'Bound', 'Compelled', 'Controlled', 'Dazed', 'Deaf', 'Defenseless', 'Disabled', 'Entranced', 'Exhausted', 'Fatigued', 'Hindered', 'Immobile', 'Impaired', 'Incapacitated', 'Paralyzed', 'Prone', 'Restrained', 'Staggered', 'Stunned', 'Surprised', 'Transformed', 'Unaware', 'Vulnerable', 'Weakened'];
export const SEVERITY = { Incapacitated: 10, Asleep: 9, Paralyzed: 9, Controlled: 9, Bound: 8, Stunned: 8, Unaware: 7, Staggered: 7, Compelled: 6, Entranced: 6, Defenseless: 6, Transformed: 6, Exhausted: 5, Restrained: 5, Immobile: 5, Disabled: 5, Dazed: 4, Blind: 4, Prone: 3, Vulnerable: 3, Impaired: 3, Fatigued: 2, Hindered: 2, Deaf: 1, Weakened: 1 };

/** Turn one tier of an affliction's text ("Dazed and Vision Impaired") into condition names. */
function parseTier(text, index) {
  const found = KNOWN.filter((k) => new RegExp(`\\b${k}\\b`, 'i').test(text));
  if (/immobiliz/i.test(text) && !found.includes('Immobile')) found.push('Immobile');
  if (/transform/i.test(text) && !found.includes('Transformed')) found.push('Transformed');
  if (found.length) return found;
  return [['Impaired', 'Disabled', 'Incapacitated'][Math.min(2, index)]];
}

/** Resistance and the three degrees of an Affliction-type power from its detail text. */
export function parseAffliction(p, R) {
  const eff = R.effect(p.effect);
  const detail = String(p.detail || '');
  const resist = (/Resisted by ([A-Za-z]+)/i.exec(detail)?.[1]) || p.resistance || (eff.resistance === 'Fortitude or Will' ? 'Fortitude' : eff.resistance) || 'Fortitude';
  const afterSemi = detail.includes(';') ? detail.split(';').slice(1).join(';') : (/Resisted by/i.test(detail) ? '' : detail);
  const tierTexts = afterSemi.split(',').map((s) => s.trim()).filter(Boolean);
  let tiers = tierTexts.length ? tierTexts.map((t, i) => parseTier(t, i)) : [['Dazed'], ['Stunned'], ['Incapacitated']];
  if (p.effect === 'Snare' && !tierTexts.length) tiers = [['Hindered', 'Vulnerable'], ['Defenseless', 'Immobile']];
  if (p.effect === 'Dazzle' && !tierTexts.length) tiers = [['Impaired'], ['Disabled'], ['Unaware']];
  if (p.effect === 'Sleep' && !tierTexts.length) tiers = [['Fatigued'], ['Exhausted'], ['Asleep']];
  if (p.effect === 'Mind Control' && !tierTexts.length) tiers = [['Dazed'], ['Compelled'], ['Controlled']];
  const limited = (p.flaws || []).filter((f) => f.name === 'Limited Degree').reduce((s, f) => s + (f.steps ?? 1), 0);
  const maxDegree = Math.max(1, Math.min(tiers.length, 3 - limited));
  const cap = (v) => v.charAt(0).toUpperCase() + v.slice(1);
  return { resist: cap(resist.toLowerCase()), tiers: tiers.slice(0, maxDegree), maxDegree, cumulative: hasExtra(p, 'Cumulative'), progressive: hasExtra(p, 'Progressive'), extraCondition: hasExtra(p, 'Extra Condition') };
}
/** A fighter holding someone is hindered and vulnerable (p176); Improved Grab and Grabbing Finesse spare it the vulnerable part (p75, p77). */
function holdingConditions(c, add) {
  add('Hindered');
  if (!c.adv?.['Improved Grab'] && !c.adv?.['Grabbing Finesse']) add('Vulnerable');
}

/** The basic conditions in force on a combatant right now. */
export function activeConditions(c) {
  const set = new Set();
  const add = (name) => { set.add(name); for (const sub of COMPOSITE[name] || []) if (sub !== name) add(sub); };
  if (c.dazed) add('Dazed');
  if (c.staggered) add('Staggered');
  if (c.out && !c.fled) add('Incapacitated');
  if (c.fatigue >= 2) add('Exhausted'); else if (c.fatigue === 1) add('Fatigued');
  if (c.grabbedBy) add(c.conditions.some((x) => x.name === 'Bound') ? 'Bound' : 'Restrained');
  if (c.holding) holdingConditions(c, add);
  for (const x of c.conditions) add(x.name);
  return set;
}

export function conditionLabels(c) {
  if (c.fled) return [c.escaped ? 'Got away' : 'Fled'];
  if (c.out) return [c.outReason === 'minion' ? 'Down' : c.outReason === 'asleep' ? 'Asleep' : c.outReason === 'paralyzed' ? 'Paralyzed' : 'Incapacitated'];
  const basic = activeConditions(c);
  const named = new Set();
  if (c.staggered && !c.out) named.add('Staggered');
  else if (c.dazed && !c.out) named.add('Dazed');
  if (c.fatigue === 1) named.add('Fatigued'); if (c.fatigue >= 2) named.add('Exhausted');
  if (c.grabbedBy) named.add(basic.has('Bound') ? 'Bound' : 'Restrained');
  for (const x of c.conditions) named.add(x.name);
  for (const n of ['Prone', 'Vulnerable', 'Defenseless', 'Hindered', 'Immobile', 'Impaired', 'Disabled', 'Stunned', 'Unaware']) if (basic.has(n) && ![...named].some((m) => (COMPOSITE[m] || []).includes(n))) named.add(n);
  return [...named];
}

export function checkPenalty(c) {
  const s = activeConditions(c);
  return (s.has('Disabled') ? 5 : s.has('Impaired') ? 2 : 0);
}

/** Did this attacker's feint leave the target vulnerable to them (DCA 64)? */
export function feintedBy(t, c) { return !!(t.feinted && c && t.feinted.by === c.id); }

/** Impaired or worse from any source (a demoralize, an Affliction, exhaustion). */
export function isImpaired(c) { const s = activeConditions(c); return s.has('Impaired') || s.has('Disabled'); }

/** Is this fighter under a Demoralize (Intimidation or Taunt)? */
export function isDemoralized(c) { return c.conditions.some((x) => x.source === 'demoralize'); }

/** The bonus an Aid gives c against this foe, for attack checks or for defense. Aids do not stack: the best one counts. */
export function aidBonus(c, foe, mode = 'attack') {
  let best = 0;
  for (const a of c.aid || []) if (foe && a.vs === foe.id && a.mode === mode && a.amount > best) best = a.amount;
  return best;
}

/** The defense an attack from `attacker` faces: a successful feint makes the target vulnerable to the feinter's next attack, and an Aid can add to it. */
export function defenseVs(t, which, attacker) {
  const v = defenseOf(t, which);
  const s = activeConditions(t);
  const base = feintedBy(t, attacker) && !s.has('Vulnerable') && !s.has('Defenseless') ? Math.ceil(v / 2) : v;
  return s.has('Defenseless') ? base : base + aidBonus(t, attacker, 'defense');
}

export function defenseOf(c, which) {
  const s = activeConditions(c);
  let v = (c.d.defenses[which] ?? 0) + c.defMod - (c.weakened[which] || 0);
  if (s.has('Defenseless')) return 0;
  if (s.has('Vulnerable') || c.aiming) v = Math.ceil(v / 2); // aiming leaves you vulnerable (DCA 175)
  return v;
}

export function resistOf(c, which) {
  const dd = c.d.defenses;
  if (which === 'Toughness') return Math.max(-5, dd.Toughness - c.bruises - c.nullified - (c.weakened.Toughness || 0) - (c.weakened.Strength ? Math.floor(c.weakened.Strength / 2) : 0)) - checkPenalty(c);
  if (which === 'Dodge' || which === 'Parry') return defenseOf(c, which) - checkPenalty(c);
  const v = dd[which];
  if (typeof v !== 'number') return null; // immune
  return v - (c.weakened[which] || 0) - checkPenalty(c);
}

export function canAct(c) {
  const s = activeConditions(c);
  if (c.out) return 'none';
  if (s.has('Stunned') || s.has('Unaware')) return 'none';
  if (c.surpriseActor) return 'standard'; // the surprise round: a standard action, or a move instead (DCA 167)
  if (s.has('Controlled')) return 'controlled';
  if (s.has('Dazed') || s.has('Compelled')) return 'standard';
  return 'full';
}
