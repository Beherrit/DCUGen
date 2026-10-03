// Vehicles & HQs: premade vehicles and headquarters priced by the DC Adventures equipment rules,
// with the rules themselves, a random roller, and "give it to my character".

import { h, clear, toast, copyText, inkFor } from './dom.js';
import { state } from './store.js';
import { vehicleCost, hqCost, vehicleStatLine, hqStatLine, vehicleFeature, hqFeature, featureLabel, vehiclePowerText, randomVehicle, randomHeadquarters, vehicleData, hqData } from '../engine/vehicles.js';
import { randomSeed } from '../engine/rng.js';

let R;
let root;
let hooks = {};
let section = 'vehicles';
const f = { vehicles: { setting: '', category: '', q: '' }, hq: { setting: '', q: '' }, rules: { q: '' } };
let picked = { vehicles: null, hq: null };

const SETTING_COLOR = {
  Modern: '#2f6fde', Military: '#556b2f', Villain: '#8b1e3f', 'Sci-Fi': '#1f8f8a', Fantasy: '#7a3fb8', Steampunk: '#a0662b',
  Exotic: '#c2410c', Cosmic: '#3b2f8f', Mystic: '#6b3fa0',
};
const CAT_GLYPH = { Ground: '🚗', Water: '⛵', Air: '✈', Space: '🚀', Exotic: '🌀' };
const colorOf = (s) => SETTING_COLOR[s] || '#555555';

export function initGarage(rules, el, h2 = {}) {
  R = rules;
  root = el;
  hooks = h2;
  try { section = localStorage.getItem('dcugen.garage') || 'vehicles'; } catch { /* ignore */ }
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
    h('div', { class: 'bst-card-top' }, h('span', { class: 'bst-glyph', 'aria-hidden': 'true' }, CAT_GLYPH[v.category] || '•'), h('span', { class: 'bst-cat' }, `${v.setting} · ${v.category}`), h('span', { class: 'bst-pl num' }, `${v.cost} ep`)),
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
        h('div', { class: 'eyebrow' }, `${v.setting} · ${v.category} vehicle${v.source && v.source !== 'DCUGen' ? ` · ${v.source}` : ''}`),
        h('h1', { class: 'codename', style: { fontSize: 'clamp(28px, 4.5vw, 46px)' } }, v.name),
        h('div', { class: 'realname' }, [v.crew, v.summary].filter(Boolean).join(' · '))),
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'button', onClick: () => giveToCharacter(v, 'vehicle') }, 'Give to current character'),
        h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(`${v.name}: ${line}`)) ? 'Stat block copied' : 'Copy failed') }, 'Copy stat block'),
        h('span', { class: 'spacer' }),
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

function vehicles() {
  const data = vehicleData(R);
  const all = data.premade || [];
  const fv = f.vehicles;
  const settings = [...new Set(all.map((v) => v.setting))];
  const counts = { '': all.length, ...Object.fromEntries(settings.map((s) => [s, all.filter((v) => v.setting === s).length])) };
  const cats = [...new Set(all.map((v) => v.category))];
  const grid = h('div', { class: 'bst-grid' });
  const draw = () => {
    clear(grid);
    const term = fv.q.toLowerCase();
    const list = all.filter((v) => (!fv.setting || v.setting === fv.setting) && (!fv.category || v.category === fv.category)
      && (!term || `${v.name} ${v.summary || ''} ${v.category} ${v.setting} ${v.size}`.toLowerCase().includes(term)));
    if (!list.length) grid.append(h('p', { class: 'hint' }, 'No vehicle matches.'));
    for (const v of list) grid.append(vehicleCard(v));
  };
  draw();
  return [
    chipRow(settings, fv.setting, (s) => { fv.setting = s; renderGarage(); }, counts),
    h('div', { class: 'bst-filters' },
      h('input', { type: 'search', id: 'veh-q', placeholder: 'Search: starship, galleon, tank, carpet...', value: fv.q, 'aria-label': 'Search vehicles', onInput: (e) => { fv.q = e.target.value; draw(); } }),
      h('label', { class: 'field' }, h('span', null, 'Type'), h('select', { id: 'veh-cat', onChange: (e) => { fv.category = e.target.value; draw(); } },
        h('option', { value: '' }, 'Ground, water, air, space'), cats.map((c) => h('option', { value: c, selected: c === fv.category }, `${CAT_GLYPH[c] || ''} ${c}`)))),
      h('button', { class: 'btn primary', type: 'button', onClick: () => { picked.vehicles = randomVehicle(R, { seed: randomSeed(), setting: fv.setting || undefined, category: fv.category || undefined }); renderGarage(); scrollToDetail(); } }, '🎲 Random vehicle')),
    h('div', { class: 'bst-layout' }, h('div', { class: 'bst-list' }, grid), vehicleDetail(picked.vehicles)),
  ];
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
  const all = hqData(R).premade || [];
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

// ---- rules --------------------------------------------------------------------------------------

function rules() {
  const v = vehicleData(R);
  const q = hqData(R);
  const groups = [
    ['Vehicles', v.rules || []],
    ['Headquarters', q.rules || []],
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

const SECTIONS = [['vehicles', 'Vehicles'], ['hq', 'Headquarters'], ['rules', 'Rules']];

export function renderGarage() {
  if (!root) return;
  clear(root);
  const vCount = (vehicleData(R).premade || []).length;
  const qCount = (hqData(R).premade || []).length;
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Vehicles & HQs'),
    h('p', null, `${vCount} vehicles and ${qCount} headquarters, from everyday cars to starships, sky-galleons and wizard towers. Every cost is worked out with the DC Adventures equipment rules (DCA 155-163), and you can hand any of them to the character you have open.`))));
  root.append(h('div', { class: 'ae-tabs', role: 'group', 'aria-label': 'Section', style: { marginBottom: '14px' } },
    SECTIONS.map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(section === id), onClick: () => { section = id; try { localStorage.setItem('dcugen.garage', id); } catch { /* ignore */ } renderGarage(); } }, label))));
  root.append(...(section === 'vehicles' ? vehicles() : section === 'hq' ? headquarters() : rules()));
}

