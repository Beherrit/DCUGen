// Battle map geometry, kept free of the DOM so it can be tested: who an area template catches, what
// lies between two tokens (walls block the line, cover gives the attacker −2 or −5), and the map model.
// Positions are in squares (a token at {x, y} fills the square from x to x + size); sizes in feet.

/** What can be painted on a square. `cover` is the attack penalty it gives (DCA: partial −2, total −5). */
export const TERRAIN = {
  wall: { label: 'Wall', hint: 'Blocks movement and sight (complete cover)', color: '#3b3f4a', blocks: true, height: 1.6 },
  total: { label: 'Total cover', hint: 'Pillars, cars, thick trees: −5 to attacks through it', color: '#6b5b45', cover: 5, height: 0.9 },
  partial: { label: 'Partial cover', hint: 'Low walls, crates, railings: −2 to attacks through it', color: '#a08a62', cover: 2, height: 0.45 },
  difficult: { label: 'Difficult ground', hint: 'Rubble, mud, crowds: movement is hindered', color: '#8a6d3b', height: 0.04 },
  water: { label: 'Water', hint: 'Swimming, or wading at half speed', color: '#2f78b7', height: 0.03 },
  hazard: { label: 'Hazard', hint: 'Fire, acid, live wires: note the damage on the map', color: '#d1495b', height: 0.05 },
};

/**
 * Pieces you can build on the map, Monopoly style: drag them, stretch them, make them taller. w and d are the
 * footprint in squares, floors the height (12 ft a floor; for small things `ft` is the height in feet).
 */
export const PROP_CATS = [
  ['city', '🏙 City'], ['buildings', '🏠 Buildings'], ['vehicles', '🚗 Vehicles'], ['construction', '🚧 Construction'],
  ['nature', '🌳 Nature & parks'], ['people', '🧍 People'], ['scifi', '🛸 Space & caves'],
];
// model: how 3D draws it. flat: lies on the ground (roads, ponds), no cover. blocks: like a wall. cover: −2 or −5.
export const PROPS = {
  // city
  road: { cat: 'city', label: 'Road', icon: '🛣', w: 2, d: 8, ft: 0.1, color: '#3d4048', model: 'road', flat: true },
  sidewalk: { cat: 'city', label: 'Sidewalk / plaza', icon: '⬜', w: 1, d: 8, ft: 0.4, color: '#b9b6ae', model: 'slab', flat: true },
  parking: { cat: 'city', label: 'Parking lot', icon: '🅿', w: 6, d: 4, ft: 0.1, color: '#4a4d55', model: 'parking', flat: true },
  crosswalk: { cat: 'city', label: 'Crosswalk', icon: '🦓', w: 2, d: 2, ft: 0.1, color: '#3d4048', model: 'crosswalk', flat: true },
  lamp: { cat: 'city', label: 'Street lamp', icon: '💡', w: 1, d: 1, ft: 14, color: '#2b2f36', model: 'lamp' },
  trafficlight: { cat: 'city', label: 'Traffic light', icon: '🚦', w: 1, d: 1, ft: 12, color: '#2b2f36', model: 'trafficlight' },
  bench: { cat: 'city', label: 'Bench', icon: '🪑', w: 2, d: 1, ft: 3, color: '#8a5a32', model: 'bench', cover: 2 },
  hydrant: { cat: 'city', label: 'Fire hydrant', icon: '🧯', w: 1, d: 1, ft: 3, color: '#c62f3a', model: 'hydrant' },
  busstop: { cat: 'city', label: 'Bus stop', icon: '🚏', w: 2, d: 1, ft: 8, color: '#5d7da3', model: 'busstop', cover: 2 },
  dumpster: { cat: 'city', label: 'Dumpster', icon: '🗑', w: 2, d: 1, ft: 5, color: '#2f6b45', model: 'box', cover: 5 },
  fence: { cat: 'city', label: 'Fence', icon: '🚧', w: 1, d: 4, ft: 5, color: '#9a8f80', model: 'fence', cover: 2 },
  mailbox: { cat: 'city', label: 'Mailbox', icon: '📮', w: 1, d: 1, ft: 4, color: '#2b5aa8', model: 'box', cover: 2 },
  // buildings
  shed: { cat: 'buildings', label: 'Small house', icon: '🏡', w: 2, d: 2, floors: 1, color: '#d9c7a1', model: 'building', roof: 'gable', blocks: true },
  house: { cat: 'buildings', label: 'House', icon: '🏠', w: 2, d: 2, floors: 1, color: '#2e9d57', model: 'building', roof: 'gable', blocks: true },
  home2: { cat: 'buildings', label: 'Two-storey home', icon: '🏘', w: 3, d: 3, floors: 2, color: '#8fa9c7', model: 'building', roof: 'gable', windows: true, blocks: true },
  shop: { cat: 'buildings', label: 'Shop', icon: '🏪', w: 3, d: 2, floors: 1, color: '#e0a030', model: 'building', roof: 'flat', windows: true, awning: true, blocks: true },
  diner: { cat: 'buildings', label: 'Diner', icon: '🍔', w: 4, d: 2, floors: 1, color: '#d8d8d8', model: 'building', roof: 'flat', windows: true, awning: true, blocks: true },
  hotel: { cat: 'buildings', label: 'Hotel', icon: '🏨', w: 3, d: 2, floors: 3, color: '#d1352b', model: 'building', roof: 'gable', windows: true, blocks: true },
  apartment: { cat: 'buildings', label: 'Apartments', icon: '🏢', w: 4, d: 3, floors: 5, color: '#b5715a', model: 'building', roof: 'flat', windows: true, blocks: true },
  office: { cat: 'buildings', label: 'Office block', icon: '🏬', w: 4, d: 3, floors: 8, color: '#b9a98c', model: 'building', roof: 'flat', windows: true, blocks: true },
  tower: { cat: 'buildings', label: 'Skyscraper', icon: '🏙', w: 3, d: 3, floors: 24, color: '#5d7da3', model: 'building', roof: 'flat', windows: true, blocks: true },
  megatower: { cat: 'buildings', label: 'Mega tower', icon: '🗼', w: 5, d: 5, floors: 60, color: '#3f5872', model: 'building', roof: 'spire', windows: true, blocks: true },
  warehouse: { cat: 'buildings', label: 'Warehouse', icon: '🏭', w: 5, d: 4, floors: 2, color: '#8a8f99', model: 'building', roof: 'flat', blocks: true },
  gas: { cat: 'buildings', label: 'Gas station', icon: '⛽', w: 4, d: 3, ft: 16, color: '#e3e3e3', model: 'gas', cover: 5 },
  police: { cat: 'buildings', label: 'Police station', icon: '🚓', w: 4, d: 3, floors: 2, color: '#2b4a7a', model: 'building', roof: 'flat', windows: true, blocks: true },
  church: { cat: 'buildings', label: 'Church', icon: '⛪', w: 3, d: 5, floors: 2, color: '#cfc6b4', model: 'building', roof: 'gable', steeple: true, blocks: true },
  // vehicles
  car: { cat: 'vehicles', label: 'Car', icon: '🚗', w: 1, d: 2, ft: 5, color: '#c62f3a', model: 'car', cover: 5 },
  taxi: { cat: 'vehicles', label: 'Taxi', icon: '🚕', w: 1, d: 2, ft: 5, color: '#f2c230', model: 'car', cover: 5 },
  policecar: { cat: 'vehicles', label: 'Police car', icon: '🚓', w: 1, d: 2, ft: 5, color: '#1d2b4a', model: 'car', siren: true, cover: 5 },
  van: { cat: 'vehicles', label: 'Van', icon: '🚐', w: 1, d: 2, ft: 7, color: '#e8e8e8', model: 'van', cover: 5 },
  truck: { cat: 'vehicles', label: 'Truck', icon: '🚚', w: 1, d: 4, ft: 12, color: '#d35f2b', model: 'truck', blocks: true },
  bus: { cat: 'vehicles', label: 'Bus', icon: '🚌', w: 1, d: 4, ft: 10, color: '#f0b429', model: 'bus', blocks: true },
  tank: { cat: 'vehicles', label: 'Tank', icon: '🪖', w: 2, d: 3, ft: 8, color: '#5b6b3a', model: 'tank', blocks: true },
  helicopter: { cat: 'vehicles', label: 'Helicopter', icon: '🚁', w: 2, d: 4, ft: 12, color: '#3a4a5a', model: 'heli', cover: 5 },
  bike: { cat: 'vehicles', label: 'Motorbike', icon: '🏍', w: 1, d: 1, ft: 4, color: '#222831', model: 'bike', cover: 2 },
  // construction
  crane: { cat: 'construction', label: 'Tower crane', icon: '🏗', w: 2, d: 2, ft: 160, color: '#f2b705', model: 'crane', cover: 5 },
  scaffold: { cat: 'construction', label: 'Scaffolding', icon: '🪜', w: 4, d: 1, ft: 30, color: '#9aa3ad', model: 'scaffold', cover: 2 },
  girders: { cat: 'construction', label: 'Steel girders', icon: '🔩', w: 3, d: 1, ft: 3, color: '#b0543a', model: 'girders', cover: 2 },
  dirt: { cat: 'construction', label: 'Dirt pile', icon: '⛰', w: 2, d: 2, ft: 8, color: '#8a6d3b', model: 'mound', cover: 5 },
  cones: { cat: 'construction', label: 'Traffic cones', icon: '🔺', w: 2, d: 1, ft: 2.5, color: '#f26b1d', model: 'cones' },
  barrier: { cat: 'construction', label: 'Jersey barrier', icon: '🧱', w: 1, d: 3, ft: 3, color: '#c9c5bc', model: 'barrier', cover: 2 },
  digger: { cat: 'construction', label: 'Excavator', icon: '🚜', w: 2, d: 3, ft: 10, color: '#f2b705', model: 'digger', cover: 5 },
  crate: { cat: 'construction', label: 'Crates', icon: '📦', w: 1, d: 1, ft: 4, color: '#a0743c', model: 'crates', cover: 2 },
  container: { cat: 'construction', label: 'Shipping container', icon: '🚛', w: 1, d: 4, ft: 9, color: '#2f78b7', model: 'container', blocks: true },
  // nature and parks
  treesmall: { cat: 'nature', label: 'Small tree', icon: '🌱', w: 1, d: 1, ft: 12, color: '#3f9a43', model: 'pine', cover: 2 },
  tree: { cat: 'nature', label: 'Pine tree', icon: '🌲', w: 1, d: 1, ft: 25, color: '#2f7d32', model: 'pine', cover: 5 },
  oak: { cat: 'nature', label: 'Big oak', icon: '🌳', w: 2, d: 2, ft: 35, color: '#4f8f2f', model: 'oak', cover: 5 },
  palm: { cat: 'nature', label: 'Palm tree', icon: '🌴', w: 1, d: 1, ft: 30, color: '#3e9a3a', model: 'palm', cover: 2 },
  bush: { cat: 'nature', label: 'Bushes', icon: '🌿', w: 2, d: 1, ft: 4, color: '#3b7d2a', model: 'bush', cover: 2 },
  rock: { cat: 'nature', label: 'Boulder', icon: '🪨', w: 1, d: 1, ft: 6, color: '#7d7a73', model: 'rock', cover: 5 },
  pond: { cat: 'nature', label: 'Pond', icon: '💧', w: 4, d: 3, ft: 0.2, color: '#2f78b7', model: 'pond', flat: true },
  lake: { cat: 'nature', label: 'Lake', icon: '🌊', w: 10, d: 7, ft: 0.2, color: '#255f99', model: 'pond', flat: true },
  park: { cat: 'nature', label: 'Park lawn', icon: '🏞', w: 6, d: 6, ft: 0.15, color: '#5fb04a', model: 'park', flat: true },
  flowers: { cat: 'nature', label: 'Flower bed', icon: '🌷', w: 2, d: 1, ft: 1.5, color: '#d94f8a', model: 'flowers', flat: true },
  fountain: { cat: 'nature', label: 'Fountain', icon: '⛲', w: 2, d: 2, ft: 6, color: '#b9b6ae', model: 'fountain', cover: 2 },
  picnic: { cat: 'nature', label: 'Picnic table', icon: '🧺', w: 2, d: 1, ft: 3, color: '#9a6a3c', model: 'picnic', cover: 2 },
  playground: { cat: 'nature', label: 'Swing set', icon: '🛝', w: 3, d: 2, ft: 9, color: '#d1352b', model: 'swings' },
  log: { cat: 'nature', label: 'Fallen log', icon: '🪵', w: 1, d: 3, ft: 2.5, color: '#6b4a2b', model: 'log', cover: 2 },
  // people (bystanders, not fighters)
  civilian: { cat: 'people', label: 'Civilian', icon: '🧍', w: 1, d: 1, ft: 5.8, color: '#4a7bd1', model: 'person' },
  crowd: { cat: 'people', label: 'Crowd', icon: '👥', w: 3, d: 2, ft: 5.8, color: '#9b59b6', model: 'crowd', cover: 2 },
  cop: { cat: 'people', label: 'Police officer', icon: '👮', w: 1, d: 1, ft: 6, color: '#1d2b4a', model: 'person', hat: true },
  worker: { cat: 'people', label: 'Construction worker', icon: '👷', w: 1, d: 1, ft: 5.9, color: '#f26b1d', model: 'person', hat: true },
  medic: { cat: 'people', label: 'Paramedic', icon: '🧑\u200d⚕️', w: 1, d: 1, ft: 5.8, color: '#e8e8e8', model: 'person' },
  reporter: { cat: 'people', label: 'Reporter', icon: '🎥', w: 1, d: 1, ft: 5.7, color: '#7d4f9a', model: 'person' },
  child: { cat: 'people', label: 'Child', icon: '🧒', w: 1, d: 1, ft: 4, color: '#e0a030', model: 'person' },
  dog: { cat: 'people', label: 'Dog', icon: '🐕', w: 1, d: 1, ft: 2, color: '#a0743c', model: 'dog' },
  // space, caves and the strange
  stalagmite: { cat: 'scifi', label: 'Stalagmite', icon: '🗻', w: 1, d: 1, ft: 14, color: '#6e5e4e', model: 'spike', cover: 5 },
  crystal: { cat: 'scifi', label: 'Crystals', icon: '💎', w: 1, d: 1, ft: 8, color: '#7fd4ff', model: 'crystal', cover: 5 },
  lava: { cat: 'scifi', label: 'Lava pool', icon: '🌋', w: 3, d: 3, ft: 0.2, color: '#ff5a1f', model: 'lava', flat: true },
  crater: { cat: 'scifi', label: 'Crater', icon: '🕳', w: 4, d: 4, ft: 1.5, color: '#8c8a86', model: 'crater', flat: true },
  asteroid: { cat: 'scifi', label: 'Space rock', icon: '☄', w: 2, d: 2, ft: 10, color: '#6f6a64', model: 'rock', cover: 5 },
  console: { cat: 'scifi', label: 'Computer console', icon: '🖥', w: 2, d: 1, ft: 4, color: '#3a4656', model: 'console', cover: 2 },
  reactor: { cat: 'scifi', label: 'Power core', icon: '⚛', w: 2, d: 2, ft: 14, color: '#4de1ff', model: 'reactor', blocks: true },
  dish: { cat: 'scifi', label: 'Satellite dish', icon: '📡', w: 2, d: 2, ft: 14, color: '#d8dde3', model: 'dish', cover: 5 },
  pod: { cat: 'scifi', label: 'Escape pod', icon: '🛸', w: 2, d: 2, ft: 8, color: '#c4ccd6', model: 'pod', cover: 5 },
  pillar: { cat: 'scifi', label: 'Stone pillar', icon: '🏛', w: 1, d: 1, ft: 18, color: '#8b8579', model: 'pillar', blocks: true },
  torch: { cat: 'scifi', label: 'Torch / brazier', icon: '🔥', w: 1, d: 1, ft: 5, color: '#6b4a2b', model: 'brazier' },
  mushroom: { cat: 'scifi', label: 'Giant mushroom', icon: '🍄', w: 2, d: 2, ft: 12, color: '#b0413e', model: 'mushroom', cover: 5 },
};

/** The ground a map stands on: its colour on the 2D board and the whole look of the 3D scene. */
export const GROUNDS = {
  grass: { label: '🌿 Grass field', board: '#cfe0bb', line: '#7a8f68' },
  city: { label: '🏙 City streets', board: '#c9c9c4', line: '#7d7d78' },
  desert: { label: '🏜 Desert', board: '#e6d3a3', line: '#a8915c' },
  snow: { label: '❄ Snow', board: '#eef3f7', line: '#9fb0c0' },
  dirt: { label: '🟫 Dirt and mud', board: '#b49a76', line: '#7e6648' },
  dungeon: { label: '🧱 Dungeon / underground', board: '#77736b', line: '#4b4842' },
  cavern: { label: '🦇 Cavern', board: '#5a4c40', line: '#3a3029' },
  moon: { label: '🌑 Moon / asteroid', board: '#9c9a96', line: '#6c6a66' },
  space: { label: '🌌 Deep space', board: '#0f1424', line: '#2c3a5c' },
  deck: { label: '🛸 Starship deck', board: '#9aa3ad', line: '#5d6670' },
};
export const FLOOR_FT = 12;
export const propHeightFt = (p) => { const P = PROPS[p.kind] || {}; return p.floors != null ? p.floors * FLOOR_FT : (p.ft ?? P.ft ?? 10); };
export function newProp(kind, x, y) {
  const P = PROPS[kind];
  const p = { id: Math.random().toString(36).slice(2, 9), kind, x: Math.floor(x), y: Math.floor(y), w: P.w, d: P.d, color: P.color };
  if (P.floors != null) p.floors = P.floors; else p.ft = P.ft;
  return p;
}
/** The squares a piece stands on. */
export function propCells(p) { const out = []; for (let i = 0; i < p.w; i++) for (let j = 0; j < p.d; j++) out.push(`${p.x + i},${p.y + j}`); return out; }
/** Terrain plus pieces, as one lookup: square -> what's there (a TERRAIN kind or a piece's rules). */
export function blockers(map) {
  const out = {};
  for (const [k, kind] of Object.entries(map.terrain || {})) if (TERRAIN[kind]) out[k] = TERRAIN[kind];
  for (const p of map.props || []) { const P = PROPS[p.kind]; if (!P || (!P.blocks && !P.cover)) continue; for (const k of propCells(p)) out[k] = { blocks: P.blocks, cover: P.cover, label: P.label }; }
  return out;
}

/** Weather and light: how 3D draws them, the 2D overlay, and a reminder of what they do at the table. */
export const WEATHER = {
  clear: { label: '☀ Clear' },
  rain: { label: '🌧 Rain', hint: 'Rain: −2 to see and hear things at a distance (Perception).' },
  storm: { label: '⛈ Thunderstorm', hint: 'Storm: −2 to Perception; flying in it is hard going. Lightning lights everything up.' },
  snow: { label: '🌨 Snow', hint: 'Snow: slippery footing; −2 to Perception at range.' },
  blizzard: { label: '❄ Blizzard', hint: 'Blizzard: beyond 30 ft everyone has partial concealment (−2); the cold is a hazard.' },
  fog: { label: '🌫 Fog', hint: 'Fog: beyond 30 ft partial concealment (−2), beyond 60 ft total (−5).' },
  sandstorm: { label: '🏜 Sandstorm', hint: 'Sandstorm: partial concealment (−2) beyond 30 ft; −2 to Perception.' },
  ash: { label: '🌋 Ash & embers', hint: 'Ash and embers: smoke fills the air; long fights may call for Fortitude checks.' },
};
export const LIGHTS = {
  day: { label: '🌞 Day' },
  dusk: { label: '🌇 Dusk', hint: 'Dusk: dim light; far shapes are hard to make out.' },
  night: { label: '🌙 Night', hint: 'Night: unlit places give partial concealment (−2) unless you can see in the dark.' },
};

export const SHAPES = ['Burst', 'Cone', 'Line', 'Cloud', 'Cylinder'];

const newId = () => Math.random().toString(36).slice(2, 10);

export function newMap(name = 'Battle map', over = {}) {
  return { id: newId(), name, w: 36, h: 22, scale: 10, zoom: 26, grid: 0.6, ground: 'grass', weather: 'clear', light: 'day', bg: null, terrain: {}, props: [], tokens: {}, templates: [], sel: null, selT: null, selP: null, ...over };
}

/** Bring an older single map ({ template }) or none at all up to the list of maps. */
export function migrateMaps(gs) {
  if (!Array.isArray(gs.maps)) {
    gs.maps = [];
    if (gs.map) {
      const { template, tool, ...rest } = gs.map;
      gs.maps.push(newMap('Battle map', { ...rest, templates: template ? [{ id: newId(), steps: 1, effect: tool?.effect || 'Damage 10', ...template }] : [] }));
    }
    delete gs.map;
  }
  if (!gs.maps.length) gs.maps.push(newMap());
  for (const m of gs.maps) {
    m.terrain ||= {}; m.tokens ||= {}; m.templates ||= []; m.props ||= [];
    if (m.zoom == null) m.zoom = 26;
    if (m.grid == null) m.grid = 0.6;
  }
  if (!gs.maps.some((m) => m.id === gs.mapId)) gs.mapId = gs.maps[0].id;
  return gs.maps.find((m) => m.id === gs.mapId);
}

export const sizeOf = (t) => Math.max(1, Math.min(6, t?.size || 1));
export const centerOf = (t) => ({ x: t.x + sizeOf(t) / 2, y: t.y + sizeOf(t) / 2 });

/** Where a template starts and points: a cone or line can hang off a token and follow it around. */
export function templateGeom(t, tokens = {}) {
  const from = t.from && tokens[t.from] ? centerOf(tokens[t.from]) : null;
  if (t.shape === 'Cone' || t.shape === 'Line') {
    const ox = from ? from.x : t.ox; const oy = from ? from.y : t.oy;
    let ang = t.ang;
    if (ang == null) ang = Math.atan2(t.y - t.oy, t.x - t.ox);
    return { ox, oy, ang, x: t.x, y: t.y };
  }
  return { x: from ? from.x : t.x, y: from ? from.y : t.y };
}

/** Who is inside a template. tokens: { key: {x, y, size} }; scale: feet per square. */
export function insideTemplate(t, tokens, scale) {
  if (!t) return [];
  const r = t.ft / scale;
  const g = templateGeom(t, tokens);
  const out = [];
  for (const [key, p] of Object.entries(tokens)) {
    if (t.from === key && (t.shape === 'Cone' || t.shape === 'Line')) continue; // the one making it
    const c = centerOf(p);
    const reach = sizeOf(p) / 2 - 0.2; // a big creature is caught when any of it is inside
    let hit = false;
    if (t.shape === 'Cone' || t.shape === 'Line') {
      const ux = Math.cos(g.ang); const uy = Math.sin(g.ang);
      const vx = c.x - g.ox; const vy = c.y - g.oy;
      const along = vx * ux + vy * uy; const across = Math.abs(vx * uy - vy * ux);
      if (t.shape === 'Cone') hit = along > -reach && along <= r + reach && across <= Math.max(0, along) * 0.5 + 0.3 + reach;
      else hit = along > -reach && along <= r + reach && across <= Math.max(0.5, (5 / scale) / 2 + 0.3) + reach;
    } else hit = Math.hypot(c.x - g.x, c.y - g.y) <= r + 0.3 + reach;
    if (hit) out.push(key);
  }
  return out;
}

const cellsOf = (t) => { const s = sizeOf(t); const out = new Set(); for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) out.add(`${t.x + i},${t.y + j}`); return out; };

/**
 * What lies between two tokens: { blocked, cover, through } where cover is 0, 2 or 5 (the attack penalty)
 * and blocked means a wall is in the way. Squares either token stands in don't count.
 */
export function sightLine(map, a, b) {
  const A = centerOf(a); const B = centerOf(b);
  const skip = new Set([...cellsOf(a), ...cellsOf(b)]);
  const d = Math.hypot(B.x - A.x, B.y - A.y);
  const steps = Math.max(1, Math.ceil(d * 8));
  let cover = 0; let blocked = false; const through = new Set();
  const what = blockers(map);
  for (let i = 1; i < steps; i++) {
    const x = A.x + ((B.x - A.x) * i) / steps; const y = A.y + ((B.y - A.y) * i) / steps;
    const k = `${Math.floor(x)},${Math.floor(y)}`;
    if (skip.has(k)) continue;
    const T = what[k];
    if (!T) continue;
    through.add(T.label);
    if (T.blocks) blocked = true;
    if (T.cover) cover = Math.max(cover, T.cover);
  }
  return { blocked, cover: blocked ? 0 : cover, through: [...through] };
}

/** Distance in feet between two tokens, edge to edge for big ones (the way the grid is read at the table). */
export function feetBetween(a, b, scale) {
  const A = centerOf(a); const B = centerOf(b);
  const gap = Math.max(0, Math.hypot(A.x - B.x, A.y - B.y) - (sizeOf(a) - 1) / 2 - (sizeOf(b) - 1) / 2);
  return Math.round(gap * scale);
}

/** Paint (or erase with kind null) every square in a box from one corner to the other. */
export function paintBox(map, x1, y1, x2, y2, kind) {
  const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)]; const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
  for (let x = Math.max(0, ax); x <= Math.min(map.w - 1, bx); x++) {
    for (let y = Math.max(0, ay); y <= Math.min(map.h - 1, by); y++) {
      if (kind) map.terrain[`${x},${y}`] = kind; else delete map.terrain[`${x},${y}`];
    }
  }
}

/** Squares outside the map after it shrinks are dropped; tokens are pulled back inside. */
export function resizeMap(map, w, h) {
  map.w = Math.max(5, Math.min(200, Math.round(w)));
  map.h = Math.max(5, Math.min(200, Math.round(h)));
  for (const k of Object.keys(map.terrain)) { const [x, y] = k.split(',').map(Number); if (x >= map.w || y >= map.h) delete map.terrain[k]; }
  for (const t of Object.values(map.tokens)) { t.x = Math.min(t.x, map.w - sizeOf(t)); t.y = Math.min(t.y, map.h - sizeOf(t)); }
  map.props = (map.props || []).filter((p) => p.x < map.w && p.y < map.h);
  for (const p of map.props) { p.w = Math.min(p.w, map.w - p.x); p.d = Math.min(p.d, map.h - p.y); }
}

/** A short, stable id for a picture (so players only download it once). */
export function assetId(data) {
  let h1 = 0x811c9dc5; let h2 = 0;
  for (let i = 0; i < data.length; i += Math.max(1, Math.floor(data.length / 20000))) { h1 = Math.imul(h1 ^ data.charCodeAt(i), 16777619); h2 = (h2 * 31 + data.charCodeAt(i)) | 0; }
  return `a${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${data.length.toString(36)}`;
}
