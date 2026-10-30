// Immunity (DCA 102-104): what a fighter's Immunity powers (and absent abilities) make it ignore, read from the
// power's detail text, and whether an attack, a critical hit, an interaction skill or a hold is one of them.
//
// Book ranks (DCA 102): 1 a rare descriptor (your own powers), one environment, one type of suffocation, aging,
// disease, poison; 2 critical hits, all suffocation, an uncommon descriptor; 5 alteration, dazzle, emotion,
// entrapment, fatigue, interaction skills, or a particular Damage effect ("cold damage"); 10 a common descriptor
// (all effects with it) and life support; 20 a very common descriptor (bludgeoning, energy); 30 all Fortitude or
// all Will effects; 80 all Toughness effects. "Degrees of Immunity" (DCA 103): cold at 1 rank is the environment only,
// at 5 ranks cold Damage only, at 10 ranks every cold effect.
// Where the detail says "damage" or "effects" that wins. A bare common descriptor ("fire") is read from the
// power's rank per item: under 5 the environment only, 5 to 9 Damage only, 10 or more every effect.
// Limited to Half Effect marks the entry half (the effect lands at half rank).

import { allPowers } from '../derive.js';
import { hasExtra } from './util.js';
import { canonical, isCommon, sourceDescriptors } from './descriptors.js';
import { insubEntries, entraps } from './insubstantial.js';

const damaging = (atk) => atk.effect === 'Damage' || atk.effect === 'Mental Blast';
const tierNames = (atk) => (atk.tiers || []).flat();
const textOf = (atk) => `${atk.name} ${atk.power?.detail || ''}`.toLowerCase();
const GENERIC = new Set(['weapon', 'unarmed', 'physical', 'energy', 'bludgeoning', 'ballistic']); // everyone has these: not "your own"

/** Every kind of immunity that is not a plain descriptor: the words that name it, and what in an attack it stops. */
const KINDS = [
  { re: /^(need for|starv|thirst|hunger|high pressure|pressure|vacuum)|^(the )?(environment|environmental)/, label: null, environment: true },
  { re: /critical/, label: 'critical hits', flags: { crit: true } },
  { re: /life support/, label: 'life support', hits: (a) => a.effect === 'Suffocation' || has(a, ['disease', 'poison']) || rawHas(a, /toxin|vacuum|suffocat|drown|asphyx/) }, // the environment itself (cold, heat, radiation) is not an attack
  { re: /interaction|social skill|persuasion|deception|intimidat/, label: 'interaction skills', flags: { interaction: true } },
  { re: /\bfear|terror|cowardice/, label: 'fear', flags: { fear: true }, hits: (a) => a.fear || has(a, ['emotion']) },
  { re: /emotion/, label: 'emotion effects', hits: (a) => a.fear || has(a, ['emotion']) },
  { re: /entrap|grappl|snare|\bbond|restrain|\bgrab|\bholds?\b|binding/, label: 'entrapment (holds, snares and bonds)', flags: { grab: true }, hits: (a) => entraps(a) },
  { re: /alteration|transform|shrink|morph/, label: 'alteration effects', hits: (a) => ['Transform', 'Shrinking', 'Morph'].includes(a.effect) || tierNames(a).includes('Transformed') },
  { re: /dazzle|sensory|sensor|blind|deaf|vision|sight|hearing|visual|auditory|olfactory|smell|tactile|taste/, label: 'sensory effects', hits: (a, w) => sensory(a, w) },
  { re: /fatigue|exhaust/, label: 'fatigue effects', hits: (a) => tierNames(a).some((n) => ['Fatigued', 'Exhausted'].includes(n)) },
  { re: /\bsleep/, label: 'sleep', hits: (a) => a.effect === 'Sleep' || tierNames(a).includes('Asleep') },
  { re: /suffocat|breath|drown|asphyx|underwater|atmosphere/, label: 'suffocation', hits: (a) => a.effect === 'Suffocation' || has(a, ['drowning']) || rawHas(a, /suffocat|drown|asphyx/) },
  { re: /mind reading|read(ing)? minds?/, label: 'mind reading', hits: (a) => a.effect === 'Mind Reading' },
];
const has = (a, list) => list.some((d) => (a.descriptors || []).includes(d));
const rawHas = (a, re) => (a.descriptors || []).some((d) => re.test(d));

/** An Affliction or Dazzle that takes a sense; a sense named in the detail narrows it (sight unless it says hearing). */
function sensory(atk, wanted) {
  const isSense = atk.effect === 'Dazzle' || atk.effect === 'Illusion' || tierNames(atk).some((n) => ['Blind', 'Deaf'].includes(n));
  if (!isSense) return false;
  const hearing = /hearing|auditory|deaf|sound/;
  const wantEar = hearing.test(wanted); const wantEye = /vision|sight|visual|blind/.test(wanted);
  if (!wantEar && !wantEye) return true;
  const ear = hearing.test(textOf(atk)) || tierNames(atk).includes('Deaf');
  return wantEar ? ear : !ear;
}

/** Split an immunity's detail into its items, handing a trailing "damage" or "effects" to items that have none. */
function itemsOf(detail) {
  const parts = detail.split(/,|;|\band\b|\/|\+/).map((x) => x.trim()).filter(Boolean);
  const end = /\b(damage|attacks?)\b/.test(parts.at(-1) || '') ? 'damage' : /\beffects?\b/.test(parts.at(-1) || '') ? 'effects' : '';
  return parts.map((x) => (end && !/\b(damage|attacks?|effects?)\b/.test(x) ? `${x} ${end}` : x));
}

/** The descriptors a fighter's own powers carry (without the generic families): "your own powers" (DCA 102, 1 rank). */
function ownDescriptors(ch) {
  const set = new Set(sourceDescriptors(ch).always);
  for (const { power: p } of allPowers(ch, { includeAlternates: true })) {
    if (p.effect === 'Immunity') continue;
    for (const x of [...(p.descriptors || []), p.name]) for (const d of canonical(x)) set.add(d);
  }
  return [...set].filter((d) => !GENERIC.has(d));
}

/** The immunity entry for one item of an Immunity power, or null. per: ranks spent per item; half: Limited to Half Effect. */
function entryFor(item, per, half, ownSet) {
  const q = /\b(damage|attacks?)\b/.test(item) ? 'damage' : /\beffects?\b/.test(item) ? 'all' : null;
  const core = item.replace(/\b(damage|attacks?|effects?|immunity to|immune to|resisted by|any|all|the|to)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const base = { half, rank: per };
  if (/fortitude/.test(item)) return { ...base, label: 'Fortitude effects', hits: (a) => String(a.resistance).toLowerCase() === 'fortitude' };
  if (/\bwill\b/.test(item)) return { ...base, label: 'Will effects', hits: (a) => String(a.resistance).toLowerCase() === 'will' };
  if (/\btoughness\b|\ball (damage|attacks)\b|\bdamage \(all\)/.test(item)) return { ...base, label: 'all damage', hits: (a) => damaging(a) };
  for (const k of KINDS) {
    if (!k.re.test(core) && !k.re.test(item)) continue;
    if (k.environment) return { ...base, label: `${item} (the environment only)`, environment: true };
    return { ...base, label: k.label, ...(k.flags || {}), hits: k.hits ? (a) => k.hits(a, item) : null };
  }
  if (/\b(own|my|his|her) (own )?(powers?|effects?)\b|\bown (powers?|effects?)\b|\bself\b/.test(item)) return ownEntry(base, ownSet);
  return descriptorEntry(core || item, q, per, base);
}

/** "Your own powers" (1 rank): every effect that shares a descriptor with the fighter's own powers. */
function ownEntry(base, ownSet) {
  const mine = new Set(ownSet);
  return { ...base, label: 'its own powers', hits: (a) => (a.descriptors || []).find((d) => mine.has(d)) };
}

/** An Immunity to a descriptor: how much it stops depends on the words and on the ranks spent on it. */
function descriptorEntry(core, q, per, base) {
  const names = canonical(core);
  const words = names.length ? names : [core];
  let scope = q || 'all';
  if (!q && names.length && names.every(isCommon) && !/\b(physical|energy)\b/.test(core)) scope = per >= 10 ? 'all' : per >= 5 ? 'damage' : 'environment';
  const label = `${words.filter((w, i) => words.indexOf(w) === i).join(' / ')} ${scope === 'damage' ? 'damage' : scope === 'environment' ? '(the environment only)' : 'effects'}`;
  if (scope === 'environment') return { ...base, label, environment: true };
  return { ...base, label, hits: (a) => descriptorHit(a, words, scope === 'damage') };
}

/** The attack's descriptor that the immunity names, or null; Damage only when scope is damage. */
function descriptorHit(atk, words, damageOnly) {
  if (damageOnly && !damaging(atk)) return null;
  for (const d of atk.descriptors || []) {
    if (d.length <= 2 || d === 'variable') continue;
    if (words.some((w) => w === d || (w.length > 2 && !canonical(w).length && (w.includes(d) || d.includes(w))))) return d;
  }
  return null;
}

/**
 * What a fighter is immune to: entries { label, half, hits(atk), crit, interaction, fear, grab, environment }. From
 * Immunity powers and from abilities the fighter lacks (no Stamina: Fortitude; no Intellect and Presence: Will).
 */
export function immunitiesOf(ch, d) {
  const out = [];
  if (d.defenses.immune?.Fortitude) out.push({ label: 'Fortitude effects (no Stamina)', hits: (a) => String(a.resistance).toLowerCase() === 'fortitude' });
  if (d.defenses.immune?.Will) out.push({ label: 'Will effects (no mind)', hits: (a) => String(a.resistance).toLowerCase() === 'will' });
  const ownSet = ownDescriptors(ch);
  for (const { power: p } of allPowers(ch, { includeAlternates: false })) {
    if (p.effect !== 'Immunity' || !p.detail) continue;
    const half = (p.flaws || []).some((f) => /half effect/i.test(f.name || f));
    const items = itemsOf(String(p.detail).toLowerCase());
    const per = (p.rank || 1) / Math.max(1, items.length);
    const reflect = hasExtra(p, 'Reflect'); // sends back the attacks it stops (DCA 102); Redirect needs Reflect
    for (const item of items) { const e = entryFor(item, per, half, ownSet); if (e) out.push(reflect ? { ...e, reflect, redirect: hasExtra(p, 'Redirect') } : e); }
  }
  return out;
}

/** The reason an entry stops this attack, or null. */
function reasonOf(e, atk, target) {
  if (!e.hits) return null;
  const hit = e.hits(atk, target);
  if (!hit) return null;
  return `immune to ${e.label}${typeof hit === 'string' && hit !== e.label ? ` (the attack is ${hit})` : ''}`;
}

/**
 * Is the target immune to this attack? Returns the reason, or null. wantHalf looks only at Limited to Half Effect
 * immunities, which halve the rank instead of stopping the attack.
 */
export function immunityMatch(target, atk, wantHalf) { return immunityHit(target, atk, wantHalf)?.why || null; }

/** The same, with the immunity that did it: { why, entry } (entry is null for Fearless). */
export function immunityHit(target, atk, wantHalf = false) {
  for (const e of [...(target.immune || []), ...insubEntries(target)]) {
    if (!!e.half !== wantHalf) continue;
    const why = reasonOf(e, atk, target);
    if (why) return { why, entry: e };
  }
  if (!wantHalf && atk.fear && target.adv?.Fearless) return { why: 'Fearless', entry: null };
  return null;
}

const whole = (t, key) => (t.immune || []).find((e) => e[key] && !e.half);
/** Immune to critical hits (2 ranks)? Returns the immunity or null. */
export const critImmune = (t) => whole(t, 'crit') || null;
/** Immune to interaction skills (5 ranks): Deceive, Intimidate, feints and demoralizing fail. */
export const interactionImmune = (t) => whole(t, 'interaction') || null;
/** Immune to entrapment (5 ranks): cannot be grabbed, snared or bound. */
export const holdImmune = (t) => whole(t, 'grab') || null;
/** Cannot be held: immune to entrapment, or in any Insubstantial form (a fluid form flows out of a hold, DCA 103). */
export const slipsHold = (t) => !!(holdImmune(t) || t.insub);
/** Immune to fear (Fearless, or an Immunity to fear). */
export const fearImmune = (t) => !!whole(t, 'fear');

/** The fighter's immunities in plain words, for the Battle Room and the log. */
export function describeImmunities(c) {
  // One line per immunity: "Fortitude effects (no Stamina)" and an Immunity power to Fortitude effects are the same,
  // and a full immunity outranks a half-effect one to the same thing.
  const byKey = new Map();
  for (const e of [...(c.immune || []), ...insubEntries(c)]) {
    const key = e.label.replace(/ \([^)]*\)$/, '');
    const had = byKey.get(key);
    if (!had || (had.half && !e.half)) byKey.set(key, e);
  }
  return [...byKey.values()].map((e) => `${e.label}${e.half ? ' (half effect)' : ''}`);
}

