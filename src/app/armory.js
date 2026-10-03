// Equipment browser: every item in every genre, searchable, with a custom item maker.
// Items go straight onto the open character, raising the Equipment advantage as needed (DCA 147).

import { h, clear, toast } from './dom.js';
import { state } from './store.js';
import { searchGear, gearCatalog, gearToEquipment, gearToDevice, customItem, GEAR_GENRES } from '../engine/gear.js';
import { explainPower } from '../engine/render.js';

let R;
let rerender = () => {};
let hooks = {};
const f = { q: '', genre: '', category: '', maxCost: '' };
let picked = null;
const MINE_KEY = 'dcugen.mygear.v1';

function loadMine() { try { return JSON.parse(localStorage.getItem(MINE_KEY) || '[]'); } catch { return []; } }
function saveMine(list) { try { localStorage.setItem(MINE_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ } }

export function initArmory(rules, { render, applyToCurrent }) {
  R = rules;
  rerender = render;
  hooks = { applyToCurrent };
}

/** Add an item to the open character (or any character via apply). */
export function giveItem(item, apply = hooks.applyToCurrent) {
  if (!state.current) { toast('Open a character on the Forge first.'); return; }
  const c = JSON.parse(JSON.stringify(state.current));
  if (item.device) {
    // Magic items are Removable devices, paid for with power points rather than equipment points.
    c.devices = [...(c.devices || []), gearToDevice(item)];
    apply?.(c);
    toast(`${item.name} added to ${c.identity?.codename || 'the character'} as a device (${item.cost} pp)`);
    return;
  }
  c.equipment = [...(c.equipment || []), gearToEquipment(item)];
  const ep = c.equipment.reduce((t, e) => t + (e.cost || 0), 0);
  const need = Math.ceil(ep / 5);
  c.advantages = c.advantages || [];
  const adv = c.advantages.find((a) => a.name === 'Equipment');
  if (adv) adv.rank = Math.max(adv.rank || 1, need); else if (need > 0) c.advantages.push({ name: 'Equipment', rank: need });
  apply?.(c);
  toast(`${item.name} (${item.cost} ep) added to ${c.identity?.codename || 'the character'} · Equipment ${need}`);
}

function allItems() {
  return [...loadMine().map((x) => ({ ...x, genre: x.genre || 'Custom', mine: true })), ...gearCatalog(R)];
}

function itemCard(it) {
  const sel = picked?.id === it.id && picked?.name === it.name;
  return h('button', { type: 'button', class: `gear-row ${sel ? 'sel' : ''}`, onClick: () => { picked = it; rerender(); } },
    h('span', { class: 'gear-name' }, it.name, it.mine ? h('span', { class: 'chip', style: { marginLeft: '6px' } }, 'mine') : null),
    h('span', { class: 'gear-eff' }, it.effect || it.summary || ''),
    h('span', { class: 'gear-meta' }, [it.genre, it.category].filter(Boolean).join(' · ')),
    h('span', { class: 'gear-cost num' }, `${it.cost} ${it.device ? 'pp' : 'ep'}`));
}

function detail(it) {
  if (!it) return h('div', { class: 'bst-empty' }, h('p', null, 'Pick an item to see what it does, then give it to the character you have open.'));
  const explained = (it.powers || []).map((p) => { try { return explainPower({ extras: [], flaws: [], ...p }, R).what; } catch { return null; } }).filter(Boolean);
  return h('section', { class: 'panel gear-detail', id: 'gear-detail' },
    h('div', { class: 'eyebrow' }, [it.genre, it.category].filter(Boolean).join(' · ')),
    h('h2', null, it.name),
    it.summary ? h('p', { style: { margin: '0 0 8px' } }, it.summary) : null,
    h('dl', { class: 'bio-dl' },
      h('dt', null, 'Effect'), h('dd', null, it.effect || '—'),
      h('dt', null, 'Cost'), h('dd', null, it.device ? `${it.cost} power points as a ${it.device === 'easily' ? 'easily removable' : 'removable'} device (DCA 143)` : `${it.cost} equipment points (${Math.ceil(it.cost / 5)} Equipment rank${Math.ceil(it.cost / 5) === 1 ? '' : 's'} on its own)`),
      it.attack ? [h('dt', null, 'Attack'), h('dd', null, `${it.attack.kind === 'ranged' ? 'Ranged' : 'Close'} damage ${it.attack.rank}${it.attack.strengthBased ? ' + Strength' : ''}${it.attack.crit && it.attack.crit < 20 ? `, crit ${it.attack.crit}-20` : ''}`)] : null,
      it.protection ? [h('dt', null, 'Protection'), h('dd', null, `+${it.protection} Toughness`)] : null,
      explained.length ? [h('dt', null, 'At the table'), h('dd', null, explained.join(' '))] : null,
      (it.tags || []).length ? [h('dt', null, 'Tags'), h('dd', null, it.tags.join(', '))] : null),
    it.source && it.source !== 'DCUGen' ? h('div', { class: 'rule-src' }, it.source) : null,
    h('div', { class: 'btn-row', style: { marginTop: '10px' } },
      h('button', { class: 'btn primary', type: 'button', onClick: () => giveItem(it) }, 'Give to current character'),
      it.mine ? h('button', { class: 'btn ghost danger', type: 'button', onClick: () => { saveMine(loadMine().filter((x) => x.id !== it.id)); picked = null; rerender(); } }, 'Delete my item') : null));
}

// ---- custom items -------------------------------------------------------------------------------

const CUSTOM_KINDS = {
  'Ranged weapon': { effect: 'Damage', range: 'Ranged', category: 'Ranged Weapon' },
  'Melee weapon': { effect: 'Damage', range: 'Close', strengthBased: true, category: 'Melee Weapon' },
  Armor: { protection: true, category: 'Armor' },
  'Gadget (feature)': { features: true, category: 'Gear' },
  'Sensor / scanner': { effect: 'Senses', range: 'Personal', category: 'Sensor' },
  'Grenade / area': { effect: 'Damage', range: 'Ranged', area: 'Burst', category: 'Grenade' },
  'Non-lethal (affliction)': { effect: 'Affliction', range: 'Ranged', category: 'Non-lethal Weapon' },
};
let custom = { name: '', kind: 'Ranged weapon', rank: 4, genre: 'Custom', note: '', extras: [] };

function customMaker() {
  const k = CUSTOM_KINDS[custom.kind];
  const powers = [];
  const features = [];
  let protection = 0;
  if (k.protection) protection = custom.rank;
  else if (k.features) for (let i = 0; i < custom.rank; i++) features.push(custom.note || 'Feature');
  else {
    const p = { effect: k.effect, rank: custom.rank, range: k.range, extras: [], flaws: [] };
    if (k.strengthBased) p.strengthBased = true;
    if (k.area) p.extras.push({ name: 'Area', option: k.area });
    if (k.effect === 'Affliction') p.detail = 'Resisted by Fortitude; Dazed, Stunned, Incapacitated';
    if (k.effect === 'Senses') p.detail = custom.note || 'Extended Vision, Infravision';
    for (const x of custom.extras) p.extras.push({ name: x });
    powers.push(p);
  }
  let item;
  let err = null;
  try { item = customItem(R, { name: custom.name || `Custom ${custom.kind}`, genre: custom.genre || 'Custom', category: k.category, powers, features, protection, notes: custom.note }); } catch (e) { err = e.message; }
  const set = (fn) => { fn(custom); rerender(); };
  const extrasAllowed = !k.protection && !k.features && k.effect === 'Damage' ? ['Accurate', 'Multiattack', 'Penetrating', 'Improved Critical'] : [];
  return h('section', { class: 'panel gear-custom' },
    h('h2', null, 'Make your own item'),
    h('p', { class: 'hint', style: { margin: '0 0 8px' } }, 'Equipment costs what its effects would cost as powers (DCA 145): Ranged Damage 4 is 8 ep, Protection 3 is 3 ep, each feature 1 ep.'),
    h('div', { class: 'gar-build-grid' },
      h('label', { class: 'field' }, h('span', null, 'Name'), h('input', { type: 'text', value: custom.name, placeholder: 'Grandpa\'s Shotgun', onChange: (e) => set((c) => { c.name = e.target.value; }) })),
      h('label', { class: 'field' }, h('span', null, 'Kind'), h('select', { onChange: (e) => set((c) => { c.kind = e.target.value; c.extras = []; }) }, Object.keys(CUSTOM_KINDS).map((x) => h('option', { value: x, selected: x === custom.kind }, x)))),
      h('label', { class: 'field' }, h('span', null, k.protection ? 'Protection' : k.features ? 'Features' : 'Rank'), h('input', { type: 'number', min: 1, max: 20, value: custom.rank, onChange: (e) => set((c) => { c.rank = Math.max(1, Math.min(20, Number(e.target.value) || 1)); }) })),
      h('label', { class: 'field' }, h('span', null, 'Genre'), h('input', { type: 'text', value: custom.genre, list: 'gear-genres', onChange: (e) => set((c) => { c.genre = e.target.value; }) }), h('datalist', { id: 'gear-genres' }, GEAR_GENRES.map((g) => h('option', { value: g.label }))))),
    h('label', { class: 'field' }, h('span', null, k.features ? 'What it does' : k.effect === 'Senses' ? 'Senses (e.g. Darkvision, Radio)' : 'Notes / descriptor'), h('input', { type: 'text', value: custom.note, onChange: (e) => set((c) => { c.note = e.target.value; }) })),
    extrasAllowed.length ? h('div', { class: 'tagwrap' }, extrasAllowed.map((x) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: custom.extras.includes(x), onChange: (e) => set((c) => { c.extras = e.target.checked ? [...c.extras, x] : c.extras.filter((y) => y !== x); }) }), x))) : null,
    err ? h('p', { class: 'adv-warn' }, err) : h('div', { class: 'gear-preview' }, h('b', null, `${item.name}: `), item.effect, h('span', { class: 'num', style: { marginLeft: '8px', fontWeight: 800 } }, `${item.cost} ep`)),
    h('div', { class: 'btn-row', style: { marginTop: '8px' } },
      h('button', { class: 'btn primary', type: 'button', disabled: !!err, onClick: () => giveItem(item) }, 'Give to current character'),
      h('button', { class: 'btn', type: 'button', disabled: !!err, onClick: () => { const list = loadMine(); list.unshift({ ...item, id: `my-${Date.now().toString(36)}` }); saveMine(list); toast(`${item.name} saved to your items`); rerender(); } }, 'Save to my items')));
}

export function armorySection() {
  const list = allItems();
  const genres = [...new Set(list.map((x) => x.genre))];
  const inGenre = list.filter((x) => !f.genre || x.genre === f.genre);
  const cats = [...new Set(inGenre.map((x) => x.category).filter(Boolean))].sort();
  const box = h('div', { class: 'gear-list' });
  const draw = () => {
    clear(box);
    let items;
    try {
      items = searchGear(R, { q: f.q, genre: f.genre || undefined, category: f.category || undefined, maxCost: f.maxCost ? Number(f.maxCost) : undefined });
    } catch { items = []; }
    const mine = loadMine().map((x) => ({ ...x, genre: x.genre || 'Custom', mine: true })).filter((x) => (!f.genre || x.genre === f.genre) && (!f.q || `${x.name} ${x.effect}`.toLowerCase().includes(f.q.toLowerCase())));
    const all = [...mine, ...items];
    if (!all.length) { box.append(h('p', { class: 'hint' }, 'Nothing matches.')); return; }
    for (const it of all.slice(0, 300)) box.append(itemCard(it));
    if (all.length > 300) box.append(h('p', { class: 'hint' }, `Showing 300 of ${all.length}. Search to narrow it down.`));
  };
  draw();
  const counts = Object.fromEntries(genres.map((g) => [g, list.filter((x) => x.genre === g).length]));
  return [
    h('div', { class: 'bst-realms', role: 'group', 'aria-label': 'Genre' },
      h('button', { type: 'button', class: 'bst-realm', 'aria-pressed': String(!f.genre), style: { '--rc': '#444' }, onClick: () => { f.genre = ''; f.category = ''; rerender(); } }, h('span', null, 'All genres'), h('span', { class: 'count' }, list.length)),
      genres.map((g) => h('button', { type: 'button', class: 'bst-realm', 'aria-pressed': String(f.genre === g), style: { '--rc': '#6b5b3e', '--rc-ink': '#fff' }, onClick: () => { f.genre = f.genre === g ? '' : g; f.category = ''; rerender(); } }, h('span', null, g), h('span', { class: 'count' }, counts[g])))),
    h('div', { class: 'bst-filters' },
      h('input', { type: 'search', id: 'gear-q', placeholder: 'Search any item: rifle, rope, plasma, lockpick, chainmail...', value: f.q, 'aria-label': 'Search equipment', onInput: (e) => { f.q = e.target.value; draw(); } }),
      h('label', { class: 'field' }, h('span', null, 'Category'), h('select', { id: 'gear-cat', onChange: (e) => { f.category = e.target.value; draw(); } }, h('option', { value: '' }, 'All'), cats.map((c) => h('option', { value: c, selected: c === f.category }, c)))),
      h('label', { class: 'field bst-num' }, h('span', null, 'Max ep'), h('input', { type: 'number', id: 'gear-max', min: 0, value: f.maxCost, onChange: (e) => { f.maxCost = e.target.value; draw(); } }))),
    h('div', { class: 'bst-layout' }, h('div', { class: 'bst-list' }, box), h('div', { class: 'bst-detail' }, detail(picked), customMaker())),
  ];
}
