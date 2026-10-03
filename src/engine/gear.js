// Equipment catalog: genre gear files (data/gear/*.json) merged with the book's equipment list,
// with search, pricing, and conversion to the sheet's equipment format.
//
// Pricing (DC Adventures Hero's Handbook ch. 7, "Equipment Cost", DCA 147):
//   an item costs equipment points (ep) equal to the power-point cost of its effects, so
//   Damage 3 = 3 ep, Ranged Damage 4 = 8 ep, Ranged Multiattack Damage 4 = 12 ep, Protection 2 = 2 ep.
//   Powers are priced by powerCost() (costs.js), Alternate Effects +1 ep each (DCA 147, "Alternate Equipment").
//   Features cost 1 ep per rank (DCA 148, "each of the following items is a rank 1 Feature").
//   Weapon qualities are Features too: +1 critical threat range = 1 ep (Improved Critical, DCA 150),
//   Improved Grab / Improved Trip = 1 ep each (DCA 151); Gadget Guides weapon qualities are 1 point
//   each (Dangerous, Defensive, Disarming, ... GG 10-11).
//   A partial extra (applied to only some ranks, e.g. the rocket launcher's Burst Area 7 on Damage 10,
//   DCA 152) costs its value x the ranks it covers.
//   Equipment never takes the Removable discount; that flaw is for devices (DCA 143).
//
// Devices (items with `device: 'removable' | 'easily'`) are priced in power points:
//   raw cost as above, minus 1 point per 5 (Removable) or 2 per 5 (Easily Removable), via deviceCost().
//   Enchanted weapons and armor are devices, not equipment (DCA 145, "Enhanced Equipment").

import { powerCost, deviceCost, modifierValue, equipmentRanksNeeded } from './costs.js';
import { describeEffect } from './render.js';
const clone = (x) => JSON.parse(JSON.stringify(x));
const lc = (s) => String(s ?? '').toLowerCase();

export const GEAR_GENRES = [
  { id: 'everyday', label: 'Everyday', blurb: 'Phones, tools, clothing and kits found in any modern city.' },
  { id: 'modern_weapons', label: 'Modern Weapons', blurb: 'Handguns, long guns, knives and less-lethal arms of the present day.' },
  { id: 'police_security', label: 'Police & Security', blurb: 'Duty gear for cops, guards, SWAT and corrections officers.' },
  { id: 'military', label: 'Military', blurb: 'Infantry weapons, explosives, body armor and field kit.' },
  { id: 'espionage', label: 'Espionage', blurb: 'Concealed weapons, bugs, disguises and infiltration tools.' },
  { id: 'medical', label: 'Medical', blurb: 'First aid, trauma kits, drugs and diagnostic gear.' },
  { id: 'survival_outdoors', label: 'Survival & Outdoors', blurb: 'Climbing, camping, diving, hunting and wilderness gear.' },
  { id: 'fantasy_medieval', label: 'Fantasy & Medieval', blurb: 'Mundane swords, axes, bows, polearms, shields and armor.' },
  { id: 'fantasy_magic', label: 'Fantasy Magic', blurb: 'Enchanted items, priced as Removable devices in power points.' },
  { id: 'sci_fi', label: 'Sci-Fi', blurb: 'Blasters, energy blades, powered armor, scanners and medkits.' },
  { id: 'space', label: 'Space', blurb: 'Vacuum suits, mag boots, jetpacks and zero-g tools.' },
  { id: 'steampunk_victorian', label: 'Steampunk & Victorian', blurb: 'Clockwork guns, gimmicked canes, aether gadgets and brass goggles.' },
  { id: 'wild_west', label: 'Wild West', blurb: 'Six-shooters, lever-action rifles, lariats and trail gear.' },
  { id: 'pulp_1930s', label: 'Pulp 1930s', blurb: 'Tommy guns, rocket packs, fedoras and two-fisted adventure kit.' },
  { id: 'cyberpunk', label: 'Cyberpunk', blurb: 'Smart guns, decks and cyberware (priced at full power cost).' },
  { id: 'post_apocalyptic', label: 'Post-Apocalyptic', blurb: 'Scrap weapons, rad gear and wasteland survival kit.' },
  { id: 'occult_mystic', label: 'Occult & Mystic', blurb: 'Mundane occult gear: talismans, ritual kits and ghost-hunting tools.' },
  { id: 'superhero_gadgets', label: 'Superhero Gadgets', blurb: 'Utility-belt items: grapnels, gas pellets, bolas, smoke and tracers.' },
];
const GENRE_BY_KEY = new Map(GEAR_GENRES.flatMap((g) => [[g.id, g], [lc(g.label), g]]));
export const gearGenre = (key) => GENRE_BY_KEY.get(lc(key)) || null;

// Genre for equipment.json items not already in a gear file.
const BOOK_CATEGORY_GENRE = [
  [/Archaic|Shield/, 'fantasy_medieval'], [/Exotic Melee|Simple Melee|Projectile|Thrown|Accessory/, 'modern_weapons'],
  [/Energy/, 'sci_fi'], [/Heavy|Grenade|Explosive/, 'military'], [/Modern Armor/, 'police_security'],
  [/Utility Belt/, 'superhero_gadgets'], [/Criminal|Surveillance/, 'espionage'], [/Survival/, 'survival_outdoors'],
];

const slug = (s) => lc(s).replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const featureRanks = (f) => (typeof f === 'string' ? 1 : (f.ranks ?? 1));
const featureName = (f) => (typeof f === 'string' ? f : f.name);
const CRIT_FEATURE = /^(Improved Critical|Dangerous)\b/i;

/** Normalize a power into engine format (missing modifier lists become empty arrays). */
function normPower(p) {
  const out = { extras: [], flaws: [], ...clone(p) };
  if (out.alternates) out.alternates = out.alternates.map(normPower);
  if (out.linked) out.linked = out.linked.map(normPower);
  return out;
}

/** Cost breakdown of an item: { raw, cost, unit }. Equipment is in ep, devices in pp. */
export function gearItemCost(item, R) {
  const powers = item.powers || [];
  const featureCost = (item.features || []).reduce((s, f) => s + featureRanks(f), 0);
  const partialCost = (item.partials || []).reduce(
    (s, m) => s + m.ranks * modifierValue(m, R.modifier('extra', m.name, m.effect || 'Damage')), 0);
  const powerTotal = powers.reduce((s, p) => s + powerCost(p, R), 0);
  const raw = powerTotal + featureCost + partialCost;
  if (item.device) {
    const flat = featureCost + partialCost;
    const asPowers = flat ? [...powers, { effect: 'Feature', rank: flat, extras: [], flaws: [] }] : powers;
    const d = deviceCost({ kind: item.device === 'easily' ? 'easily' : 'removable', powers: asPowers }, R);
    return { raw: d.raw, cost: d.total, unit: 'pp' };
  }
  return { raw, cost: raw, unit: 'ep' };
}

/** Critical threat floor: 20 minus Improved Critical / Dangerous ranks bought as features. */
function critOf(features) {
  const ranks = (features || []).filter((f) => CRIT_FEATURE.test(featureName(f))).reduce((s, f) => s + featureRanks(f), 0);
  return 20 - ranks;
}

/** The attack the sheet tracks: the first non-Area Damage effect (derive.js reads only Damage). */
function attackOf(powers, features, R) {
  for (const p of powers || []) {
    if (!['Damage', 'Strike', 'Blast'].includes(p.effect)) continue;
    if ((p.extras || []).some((m) => m.name === 'Area')) continue;
    const range = p.range || R.effect(p.effect).range;
    return { kind: range === 'Close' ? 'close' : 'ranged', rank: p.rank, strengthBased: !!p.strengthBased, crit: critOf(features) };
  }
  return null;
}

function protectionOf(powers) {
  return (powers || []).filter((p) => p.effect === 'Protection').reduce((s, p) => s + (p.rank || 0), 0);
}

function featureText(f) {
  const n = featureRanks(f);
  const name = featureName(f);
  const detail = typeof f === 'string' ? null : f.detail;
  if (/^Improved Critical$/i.test(name)) return `Improved Critical ${n} (${20 - n}-20)`;
  return `${name}${n > 1 || name === 'Feature' ? ` ${n}` : ''}${detail ? ` (${detail})` : ''}`;
}

/** Book-style effect text from powers, partial extras and features. */
export function gearEffectText(item, R) {
  const parts = [];
  for (const p of item.powers || []) {
    let s = describeEffect(p, R);
    for (const a of p.alternates || []) s += `; AE: ${a.name ? `${a.name}: ` : ''}${describeEffect(a, R)}`;
    parts.push(s);
  }
  for (const m of item.partials || []) parts.push(`${m.option ? `${m.option} ` : ''}${m.name} ${m.ranks} (on ${m.ranks} ranks)`);
  for (const f of item.features || []) parts.push(featureText(f));
  return parts.join(', ');
}

/**
 * Build a complete catalog item from a spec, pricing it by the rules.
 * spec: { name, genre, category, powers, features, partials, device, effect?, tags, summary, source, notes, bookCost }
 */
export function buildGearItem(R, spec) {
  const powers = (spec.powers || []).map(normPower);
  const item = {
    id: spec.id || slug(spec.name),
    name: spec.name,
    genre: spec.genre || 'Custom',
    category: spec.category || 'Gear',
  };
  item.effect = '';
  if (powers.length) item.powers = powers;
  if (spec.features?.length) item.features = clone(spec.features);
  if (spec.partials?.length) item.partials = clone(spec.partials);
  if (spec.device) item.device = spec.device === 'easily' ? 'easily' : 'removable';
  item.effect = spec.effect || gearEffectText(item, R);
  const attack = spec.attack === false ? null : attackOf(powers, spec.features, R);
  if (attack && !item.device) item.attack = attack;
  const prot = protectionOf(powers);
  if (prot && !item.device) item.protection = prot;
  const c = gearItemCost(item, R);
  item.cost = c.cost;
  if (item.device) { item.costUnit = 'pp'; item.rawCost = c.raw; }
  if (spec.bookCost != null) item.bookCost = spec.bookCost;
  item.tags = [...new Set((spec.tags || []).map(lc))];
  item.summary = spec.summary || '';
  if (spec.notes) item.notes = spec.notes;
  item.source = spec.source || 'DCUGen';
  return item;
}

/** Convert an equipment.json entry (no engine powers) into a catalog item, keeping its printed cost. */
function bookItem(it, genreId) {
  const g = gearGenre(genreId);
  const out = {
    id: slug(it.name), name: it.name, genre: g.label, category: it.category, effect: it.effect, cost: it.cost,
    tags: [], summary: it.notes || '', source: it.source || 'DCA', bookCost: it.cost,
  };
  const prot = /Protection (\d+)/.exec(it.effect || '');
  if (prot && /Armor/.test(it.category || '')) out.protection = Number(prot[1]);
  const dmg = /(Ranged )?(?:Multiattack )?Damage (\d+)/.exec(it.effect || '');
  if (dmg && !/Area/.test(it.effect)) out.attack = { kind: dmg[1] ? 'ranged' : 'close', rank: Number(dmg[2]), strengthBased: !!it.strength_based, crit: it.crit ?? 20 };
  return out;
}

const CATALOG_CACHE = new WeakMap();

/** Every catalog item: gear files first, then any equipment.json weapon/armor/gear not already listed (vehicles excluded). */
export function gearCatalog(R) {
  if (CATALOG_CACHE.has(R)) return CATALOG_CACHE.get(R);
  const out = [];
  const seen = new Set();
  const files = R.raw?.gear || {};
  const order = [...GEAR_GENRES.map((g) => g.id), ...Object.keys(files).filter((k) => !gearGenre(k))];
  for (const id of order) {
    for (const it of files[id] || []) {
      const key = lc(it.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const g = gearGenre(id) || gearGenre(it.genre);
      out.push({ ...it, genre: it.genre || g?.label || id, genreId: g?.id || id });
    }
  }
  const eq = R.raw?.equipment || {};
  for (const it of [...(eq.weapons || []), ...(eq.armor || []), ...(eq.gear || [])]) {
    if (/Vehicle/.test(it.category || '')) continue;
    const key = lc(it.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const genreId = BOOK_CATEGORY_GENRE.find(([re]) => re.test(it.category || ''))?.[1] || 'everyday';
    out.push({ ...bookItem(it, genreId), genreId });
  }
  CATALOG_CACHE.set(R, out);
  return out;
}

/**
 * Search the catalog. All filters are optional:
 *   q: words matched against name (weighted), tags, category, effect, summary
 *   genre: genre id or label; category: substring; maxCost: cost ceiling (ep, or pp for devices);
 *   tags: array, all must match; kind: 'equipment' | 'device'
 * With a query, results are sorted by relevance; otherwise by genre, category, cost and name.
 */
export function searchGear(R, { q = '', genre, category, maxCost, tags, kind } = {}) {
  const words = lc(q).split(/\s+/).filter(Boolean);
  const g = genre ? gearGenre(genre) : null;
  const tagList = (Array.isArray(tags) ? tags : tags ? [tags] : []).map(lc);
  const genreRank = new Map(GEAR_GENRES.map((x, i) => [x.id, i]));
  const hits = [];
  for (const it of gearCatalog(R)) {
    if (genre && it.genreId !== (g?.id ?? genre)) continue;
    if (category && !lc(it.category).includes(lc(category))) continue;
    if (maxCost != null && it.cost > maxCost) continue;
    if (kind === 'device' && !it.device) continue;
    if (kind === 'equipment' && it.device) continue;
    if (tagList.length && !tagList.every((t) => (it.tags || []).includes(t))) continue;
    let score = 0;
    if (words.length) {
      const name = lc(it.name);
      const fields = [lc((it.tags || []).join(' ')), lc(it.category), lc(it.effect), lc(it.summary), lc(it.genre)];
      let all = true;
      for (const w of words) {
        let s = 0;
        if (name === w) s += 12;
        else if (name.startsWith(w)) s += 8;
        else if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)) s += 6;
        else if (name.includes(w)) s += 4;
        if ((it.tags || []).includes(w)) s += 3;
        if (fields.some((f) => f.includes(w))) s += 1;
        if (!s) { all = false; break; }
        score += s;
      }
      if (!all) continue;
      if (lc(it.name) === lc(q).trim()) score += 20;
    }
    hits.push({ it, score });
  }
  hits.sort((a, b) => (b.score - a.score)
    || (words.length ? 0 : (genreRank.get(a.it.genreId) ?? 99) - (genreRank.get(b.it.genreId) ?? 99))
    || (words.length ? 0 : lc(a.it.category).localeCompare(lc(b.it.category)))
    || (a.it.cost - b.it.cost) || a.it.name.localeCompare(b.it.name));
  return hits.map((h) => h.it);
}

/** The object to push onto ch.equipment (same shape as the sheet's equipment picker builds). */
export function gearToEquipment(item) {
  if (item.device) throw new Error(`${item.name} is a device (power points); use gearToDevice()`);
  const out = { name: item.name, cost: item.cost, effect: item.effect };
  if (item.protection) out.protection = item.protection;
  if (item.attack) out.attack = { ...item.attack };
  if (item.category) out.category = item.category;
  if (item.id) out.gearId = item.id;
  return out;
}

/** The object to push onto ch.devices for a device item (features become a Feature power). */
export function gearToDevice(item) {
  const flat = (item.features || []).reduce((s, f) => s + featureRanks(f), 0);
  const powers = clone(item.powers || []);
  if (flat) powers.push({ name: 'Features', effect: 'Feature', rank: flat, detail: (item.features || []).map(featureName).join(', '), extras: [], flaws: [] });
  return { name: item.name, kind: item.device === 'easily' ? 'easily' : 'removable', powers, notes: item.summary || '' };
}

/**
 * A self-made item priced by the rules: powers via powerCost, features 1 ep per rank,
 * protection 1 ep per rank (added as a Protection power).
 * features: strings or { name, ranks }. Pass device: 'removable' | 'easily' to price it as a device.
 */
export function customItem(R, { name = 'Custom Item', genre = 'Custom', category = 'Gear', powers = [], features = [], protection = 0, notes, tags, summary, device } = {}) {
  const list = [...powers];
  if (protection > 0) list.push({ name: 'Armor', effect: 'Protection', rank: protection });
  return buildGearItem(R, {
    name, genre, category, powers: list, features, device, notes,
    tags: tags || ['custom'], summary: summary || notes || '', source: 'Custom',
  });
}

/** Equipment advantage rank needed for the character's equipment (5 ep per rank). */
export function equipmentRankFor(ch) {
  return equipmentRanksNeeded(ch);
}
