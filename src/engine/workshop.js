// The Workshop: gear loadouts, gadgets and magic items, minion squads, creatures and monsters.
// Everything is priced and checked with the same rules engine as characters.

import { makeRng, randomSeed } from './rng.js';
import { ABILITIES, EP_PER_EQUIPMENT_RANK } from './rules.js';
import { powerCost, deviceCost, costBreakdown, primaryOwnCost, alternateOwnCost } from './costs.js';
import { checkLimits } from './limits.js';
import { generateCharacter, instantiate, templateKind, templateRolls, parseItem, repairCharacter, utilityBeltCost } from './generator.js';
import { catalogToCharacter } from './catalog.js';
import { rollSpec } from './expr.js';
const clone = (x) => JSON.parse(JSON.stringify(x));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Lowest power level at which a character meets every PL limit (ignoring points). */
export function estimatePL(ch, R) {
  for (let pl = 1; pl <= 40; pl++) {
    const errs = checkLimits({ ...ch, pl }, R).filter((i) => i.severity === 'error' && i.rule !== 'budget' && i.rule !== 'equipment');
    if (!errs.length) return pl;
  }
  return 40;
}

// ---------------------------------------------------------------------------------------------
// Gear loadouts

export const LOADOUT_FOCUS = {
  any: { label: 'Anything goes' },
  street: { label: 'Street tough', weapons: /Simple Melee|Exotic Melee|Projectile/, maxWeapon: 8, armor: /Modern/, gear: /Criminal|Survival|Electronics/ },
  tactical: { label: 'Tactical / soldier', weapons: /Projectile|Grenade/, armor: /Modern/, gear: /Electronics|Surveillance|Survival/ },
  detective: { label: 'Detective', weapons: /Projectile/, maxWeapon: 6, armor: /Modern/, gear: /Electronics|Surveillance|Criminal/ },
  spy: { label: 'Spy', weapons: /Projectile|Weapon Accessory/, maxWeapon: 6, armor: /Modern/, gear: /Surveillance|Criminal|Electronics/ },
  vigilante: { label: 'Masked vigilante', weapons: /Thrown|Simple Melee|Exotic Melee/, armor: /Modern/, gear: /Surveillance|Survival|Criminal/, belt: true },
  archaic: { label: 'Sword and shield', weapons: /Archaic|Exotic Melee|Projectile/, weaponNames: /Bow|Crossbow|Sword|Axe|Spear|Mace|Hammer|Javelin/, armor: /Archaic|Shield/, gear: /Survival/ },
  survival: { label: 'Wilderness survival', weapons: /Projectile|Simple Melee/, weaponNames: /Bow|Knife|Rifle|Crossbow|Shotgun/, armor: null, gear: /Survival/ },
  scifi: { label: 'Sci-fi blaster kit', weapons: /Energy/, armor: /Modern/, gear: /Electronics|Surveillance/, devices: true },
};

export function generateLoadout(R, { ep, ranks, focus = 'any', seed = randomSeed(), pl } = {}) {
  const rng = makeRng(`loadout-${seed}`);
  const budget = ep != null ? Number(ep) : (Number(ranks) || 4) * EP_PER_EQUIPMENT_RANK;
  const f = LOADOUT_FOCUS[focus] || LOADOUT_FOCUS.any;
  const eq = R.raw.equipment || {};
  let points = budget;
  const items = [];
  const take = (item, kind) => {
    if (!item || item.cost > points || items.some((x) => x.name === item.name)) return false;
    if (pl && kind === 'weapon') {
      const m = /Damage (\d+)/.exec(item.effect || '');
      if (m && Number(m[1]) > pl) return false; // keep weapons within the PL
    }
    items.push(parseItem(item, kind));
    points -= item.cost;
    return true;
  };
  const weapons = (eq.weapons || []).filter((w) => (!f.weapons || f.weapons.test(w.category || '')) && (!f.weaponNames || f.weaponNames.test(w.name)) && (!f.maxWeapon || w.cost <= f.maxWeapon) && !/Accessory/.test(w.category || ''));
  const accessories = (eq.weapons || []).filter((w) => /Accessory/.test(w.category || ''));
  const armor = f.armor === null ? [] : (eq.armor || []).filter((a) => !f.armor || f.armor.test(a.category || ''));
  const gear = (eq.gear || []).filter((g) => !/Vehicle|Utility Belt/.test(g.category || '') && (!f.gear || f.gear.test(g.category || '')));

  if (f.belt && points >= 8) {
    const belt = (eq.gear || []).find((g) => /Utility Belt/.test(g.name));
    if (belt) {
      const contents = rng.sample(belt.contents || [], rng.int(3, Math.min(7, (belt.contents || []).length)));
      while (contents.length > 1 && utilityBeltCost(contents) > points * 0.8) contents.pop();
      const cost = utilityBeltCost(contents);
      if (cost <= points) {
        items.push({ name: 'Utility Belt', cost, effect: `Alternate equipment array: ${contents.map((c) => c.name).join(', ')}`, contents, source: belt.source, array: true });
        points -= cost;
      }
    }
  }
  const mainCount = rng.int(1, 2);
  for (let i = 0; i < mainCount; i++) take(rng.pick(weapons.filter((w) => w.cost <= points)), 'weapon');
  if (items.some((x) => x.attack?.kind === 'ranged') && rng.chance(0.5)) take(rng.pick(accessories), 'gear');
  if (armor.length && rng.chance(0.75)) take(rng.pick(armor.filter((a) => a.cost <= points)), 'armor');
  if (f.devices) {
    const devs = (eq.devices || []).filter((d) => d.cost_unit === 'ep' && d.cost && d.cost <= points);
    if (devs.length && rng.chance(0.6)) {
      const d = rng.pick(devs);
      items.push({ name: d.name, cost: d.cost, effect: d.powers, source: d.source });
      points -= d.cost;
    }
  }
  for (let i = 0; i < 30 && points > 0; i++) {
    const g = rng.pick(gear.filter((x) => x.cost <= points && !items.some((y) => y.name === x.name)));
    if (!g) break;
    take(g, 'gear');
  }
  const used = budget - points;
  return { kind: 'loadout', focus, label: f.label, budget, used, ranks: Math.ceil(used / EP_PER_EQUIPMENT_RANK), items, seed };
}

// ---------------------------------------------------------------------------------------------
// Gadgets and magic items

export const DEVICE_TYPES = {
  tech: {
    label: 'Gadget (tech)', themes: ['tech', 'electric', 'gravity', 'light', 'magnetism', 'sonic', 'arsenal'],
    forms: ['Gauntlet', 'Rifle', 'Belt', 'Visor', 'Harness', 'Boots', 'Wrist Unit', 'Drone', 'Staff', 'Backpack'],
    prefixes: ['Mk-II', 'Mk-IV', 'Prototype', 'X-9', 'Omega', 'Kinetic', 'Quantum', 'Tactical', 'Hard-Light', 'Ion'],
    makers: ['Argent Dynamics', 'NOVA Labs', 'Sterling Tech', 'Helix Corp', 'Meridian Aerospace', 'a garage workshop', 'a black-budget lab'],
    blurbs: ['Built to take punishment and keep working.', 'Its battery indicator is always a little too low.', 'Covered in warning labels nobody reads.', 'Hums when it powers up.'],
  },
  magic: {
    label: 'Magic item', themes: ['magic', 'death', 'shadow', 'chaos', 'time', 'fire', 'light'],
    forms: ['Amulet', 'Ring', 'Sword', 'Staff', 'Cloak', 'Tome', 'Crown', 'Gem', 'Wand', 'Mask', 'Dagger', 'Gauntlet'],
    prefixes: ['the Ninth Seal', 'the Drowned King', 'Ashes', 'the Red Moon', 'Whispers', 'the Last Witch', 'Thorns', 'Midnight', 'the Starless Sea', 'Bound Souls'],
    makers: ['an ancient sorcerer', 'a forgotten order of monks', 'a fallen god', 'the witches of the old country', 'a demon who wants it back'],
    blurbs: ['It whispers to whoever carries it.', 'Cold to the touch, even in summer.', 'Its runes rearrange themselves at night.', 'Animals refuse to go near it.'],
  },
  alien: {
    label: 'Alien artifact', themes: ['cosmic', 'space', 'radiation', 'gravity', 'strength', 'tech'],
    forms: ['Orb', 'Rifle', 'Band', 'Armor Shard', 'Cube', 'Lance', 'Crystal', 'Collar', 'Pod'],
    prefixes: ['Zeta-Beam', 'Nth-Metal', 'Star-Forged', 'Hive', 'Void', 'Thalassian', 'Corona', 'Xeno'],
    makers: ['a dead empire', 'a crashed scout ship', 'a galactic bounty hunter', 'an alien war machine', 'a cosmic trader'],
    blurbs: ['Nobody on Earth can read its markings.', 'It adjusts itself to the user\'s hand.', 'Sometimes it seems to be listening.', 'Warm, faintly glowing and very heavy.'],
  },
  cosmic: {
    label: 'Cosmic relic', themes: ['cosmic', 'light', 'time', 'space'],
    forms: ['Ring', 'Lantern', 'Gem', 'Spear', 'Crown', 'Mantle', 'Medallion'],
    prefixes: ['the Source', 'Eternity', 'the Endless Night', 'the First Light', 'the Infinite', 'Creation'],
    makers: ['the Guardians of a far galaxy', 'a being older than stars', 'the heart of a supernova', 'an entity at the edge of the universe'],
    blurbs: ['It chooses its wielder, not the other way around.', 'Stars seem to bend toward it.', 'It is heavier in the hands of the unworthy.'],
  },
  weapon: {
    label: 'Signature weapon', themes: ['arsenal', 'martial', 'fire', 'electric', 'ice'],
    forms: ['Sword', 'Bow', 'Hammer', 'Whip', 'Shield', 'Spear', 'Staff', 'Chakram', 'Glaive', 'Pistols'],
    prefixes: ['Thunder', 'Widowmaker', 'Last Word', 'Starfall', 'Ironheart', 'Nightfall', 'Dragonbone', 'Silver'],
    makers: ['a legendary smith', 'a family of warriors', 'a weapons lab', 'a dying mentor'],
    blurbs: ['Perfectly balanced, and a little too famous.', 'Each nick on it tells a story.', 'It always seems to come back.'],
  },
};

function themeById(R, id) {
  return R.raw.themes.find((t) => t.id === id);
}

function deviceName(type, form, rng) {
  const t = DEVICE_TYPES[type];
  const p = rng.pick(t.prefixes);
  switch (type) {
    case 'magic': case 'cosmic': return rng.chance(0.7) ? `${form} of ${p}` : `${cap(p.replace(/^the /, ''))} ${form}`;
    case 'tech': return `${p} ${form}`;
    case 'alien': return `${p} ${form}`;
    default: return rng.chance(0.5) ? `${p}` : `${p} ${form}`;
  }
}

/**
 * A named device with real powers, priced with the Removable rule and kept within PL limits
 * (attacks assume the wielder's attack bonus is about PL).
 * opts: { pl, type: tech|magic|alien|cosmic|weapon, budget (pp), seed, removable: 'removable'|'easily' }
 */
export function generateDevice(R, { pl = 10, type = 'tech', budget, seed = randomSeed(), removable } = {}) {
  const rng = makeRng(`device-${seed}`);
  const t = DEVICE_TYPES[type] || DEVICE_TYPES.tech;
  const theme = themeById(R, rng.pick(t.themes)) || R.raw.themes[0];
  const form = rng.pick(t.forms);
  const powers = [];
  const pick = (pred) => {
    const list = (theme.powers || []).filter(pred);
    return list.length ? rng.weighted(list) : null;
  };
  const rankOf = (tpl) => {
    if (tpl.rank === 'attack') return templateRolls(tpl, R) ? pl : Math.max(1, pl - rng.int(0, 2));
    if (tpl.rank === 'pl') return Math.max(1, pl - rng.int(0, 2));
    if (tpl.rank === 'toughness') return Math.max(1, Math.round(pl / 2) + rng.int(-1, 2));
    return Math.max(1, rollSpec(tpl.rank, pl, rng));
  };
  // Main power: usually an attack
  const mainTpl = rng.chance(0.85) ? pick((x) => x.role === 'attack') : pick((x) => x.role !== 'attack');
  if (mainTpl) {
    const main = instantiate(mainTpl, rankOf(mainTpl), theme, rng);
    main.alternates = [];
    powers.push(main);
    const nAlts = mainTpl.role === 'attack' ? rng.int(0, type === 'weapon' || type === 'tech' ? 3 : 2) : 0;
    const used = new Set([mainTpl]);
    for (let i = 0; i < nAlts; i++) {
      const altTpl = pick((x) => (x.role === 'attack' || x.role === 'control') && !used.has(x));
      if (!altTpl) break;
      used.add(altTpl);
      const alt = instantiate(altTpl, rankOf(altTpl), theme, rng);
      delete alt.alternates;
      while (alt.rank > 1 && alternateOwnCost(alt, R) > primaryOwnCost(main, R)) alt.rank--;
      if (alternateOwnCost(alt, R) <= primaryOwnCost(main, R)) main.alternates.push(alt);
    }
  }
  if (rng.chance(type === 'weapon' ? 0.25 : 0.45)) {
    const def = pick((x) => x.role === 'defense' && x.rank === 'toughness');
    if (def) powers.push(instantiate(def, rankOf(def), theme, rng));
  }
  const extras = rng.int(type === 'weapon' ? 0 : 1, 2);
  for (let i = 0; i < extras; i++) {
    const u = pick((x) => ['movement', 'sense', 'utility', 'support'].includes(x.role) && !powers.some((p) => p.effect === x.effect));
    if (u) powers.push(instantiate(u, rankOf(u), theme, rng));
  }
  for (const p of powers) { if (p.alternates && !p.alternates.length) delete p.alternates; }
  const kind = removable || (['Ring', 'Amulet', 'Gem', 'Wand', 'Medallion', 'Collar', 'Band', 'Orb', 'Crystal'].includes(form) || rng.chance(0.3) ? 'easily' : 'removable');
  const name = deviceName(type, form, rng);
  const device = { name, kind, powers };

  // Fit a power-point budget by trimming ranks (largest first), never below rank 1.
  if (budget != null) {
    for (let guard = 0; guard < 400 && deviceCost(device, R).total > budget; guard++) {
      const p = powers.slice().sort((a, b) => powerCost(b, R) - powerCost(a, R))[0];
      if (!p) break;
      if (p.alternates?.length && rng.chance(0.4)) { p.alternates.pop(); continue; }
      if (p.rank > 1) {
        p.rank -= 1;
        for (const a of p.alternates || []) while (a.rank > 1 && alternateOwnCost(a, R) > primaryOwnCost(p, R)) a.rank--;
      } else if (powers.length > 1) powers.splice(powers.indexOf(p), 1);
      else break;
    }
  }
  const cost = deviceCost(device, R);
  const holder = { pl, abilities: Object.fromEntries(ABILITIES.map((a) => [a, 0])), defenses: {}, skills: [], advantages: [], powers: [], devices: [device], equipment: [] };
  const issues = checkLimits(holder, R).filter((i) => i.severity === 'error' && i.rule !== 'budget');
  return {
    kind: 'device', type, typeLabel: t.label, name, form, seed, pl,
    summary: `${cap(form.toLowerCase())} from ${rng.pick(t.makers)}, humming with ${theme.descriptors[0]} power. ${rng.pick(t.blurbs)}`,
    theme: { id: theme.id, name: theme.name, color: theme.color },
    device, cost, issues,
    note: 'Attack bonus + effect rank still has to fit the wielder\'s power level (2 x PL).',
  };
}

/** A Gadget Guides catalog device (printed stats; not re-priced). */
export function pickCatalogDevice(R, { seed = randomSeed(), category } = {}) {
  const rng = makeRng(`catalog-device-${seed}`);
  const list = (R.raw.equipment?.devices || []).filter((d) => !category || d.category === category);
  return rng.pick(list);
}

// ---------------------------------------------------------------------------------------------
// Minion squads

export const MINION_TYPES = ['m-thug', 'm-soldier', 'm-ninja', 'm-cultist', 'm-agent', 'm-hench', 'm-alien', 'm-drone', 'm-zombie'];

const SQUAD_ADJ = ['Crimson', 'Black', 'Iron', 'Silent', 'Golden', 'Night', 'Steel', 'Venom', 'Ghost', 'Red', 'Grim', 'Chrome'];
const SQUAD_NOUN = ['Fang', 'Hand', 'Lotus', 'Skull', 'Talon', 'Serpent', 'Legion', 'Cobra', 'Jackal', 'Wolf', 'Hydra', 'Spider'];

/**
 * A group of identical minions. rank = the minions' PL (Minion advantage rank).
 * opts: { type, rank, count, villainPl, seed }
 */
export function generateMinionSquad(R, { type, rank, count = 6, villainPl = 10, seed = randomSeed() } = {}) {
  const rng = makeRng(`squad-${seed}`);
  const t = type && type !== 'any' ? type : rng.pick(MINION_TYPES);
  const r = clamp(Number(rank) || clamp(villainPl - rng.int(4, 6), 2, 8), 1, 15);
  const n = clamp(Number(count) || 6, 1, 64);
  const member = generateCharacter(R, { archetype: t, pl: r, seed: `${seed}-${t}`, alignment: 'villain', chaos: 0.2 });
  const names = [];
  const flavor = R.raw.flavor;
  for (let i = 0; i < n; i++) {
    if (member.construct === 'automaton') names.push(`${member.archetype.name} ${String(i + 1).padStart(2, '0')}`);
    else names.push(`${rng.pick(rng.chance(0.5) ? flavor.female_names : flavor.male_names)} ${rng.pick(flavor.story.surnames)}`);
  }
  const k = Math.ceil(Math.log2(Math.max(1, n)));
  const squadName = `${rng.pick(SQUAD_ADJ)} ${rng.pick(SQUAD_NOUN)} ${member.archetype.name}${n > 1 ? 's' : ''}`;
  member.identity = { ...member.identity, codename: squadName.replace(/s$/, ''), realName: `${n} minions` };
  return {
    kind: 'squad', name: squadName, type: t, typeName: member.archetype.name, rank: r, count: n, member, names, seed,
    villainCost: {
      minionAdvantage: { rank: r, each: r, total: r * n, text: `Minion ${r} for each follower: ${r * n} points for ${n}` },
      summon: { rank: r, multiple: k, total: (2 + 2 * k) * r, text: `Summon ${r} (${member.archetype.name}), Multiple Minions ${k} (up to ${2 ** k}): ${(2 + 2 * k) * r} points` },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Creatures: catalog, variants and the monster maker

export function catalogEntries(R) {
  const out = [];
  for (const [file, list] of Object.entries(R.raw.catalog || {})) for (const e of list) out.push({ ...e, file });
  return out;
}

export const CREATURE_TEMPLATES = {
  none: { label: 'As written' },
  young: { label: 'Young', pl: -2, abilities: { Strength: -2, Stamina: -2, Fighting: -1 }, protection: -1 },
  alpha: { label: 'Alpha / pack leader', pl: 1, abilities: { Strength: 1, Fighting: 1, Awareness: 1 }, skills: [{ name: 'Intimidation', ranks: 4 }], advantages: ['Leadership', 'Fearless'] },
  dire: { label: 'Dire', pl: 2, growth: 4, protection: 1, advantages: ['Power Attack'] },
  giant: { label: 'Giant', pl: 4, growth: 8, protection: 2 },
  rabid: { label: 'Rabid / feral', pl: 0, abilities: { Fighting: 1, Intellect: -1 }, advantages: ['All-out Attack', 'Fearless'] },
  mutant: { label: 'Mutant', pl: 1, themePower: true },
  cyber: { label: 'Cybernetic', pl: 2, protection: 3, cyber: true },
  undead: { label: 'Undead', pl: 1, undead: true },
  spectral: { label: 'Spectral', pl: 1, spectral: true },
};

function addPower(ch, p) {
  ch.powers.push({ extras: [], flaws: [], ...p });
}

/** Apply a template to a catalog creature and make it legal at its new PL. */
export function creatureVariant(R, entry, templateId = 'none', { seed = randomSeed() } = {}) {
  const rng = makeRng(`variant-${seed}`);
  const t = CREATURE_TEMPLATES[templateId] || CREATURE_TEMPLATES.none;
  const ch = catalogToCharacter(entry);
  ch.pl = clamp(entry.pl + (t.pl || 0), 1, 30);
  for (const [a, d] of Object.entries(t.abilities || {})) if (ch.abilities[a] !== null) ch.abilities[a] += d;
  const prot = ch.powers.find((p) => p.effect === 'Protection');
  if (t.protection) {
    if (prot) prot.rank = Math.max(1, prot.rank + t.protection);
    else if (t.protection > 0) addPower(ch, { name: 'Tough Hide', effect: 'Protection', rank: t.protection, role: 'defense' });
  }
  if (t.growth) {
    const g = ch.powers.find((p) => p.effect === 'Growth');
    if (g) g.rank += t.growth;
    else addPower(ch, { name: 'Huge Size', effect: 'Growth', rank: t.growth, extras: [{ name: 'Permanent' }, { name: 'Innate' }], role: 'utility' });
  }
  for (const s of t.skills || []) ch.skills.push({ ...s });
  for (const a of t.advantages || []) if (!ch.advantages.some((x) => x.name === a) && R.advantage(a)) ch.advantages.push({ name: a, rank: 1 });
  if (t.themePower) {
    const theme = rng.pick(R.raw.themes.filter((x) => !['martial', 'arsenal', 'tech'].includes(x.id)));
    const tpl = rng.weighted((theme.powers || []).filter((x) => x.role === 'attack' && !x.strengthBased));
    if (tpl) {
      const p = instantiate(tpl, templateRolls(tpl, R) ? ch.pl : ch.pl, theme, rng);
      delete p.alternates;
      ch.powers.push(p);
      ch.mutation = theme.name;
    }
  }
  if (t.cyber) {
    addPower(ch, { name: 'Arm Cannon', effect: 'Damage', range: 'Ranged', rank: ch.pl, role: 'attack' });
    addPower(ch, { name: 'Cybernetic Senses', effect: 'Senses', rank: 3, detail: 'Infravision, Radio, Extended Vision', role: 'sense' });
  }
  if (t.undead) {
    const sta = ch.abilities.Stamina;
    ch.abilities.Stamina = null;
    addPower(ch, { name: 'Undead', effect: 'Immunity', rank: 30, detail: 'Fortitude effects', role: 'defense' });
    if (sta > 0) { const p2 = ch.powers.find((p) => p.effect === 'Protection'); if (p2) p2.rank += sta; else addPower(ch, { name: 'Dead Flesh', effect: 'Protection', rank: sta, role: 'defense' }); }
    ch.skills = ch.skills.filter((s) => s.name !== 'Stealth');
  }
  if (t.spectral) {
    addPower(ch, { name: 'Spectral Form', effect: 'Insubstantial', rank: 4, role: 'defense' });
    addPower(ch, { name: 'Drift', effect: 'Flight', rank: 2, role: 'movement' });
  }
  repairCharacter(ch, R, `variant-${seed}`);
  ch.identity = { codename: t.label === 'As written' ? entry.name : `${t.label.split(' / ')[0]} ${entry.name}`, realName: entry.category || '' };
  ch.summary = entry.summary;
  ch.variant = templateId;
  ch.fitsPL = estimatePL(ch, R);
  return ch;
}

const BODY = {
  beast: { nouns: ['Stalker', 'Prowler', 'Ravager', 'Maw', 'Hound', 'Brute'], attacks: ['bite', 'claws'], move: ['speed', 'leap'], senses: 'Low-light Vision, Scent, Tracking' },
  reptile: { nouns: ['Wyrm', 'Drake', 'Basilisk', 'Saurian', 'Serpent'], attacks: ['bite', 'tail', 'breath', 'gaze'], move: ['swim', 'speed'], senses: 'Infravision, Scent' },
  insect: { nouns: ['Crawler', 'Hive-Queen', 'Stinger', 'Skitterer', 'Mantid'], attacks: ['sting', 'claws', 'web'], move: ['climb', 'fly'], senses: 'Darkvision, Tremorsense' },
  humanoid: { nouns: ['Brute', 'Horror', 'Ogre', 'Ghoul', 'Wretch', 'Colossus'], attacks: ['claws', 'slam', 'gaze'], move: ['leap', 'speed'], senses: 'Darkvision' },
  amorphous: { nouns: ['Ooze', 'Mass', 'Blob', 'Devourer', 'Shapeless One'], attacks: ['engulf', 'tentacles', 'acid'], move: ['climb', 'swim'], senses: 'Blindsight (tactile, ranged)' },
  avian: { nouns: ['Shrieker', 'Roc', 'Harpy', 'Stormwing', 'Talon'], attacks: ['claws', 'bite', 'screech'], move: ['fly'], senses: 'Extended Vision, Low-light Vision' },
  aquatic: { nouns: ['Leviathan', 'Kraken', 'Deep One', 'Lurker', 'Abyss-Maw'], attacks: ['bite', 'tentacles', 'ink'], move: ['swim'], senses: 'Darkvision, Detect Vibrations' },
  elemental: { nouns: ['Elemental', 'Golem', 'Storm', 'Colossus', 'Wraith'], attacks: ['slam', 'breath', 'aura'], move: ['fly', 'burrow'], senses: 'Darkvision' },
};
const MONSTER_ADJ = ['Ashen', 'Gloom', 'Iron', 'Bone', 'Ember', 'Mire', 'Frost', 'Thorn', 'Hollow', 'Void', 'Rust', 'Blood', 'Night', 'Plague', 'Storm', 'Glass'];

const SIZES = [
  { name: 'Medium', growth: 0 }, { name: 'Large', growth: 4 }, { name: 'Huge', growth: 8 }, { name: 'Gargantuan', growth: 12 }, { name: 'Colossal', growth: 16 },
];

/**
 * A new monster built to a PL. opts: { pl, body, size, seed }
 */
export function generateMonster(R, { pl = 8, body, size, seed = randomSeed() } = {}) {
  const rng = makeRng(`monster-${seed}`);
  const bodyId = body && BODY[body] ? body : rng.pick(Object.keys(BODY));
  const b = BODY[bodyId];
  const sizeIdx = size ? Math.max(0, SIZES.findIndex((s) => s.name === size)) : clamp(Math.floor((pl - 3) / 4) + rng.int(-1, 1), 0, 4);
  const sz = SIZES[sizeIdx];
  const element = rng.pick(R.raw.themes.filter((t) => ['fire', 'ice', 'electric', 'shadow', 'radiation', 'plant', 'death', 'water', 'earth', 'sonic'].includes(t.id)));
  const ch = {
    pl, kind: 'monster', abilities: {}, defenses: { Dodge: 0, Parry: 0, Fortitude: 0, Will: 0 }, skills: [], advantages: [], powers: [], devices: [], equipment: [],
  };
  const intelligent = bodyId === 'humanoid' ? rng.chance(0.5) : rng.chance(0.15);
  const base = Math.max(1, Math.round(pl / 2));
  ch.abilities = {
    Strength: base + rng.int(-1, 2), Stamina: base + rng.int(-1, 2), Agility: rng.int(0, Math.max(1, base - 1)), Dexterity: rng.int(-1, 1),
    Fighting: base + rng.int(-1, 1), Intellect: intelligent ? rng.int(0, 3) : rng.int(-5, -3), Awareness: rng.int(1, 3), Presence: rng.int(-3, 1),
  };
  if (sz.growth) addPower(ch, { name: `${sz.name} Size`, effect: 'Growth', rank: sz.growth, extras: [{ name: 'Permanent' }, { name: 'Innate' }], role: 'utility' });
  const effStr = ch.abilities.Strength + sz.growth;
  const attacks = rng.sample(b.attacks, rng.int(1, 2));
  for (const a of attacks) {
    switch (a) {
      case 'bite': case 'claws': case 'tail': case 'slam': {
        const bonus = clamp(pl - effStr, 1, 6);
        addPower(ch, { name: cap(a === 'tail' ? 'tail lash' : a), effect: 'Damage', rank: bonus, strengthBased: true, role: 'attack' });
        break;
      }
      case 'sting': addPower(ch, { name: 'Venom Sting', effect: 'Affliction', rank: pl, detail: 'Resisted by Fortitude; Dazed, Stunned, Paralyzed', extras: [{ name: 'Progressive' }], role: 'attack' }); break;
      case 'web': addPower(ch, { name: 'Web Spray', effect: 'Affliction', range: 'Ranged', rank: pl, detail: 'Resisted by Dodge, overcome by Damage; Hindered and Vulnerable, Defenseless and Immobile', extras: [{ name: 'Cumulative' }, { name: 'Extra Condition' }], flaws: [{ name: 'Limited Degree' }], role: 'attack' }); break;
      case 'breath': addPower(ch, { name: `${cap(element.descriptors[0])} Breath`, effect: 'Damage', range: 'Close', rank: pl, extras: [{ name: 'Area', option: 'Cone' }], descriptors: [element.descriptors[0]], role: 'attack' }); break;
      case 'gaze': addPower(ch, { name: 'Paralyzing Gaze', effect: 'Affliction', range: 'Perception', rank: pl, detail: 'Resisted by Will; Dazed, Stunned, Paralyzed', flaws: [{ name: 'Sense-Dependent', detail: 'sight' }], role: 'attack' }); break;
      case 'engulf': addPower(ch, { name: 'Engulf', effect: 'Damage', rank: pl, flaws: [{ name: 'Grab-Based' }], role: 'attack' }); break;
      case 'tentacles': addPower(ch, { name: 'Tentacles', effect: 'Damage', rank: clamp(pl - effStr, 1, 5), strengthBased: true, extras: [{ name: 'Reach', steps: 3 }], role: 'attack' }); ch.advantages.push({ name: 'Improved Grab', rank: 1 }); break;
      case 'acid': addPower(ch, { name: 'Acid Spit', effect: 'Damage', range: 'Ranged', rank: pl, descriptors: ['acid'], role: 'attack' }); break;
      case 'ink': addPower(ch, { name: 'Ink Cloud', effect: 'Concealment', rank: 4, detail: 'All visual senses', extras: [{ name: 'Attack' }, { name: 'Area', option: 'Cloud' }], role: 'utility' }); break;
      case 'screech': addPower(ch, { name: 'Screech', effect: 'Affliction', rank: pl, detail: 'Resisted by Fortitude; Dazed, Stunned, Incapacitated', extras: [{ name: 'Area', option: 'Cone' }], role: 'attack' }); break;
      case 'aura': addPower(ch, { name: `${cap(element.descriptors[0])} Aura`, effect: 'Damage', rank: Math.max(1, pl - 2), extras: [{ name: 'Reaction', option: 'From standard action' }], descriptors: [element.descriptors[0]], role: 'attack' }); break;
      default: break;
    }
  }
  addPower(ch, { name: 'Monstrous Hide', effect: 'Protection', rank: Math.max(1, Math.round(pl / 2) + rng.int(-1, 2)), role: 'defense' });
  addPower(ch, { name: 'Monster Senses', effect: 'Senses', rank: rng.int(2, 4), detail: b.senses, role: 'sense' });
  const move = rng.pick(b.move);
  const mv = { speed: ['Speed', 'Fast'], leap: ['Leaping', 'Bounding Leap'], swim: ['Swimming', 'Swimmer'], fly: ['Flight', 'Flight'], climb: ['Movement', 'Wall-Crawling'], burrow: ['Burrowing', 'Tunneling'] }[move];
  addPower(ch, { name: mv[1], effect: mv[0], rank: mv[0] === 'Movement' ? 1 : clamp(Math.round(pl / 2), 2, 8), detail: mv[0] === 'Movement' ? 'Wall-crawling' : undefined, role: 'movement', flaws: move === 'fly' && bodyId !== 'elemental' ? [{ name: 'Wings' }] : [] });
  if (rng.chance(0.35)) addPower(ch, { name: 'Regeneration', effect: 'Regeneration', rank: rng.int(2, pl), role: 'utility' });
  if (rng.chance(0.3) && element) addPower(ch, { name: `${cap(element.descriptors[0])}-proof`, effect: 'Immunity', rank: 5, detail: `${element.descriptors[0]} damage`, role: 'defense' });
  ch.skills.push({ name: 'Perception', ranks: rng.int(2, 8) }, { name: 'Intimidation', ranks: rng.int(2, 8) });
  if (bodyId !== 'elemental' && rng.chance(0.5)) ch.skills.push({ name: 'Stealth', ranks: rng.int(2, 6) });
  // Close-combat accuracy toward the cap
  const close = ch.powers.find((p) => p.role === 'attack' && p.strengthBased);
  if (close) ch.skills.push({ name: 'Close Combat', spec: close.name, ranks: Math.max(0, 2 * pl - (effStr + close.rank) - ch.abilities.Fighting) });
  ch.advantages.push({ name: 'Fearless', rank: 1 });
  if (rng.chance(0.5)) ch.advantages.push({ name: 'Power Attack', rank: 1 });
  // Defenses toward the caps
  ch.defenses.Dodge = Math.max(0, rng.int(1, 3));
  ch.defenses.Parry = Math.max(0, rng.int(1, 3));
  ch.defenses.Fortitude = rng.int(1, 4);
  ch.defenses.Will = rng.int(1, 4);
  repairCharacter(ch, R, `monster-${seed}`);
  const name = `${rng.pick(MONSTER_ADJ)} ${rng.pick(b.nouns)}`;
  ch.identity = { codename: name, realName: `${sz.name} ${bodyId} monster` };
  ch.summary = `A ${sz.name.toLowerCase()} ${bodyId} creature${element ? ` steeped in ${element.descriptors[0]}` : ''}. ${intelligent ? 'Cunning, and it remembers faces.' : 'Pure hunger and instinct.'}`;
  ch.body = bodyId;
  ch.size = sz.name;
  ch.fitsPL = estimatePL(ch, R);
  ch.seed = seed;
  return ch;
}

/** Random catalog creature (optionally filtered), with an optional template. */
export function randomCreature(R, { kind, category, minPl = 0, maxPl = 99, template = 'none', seed = randomSeed() } = {}) {
  const rng = makeRng(`creature-${seed}`);
  const pool = catalogEntries(R).filter((e) => (!kind || e.kind === kind) && (!category || e.category === category) && e.pl >= minPl && e.pl <= maxPl);
  const entry = rng.pick(pool);
  if (!entry) return null;
  const t = template === 'random' ? rng.pick(Object.keys(CREATURE_TEMPLATES)) : template;
  return creatureVariant(R, entry, t, { seed });
}

export function pointsOf(ch, R) {
  return costBreakdown(ch, R);
}
