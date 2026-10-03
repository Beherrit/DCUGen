// Workshop: random gear, gadgets and magic items, minion squads, robots, creatures and monsters.

import { h, clear, toast, copyText, download, slug, inkFor } from './dom.js';
import { state, upsert } from './store.js';
import { renderFile } from './sheetview.js';
import { exportExcel, exportJson, exportText } from './exporters.js';
import { randomSeed } from '../engine/rng.js';
import { generateCharacter } from '../engine/generator.js';
import { describeEffect, statBlockText } from '../engine/render.js';
import { powerCost } from '../engine/costs.js';
import { generateLoadout, generateDevice, generateMinionSquad, generateMonster, randomCreature, creatureVariant, catalogEntries, LOADOUT_FOCUS, DEVICE_TYPES, MINION_TYPES, CREATURE_TEMPLATES, pickCatalogDevice } from '../engine/workshop.js';
let R;
let root;
let hooks = {};
let section = 'gear';
let result = null;
const opts = {
  gear: { ep: 20, focus: 'any', pl: 10 },
  device: { type: 'tech', pl: 10, budget: '' },
  squad: { type: 'any', rank: 4, count: 6, villainPl: 10 },
  robot: { kind: 'android', pl: 10 },
  creature: { kind: '', category: '', template: 'none', minPl: 0, maxPl: 20, search: '' },
  monster: { pl: 8, body: '', size: '' },
};

const SECTIONS = [
  ['gear', 'Gear loadout'], ['device', 'Gadgets & items'], ['squad', 'Minion squads'],
  ['robot', 'Robots'], ['creature', 'Animals & creatures'], ['monster', 'Monster maker'],
];

export function initWorkshop(rules, el, h2) {
  R = rules;
  root = el;
  hooks = h2;
  renderWorkshop();
}

const field = (label, control) => h('label', { class: 'field' }, h('span', null, label), control);
const num = (id, value, onSet, min = 0, max = 99) => h('input', { type: 'number', id, min, max, value, onChange: (e) => onSet(Number(e.target.value)) });
const sel = (id, value, options, onSet) => h('select', { id, onChange: (e) => onSet(e.target.value) }, options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) }, t)));

function roll() {
  try {
    const seed = randomSeed();
    switch (section) {
      case 'gear': result = generateLoadout(R, { ...opts.gear, seed }); break;
      case 'device': result = generateDevice(R, { pl: opts.device.pl, type: opts.device.type, budget: opts.device.budget === '' ? undefined : Number(opts.device.budget), seed }); break;
      case 'squad': result = generateMinionSquad(R, { ...opts.squad, seed }); break;
      case 'robot':
        if (opts.robot.kind === 'drone') result = { kind: 'squad-robot', ...generateMinionSquad(R, { type: 'm-drone', rank: Math.max(2, Math.round(opts.robot.pl / 2)), count: 4, seed }) };
        else result = { kind: 'character', ch: generateCharacter(R, { archetype: opts.robot.kind, pl: opts.robot.pl, seed }) };
        break;
      case 'creature': {
        const c = opts.creature;
        const ch = randomCreature(R, { kind: c.kind || undefined, category: c.category || undefined, template: c.template, minPl: c.minPl, maxPl: c.maxPl, seed });
        result = ch ? { kind: 'character', ch } : null;
        if (!ch) toast('No creature matches those filters.');
        break;
      }
      case 'monster': result = { kind: 'character', ch: generateMonster(R, { pl: opts.monster.pl, body: opts.monster.body || undefined, size: opts.monster.size || undefined, seed }) };
        break;
      default: break;
    }
  } catch (e) {
    toast(e.message);
  }
  renderWorkshop();
}

function controls() {
  switch (section) {
    case 'gear': return [
      field('Equipment points', num('w-ep', opts.gear.ep, (v) => { opts.gear.ep = v; }, 1, 200)),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Equipment advantage: 5 points per rank.'),
      field('Style', sel('w-focus', opts.gear.focus, Object.entries(LOADOUT_FOCUS).map(([k, v]) => [k, v.label]), (v) => { opts.gear.focus = v; })),
      field('Power level (weapon cap)', num('w-gear-pl', opts.gear.pl, (v) => { opts.gear.pl = v; }, 1, 20)),
    ];
    case 'device': return [
      field('Kind', sel('w-dtype', opts.device.type, Object.entries(DEVICE_TYPES).map(([k, v]) => [k, v.label]), (v) => { opts.device.type = v; })),
      field('Power level', num('w-dpl', opts.device.pl, (v) => { opts.device.pl = v; }, 1, 20)),
      field('Point budget (blank = any)', h('input', { type: 'number', id: 'w-dbudget', min: 1, value: opts.device.budget, onChange: (e) => { opts.device.budget = e.target.value; } })),
    ];
    case 'squad': return [
      field('Type', sel('w-stype', opts.squad.type, [['any', 'Any'], ...MINION_TYPES.map((t) => [t, R.raw.archetypes.find((a) => a.id === t)?.name || t])], (v) => { opts.squad.type = v; })),
      field('Minion rank (their PL)', num('w-srank', opts.squad.rank, (v) => { opts.squad.rank = v; }, 1, 15)),
      field('How many', num('w-scount', opts.squad.count, (v) => { opts.squad.count = v; }, 1, 64)),
    ];
    case 'robot': return [
      field('Kind', sel('w-rkind', opts.robot.kind, [['android', 'Android (thinking, full character)'], ['robot', 'Combat robot (automaton, full character)'], ['drone', 'Robot drones (cheap minions)']], (v) => { opts.robot.kind = v; })),
      field('Power level', num('w-rpl', opts.robot.pl, (v) => { opts.robot.pl = v; }, 1, 20)),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Constructs follow DC Adventures ch. 7: no Stamina, immune to Fortitude effects, Toughness from Protection. Automatons have no Intellect or Presence.'),
    ];
    case 'creature': {
      const cats = [...new Set(catalogEntries(R).map((e) => e.category))].sort();
      return [
        field('Kind', sel('w-ckind', opts.creature.kind, [['', 'Any'], ['animal', 'Animals'], ['monster', 'Monsters'], ['minion', 'People'], ['construct', 'Constructs']], (v) => { opts.creature.kind = v; })),
        field('Category', sel('w-ccat', opts.creature.category, [['', 'Any'], ...cats.map((c) => [c, c])], (v) => { opts.creature.category = v; })),
        field('Template', sel('w-ctpl', opts.creature.template, [['none', 'As written'], ['random', 'Random template'], ...Object.entries(CREATURE_TEMPLATES).filter(([k]) => k !== 'none').map(([k, v]) => [k, v.label])], (v) => { opts.creature.template = v; })),
        h('div', { class: 'grid2' }, field('Min PL', num('w-cmin', opts.creature.minPl, (v) => { opts.creature.minPl = v; }, 0, 30)), field('Max PL', num('w-cmax', opts.creature.maxPl, (v) => { opts.creature.maxPl = v; }, 0, 30))),
      ];
    }
    case 'monster': return [
      field('Power level', num('w-mpl', opts.monster.pl, (v) => { opts.monster.pl = v; }, 1, 20)),
      field('Body', sel('w-mbody', opts.monster.body, [['', 'Any'], ['beast', 'Beast'], ['reptile', 'Reptile'], ['insect', 'Insect'], ['humanoid', 'Humanoid'], ['amorphous', 'Amorphous'], ['avian', 'Avian'], ['aquatic', 'Aquatic'], ['elemental', 'Elemental']], (v) => { opts.monster.body = v; })),
      field('Size', sel('w-msize', opts.monster.size, [['', 'Fits the PL'], ['Medium', 'Medium'], ['Large', 'Large'], ['Huge', 'Huge'], ['Gargantuan', 'Gargantuan'], ['Colossal', 'Colossal']], (v) => { opts.monster.size = v; })),
    ];
    default: return [];
  }
}

function charActions(ch, extra = []) {
  return h('div', { class: 'toolbar' },
    h('button', { class: 'btn primary', type: 'button', onClick: () => { upsert(ch); toast(`${ch.identity?.codename} saved to your roster`); } }, 'Save to roster'),
    h('button', { class: 'btn', type: 'button', onClick: () => { hooks.openInForge?.(ch); } }, 'Open in Forge to edit'),
    h('button', { class: 'btn', type: 'button', onClick: () => { hooks.addToInitiative?.(ch); toast(`${ch.identity?.codename} added to initiative`); } }, 'Add to initiative'),
    ...extra,
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(statBlockText(ch, R))) ? 'Stat block copied' : 'Copy failed') }, 'Copy stat block'),
    h('button', { class: 'btn', type: 'button', onClick: () => exportExcel(ch, R) }, 'Excel'),
    h('button', { class: 'btn', type: 'button', onClick: () => exportJson(ch) }, 'JSON'),
    h('button', { class: 'btn', type: 'button', onClick: () => exportText(ch, R) }, 'Text'));
}

function addToCurrent(fn, what) {
  if (!state.current) { toast('Roll or open a character on the Forge first.'); return; }
  const c = JSON.parse(JSON.stringify(state.current));
  fn(c);
  hooks.applyToCurrent?.(c);
  toast(`${what} added to ${c.identity?.codename || 'the character'}`);
}

function itemCard(title, subtitle, color, body, actions) {
  return h('article', { class: 'file' },
    h('div', { class: 'file-head', style: { '--hero': color, '--hero-ink': inkFor(color) } },
      h('div', { class: 'eyebrow' }, subtitle),
      h('h1', { class: 'codename', style: { fontSize: 'clamp(30px, 5vw, 52px)' } }, title)),
    actions,
    h('div', { style: { padding: '16px 20px', display: 'grid', gap: '12px' } }, body));
}

function showResult() {
  if (!result) {
    return h('div', { class: 'empty' }, h('h2', null, 'Ready when you are'), h('p', null, 'Pick your options and press Roll. Every result is built and priced with the DC Adventures rules.'));
  }
  if (result.kind === 'loadout') {
    const l = result;
    const text = l.items.map((i) => `${i.name} (${i.cost} ep): ${i.effect || ''}`).join('\n');
    return itemCard(`${l.label} kit`, `Gear loadout · ${l.used}/${l.budget} equipment points · Equipment ${l.ranks}`, '#3b6e8f',
      [h('div', { class: 'table-wrap' }, h('table', { class: 'skills' }, h('tbody', null, l.items.map((i) => h('tr', null,
        h('td', null, h('b', null, i.name), i.contents ? h('div', { style: { fontSize: '12.5px', color: 'var(--ink-3)' } }, i.contents.map((c) => c.name).join(', ')) : null),
        h('td', null, i.effect || ''), h('td', { class: 'n' }, `${i.cost} ep`)))))),
      h('p', { class: 'hint', style: { margin: 0 } }, `Needs the Equipment advantage at rank ${l.ranks} (${l.ranks * 5} points of gear).`)],
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'button', onClick: () => addToCurrent((c) => {
          c.equipment = [...(c.equipment || []), ...JSON.parse(JSON.stringify(l.items))];
          const ep = c.equipment.reduce((t, e) => t + (e.cost || 0), 0);
          const adv = c.advantages.find((a) => a.name === 'Equipment');
          if (adv) adv.rank = Math.max(adv.rank, Math.ceil(ep / 5)); else c.advantages.push({ name: 'Equipment', rank: Math.ceil(ep / 5) });
        }, 'Gear') }, 'Give to current character'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(text)) ? 'Gear list copied' : 'Copy failed') }, 'Copy list'),
        h('button', { class: 'btn', type: 'button', onClick: () => download(`${slug(l.label)}-gear.json`, JSON.stringify(l, null, 2), 'application/json') }, 'JSON')));
  }
  if (result.kind === 'device') {
    const d = result;
    const lines = d.device.powers.map((p) => ({ p, text: describeEffect(p, R), cost: powerCost(p, R) }));
    const text = `${d.name} (${d.device.kind === 'easily' ? 'Easily Removable' : 'Removable'}) • ${d.cost.total} points\n${lines.map((l) => `${l.p.name}: ${l.text}${(l.p.alternates || []).map((a) => `; AE: ${a.name}: ${describeEffect(a, R)}`).join('')}`).join('\n')}`;
    return itemCard(d.name, `${d.typeLabel} · PL ${d.pl} · ${d.device.kind === 'easily' ? 'Easily Removable' : 'Removable'}`, d.theme.color,
      [h('p', { style: { margin: 0 } }, d.summary),
        ...lines.map((l) => h('div', { class: 'power' },
          h('div', { class: 'power-top' }, h('span', { class: 'power-name' }, l.p.name), h('span', { class: 'power-cost' }, `${l.cost} pp`)),
          h('div', { class: 'power-text' }, l.text),
          (l.p.alternates || []).map((a) => h('div', { class: 'ae' }, h('b', null, `AE: ${a.name} `), describeEffect(a, R))))),
        h('div', { class: 'result' }, h('b', null, `Cost: ${d.cost.raw} − ${d.cost.discount} = ${d.cost.total} power points. `),
          `${d.device.kind === 'easily' ? 'Easily Removable: −2' : 'Removable: −1'} point per 5 points of the device's powers. ${d.note}`),
        d.issues.length ? h('ul', { class: 'issues' }, d.issues.map((i) => h('li', { class: 'error' }, i.message))) : null],
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn primary', type: 'button', onClick: () => addToCurrent((c) => { c.devices = [...(c.devices || []), JSON.parse(JSON.stringify(d.device))]; }, d.name) }, 'Give to current character'),
        h('button', { class: 'btn', type: 'button', onClick: () => { const cat = pickCatalogDevice(R, { seed: randomSeed() }); if (cat) { result = { kind: 'catalog-device', item: cat }; renderWorkshop(); } } }, 'Or roll from Gadget Guides'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(text)) ? 'Item copied' : 'Copy failed') }, 'Copy'),
        h('button', { class: 'btn', type: 'button', onClick: () => download(`${slug(d.name)}.json`, JSON.stringify(d, null, 2), 'application/json') }, 'JSON')));
  }
  if (result.kind === 'catalog-device') {
    const it = result.item;
    return itemCard(it.name, `Gadget Guides · ${it.category} · ${it.cost}${it.cost_per_rank ? ` + ${it.cost_per_rank}/rank` : ''} ${it.cost_unit}`, '#55606e',
      [h('p', { style: { margin: 0 } }, it.summary || ''), h('div', { class: 'power-text' }, it.powers), h('p', { class: 'hint', style: { margin: 0 } }, `Source: ${it.source}. Printed stats, shown as in the book.`)],
      h('div', { class: 'toolbar' }, h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(`${it.name}: ${it.powers}`)) ? 'Copied' : 'Copy failed') }, 'Copy')));
  }
  if (result.kind === 'squad' || result.kind === 'squad-robot') {
    const s = result;
    const { el } = renderFile(s.member, R, { toolbar: charActions(s.member) });
    return h('div', { style: { display: 'grid', gap: '12px' } },
      h('div', { class: 'panel' },
        h('h2', null, `${s.name} (${s.count})`),
        h('p', { style: { margin: 0 } }, `${s.count} ${s.typeName.toLowerCase()} minions, PL ${s.rank}. One stat block for the whole group; each one is out after a single failed Toughness check (minion rules).`),
        h('div', { class: 'result' }, h('b', null, 'To give these to a villain: '), h('div', null, s.villainCost.minionAdvantage.text), h('div', null, `or ${s.villainCost.summon.text}`)),
        h('div', { class: 'tagwrap' }, s.names.map((n) => h('span', { class: 'chip' }, n)))),
      el);
  }
  if (result.kind === 'character') {
    const ch = result.ch;
    const extra = [];
    if (section === 'creature' && ch.catalogId) {
      const entry = catalogEntries(R).find((e) => e.id === ch.catalogId);
      if (entry) {
        extra.push(h('select', { 'aria-label': 'Apply a template', onChange: (e) => { result = { kind: 'character', ch: creatureVariant(R, entry, e.target.value, { seed: randomSeed() }) }; renderWorkshop(); } },
          Object.entries(CREATURE_TEMPLATES).map(([k, v]) => h('option', { value: k, selected: k === (ch.variant || 'none') }, `Template: ${v.label}`))));
      }
    }
    const { el } = renderFile(ch, R, { toolbar: charActions(ch, extra) });
    const info = [ch.summary, ch.fitsPL ? `Fits PL ${ch.fitsPL} by the power level limits.` : null, ch.mutation ? `Mutation: ${ch.mutation}.` : null].filter(Boolean).join(' ');
    return h('div', { style: { display: 'grid', gap: '12px' } }, info ? h('div', { class: 'result' }, info) : null, el);
  }
  return null;
}

function catalogBrowser() {
  const c = opts.creature;
  const all = catalogEntries(R);
  const q = c.search.toLowerCase();
  const list = all.filter((e) => (!c.kind || e.kind === c.kind) && (!c.category || e.category === c.category) && e.pl >= c.minPl && e.pl <= c.maxPl
    && (!q || `${e.name} ${e.category} ${(e.tags || []).join(' ')}`.toLowerCase().includes(q)));
  const listEl = h('div', { class: 'scroll', style: { maxHeight: '420px' } });
  const draw = (items) => {
    clear(listEl);
    if (!all.length) { listEl.append(h('p', { class: 'hint' }, 'The creature catalog is not in this build.')); return; }
    for (const e of items.slice(0, 150)) {
      listEl.append(h('button', { class: 'chip', type: 'button', style: { margin: '3px' }, title: e.summary || '', onClick: () => {
        result = { kind: 'character', ch: creatureVariant(R, e, c.template === 'random' ? 'none' : c.template, { seed: randomSeed() }) };
        renderWorkshop();
      } }, `${e.name} · PL ${e.pl}`));
    }
  };
  draw(list);
  return h('div', { class: 'panel' },
    h('h2', null, `Catalog (${list.length})`),
    h('input', { type: 'search', id: 'w-csearch', placeholder: 'Search animals, monsters, people', value: c.search, 'aria-label': 'Search catalog',
      onInput: (e) => { c.search = e.target.value; const qq = c.search.toLowerCase(); draw(all.filter((x) => (!c.kind || x.kind === c.kind) && (!c.category || x.category === c.category) && x.pl >= c.minPl && x.pl <= c.maxPl && (!qq || `${x.name} ${x.category} ${(x.tags || []).join(' ')}`.toLowerCase().includes(qq)))); } }),
    listEl);
}

export function renderWorkshop() {
  if (!root) return;
  clear(root);
  root.append(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'Workshop'),
      h('p', null, 'Roll gear, gadgets and magic items, minion squads, robots, animals and monsters. Everything is priced and checked with the same rules as characters.'))));
  const tabs = h('div', { class: 'ae-tabs', role: 'group', 'aria-label': 'What to make', style: { marginBottom: '14px' } },
    SECTIONS.map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(section === id), onClick: () => { section = id; result = null; renderWorkshop(); } }, label)));
  root.append(tabs);
  const rail = h('aside', { class: 'rail', 'aria-label': 'Workshop options' },
    h('h2', null, SECTIONS.find(([id]) => id === section)[1]),
    controls(),
    h('button', { class: 'btn primary big', type: 'button', id: 'w-roll', onClick: roll }, 'Roll'));
  const main = h('div', { style: { minWidth: 0, display: 'grid', gap: '14px', alignContent: 'start' } }, showResult(), section === 'creature' ? catalogBrowser() : null);
  root.append(h('div', { class: 'forge' }, rail, main));
}
