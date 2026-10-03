// Vehicles & HQs: premade vehicles and headquarters priced by the DC Adventures equipment rules,
// with the rules themselves, a random roller, and "give it to my character".

import { h, clear, toast, copyText, inkFor } from './dom.js';
import { state } from './store.js';
import { vehicleCost, hqCost, vehicleStatLine, hqStatLine, vehicleFeature, hqFeature, featureLabel, vehiclePowerText, randomVehicle, randomHeadquarters, vehicleData, hqData } from '../engine/vehicles.js';
import { randomSeed } from '../engine/rng.js';
import { initArmory, armorySection } from './armory.js';
import { spaceTravelTime, spaceRoutes, sensorRange, randomPlanet } from '../engine/space.js';

let R;
let root;
let hooks = {};
let section = 'vehicles';
const f = { ships: { setting: '', category: '', q: '' }, vehicles: { setting: '', category: '', q: '' }, hq: { setting: '', q: '' }, rules: { q: '' } };
let picked = { vehicles: null, hq: null };

const SETTING_COLOR = {
  Mine: '#d1495b', Alien: '#2a9d5c',
  Modern: '#2f6fde', Military: '#556b2f', Villain: '#8b1e3f', 'Sci-Fi': '#1f8f8a', Fantasy: '#7a3fb8', Steampunk: '#a0662b',
  Exotic: '#c2410c', Cosmic: '#3b2f8f', Mystic: '#6b3fa0',
};
const CAT_GLYPH = { Ground: '🚗', Water: '⛵', Air: '✈', Space: '🚀', Exotic: '🌀' };
const colorOf = (s) => SETTING_COLOR[s] || '#555555';

export function initGarage(rules, el, h2 = {}) {
  R = rules;
  root = el;
  hooks = h2;
  initArmory(rules, { render: () => renderGarage(), applyToCurrent: (c) => hooks.applyToCurrent?.(c) });
  try { section = localStorage.getItem('dcugen.garage') || 'gear'; } catch { /* ignore */ }
}

/** Put a vehicle or headquarters on the open character's equipment, raising Equipment if needed (DCA 147). */
function giveToCharacter(item, kind) {
  if (!state.current) { toast('Open a character on the Forge first.'); return; }
  const c = JSON.parse(JSON.stringify(state.current));
  const cost = kind === 'vehicle' ? vehicleCost(item, R).total : hqCost(item, R).total;
  const effect = kind === 'vehicle' ? vehicleStatLine(item, R) : hqStatLine(item, R);
  c.equipment = [...(c.equipment || []), { name: item.name, cost, effect, category: kind === 'vehicle' ? 'Vehicle' : 'Headquarters' }];
  const ep = c.equipment.reduce((t, e) => t + (e.cost || 0), 0);
  const need = Math.ceil(ep / 5);
  const adv = (c.advantages = c.advantages || []).find((a) => a.name === 'Equipment');
  if (adv) adv.rank = Math.max(adv.rank || 1, need); else c.advantages.push({ name: 'Equipment', rank: need });
  hooks.applyToCurrent?.(c);
  toast(`${item.name} (${cost} ep) added to ${c.identity?.codename || 'the character'}. Equipment is now rank ${need}.`);
}

function chipRow(values, current, onPick, counts) {
  return h('div', { class: 'bst-realms', role: 'group' },
    h('button', { type: 'button', class: 'bst-realm', 'aria-pressed': String(!current), style: { '--rc': '#444' }, onClick: () => onPick('') }, h('span', null, 'All'), h('span', { class: 'count' }, counts[''])),
    values.map((v) => h('button', { type: 'button', class: 'bst-realm', 'aria-pressed': String(current === v), style: { '--rc': colorOf(v), '--rc-ink': inkFor(colorOf(v)) }, onClick: () => onPick(current === v ? '' : v) },
      h('span', null, v), h('span', { class: 'count' }, counts[v] || 0))));
}

function statBox(label, value) {
  return h('div', null, h('b', { class: 'num' }, value ?? '—'), h('span', null, label));
}

// ---- vehicles -----------------------------------------------------------------------------------

function vehicleSpeed(v) {
  return v.speed ?? (v.alt_movement?.[0]?.rank) ?? '—';
}

function vehicleCard(v) {
  const col = colorOf(v.setting);
  const sel = picked.vehicles?.id === v.id;
  return h('button', { type: 'button', class: `bst-card ${sel ? 'sel' : ''}`, style: { '--rc': col, '--rc-ink': inkFor(col) }, onClick: () => { picked.vehicles = v; renderGarage(); scrollToDetail(); } },
    h('div', { class: 'bst-card-top' }, h('span', { class: 'bst-glyph', 'aria-hidden': 'true' }, CAT_GLYPH[v.category] || '•'), h('span', { class: 'bst-cat' }, `${v.setting} · ${v.class || v.category}`), h('span', { class: 'bst-pl num' }, `${v.cost} ep`)),
    h('div', { class: 'bst-name' }, v.name),
    h('div', { class: 'bst-meta' }, [v.size, v.movement && v.movement !== 'Speed' ? v.movement : null, v.crew].filter(Boolean).join(' · ')),
    v.summary ? h('p', { class: 'bst-sum' }, v.summary) : null,
    h('div', { class: 'bst-stats' }, statBox('STR', v.strength), statBox('SPD', vehicleSpeed(v)), statBox('DEF', v.defense), statBox('TOU', v.toughness)));
}

function featureList(list, find) {
  if (!list?.length) return null;
  return h('ul', { class: 'gar-feats' }, list.map((x) => {
    const def = find(x.name, R);
    return h('li', null, h('b', null, featureLabel(x)), def?.text ? `: ${def.text}` : '');
  }));
}

function costTable(breakdown, total, book) {
  return h('table', { class: 'gar-cost' }, h('tbody', null,
    breakdown.map((b) => h('tr', null, h('td', null, b.label), h('td', { class: 'num' }, `${b.cost} ep`))),
    h('tr', { class: 'final' }, h('td', null, 'Total'), h('td', { class: 'num' }, `${total} ep`)),
    book != null && book !== total ? h('tr', { class: 'book' }, h('td', null, 'Printed in the book'), h('td', { class: 'num' }, `${book} ep`)) : null));
}

function vehicleDetail(v) {
  if (!v) return h('div', { class: 'bst-empty' }, h('p', null, 'Pick a vehicle to see its stat block, cost breakdown and what its features do.'));
  const c = vehicleCost(v, R);
  const col = colorOf(v.setting);
  const line = vehicleStatLine(v, R);
  return h('div', { id: 'gar-detail', class: 'bst-detail' },
    h('article', { class: 'file' },
      h('div', { class: 'file-head', style: { '--hero': col, '--hero-ink': inkFor(col) } },
        h('div', { class: 'pl-badge' }, h('b', { class: 'num' }, c.total), h('span', null, 'EQUIP. POINTS')),
        h('div', { class: 'eyebrow' }, `${v.setting} · ${v.class || v.category} ${v.class ? '' : 'vehicle'}${v.source && v.source !== 'DCUGen' ? ` · ${v.source}` : ''}`),
        h('h1', { class: 'codename', style: { fontSize: 'clamp(28px, 4.5vw, 46px)' } }, v.name),
        h('div', { class: 'realname' }, [v.crew, v.summary].filter(Boolean).join(' · '))),
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'button', onClick: () => giveToCharacter(v, 'vehicle') }, 'Give to current character'),
        h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(`${v.name}: ${line}`)) ? 'Stat block copied' : 'Copy failed') }, 'Copy stat block'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', onClick: () => startFrom(v, 'vehicle') }, 'Copy to builder'),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => { picked.vehicles = randomVehicle(R, { seed: randomSeed(), setting: f.vehicles.setting || undefined, category: f.vehicles.category || undefined }); renderGarage(); } }, '🎲 Random variant')),
      h('div', { class: 'file-body gar-body' },
        h('div', { class: 'col' },
          h('section', { class: 'sec' }, h('h3', null, 'Traits'),
            h('div', { class: 'bst-stats gar-big' }, statBox('SIZE', v.size), statBox('STRENGTH', v.strength), statBox('SPEED', vehicleSpeed(v)), statBox('DEFENSE', v.defense), statBox('TOUGHNESS', v.toughness)),
            h('p', { class: 'gar-line' }, line)),
          v.powers?.length ? h('section', { class: 'sec' }, h('h3', null, 'Weapons and powers'),
            v.powers.map((p) => h('div', { class: 'power' }, h('div', { class: 'power-top' }, h('span', { class: 'power-name' }, p.name || p.effect)), h('div', { class: 'power-text' }, vehiclePowerText(p, R))))) : null,
          v.features?.length ? h('section', { class: 'sec' }, h('h3', null, 'Features'), featureList(v.features, vehicleFeature)) : null),
        h('div', { class: 'col' },
          h('section', { class: 'sec' }, h('h3', null, 'Cost', h('span', { class: 'pts' }, 'equipment points')),
            costTable(c.breakdown, c.total, v.book_cost),
            v.book_cost_note ? h('p', { class: 'hint' }, v.book_cost_note) : null,
            h('p', { class: 'hint' }, `Costs ${c.total} equipment points: ${Math.ceil(c.total / 5)} rank${Math.ceil(c.total / 5) === 1 ? '' : 's'} of the Equipment advantage on its own. A team can share one vehicle (Equipment points pooled).`))))));
}

function vehicles(space = false) {
  const data = vehicleData(R);
  const all = [...loadMine().vehicles, ...(data.premade || [])].filter((v) => !space || v.category === 'Space');
  const fv = space ? f.ships : f.vehicles;
  // Starships group by class (fighter, freighter, cruiser...); other vehicles by setting.
  const key = space ? 'class' : 'setting';
  const groupOf = (v) => v[key] || (space ? 'Other' : v.setting);
  const settings = [...new Set(all.map(groupOf))];
  const counts = { '': all.length, ...Object.fromEntries(settings.map((s) => [s, all.filter((v) => groupOf(v) === s).length])) };
  const cats = [...new Set(all.map((v) => v.category))];
  const grid = h('div', { class: 'bst-grid' });
  const draw = () => {
    clear(grid);
    const term = fv.q.toLowerCase();
    const list = all.filter((v) => (!fv.setting || groupOf(v) === fv.setting) && (space || !fv.category || v.category === fv.category)
      && (!term || `${v.name} ${v.summary || ''} ${v.category} ${v.setting} ${v.class || ''} ${v.size}`.toLowerCase().includes(term)));
    if (!list.length) grid.append(h('p', { class: 'hint' }, 'No vehicle matches.'));
    for (const v of list) grid.append(vehicleCard(v));
  };
  draw();
  return [
    space ? spaceTools() : null,
    chipRow(settings, fv.setting, (s) => { fv.setting = s; renderGarage(); }, counts),
    h('div', { class: 'bst-filters' },
      h('input', { type: 'search', id: space ? 'ship-q' : 'veh-q', placeholder: space ? 'Search: freighter, cloak, tractor beam, hive...' : 'Search: galleon, tank, carpet, jet...', value: fv.q, 'aria-label': space ? 'Search starships' : 'Search vehicles', onInput: (e) => { fv.q = e.target.value; draw(); } }),
      space ? null : h('label', { class: 'field' }, h('span', null, 'Type'), h('select', { id: 'veh-cat', onChange: (e) => { fv.category = e.target.value; draw(); } },
        h('option', { value: '' }, 'Ground, water, air, space'), cats.map((c) => h('option', { value: c, selected: c === fv.category }, `${CAT_GLYPH[c] || ''} ${c}`)))),
      h('button', { class: 'btn primary', type: 'button', onClick: () => {
        const pool = all.filter((v) => !fv.setting || groupOf(v) === fv.setting);
        picked.vehicles = space || pool.length < all.length
          ? (pool.length ? pool[Math.floor(Math.random() * pool.length)] : null)
          : randomVehicle(R, { seed: randomSeed(), category: fv.category || undefined });
        renderGarage(); scrollToDetail();
      } }, space ? '🎲 Random starship' : '🎲 Random vehicle')),
    h('div', { class: 'bst-layout' }, h('div', { class: 'bst-list' }, grid), vehicleDetail(picked.vehicles)),
  ];
}


// ---- space tools: travel times, sensors, planets --------------------------------------------------

const spaceState = { route: '', st: 2, flight: 10, sensor: 6, planet: null };

function spaceTools() {
  const routes = spaceRoutes(R) || [];
  if (!spaceState.route && routes.length) spaceState.route = (routes.find((r) => /mars/i.test(r.id)) || routes[0]).id;
  const out = h('div', { class: 'result' });
  const sense = h('div', { class: 'result' });
  const drawTravel = () => {
    clear(out);
    try {
      const t = spaceTravelTime(R, { route: spaceState.route, spaceTravelRank: spaceState.st || 0, flightRank: spaceState.flight || 0 });
      out.append(h('b', null, t.name || ''), t.distance ? ` (${t.distance})` : '', h('div', null, t.text));
    } catch (e) { out.append(e.message); }
  };
  const drawSensor = () => {
    clear(sense);
    try { sense.append(sensorRange(R, Number(spaceState.sensor) || 0).text); } catch (e) { sense.append(e.message); }
  };
  drawTravel();
  drawSensor();
  const num = (label, key, min, max, after) => h('label', { class: 'field' }, h('span', null, label),
    h('input', { type: 'number', min, max, value: spaceState[key], onInput: (e) => { spaceState[key] = Number(e.target.value); after(); } }));
  const planet = spaceState.planet;
  return h('div', { class: 'space-tools' },
    h('section', { class: 'panel' }, h('h2', null, 'Travel time'),
      h('div', { class: 'gar-build-grid' },
        h('label', { class: 'field' }, h('span', null, 'Trip'), h('select', { onChange: (e) => { spaceState.route = e.target.value; drawTravel(); } },
          routes.map((r) => h('option', { value: r.id, selected: r.id === spaceState.route }, r.name)))),
        num('Space Travel rank', 'st', 0, 3, drawTravel), num('Flight rank', 'flight', 0, 40, drawTravel)),
      out,
      h('p', { class: 'hint', style: { margin: '6px 0 0' } }, 'Flight uses the book\'s time = distance − speed rank math. Space Travel times are DCUGen\'s, since the book leaves FTL to the speed of plot.')),
    h('section', { class: 'panel' }, h('h2', null, 'Sensor range'),
      num('Extended senses rank', 'sensor', 0, 30, drawSensor), sense),
    h('section', { class: 'panel' }, h('h2', null, 'Random world'),
      h('button', { class: 'btn primary', type: 'button', onClick: () => { spaceState.planet = randomPlanet(R, { seed: randomSeed() }); renderGarage(); } }, '🎲 Roll a planet'),
      planet ? h('dl', { class: 'bio-dl', style: { marginTop: '8px' } }, planetRows(planet)) : h('p', { class: 'hint' }, 'World type, gravity, atmosphere, temperature, hazards, who lives there and what\'s worth finding.')));
}

function planetRows(pl) {
  const rows = [];
  for (const [k, v] of Object.entries(pl)) {
    if (k === 'seed' || v == null || v === '') continue;
    const label = k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    const text = typeof v === 'object' ? (Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? x.text || x.name || JSON.stringify(x) : x)).join('; ') : [v.result ?? v.text ?? v.name, v.game_effect, v.notes].filter(Boolean).join(' · ')) : String(v);
    rows.push(h('dt', null, label), h('dd', null, text));
  }
  return rows;
}

// ---- headquarters -------------------------------------------------------------------------------

function hqCard(q) {
  const col = colorOf(q.setting);
  const sel = picked.hq?.id === q.id;
  return h('button', { type: 'button', class: `bst-card ${sel ? 'sel' : ''}`, style: { '--rc': col, '--rc-ink': inkFor(col) }, onClick: () => { picked.hq = q; renderGarage(); scrollToDetail(); } },
    h('div', { class: 'bst-card-top' }, h('span', { class: 'bst-glyph', 'aria-hidden': 'true' }, '🏰'), h('span', { class: 'bst-cat' }, q.setting), h('span', { class: 'bst-pl num' }, `${q.cost} ep`)),
    h('div', { class: 'bst-name' }, q.name),
    h('div', { class: 'bst-meta' }, `${q.size}${q.interior_size ? ` (inside: ${q.interior_size})` : ''} · Toughness ${q.toughness ?? 6} · ${(q.features || []).length} features`),
    q.summary ? h('p', { class: 'bst-sum' }, q.summary) : null);
}

function hqDetail(q) {
  if (!q) return h('div', { class: 'bst-empty' }, h('p', null, 'Pick a headquarters to see its features and cost.'));
  const c = hqCost(q, R);
  const col = colorOf(q.setting);
  const line = hqStatLine(q, R);
  return h('div', { id: 'gar-detail', class: 'bst-detail' },
    h('article', { class: 'file' },
      h('div', { class: 'file-head', style: { '--hero': col, '--hero-ink': inkFor(col) } },
        h('div', { class: 'pl-badge' }, h('b', { class: 'num' }, c.total), h('span', null, 'EQUIP. POINTS')),
        h('div', { class: 'eyebrow' }, `${q.setting} headquarters${q.source && q.source !== 'DCUGen' ? ` · ${q.source}` : ''}`),
        h('h1', { class: 'codename', style: { fontSize: 'clamp(28px, 4.5vw, 46px)' } }, q.name),
        h('div', { class: 'realname' }, [q.crew, q.summary].filter(Boolean).join(' · '))),
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'button', onClick: () => giveToCharacter(q, 'hq') }, 'Give to current character'),
        h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(`${q.name}: ${line}`)) ? 'Stat block copied' : 'Copy failed') }, 'Copy stat block'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', onClick: () => startFrom(q, 'hq') }, 'Copy to builder'),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => { picked.hq = randomHeadquarters(R, { seed: randomSeed(), setting: f.hq.setting || undefined }); renderGarage(); } }, '🎲 Random variant')),
      h('div', { class: 'file-body gar-body' },
        h('div', { class: 'col' },
          h('section', { class: 'sec' }, h('h3', null, 'Traits'),
            h('div', { class: 'bst-stats gar-big' }, statBox('SIZE', q.size), statBox('INSIDE', q.interior_size || q.size), statBox('TOUGHNESS', q.toughness ?? 6), statBox('FEATURES', (q.features || []).length)),
            h('p', { class: 'gar-line' }, line)),
          h('section', { class: 'sec' }, h('h3', null, 'Features'), featureList(q.features, hqFeature))),
        h('div', { class: 'col' },
          h('section', { class: 'sec' }, h('h3', null, 'Cost', h('span', { class: 'pts' }, 'equipment points')),
            costTable(c.breakdown, c.total, q.book_cost),
            q.book_cost_note ? h('p', { class: 'hint' }, q.book_cost_note) : null,
            h('p', { class: 'hint' }, 'Teammates can pool equipment points to share one headquarters (DCA 159).'))))));
}

function headquarters() {
  const all = [...loadMine().hq, ...(hqData(R).premade || [])];
  const fq = f.hq;
  const settings = [...new Set(all.map((v) => v.setting))];
  const counts = { '': all.length, ...Object.fromEntries(settings.map((s) => [s, all.filter((v) => v.setting === s).length])) };
  const grid = h('div', { class: 'bst-grid' });
  const draw = () => {
    clear(grid);
    const term = fq.q.toLowerCase();
    for (const q of all.filter((x) => (!fq.setting || x.setting === fq.setting) && (!term || `${x.name} ${x.summary || ''} ${(x.features || []).map((y) => y.name).join(' ')}`.toLowerCase().includes(term)))) grid.append(hqCard(q));
    if (!grid.children.length) grid.append(h('p', { class: 'hint' }, 'No headquarters matches.'));
  };
  draw();
  return [
    chipRow(settings, fq.setting, (s) => { fq.setting = s; renderGarage(); }, counts),
    h('div', { class: 'bst-filters' },
      h('input', { type: 'search', id: 'hq-q', placeholder: 'Search: castle, moon, lab, hangar...', value: fq.q, 'aria-label': 'Search headquarters', onInput: (e) => { fq.q = e.target.value; draw(); } }),
      h('button', { class: 'btn primary', type: 'button', onClick: () => { picked.hq = randomHeadquarters(R, { seed: randomSeed(), setting: fq.setting || undefined }); renderGarage(); scrollToDetail(); } }, '🎲 Random headquarters')),
    h('div', { class: 'bst-layout' }, h('div', { class: 'bst-list' }, grid), hqDetail(picked.hq)),
  ];
}

// ---- build your own -----------------------------------------------------------------------------

const MINE_KEY = 'dcugen.mygarage.v1';
function loadMine() { try { return { vehicles: [], hq: [], ...JSON.parse(localStorage.getItem(MINE_KEY) || '{}') }; } catch { return { vehicles: [], hq: [] }; } }
function saveMine(m) { try { localStorage.setItem(MINE_KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ } }

let draft = null;
let draftKind = 'vehicle';

function blankVehicle(size = 'Large') {
  const s = vehicleData(R).sizes.find((x) => x.name === size) || vehicleData(R).sizes[0];
  return { id: `my-${Date.now().toString(36)}`, name: 'My Vehicle', category: 'Ground', setting: 'Mine', size: s.name, strength: s.strength, speed: 5, movement: 'Speed', defense: s.base_defense ?? 10 + s.defense, toughness: s.toughness, features: [], powers: [], crew: '', summary: '' };
}
function blankHq() {
  return { id: `my-${Date.now().toString(36)}`, name: 'My Headquarters', setting: 'Mine', size: 'Medium', toughness: 8, features: [], crew: '', summary: '' };
}

/** Every distinct weapon/system power on the premades, as presets for the builder. */
function powerPresets() {
  const seen = new Map();
  for (const v of vehicleData(R).premade || []) {
    for (const p of v.powers || []) {
      const key = `${p.name}|${vehiclePowerText(p, R)}`;
      if (!seen.has(key)) seen.set(key, { p, from: v.name });
    }
  }
  return [...seen.values()].sort((a, b) => (a.p.name || '').localeCompare(b.p.name || ''));
}

function startFrom(item, kind) {
  draftKind = kind;
  draft = { ...JSON.parse(JSON.stringify(item)), id: `my-${Date.now().toString(36)}`, setting: 'Mine', name: `${item.name} (custom)` };
  delete draft.book_cost;
  delete draft.book_cost_note;
  delete draft.cost;
  section = 'build';
  renderGarage();
}

function builder() {
  const mine = loadMine();
  if (!draft) draft = draftKind === 'vehicle' ? blankVehicle() : blankHq();
  const isV = draftKind === 'vehicle';
  const set = (fn) => { fn(draft); renderGarage(); };
  const num = (label, key, min = -5, max = 40) => h('label', { class: 'field' }, h('span', null, label),
    h('input', { type: 'number', min, max, value: draft[key] ?? 0, onChange: (e) => set((d) => { d[key] = Number(e.target.value) || 0; }) }));
  const text = (label, key, ph = '') => h('label', { class: 'field' }, h('span', null, label),
    h('input', { type: 'text', value: draft[key] || '', placeholder: ph, onChange: (e) => set((d) => { d[key] = e.target.value; }) }));
  const sel = (label, key, options, onSet) => h('label', { class: 'field' }, h('span', null, label),
    h('select', { onChange: (e) => set((d) => { if (onSet) onSet(d, e.target.value); else d[key] = e.target.value; }) }, options.map((o) => h('option', { value: o, selected: o === draft[key] }, o))));

  const feats = isV ? vehicleData(R).features : hqData(R).features;
  const findF = isV ? vehicleFeature : hqFeature;
  const featPick = h('select', { 'aria-label': 'Feature to add' }, feats.map((x) => h('option', { value: x.name }, `${x.name} (${x.cost}${x.per_rank ? '/rank' : ''} ep)`)));
  const presets = isV ? powerPresets() : [];
  const powPick = isV ? h('select', { 'aria-label': 'Weapon or system to add' }, presets.map((x, i) => h('option', { value: i }, `${x.p.name}: ${vehiclePowerText(x.p, R)}`))) : null;

  let cost;
  let line;
  try {
    cost = isV ? vehicleCost(draft, R) : hqCost(draft, R);
    line = isV ? vehicleStatLine(draft, R) : hqStatLine(draft, R);
  } catch (e) { cost = { total: 0, breakdown: [] }; line = e.message; }

  const form = h('section', { class: 'panel gar-build' },
    h('div', { class: 'ae-tabs', role: 'group', 'aria-label': 'What to build' },
      [['vehicle', 'Vehicle or starship'], ['hq', 'Headquarters']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(draftKind === k), onClick: () => { draftKind = k; draft = null; renderGarage(); } }, l))),
    h('div', { class: 'grid2' }, text('Name', 'name'), text('Crew / notes', 'crew', isV ? '1 pilot, 4 passengers' : 'Who lives or works here')),
    text('Description', 'summary', 'One line about it'),
    isV ? h('div', { class: 'gar-build-grid' },
      sel('Type', 'category', ['Ground', 'Water', 'Air', 'Space', 'Exotic'], (d, v) => { d.category = v; d.movement = { Ground: 'Speed', Water: 'Swimming', Air: 'Flight', Space: 'Flight', Exotic: 'Speed' }[v]; }),
      sel('Size', 'size', vehicleData(R).sizes.map((s) => s.name), (d, v) => { const s = vehicleData(R).sizes.find((x) => x.name === v); Object.assign(d, { size: v, strength: Math.max(d.strength, s.strength), toughness: Math.max(d.toughness, s.toughness), defense: s.base_defense ?? 10 + s.defense }); }),
      sel('Moves by', 'movement', ['Speed', 'Flight', 'Swimming', 'Burrowing']),
      num('Speed rank', 'speed', 0, 40), num('Strength', 'strength', 0, 40), num('Defense', 'defense', 0, 30), num('Toughness', 'toughness', 0, 40))
      : h('div', { class: 'gar-build-grid' },
        sel('Size', 'size', hqData(R).sizes.map((s) => s.name)),
        num('Toughness', 'toughness', 6, 40)),
    h('div', { class: 'label', style: { marginTop: '10px' } }, 'Features'),
    h('ul', { class: 'gar-feats' }, (draft.features || []).map((x, i) => h('li', null, h('b', null, featureLabel(x)), findF(x.name, R)?.text ? `: ${findF(x.name, R).text}` : '',
      h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${x.name}`, onClick: () => set((d) => { d.features.splice(i, 1); }) }, '✕')))),
    h('div', { class: 'add-row' }, featPick, h('button', { class: 'btn', type: 'button', onClick: () => set((d) => {
      const ex = d.features.find((x) => x.name === featPick.value);
      if (ex) ex.ranks = (ex.ranks || 1) + 1; else d.features.push({ name: featPick.value });
    }) }, 'Add feature')),
    isV ? [h('div', { class: 'label', style: { marginTop: '10px' } }, 'Weapons and systems'),
      h('ul', { class: 'gar-feats' }, (draft.powers || []).map((p, i) => h('li', null, h('b', null, p.name || p.effect), `: ${vehiclePowerText(p, R)}`,
        h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${p.name}`, onClick: () => set((d) => { d.powers.splice(i, 1); }) }, '✕')))),
      h('div', { class: 'add-row' }, powPick, h('button', { class: 'btn', type: 'button', onClick: () => set((d) => { d.powers = [...(d.powers || []), JSON.parse(JSON.stringify(presets[Number(powPick.value)].p))]; }) }, 'Add')),
      h('p', { class: 'hint' }, 'Presets come from every premade vehicle and starship: guns, torpedoes, shields, sensors, drives, tractor beams.')] : null);

  const out = { ...draft, cost: cost.total };
  const mineList = isV ? mine.vehicles : mine.hq;
  const preview = h('section', { class: 'panel' },
    h('h2', null, `${draft.name} · ${cost.total} ep`),
    h('p', { class: 'gar-line' }, line),
    costTable(cost.breakdown, cost.total),
    h('p', { class: 'hint' }, `Needs ${Math.ceil(cost.total / 5)} rank${Math.ceil(cost.total / 5) === 1 ? '' : 's'} of the Equipment advantage on its own (5 ep per rank).`),
    h('div', { class: 'btn-row', style: { marginTop: '10px' } },
      h('button', { class: 'btn primary', type: 'button', onClick: () => giveToCharacter(out, isV ? 'vehicle' : 'hq') }, 'Give to current character'),
      h('button', { class: 'btn', type: 'button', onClick: () => {
        const m = loadMine();
        const list = isV ? m.vehicles : m.hq;
        const i = list.findIndex((x) => x.id === out.id);
        if (i >= 0) list[i] = out; else list.unshift(out);
        saveMine(m);
        toast(`${out.name} saved to My ${isV ? 'vehicles' : 'headquarters'}`);
        renderGarage();
      } }, 'Save to my list'),
      h('button', { class: 'btn ghost', type: 'button', onClick: () => { draft = null; renderGarage(); } }, 'Start over')),
    mineList.length ? [h('div', { class: 'label', style: { margin: '14px 0 6px' } }, `My ${isV ? 'vehicles' : 'headquarters'} (also listed with the premades)`),
      h('ul', { class: 'gar-feats' }, mineList.map((x) => h('li', null,
        h('button', { class: 'linkish', type: 'button', onClick: () => { draft = JSON.parse(JSON.stringify(x)); renderGarage(); } }, x.name), ` · ${x.cost} ep `,
        h('button', { class: 'x', type: 'button', 'aria-label': `Delete ${x.name}`, onClick: () => {
          const m = loadMine();
          if (isV) m.vehicles = m.vehicles.filter((y) => y.id !== x.id); else m.hq = m.hq.filter((y) => y.id !== x.id);
          saveMine(m);
          if (draft?.id === x.id) draft = null;
          renderGarage();
        } }, '✕'))))] : null);
  return [h('p', { class: 'hint' }, 'Build any vehicle, starship or base by the book: size sets the starting traits, and every extra rank, feature and weapon is priced for you. Start from a premade with "Copy to builder" on its page.'),
    h('div', { class: 'gar-build-layout' }, form, preview)];
}

// ---- rules --------------------------------------------------------------------------------------

function rules() {
  const v = vehicleData(R);
  const q = hqData(R);
  const space = R.raw.spaceRules?.rules || [];
  const spaceGroups = [...new Set(space.map((r) => r.group || 'Space'))].map((g) => [`Space · ${g}`, space.filter((r) => (r.group || 'Space') === g)]);
  const groups = [
    ['Vehicles', v.rules || []],
    ['Headquarters', q.rules || []],
    ...spaceGroups,
  ];
  const grid = h('div', { class: 'rule-grid' });
  const draw = () => {
    clear(grid);
    const term = f.rules.q.toLowerCase();
    for (const [group, list] of groups) {
      for (const r of list) {
        if (term && !`${r.title} ${r.text}`.toLowerCase().includes(term)) continue;
        grid.append(h('article', { class: 'panel rule-card' },
          h('div', { class: 'eyebrow' }, group), h('h3', { class: 'rule-title' }, r.title),
          h('p', { style: { margin: 0, whiteSpace: 'pre-line' } }, r.text),
          r.table ? h('div', { class: 'table-scroll' }, h('table', { class: 'gar-cost' },
            h('thead', null, h('tr', null, r.table.columns.map((c) => h('th', null, c)))),
            h('tbody', null, r.table.rows.map((row) => h('tr', null, row.map((c) => h('td', null, String(c)))))))) : null,
          r.source ? h('div', { class: 'rule-src' }, r.source) : null));
      }
    }
    // Tables last: sizes and features with their costs.
    if (!term || /size|feature|cost/.test(term)) {
      grid.append(h('article', { class: 'panel rule-card' }, h('div', { class: 'eyebrow' }, 'Vehicles'), h('h3', { class: 'rule-title' }, 'Vehicle sizes'),
        h('table', { class: 'gar-cost' }, h('thead', null, h('tr', null, ['Size', 'Str', 'Tou', 'Def', 'Cost'].map((x) => h('th', null, x)))),
          h('tbody', null, (v.sizes || []).map((s) => h('tr', null, h('td', null, `${s.name}${s.examples ? ` (${s.examples})` : ''}`), h('td', { class: 'num' }, s.strength), h('td', { class: 'num' }, s.toughness), h('td', { class: 'num' }, s.base_defense ?? s.defense), h('td', { class: 'num' }, s.cost)))))));
      grid.append(h('article', { class: 'panel rule-card' }, h('div', { class: 'eyebrow' }, 'Headquarters'), h('h3', { class: 'rule-title' }, 'Headquarters sizes'),
        h('table', { class: 'gar-cost' }, h('thead', null, h('tr', null, ['Size', 'Cost'].map((x) => h('th', null, x)))),
          h('tbody', null, (q.sizes || []).map((s) => h('tr', null, h('td', null, `${s.name}${s.examples ? ` (${s.examples})` : ''}`), h('td', { class: 'num' }, s.cost)))))));
      for (const [group, list] of [['Vehicle features', v.features || []], ['Headquarters features', q.features || []]]) {
        grid.append(h('article', { class: 'panel rule-card' }, h('div', { class: 'eyebrow' }, group.split(' ')[0]), h('h3', { class: 'rule-title' }, group),
          h('ul', { class: 'gar-feats' }, list.map((x) => h('li', null, h('b', null, `${x.name} (${x.cost}${x.per_rank ? '/rank' : ''} ep)`), x.text ? `: ${x.text}` : '', x.source ? h('span', { class: 'rule-src', style: { display: 'inline', marginLeft: '6px' } }, x.source) : null)))));
      }
    }
  };
  draw();
  return [
    h('div', { class: 'bst-filters' }, h('input', { type: 'search', id: 'gar-rules-q', placeholder: 'Search the rules: chase, ramming, spaceship, shields, sails...', value: f.rules.q, 'aria-label': 'Search vehicle and headquarters rules', onInput: (e) => { f.rules.q = e.target.value; draw(); } })),
    grid,
  ];
}

function scrollToDetail() {
  requestAnimationFrame(() => document.getElementById('gar-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

const SECTIONS = [['gear', 'Equipment'], ['vehicles', 'Vehicles'], ['ships', 'Starships'], ['hq', 'Headquarters'], ['build', 'Build your own'], ['rules', 'Rules']];

export function renderGarage() {
  if (!root) return;
  clear(root);
  const vCount = (vehicleData(R).premade || []).length;
  const qCount = (hqData(R).premade || []).length;
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Gear & Vehicles'),
    h('p', null, `Equipment for every genre, ${vCount} vehicles and starships, and ${qCount} headquarters, from pocket knives to dreadnoughts and wizard towers. Every cost follows the DC Adventures equipment rules (DCA 145-163), and anything here can go straight onto the character you have open; the Equipment advantage updates itself.`))));
  root.append(h('div', { class: 'ae-tabs', role: 'group', 'aria-label': 'Section', style: { marginBottom: '14px' } },
    SECTIONS.map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(section === id), onClick: () => { section = id; try { localStorage.setItem('dcugen.garage', id); } catch { /* ignore */ } renderGarage(); } }, label))));
  root.append(...(section === 'gear' ? armorySection() : section === 'vehicles' ? vehicles() : section === 'ships' ? vehicles(true) : section === 'hq' ? headquarters() : section === 'build' ? builder() : rules()));
}

