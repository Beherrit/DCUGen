import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { deriveAll } from '../src/engine/derive.js';
import {
  GEAR_GENRES, gearCatalog, searchGear, gearToEquipment, gearToDevice, customItem, equipmentRankFor, gearItemCost,
} from '../src/engine/gear.js';

const files = R.raw.gear || {};
const fileItems = Object.values(files).flat();
const catalog = gearCatalog(R);
const byName = (n) => catalog.find((it) => it.name === n);

function character(equipment = []) {
  return {
    pl: 10,
    abilities: { Strength: 3, Stamina: 2, Agility: 2, Dexterity: 4, Fighting: 3, Intellect: 1, Awareness: 1, Presence: 0 },
    defenses: { Dodge: 0, Parry: 0, Fortitude: 0, Will: 0 },
    skills: [], advantages: [{ name: 'Ranged Attack', rank: 2 }], powers: [], devices: [], equipment,
  };
}

test('gear files are built into the rules and hold 500+ items', () => {
  assert.equal(Object.keys(files).length, GEAR_GENRES.length);
  assert.ok(fileItems.length >= 500, `${fileItems.length} items`);
  assert.ok(catalog.length >= fileItems.length);
});

test('every genre has items, and every item names its genre', () => {
  for (const g of GEAR_GENRES) {
    assert.ok(g.id && g.label && g.blurb, g.id);
    assert.ok((files[g.id] || []).length >= 20, `${g.id} has ${(files[g.id] || []).length}`);
    for (const it of files[g.id]) assert.equal(it.genre, g.label, it.name);
  }
});

test('names and ids are unique, and every item has the required fields', () => {
  const names = new Set();
  const ids = new Set();
  for (const it of fileItems) {
    assert.ok(!names.has(it.name.toLowerCase()), `duplicate ${it.name}`);
    assert.ok(!ids.has(it.id), `duplicate id ${it.id}`);
    names.add(it.name.toLowerCase());
    ids.add(it.id);
    for (const k of ['id', 'name', 'genre', 'category', 'effect', 'summary', 'source']) assert.ok(it[k], `${it.name} lacks ${k}`);
    assert.ok(Number.isInteger(it.cost) && it.cost >= 0, `${it.name} cost`);
    assert.ok(Array.isArray(it.tags) && it.tags.length, `${it.name} tags`);
    assert.ok(it.powers?.length || it.features?.length, `${it.name} has no powers or features to price`);
  }
});

test('every item cost equals the cost recomputed from its powers, features and partial extras', () => {
  for (const it of fileItems) {
    const c = gearItemCost(it, R);
    assert.equal(c.cost, it.cost, it.name);
    assert.equal(c.unit, it.device ? 'pp' : 'ep', it.name);
    if (it.device) assert.equal(c.raw, it.rawCost, it.name);
  }
});

test('items copied from a book reproduce the printed cost', () => {
  const withBook = fileItems.filter((it) => it.bookCost != null);
  assert.ok(withBook.length >= 150, `${withBook.length} book-priced items`);
  for (const it of withBook) assert.equal(it.cost, it.bookCost, `${it.name} (${it.source})`);
});

test('every DC Adventures weapon, armor and gear item is in the gear files at its printed cost', () => {
  const eq = R.raw.equipment;
  const book = [...eq.weapons, ...eq.armor, ...eq.gear].filter((x) => !/Vehicle/.test(x.category || ''));
  assert.equal(book.length, 78); // 44 weapons, 9 armor, 25 general gear (vehicles live in vehicles.json)
  const names = new Map(fileItems.map((it) => [it.name, it]));
  for (const b of book) {
    const it = names.get(b.name);
    assert.ok(it, `${b.name} missing from data/gear`);
    assert.equal(it.cost, b.cost, b.name);
    assert.equal(it.source, b.source, b.name);
    if (b.crit && it.attack) assert.equal(it.attack.crit, b.crit, `${b.name} crit`);
  }
  // Spot checks against the DCA 151-154 tables.
  assert.equal(byName('Sniper Rifle').cost, 11);
  assert.equal(byName('Sniper Rifle').attack.crit, 19);
  assert.equal(byName('Submachine Gun').cost, 12);
  assert.equal(byName('Rocket Launcher').cost, 27);
  assert.equal(byName('Bulletproof Vest').cost, 3);
  assert.equal(byName('Bulletproof Vest').protection, 4);
  assert.equal(byName('Utility Belt (Sample)').cost, 25);
});

test('magic items are Removable devices priced in power points', () => {
  const magic = files.fantasy_magic;
  assert.ok(magic.every((it) => it.device && it.costUnit === 'pp'));
  const stone = magic.find((it) => it.name === "The Philosopher's Stone");
  assert.equal(stone.rawCost, 55);
  assert.equal(stone.cost, 33); // Easily Removable: -2 per 5 (GG 66)
  const moon = magic.find((it) => it.name === 'Moonslayer');
  assert.equal(moon.rawCost, 19); // GG 64 before Removable
  assert.equal(moon.cost, 16);
  assert.throws(() => gearToEquipment(moon), /device/);
  const dev = gearToDevice(moon);
  assert.equal(dev.kind, 'removable');
  assert.ok(dev.powers.some((p) => p.effect === 'Feature'));
  // No other genre uses devices.
  assert.ok(fileItems.filter((it) => it.device).every((it) => it.genre === 'Fantasy Magic'));
});

test('catalog merges equipment.json without duplicates and without vehicles', () => {
  const names = catalog.map((it) => it.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  assert.ok(!catalog.some((it) => /Vehicle/.test(it.category || '')));
  for (const it of catalog) assert.ok(GEAR_GENRES.some((g) => g.id === it.genreId), it.name);
});

test('search finds by words, genre, category, tags and cost', () => {
  const pistols = searchGear(R, { q: 'pistol' });
  assert.ok(pistols.length >= 10);
  assert.ok(/pistol/i.test(pistols[0].name));
  assert.equal(searchGear(R, { q: 'laser pistol' })[0].name, 'Laser Pistol');
  const west = searchGear(R, { genre: 'wild_west' });
  assert.equal(west.length, files.wild_west.length);
  assert.deepEqual(searchGear(R, { genre: 'Wild West' }).map((x) => x.name), west.map((x) => x.name));
  const cheapArmor = searchGear(R, { category: 'armor', maxCost: 3 });
  assert.ok(cheapArmor.length > 5 && cheapArmor.every((x) => x.cost <= 3 && /armor/i.test(x.category)));
  const cyber = searchGear(R, { tags: ['cyberware', 'weapon'] });
  assert.ok(cyber.length >= 3 && cyber.every((x) => x.tags.includes('cyberware')));
  assert.ok(searchGear(R, { kind: 'device' }).every((x) => x.device));
  assert.ok(searchGear(R, { kind: 'equipment', q: 'sword' }).every((x) => !x.device));
  assert.equal(searchGear(R, { q: 'zzzz-nothing' }).length, 0);
  // Without a query, results follow genre order then cost.
  const all = searchGear(R);
  assert.equal(all.length, catalog.length);
  assert.equal(all[0].genreId, 'everyday');
});

test('customItem prices by the rules', () => {
  const blaster = customItem(R, { name: 'Test Blaster', powers: [{ effect: 'Damage', rank: 4, range: 'Ranged' }] });
  assert.equal(blaster.cost, 8); // Ranged Damage 4 = 8 ep
  assert.deepEqual(blaster.attack, { kind: 'ranged', rank: 4, strengthBased: false, crit: 20 });
  const armor = customItem(R, { name: 'Test Armor', protection: 3 });
  assert.equal(armor.cost, 3); // Protection 3 = 3 ep
  assert.equal(armor.protection, 3);
  const kit = customItem(R, { name: 'Kit', features: ['tools', { name: 'Feature', ranks: 2, detail: '+5 bonus' }] });
  assert.equal(kit.cost, 3);
  const sword = customItem(R, { name: 'Edge', powers: [{ effect: 'Damage', rank: 3, strengthBased: true }], features: [{ name: 'Improved Critical', ranks: 1 }] });
  assert.equal(sword.cost, 4); // the book's Sword
  assert.equal(sword.attack.crit, 19);
  const smg = customItem(R, { name: 'Auto', powers: [{ effect: 'Damage', rank: 4, range: 'Ranged', extras: [{ name: 'Multiattack' }] }] });
  assert.equal(smg.cost, 12);
  const vest = customItem(R, { name: 'Vest', powers: [{ effect: 'Protection', rank: 4, flaws: [{ name: 'Limited' }], extras: [{ name: 'Subtle' }] }] });
  assert.equal(vest.cost, 3);
  const grenade = customItem(R, { name: 'Boom', powers: [{ effect: 'Damage', rank: 5, range: 'Ranged', extras: [{ name: 'Area', option: 'Burst' }] }] });
  assert.equal(grenade.cost, 15);
  assert.equal(grenade.attack, undefined); // area effects are not single-target attacks
  const wand = customItem(R, { name: 'Wand', device: 'removable', powers: [{ effect: 'Damage', rank: 10, range: 'Ranged' }] });
  assert.equal(wand.cost, 16); // 20 - 4
  assert.equal(wand.costUnit, 'pp');
  assert.match(blaster.effect, /Ranged Damage 4/);
});

test('gear weapons and armor work on a character sheet', () => {
  const rifle = gearToEquipment(byName('Assault Rifle'));
  assert.deepEqual(Object.keys(rifle).slice(0, 3), ['name', 'cost', 'effect']);
  const sword = gearToEquipment(byName('Katana'));
  const vest = gearToEquipment(byName('Riot Armor'));
  const ch = character([rifle, sword, vest]);
  const d = deriveAll(ch, R);
  const shot = d.attacks.find((a) => a.name === 'Assault Rifle');
  assert.ok(shot, 'rifle attack listed');
  assert.equal(shot.kind, 'ranged');
  assert.equal(shot.rank, 5);
  assert.equal(shot.bonus, 4 + 2); // Dexterity + Ranged Attack
  const cut = d.attacks.find((a) => a.name === 'Katana');
  assert.equal(cut.rank, 3 + 3); // Strength-based
  assert.equal(cut.crit, 19);
  assert.equal(d.defenses.Toughness, 2 + 6);
  assert.equal(equipmentRankFor(ch), Math.ceil((15 + 4 + 6) / 5));
});
