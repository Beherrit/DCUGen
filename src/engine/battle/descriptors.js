// Descriptors: what an attack is made of (fire, cold, magic, bullets, psychic...), for Immunity, Insubstantial and
// Variable Descriptor to key off. DC Adventures has no fixed damage types: every effect carries descriptors (DCA 103).
//
// One table holds every descriptor the engine knows: the words that name it, its family and how common it is.
// The two families are the book's own (Insubstantial ranks 2-4 and Immunity to "physical damage", DCA 103-104):
// physical and energy. Magic and psychic are neither by themselves.
//
// house rule: the book names no list of descriptors and does not say which family earth, water, metal, plant, wind,
// acid, poison and disease belong to. Here earth, water, metal and plant are matter (physical); wind, acid, poison and
// disease are neither physical nor energy.

// d: the canonical name; fam: 'physical' | 'energy' | null; re: words that name it; common: a common descriptor, so
// an Immunity to it bought for few ranks covers less (see immunity.js).
const TABLE = [
  { d: 'bludgeoning', fam: 'physical', re: /\b(bludgeon|punch|fist|club\b|hammer|slam|blunt|kick|crush|mace|smash|pummel|thrown|boulder)/ },
  { d: 'slashing', fam: 'physical', re: /\b(slash|blade|sword|axe|claw|talon|knife|cleave|scythe|razor)/ },
  { d: 'piercing', fam: 'physical', re: /\b(pierc|spear|arrow|fang|bite|horn|stab|dart|thorn|stinger|dagger)/ },
  { d: 'ballistic', fam: 'physical', common: true, re: /\b(bullet|ballistic|gun\b|guns\b|pistol|rifle|firearm|shotgun|projectile|machine gun)/ },
  { d: 'unarmed', fam: 'physical', re: /\bunarmed\b/ },
  { d: 'weapon', fam: null, re: /\bweapon\b/ }, // any held weapon, a blaster too: not physical by itself
  { d: 'earth', fam: 'physical', re: /\b(earth|stone|rock|boulder|quake|seismic|sand)/ },
  { d: 'water', fam: 'physical', re: /\b(water|ocean|aqua|hydro|torrent|flood)/ },
  { d: 'metal', fam: 'physical', re: /\b(metal|steel|iron\b)/ },
  { d: 'plant', fam: 'physical', re: /\b(plant|vine|thorns|root|nature|leaf|forest)/ },
  { d: 'fire', fam: 'energy', common: true, re: /(\bfire(?!arm)|hellfire|wildfire|\bflam|\bblaze|\bburn|inferno|incinerat|pyro|\bember|\bcinder)/ },
  { d: 'heat', fam: 'energy', common: true, re: /\b(heat|thermal|scorch|molten|lava|magma|\bsear(ing)?\b)/ },
  { d: 'cold', fam: 'energy', common: true, re: /\b(cold|ice\b|icy|frost|freez|chill|glacial|blizzard|snow|frozen)/ },
  { d: 'electricity', fam: 'energy', common: true, re: /\b(electric|lightning|shock|spark|static|volt|taser|thunderbolt)/ },
  { d: 'sonic', fam: 'energy', common: true, re: /\b(sonic|sound|scream|shriek|banshee|boom|thunderclap)/ },
  { d: 'vibration', fam: 'energy', re: /\bvibrat/ },
  { d: 'light', fam: 'energy', re: /\b(light\b|photon|solar|radiance|prism|flash|luminous|sunbeam)/ },
  { d: 'laser', fam: 'energy', re: /\b(laser|blaster|beam)/ },
  { d: 'darkness', fam: 'energy', re: /\b(dark|shadow|umbral|gloom|midnight)/ },
  { d: 'radiation', fam: 'energy', common: true, re: /\b(radiat|nuclear|atomic|gamma|irradiat|radioactive)/ },
  { d: 'cosmic', fam: 'energy', re: /\b(cosmic|stellar|star\b|astral)/ },
  { d: 'gravity', fam: 'energy', re: /\b(gravit|graviton)/ },
  { d: 'magnetism', fam: 'energy', re: /\b(magnet|electromagnet)/ },
  { d: 'force', fam: 'energy', re: /\b(force\b|kinetic|concussive|shockwave|repulsor)/ },
  { d: 'plasma', fam: 'energy', re: /\bplasma\b/ },
  { d: 'energy', fam: 'energy', re: /\b(energy|power bolt)/ },
  { d: 'wind', fam: null, common: true, re: /\b(wind|gale|tornado|cyclone|storm|hurricane|weather|air blast|gust)/ },
  { d: 'acid', fam: null, re: /\b(acid|corros|caustic|chemical)/ },
  { d: 'poison', fam: null, re: /\b(poison|toxin|toxic|venom|noxious)/ },
  { d: 'disease', fam: null, re: /\b(disease|plague|infect|virus|contagion|rot\b)/ },
  { d: 'magic', fam: null, common: true, re: /\b(magic|mystic|arcane|spell|sorcer|eldritch|hex\b|curse|enchant|occult|witch|wizard)/ },
  { d: 'necromantic', fam: null, re: /\b(necromanc|undead|death|spectral|soul|grave)/ },
  { d: 'psychic', fam: null, re: /\b(psychic|mental|telepath|mind|psionic|telekin)/ },
  { d: 'emotion', fam: null, re: /\b(emotion|fear|terror|despair|rage|love\b|joy|dread|cowering)/ },
  { d: 'technology', fam: null, re: /\b(technolog|techno|cyber|nano|power armor|super-science|gadget|robot)/ },
];
const BY_NAME = Object.fromEntries(TABLE.map((t) => [t.d, t]));
export const PHYSICAL = new Set(TABLE.filter((t) => t.fam === 'physical').map((t) => t.d));
export const ENERGY = new Set(TABLE.filter((t) => t.fam === 'energy').map((t) => t.d));

// Variable Descriptor (DCA 133): rank 1 changes within a closely related group, rank 2 within a broad one.
// house rule: the book leaves the groups to the GM; these are the ones the engine uses.
const CLOSE_GROUPS = [
  ['fire', 'heat', 'cold'], ['wind', 'cold', 'electricity', 'water'], ['electricity', 'light', 'laser', 'magnetism', 'radiation'],
  ['sonic', 'vibration'], ['earth', 'metal', 'plant', 'water'], ['bludgeoning', 'slashing', 'piercing', 'ballistic'],
  ['acid', 'poison', 'disease'], ['psychic', 'emotion'], ['light', 'darkness'], ['gravity', 'force', 'cosmic'],
  ['magic', 'necromantic'], ['laser', 'plasma', 'energy'],
];
const BROAD_GROUPS = [
  ['psychic', 'emotion'], ['magic', 'necromantic'],
  ['technology', 'laser', 'plasma', 'electricity', 'magnetism', 'radiation', 'sonic', 'vibration'],
  ['fire', 'heat', 'cold', 'electricity', 'wind', 'water', 'earth', 'plant', 'metal', 'light', 'darkness', 'sonic'],
  [...PHYSICAL], [...ENERGY],
];

/** The canonical descriptors a word or phrase names (empty when it names none the table knows). */
export function canonical(text) {
  const s = String(text || '').toLowerCase();
  return TABLE.filter((t) => t.d === s || t.re.test(s)).map((t) => t.d);
}
export const isCommon = (d) => !!BY_NAME[d]?.common;
export const familyOf = (d) => BY_NAME[d]?.fam || null;

/** The descriptors a Variable Descriptor of this size (1 close, 2 broad) could switch an attack to, besides its own. */
export function variants(descriptors, size) {
  const groups = size >= 2 ? BROAD_GROUPS : CLOSE_GROUPS;
  const mine = new Set(descriptors);
  const out = [];
  for (const g of groups) if (g.some((x) => mine.has(x))) for (const x of g) if (!mine.has(x) && !out.includes(x)) out.push(x);
  return out;
}

/** A descriptor list with its family words added: "fire" is also "energy"; "bludgeoning" is also "physical". */
export function withFamilies(list) {
  const out = new Set(list);
  for (const d of list) { const f = familyOf(d); if (f) out.add(f); }
  return [...out];
}

const ownOf = (p) => (p?.descriptors || []).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
const known = (list) => list.some((x) => canonical(x).length);

// Powers whose whole kit shares a descriptor, from the character's theme (power source): every power attack has it.
const SOURCES = { magic: 'magic', psychic: 'psychic', tech: 'technology', cosmic: 'cosmic', death: 'necromantic', radiation: 'radiation' };
// An elemental theme's own descriptor, used when a power attack has none it can be read from.
const ELEMENTS = { fire: 'fire', ice: 'cold', electric: 'electricity', earth: 'earth', air: 'wind', water: 'water', light: 'light', shadow: 'darkness', sonic: 'sonic', gravity: 'gravity', magnetism: 'magnetism', plant: 'plant' };

/**
 * The character's power source: descriptors every power of the kit carries (a magician's spells are all magic) and the
 * theme's element to fall back on. Reads the optional ch.descriptors list (words), then the theme and the origin.
 */
export function sourceDescriptors(ch) {
  const always = new Set(); let element = null;
  for (const w of ch?.descriptors || []) for (const d of canonical(w)) always.add(d);
  for (const t of [ch?.theme, ch?.theme?.secondary]) {
    if (t?.id && SOURCES[t.id]) always.add(SOURCES[t.id]);
    if (t?.id && ELEMENTS[t.id] && !element) element = ELEMENTS[t.id];
  }
  const origin = canonical(ch?.origin?.label).filter((d) => d === 'magic' || d === 'technology');
  for (const d of origin) always.add(d);
  return { always: [...always], element };
}

/** Words in a power's or attack's name and detail that name descriptors ("Flame Burst" is fire). */
export function inferFromText(text) {
  const out = [];
  for (const d of canonical(text)) if (!out.includes(d)) out.push(d);
  return out.some((d) => ENERGY.has(d)) ? out.filter((d) => d !== 'ballistic') : out; // a blaster rifle is not a rifle
}

/**
 * An attack's descriptors: its power's own, else its array's or parent power's, else what its name and detail say,
 * plus the character's power source, a device's technology and a Magic effect's magic. Fists, claws, thrown cars and
 * weapons are physical (and a weapon is a weapon). Ends with the family words (physical, energy).
 * where: { alternateOf, linkedTo, device } from allPowers().
 */
export function attackDescriptors(R, ch, a, p, where = {}) {
  const set = new Set();
  const add = (list) => { for (const x of list) { const c = canonical(x); if (c.length) c.forEach((k) => set.add(k)); else set.add(x); } };
  add(ownOf(p));
  if (p && !known(ownOf(p))) for (const q of [where.alternateOf, where.linkedTo]) if (q && known(ownOf(q))) add(ownOf(q));
  if (p && !known([...set])) add(inferFromText(`${p.name} ${p.detail || ''} ${a.name}`));
  if (!p) add(equipmentWords(R, ch, a));
  if (p) addSource(set, ch, p, where);
  if (a.name === 'Unarmed') { set.add('bludgeoning'); set.add('unarmed'); }
  if (a.equipment) set.add('weapon');
  if (['Mind Control', 'Mental Blast'].includes(a.effect)) set.add('psychic');
  guessPhysical(set, a, p);
  if (/gun|pistol|rifle|bullet/i.test(a.name) && ![...set].some((d) => ENERGY.has(d))) set.add('ballistic');
  return withFamilies([...set]);
}

/** The power source, a device's technology and a Magic effect's magic go on a power's attacks. */
function addSource(set, ch, p, where) {
  const src = sourceDescriptors(ch);
  for (const d of src.always) set.add(d);
  if (src.element && ![...set].some((x) => BY_NAME[x])) set.add(src.element);
  if (where.device && ![...set].some((x) => x === 'magic')) { for (const d of ownOf(where.device)) if (canonical(d).length) set.add(canonical(d)[0]); set.add('technology'); }
  if (p.effect === 'Magic' || where.alternateOf?.effect === 'Magic') set.add('magic');
}

/** A weapon's descriptors from the equipment list (its damage type) and its name and category. */
function equipmentWords(R, ch, a) {
  const row = (R?.raw?.equipment?.weapons || []).find((w) => w.name.toLowerCase() === a.name.toLowerCase());
  const item = (ch.equipment || []).find((i) => i.name === a.name);
  return inferFromText(`${a.name} ${row?.damage_type || ''} ${row?.category || item?.category || ''} ${(item?.descriptors || []).join(' ')}`);
}

/** Fists, claws and swung or thrown things are physical unless they are plainly something else. */
function guessPhysical(set, a, p) {
  const other = [...set].some((x) => BY_NAME[x] && BY_NAME[x].fam !== 'physical' && x !== 'weapon');
  const strengthBased = a.name === 'Unarmed' || (a.kind === 'close' && !p) || (p && a.effect === 'Damage' && /strength/i.test(`${p.name} ${p.detail || ''}`));
  const named = p && /punch|fist|claw|bite|kick|strike|club|blade|sword|bullet|gun|arrow|projectile|thrown|slam|tail|horn|talon|fang/i.test(`${p.name} ${a.name}`);
  if (!other && a.effect === 'Damage' && (strengthBased || a.equipment || named)) set.add('physical');
}

/** The descriptors to show a player: no family words that repeat a more exact one. */
export function showDescriptors(list) {
  const l = (list || []).filter((x) => x !== 'variable');
  const exact = l.filter((x) => x !== 'physical' && x !== 'energy');
  return exact.length ? exact : l;
}

/** An attack's descriptors in plain words for the Battle Room: "fire, energy". */
export function attackDescriptorWords(atk) {
  const l = atk.descriptors || [];
  const shown = showDescriptors(l);
  const fams = ['physical', 'energy'].filter((f) => l.includes(f));
  return [...new Set([...shown, ...fams])].join(', ');
}

/** The descriptors across all of a fighter's attacks (not fists), most common first, for its card. */
export function fighterDescriptors(c) {
  const count = new Map();
  for (const a of c.attacks || []) {
    if (a.unarmed) continue;
    for (const d of showDescriptors(a.descriptors)) count.set(d, (count.get(d) || 0) + 1);
  }
  return [...count.entries()].sort((x, y) => y[1] - x[1]).map(([d]) => d);
}
