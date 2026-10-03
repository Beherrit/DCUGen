// Rules: searchable reference cards (actions, maneuvers, checks, hazards, tables, effects,
// modifiers, advantages, skills and conditions) from the DC Adventures data.

import { h, clear } from './dom.js';
import { damageMatrix } from './gmplus.js';
let R;
let root;
let query = '';
let category = 'all';

function buildCards() {
  const ref = R.raw.reference || {};
  const cards = [];
  const add = (cat, c) => cards.push({ cat, ...c });
  for (const x of ref.action_types || []) add('Actions', { title: x.name, meta: 'Action type', summary: x.summary, details: x.details, source: x.source });
  for (const x of ref.actions || []) add('Actions', { title: x.name, meta: `${x.action} action`, summary: x.summary, details: x.details, source: x.source });
  for (const x of ref.maneuvers || []) add('Maneuvers', { title: x.name, meta: 'Maneuver', summary: x.summary, details: x.details, source: x.source });
  for (const x of ref.checks || []) add('Checks', { title: x.name, meta: 'Core rules', summary: x.summary, details: x.details, source: x.source });
  for (const x of ref.combat || []) add('Combat', { title: x.name, meta: 'Combat', summary: x.summary, details: x.details, source: x.source });
  add('Tables', { title: 'Degrees of success and failure', meta: 'Table', summary: 'Every 5 points over the DC is another degree of success; every 5 under is another degree of failure.',
    table: [['Check result ≥', 'Degree', 'Example (DC 20)'], ['DC+15', 'Four (Success)', 35], ['DC+10', 'Three (Success)', 30], ['DC+5', 'Two (Success)', 25], ['DC', 'One (Success)', 20],
      ['DC−5', 'One (Failure)', 15], ['DC−10', 'Two (Failure)', 10], ['DC−15', 'Three (Failure)', 5], ['DC−20', 'Four (Failure)', 0]],
    rowClasses: ['s3', 's3', 's2', 's1', 'f1', 'f2', 'f3', 'f4'], source: 'DCA 14' });
  add('Tables', { title: 'Damage resistance matrix', meta: 'Chart', summary: 'Find your Toughness check result (left) and the damage rank (top): white no effect, blue −1 penalty, green dazed, yellow staggered, red incapacitated.', el: () => damageMatrix({}), source: 'DCA 273' });
  if (ref.difficulty?.length) add('Tables', { title: 'Difficulty classes', meta: 'Table', table: [['DC', 'Difficulty', 'Example'], ...ref.difficulty.map((d) => [d.dc, d.label, d.example || ''])] });
  if (ref.damage) add('Combat', { title: 'Damage and Toughness', meta: `Toughness check vs. DC ${ref.damage.toughness_dc}`, details: ref.damage.notes, table: [['Result', 'Effect'], ...(ref.damage.results || []).map((r) => [r.degree, r.result])] });
  if (ref.afflictions) add('Combat', { title: 'Afflictions', meta: 'Combat', details: ref.afflictions });
  if (ref.recovery) add('Combat', { title: 'Recovery', meta: 'Combat', details: ref.recovery });
  if (ref.range) add('Combat', { title: 'Range', meta: 'Combat', details: ref.range });
  if (ref.measurements?.length) {
    add('Tables', { title: 'Measurements', meta: 'Rank → mass, time, distance, volume', summary: ref.measurement_notes?.summary, details: ref.measurement_notes?.details,
      table: [['Rank', 'Mass', 'Time', 'Distance', 'Volume'], ...ref.measurements.map((m) => [m.rank, m.mass, m.time, m.distance, m.volume])] });
  }
  for (const x of ref.hazards || []) add('Hazards', { title: x.name, meta: 'Hazard', summary: x.summary, details: x.details, source: x.source, table: x.table });
  for (const [name, text] of Object.entries(R.raw.gm?.conditions?.conditions || {})) add('Conditions', { title: name, meta: 'Condition', details: text });
  for (const e of R.raw.effects || []) {
    const cost = e.fixed_cost ? Object.entries(e.fixed_cost).map(([k, v]) => `${k} ${v}`).join(', ') : e.cost_options ? Object.entries(e.cost_options).map(([k, v]) => `${k}: ${v}`).join('; ') : `${e.cost}/rank`;
    add('Effects', { title: e.name, meta: `${e.type} · ${e.action} · ${e.range} · ${e.duration}${e.resistance ? ` · resisted by ${e.resistance}` : ''}`, summary: e.summary, details: `Cost: ${cost}${e.max_rank ? `. Maximum rank ${e.max_rank}.` : '.'}${e.built_from ? ` Built from: ${e.built_from}.` : ''}`, source: e.source });
  }
  const modText = (m, sign) => `${m.cost_type === 'per_rank' ? `${sign}${m.options ? [...new Set(Object.values(m.options))].join('/') : m.value} per rank` : `${sign}${m.options ? Object.values(m.options).join('/') : m.value} flat${m.cost_type === 'flat_per_rank' ? ' per rank' : ''}`}`;
  for (const m of R.raw.modifiers?.extras || []) add('Extras', { title: m.name, meta: modText(m, '+'), summary: m.summary, details: m.options ? `Options: ${Object.entries(m.options).map(([k, v]) => `${k} (+${v})`).join(', ')}.` : '', source: m.source });
  for (const m of R.raw.modifiers?.flaws || []) add('Flaws', { title: m.name, meta: modText(m, '−'), summary: m.summary, details: m.options ? `Options: ${Object.entries(m.options).map(([k, v]) => `${k} (−${v})`).join(', ')}.` : '', source: m.source });
  for (const a of R.raw.advantages || []) {
    const max = a.max_rank === 'half_pl' ? 'half your PL' : a.max_rank;
    add('Advantages', { title: a.name, meta: `${a.type}${a.ranked ? `, ranked${max ? ` (max ${max})` : ''}` : ''}${a.book ? ` · ${a.book}` : ''}`, summary: a.summary, details: (a.requires || []).length ? `Requires: ${a.requires.join(', ')}.` : '', source: a.source });
  }
  for (const s of R.raw.skills || []) add('Skills', { title: s.name, meta: `${s.ability}${s.trained_only ? ' · trained only' : ''}${s.specialized ? ' · pick a specialty' : ''}`, summary: s.summary, source: s.source });
  return cards;
}

let cardsCache = null;

export function initRules(rules, el) {
  R = rules;
  root = el;
  renderRules();
}

function cardEl(c) {
  return h('article', { class: `panel rule-card ${c.el ? 'wide' : ''}` },
    h('div', null,
      h('div', { class: 'label' }, `${c.cat}${c.meta ? ` · ${c.meta}` : ''}`),
      h('h3', { class: 'rule-title' }, c.title)),
    c.summary ? h('p', { class: 'rule-sum' }, c.summary) : null,
    c.details ? h('p', { class: 'rule-det' }, c.details) : null,
    c.table ? h('div', { class: 'table-wrap' }, h('table', { class: 'skills rule-table' },
      h('thead', null, h('tr', null, c.table[0].map((x) => h('th', null, x)))),
      h('tbody', null, c.table.slice(1).map((row, i) => h('tr', { class: c.rowClasses?.[i] || '' }, row.map((x) => h('td', null, x))))))) : null,
    c.el ? c.el() : null,
    c.source ? h('div', { class: 'rule-src' }, c.source) : null);
}

export function renderRules() {
  if (!root) return;
  if (!cardsCache) cardsCache = buildCards();
  clear(root);
  const cats = ['all', ...new Set(cardsCache.map((c) => c.cat))];
  const grid = h('div', { class: 'rule-grid' });
  const countEl = h('span', { class: 'chip' });
  const draw = () => {
    clear(grid);
    const q = query.toLowerCase();
    const list = cardsCache.filter((c) => (category === 'all' || c.cat === category)
      && (!q || `${c.title} ${c.meta || ''} ${c.summary || ''} ${c.details || ''}`.toLowerCase().includes(q)));
    countEl.textContent = `${list.length} card${list.length === 1 ? '' : 's'}`;
    for (const c of list.slice(0, 300)) grid.append(cardEl(c));
    if (!list.length) grid.append(h('p', { style: { color: 'var(--ink-2)' } }, 'Nothing matches. Try another word.'));
  };
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Rules'),
      h('p', null, 'Quick reference for DC Adventures: actions, maneuvers, checks, combat, hazards, tables, conditions, every effect, extra, flaw, advantage and skill. Page numbers point to the Hero\'s Handbook.'))),
    h('div', { class: 'roster-tools' },
      h('input', { type: 'search', id: 'rules-q', placeholder: 'Search the rules (grab, falling, Area, Luck...)', value: query, 'aria-label': 'Search the rules', onInput: (e) => { query = e.target.value; draw(); } }),
      countEl),
    h('div', { class: 'ae-tabs', role: 'group', 'aria-label': 'Rule categories', style: { marginBottom: '14px' } },
      cats.map((c) => h('button', { type: 'button', 'aria-pressed': String(category === c), onClick: () => { category = c; renderRules(); } }, c === 'all' ? 'Everything' : c))),
    grid);
  draw();
}
