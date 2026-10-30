// Rules: searchable reference cards (actions, maneuvers, checks, hazards, tables, effects,
// modifiers, advantages, skills and conditions) from the DC Adventures data.

import { h, clear, openDialog } from './dom.js';
import { damageMatrix } from './gmplus.js';
import { guideFor, skillGuideBody } from './skillguide.js';
import { rangeCalculator } from './rangecalc.js';
import { state, savePrefs, emit } from './store.js';
import { houseRules, setHouseRules, HOUSE_DEFAULTS, isByTheBook } from '../engine/house.js';
import { martialCards } from './rules-martial.js';

/** House rules: how strict the app is for this table. */
function housePanel() {
  const hr = houseRules();
  const set = (k, v) => { state.prefs.house = { ...houseRules(), [k]: v }; setHouseRules(state.prefs.house); savePrefs(); emit('house'); renderRules(); };
  const sel = (k, label, opts, hint) => h('label', { class: 'field' }, h('span', null, label),
    h('select', { id: `house-${k}`, onChange: (e) => set(k, e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value) }, opts.map(([v, t]) => h('option', { value: String(v), selected: hr[k] === v }, t))),
    hint ? h('small', { class: 'hint' }, hint) : null);
  return h('details', { class: 'panel house-panel', open: !isByTheBook() },
    h('summary', null, h('b', null, 'House rules'), h('span', { class: 'chip' }, isByTheBook() ? 'By the book' : 'House rules on')),
    h('p', { class: 'hint', style: { margin: '8px 0' } }, 'Play your table\'s way. These change what the Forge flags as a problem and how drains work, for every character in this browser (and on your other devices if you sync).'),
    h('div', { class: 'grid2' },
      sel('plLimits', 'Power level limits (attack + effect, defenses, skills)', [['error', 'By the book: over the limit is a rule issue'], ['warning', 'Allowed: shown as a warning'], ['off', 'Off: not checked']]),
      sel('budget', 'Power point budget (PL × 15)', [['error', 'By the book: overspending is a rule issue'], ['warning', 'Allowed: shown as a warning'], ['off', 'Off: not checked']]),
      sel('weaken', 'Weaken drains', [['margin', 'As many power points as the check missed by'], ['degrees', '1 power point per degree of failure']], 'Check this against Weaken in your book (DCA 122) and pick what it says, or what your GM rules.'),
      sel('poolWarnings', 'Pool points over the PL limits', [[true, 'Warn me'], [false, 'Don\'t warn']])),
    isByTheBook() ? null : h('button', { class: 'btn sm', type: 'button', onClick: () => { state.prefs.house = { ...HOUSE_DEFAULTS }; setHouseRules(state.prefs.house); savePrefs(); emit('house'); renderRules(); } }, 'Back to by the book'));
}
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
  add('Combat', { title: 'Defense class', meta: 'Combat', summary: 'The DC to affect a target is its defense + 10.', details: 'Close attacks target Parry (DC Parry + 10), ranged attacks target Dodge (DC Dodge + 10), and mental powers target Will (DC Will + 10). A vulnerable target halves its active defenses (round up); a defenseless one has them at 0, so the DC is 10.', source: 'DCA 51' });
  for (const x of ref.combat || []) add('Combat', { title: x.name, meta: 'Combat', summary: x.summary, details: x.details, source: x.source });
  add('Tables', { title: 'Degrees of success and failure', meta: 'Table', summary: 'Every 5 points over the DC is another degree of success; every 5 under is another degree of failure.',
    table: [['Check result ≥', 'Degree', 'Example (DC 20)'], ['DC+15', 'Four (Success)', 35], ['DC+10', 'Three (Success)', 30], ['DC+5', 'Two (Success)', 25], ['DC', 'One (Success)', 20],
      ['DC−5', 'One (Failure)', 15], ['DC−10', 'Two (Failure)', 10], ['DC−15', 'Three (Failure)', 5], ['DC−20', 'Four (Failure)', 0]],
    rowClasses: ['s3', 's3', 's2', 's1', 'f1', 'f2', 'f3', 'f4'], source: 'DCA 14' });
  add('Tables', { title: 'Range cheat sheet & calculator', meta: 'Range · distance · travel · throwing', summary: 'How far an attack reaches at each rank, which band a target is in, areas, distance by rank, travel time, lifting and throwing.', el: () => rangeCalculator(null, R), source: 'DCA 172-173' });
  add('Tables', { title: 'Damage resistance matrix', meta: 'Chart', summary: 'Find your Toughness check result (left) and the damage rank (top): white no effect, blue −1 penalty, green dazed, yellow staggered, red incapacitated.', el: () => damageMatrix({}), source: 'DCA 273' });
  if (ref.difficulty?.length) add('Tables', { title: 'Difficulty classes', meta: 'Table', table: [['DC', 'Difficulty', 'Example'], ...ref.difficulty.map((d) => [d.dc, d.label, d.example || ''])] });
  if (ref.damage) add('Combat', { title: 'Damage and Toughness', meta: `Toughness check vs. DC ${ref.damage.toughness_dc}`, details: ref.damage.notes, table: [['Result', 'Effect'], ...(ref.damage.results || []).map((r) => [r.degree, r.result])] });
  if (ref.afflictions) add('Combat', { title: 'Afflictions', meta: 'Combat', details: ref.afflictions });
  if (ref.recovery) add('Combat', { title: 'Recovery', meta: 'Combat', details: ref.recovery });
  if (ref.range) add('Combat', { title: 'Range', meta: 'Combat', details: ref.range });
  if (ref.measurements?.length) {
    add('Tables', { title: 'Measurements', meta: 'Rank to mass, time, distance, volume', summary: ref.measurement_notes?.summary, details: ref.measurement_notes?.details,
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
  for (const s of R.raw.skills || []) {
    const g = guideFor(R, s.name);
    add('Skills', { title: s.name, meta: `${s.ability}${s.trained_only ? ' · trained only' : ''}${s.specialized ? ' · pick a specialty' : ''}`, summary: g ? null : s.summary,
      details: g ? `${g.covers || ''} ${(g.uses || []).map((u) => `${u.name} ${u.text || ''}`).join(' ')}` : null, el: g ? () => skillGuideBody(g) : null, hideDetails: !!g, source: g ? null : s.source });
  }
  cards.push(...martialCards(R)); // Martial Arts 3e: styles, stances, maneuvers, weapons, headquarters, optional rules
  return cards;
}

let cardsCache = null;

/** The rule card for a name ("Dazed", "Improved Initiative", "Affliction"), optionally in one category. */
export function findRule(title, cat = null) {
  if (!R) return null;
  if (!cardsCache) cardsCache = buildCards();
  const t = String(title || '').trim().toLowerCase();
  const all = cardsCache.filter((c) => c.title.toLowerCase() === t);
  return all.find((c) => !cat || c.cat === cat) || all[0] || null;
}

/** Open a rule card in a dialog, from anywhere (a tap on a condition, advantage or effect). */
export function openRule(title, cat = null) {
  const c = findRule(title, cat);
  if (!c) return false;
  openDialog({ title: c.title, body: cardEl(c) });
  return true;
}

/** Every rule card's title and category, for the jump-anywhere search. */
export function allRules() {
  if (!R) return [];
  if (!cardsCache) cardsCache = buildCards();
  return cardsCache.map((c) => ({ title: c.title, cat: c.cat }));
}

/** Make anything with data-rule="Name" (and data-rule-cat) open its rule card when tapped. */
export function enableRuleLinks(doc = document) {
  const go = (el) => { if (!openRule(el.dataset.rule, el.dataset.ruleCat || null)) return; };
  doc.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-rule]');
    if (!el || el.closest('[contenteditable]')) return;
    e.preventDefault(); e.stopPropagation();
    go(el);
  }, true);
  // The chips that aren't buttons open with Enter or Space too.
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('[data-rule][role="button"]');
    if (!el) return;
    e.preventDefault();
    go(el);
  });
}

/** A tappable rule name: a small button that opens the card. */
export function ruleLink(text, title = text, cat = null) {
  return h('button', { type: 'button', class: 'rule-link', 'data-rule': title, 'data-rule-cat': cat, title: `${title}: what the rules say` }, text);
}

export function initRules(rules, el) {
  R = rules;
  root = el;
  renderRules();
}

function cardEl(c) {
  return h('article', { class: `panel rule-card ${c.el && c.cat !== 'Skills' ? 'wide' : ''}` },
    h('div', null,
      h('div', { class: 'label' }, `${c.cat}${c.meta ? ` · ${c.meta}` : ''}`),
      h('h3', { class: 'rule-title' }, c.title)),
    c.summary ? h('p', { class: 'rule-sum' }, c.summary) : null,
    c.details && !c.hideDetails ? h('p', { class: 'rule-det' }, c.details) : null,
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
      h('p', null, 'Quick reference for DC Adventures: actions, maneuvers, checks, combat, hazards, tables, conditions, every effect, extra, flaw, advantage and skill, plus the Martial Arts book: fighting styles, stances, combat maneuvers and its optional rules. Page numbers point to the Hero\'s Handbook (DCA) or Martial Arts 3e (MA).'))),
    housePanel(),
    h('div', { class: 'roster-tools' },
      h('input', { type: 'search', id: 'rules-q', placeholder: 'Search the rules (grab, falling, Area, Luck...)', value: query, 'aria-label': 'Search the rules', onInput: (e) => { query = e.target.value; draw(); } }),
      countEl),
    h('div', { class: 'ae-tabs', role: 'group', 'aria-label': 'Rule categories', style: { marginBottom: '14px' } },
      cats.map((c) => h('button', { type: 'button', 'aria-pressed': String(category === c), onClick: () => { category = c; renderRules(); } }, c === 'all' ? 'Everything' : c))),
    grid);
  draw();
}
