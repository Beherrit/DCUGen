// Building materials and the cover made from them (Hero's Handbook p94 and p173).
// A material has a Toughness for about one inch of it: +1 for each doubling of thickness, -1 for each halving.

export const MATERIALS = {
  paper: { name: 'paper', toughness: 0 },
  soil: { name: 'soil', toughness: 0 },
  glass: { name: 'glass', toughness: 1 },
  ice: { name: 'ice', toughness: 1 },
  rope: { name: 'rope', toughness: 1 },
  wood: { name: 'wood', toughness: 3 },
  stone: { name: 'stone', toughness: 5 },
  iron: { name: 'iron', toughness: 7 },
  concrete: { name: 'reinforced concrete', toughness: 8 },
  steel: { name: 'steel', toughness: 9 },
  titanium: { name: 'titanium', toughness: 15 },
  prometheum: { name: 'Prometheum', toughness: 20 },
};

/** Find a material by its id ('concrete') or its name ('reinforced concrete'). */
export function materialOf(material) {
  const key = String(material).toLowerCase();
  return MATERIALS[key] || Object.values(MATERIALS).find((m) => m.name.toLowerCase() === key) || null;
}

/** The Toughness of a thickness of a material: the base, plus the thickness ratio's log2 rounded down. */
export function toughnessOf(material, inches) {
  const m = materialOf(material);
  if (!m) throw new Error(`Unknown material: ${material}`);
  if (!(inches > 0)) return m.toughness;
  return m.toughness + Math.floor(Math.log2(inches) + 1e-9);
}

// Presets. Each is { id, name, material, inches, level }; the Toughness is always worked out, never typed in.
// The array can also be read by id, as COVER_KINDS['brick-wall'].
export const COVER_KINDS = [
  { id: 'wooden-fence', name: 'wooden fence', material: 'wood', inches: 1, level: 'partial' },
  { id: 'brick-wall', name: 'brick wall', material: 'stone', inches: 8, level: 'total' },
  { id: 'concrete-pillar', name: 'concrete pillar', material: 'concrete', inches: 12, level: 'partial' },
  { id: 'concrete-wall', name: 'concrete wall', material: 'concrete', inches: 8, level: 'total' },
  { id: 'parked-car', name: 'parked car', material: 'steel', inches: 0.125, level: 'partial' },
  { id: 'steel-door', name: 'steel door', material: 'steel', inches: 2, level: 'total' },
  { id: 'glass-storefront', name: 'glass storefront', material: 'glass', inches: 0.5, level: 'partial' },
  { id: 'ice-wall', name: 'ice wall', material: 'ice', inches: 12, level: 'total' },
  { id: 'titanium-bulkhead', name: 'titanium bulkhead', material: 'titanium', inches: 2, level: 'total' },
];
for (const k of COVER_KINDS) COVER_KINDS[k.id] = k;

export const coverKind = (id) => COVER_KINDS.find((k) => k.id === id) || null;

// The walls of an enclosed arena: reinforced concrete, 8 inches (Toughness 11).
export const ENCLOSURE_WALL = { name: 'wall', material: 'concrete', inches: 8 };
