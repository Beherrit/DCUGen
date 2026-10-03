// GM Tools: dice and checks, initiative, encounters, hideouts, vehicles, beastiary and conditions.

import { h, clear, append, toast } from './dom.js';
import { state } from './store.js';
import { makeRng, randomSeed } from '../engine/rng.js';
import { deriveAll } from '../engine/derive.js';
import { catalogEntries } from '../engine/workshop.js';
import { randomVehicle, randomHeadquarters, vehicleStatLine, hqStatLine } from '../engine/vehicles.js';
import { catalogToCharacter } from '../engine/catalog.js';
import { combatCalculator, gmScreen, notesTool, setRules, damageMatrixTool } from './gmplus.js';
import { skillCheatSheet } from './skillguide.js';
let R;
let root;
const init = { list: [], turn: 0, round: 1 };

const d20 = () => 1 + Math.floor(Math.random() * 20);

/** Degrees of success/failure for a check (DC Adventures ch. 1). */
export function degrees(total, dc, roll) {
  let deg;
  if (total >= dc) deg = 1 + Math.floor((total - dc) / 5);
  else deg = -(1 + Math.floor((dc - total - 1) / 5));
  if (roll === 20) deg = deg > 0 ? deg + 1 : 1; // a natural 20 always succeeds, and adds a degree
  return deg;
}

const TOUGHNESS_RESULTS = {
  0: 'No effect.',
  1: 'Bruised: −1 to further resistance checks against damage.',
  2: 'Dazed until the end of the next turn, and bruised.',
  3: 'Staggered, and bruised.',
  4: 'Incapacitated.',
};

function panel(title, ...children) {
  return h('section', { class: 'panel' }, h('h2', null, title), ...children);
}

const DEG_CLASS = (deg) => (deg >= 3 ? 's3' : deg === 2 ? 's2' : deg === 1 ? 's1' : deg === -1 ? 'f1' : deg === -2 ? 'f2' : deg === -3 ? 'f3' : 'f4');
const DEG_LABEL = (deg) => (deg > 0 ? `${deg} success${deg > 1 ? 'es' : ''}` : `${-deg} fail${deg < -1 ? 's' : ''}`);

/** The book's Degrees of Success and Failure chart (DCA 14), coloured, for the current DC. */
export function bookDegreeTable(dc, total) {
  const rows = [[15, 4], [10, 3], [5, 2], [0, 1], [-5, -1], [-10, -2], [-15, -3], [-20, -4]];
  const rowFor = total == null ? null : rows.find(([off]) => total >= dc + off) || rows[rows.length - 1];
  return h('div', { class: 'table-wrap' }, h('table', { class: 'book-deg', 'aria-label': 'Degrees of success and failure' },
    h('thead', null, h('tr', null, h('th', null, 'Check result equal or greater than'), h('th', null, 'Degree'), h('th', null, `Equal or greater than… (DC ${dc})`))),
    h('tbody', null, rows.map(([off, deg]) => h('tr', { class: `${DEG_CLASS(deg)} ${rowFor && rowFor[0] === off ? 'hit' : ''}` },
      h('td', null, off === 0 ? 'DC' : `DC${off > 0 ? '+' : '−'}${Math.abs(off)}`),
      h('td', null, `${['', 'One', 'Two', 'Three', 'Four'][Math.abs(deg)]} (${deg > 0 ? 'Success' : 'Failure'})`),
      h('td', { class: 'num' }, dc + off))))),
  h('div', { class: 'rule-src' }, "DC Adventures Hero's Handbook, p. 14"));
}

/** A d20 strip coloured by degree of success: what every roll from 1 to 20 would do. */
function degreeChart(mod, dc, rolled, resultText) {
  const cells = [];
  for (let r = 1; r <= 20; r++) {
    const deg = degrees(r + mod, dc, r);
    cells.push(h('div', { class: `deg-cell ${DEG_CLASS(deg)} ${r === rolled ? 'rolled' : ''}`, title: `Roll ${r}: total ${r + mod}, ${DEG_LABEL(deg)}${resultText ? ` (${resultText(deg)})` : ''}` },
      h('b', { class: 'num' }, r), h('span', null, deg > 0 ? `+${deg}` : `${deg}`)));
  }
  const legend = [[3, 'Three or more degrees of success'], [2, 'Two degrees of success'], [1, 'Success'], [-1, 'One degree of failure'], [-2, 'Two degrees of failure'], [-3, 'Three degrees of failure'], [-4, 'Four or more degrees of failure']];
  return h('div', { class: 'deg-chart' },
    h('div', { class: 'deg-strip', role: 'img', 'aria-label': `Degrees of success for d20 ${mod >= 0 ? '+' : ''}${mod} against DC ${dc}` }, cells),
    h('div', { class: 'deg-legend' }, legend.map(([d, t]) => h('span', { class: `deg-key ${DEG_CLASS(d)}` }, resultText ? `${t.replace(/ of (success|failure)/, '')}: ${resultText(d)}` : t))),
    h('p', { class: 'hint', style: { margin: 0 } }, 'Each 5 points over the DC is another degree of success; each 5 under is another degree of failure. A natural 20 adds a degree (and always succeeds).'));
}

function diceTool() {
  const out = h('div', { class: 'dice-out num', 'aria-live': 'polite' }, '—');
  const sub = h('div', { class: 'dice-sub' }, 'Roll a d20 check against a DC.');
  const chartHost = h('div');
  const mod = h('input', { type: 'number', id: 'dice-mod', value: 0, 'aria-label': 'Modifier' });
  const dc = h('input', { type: 'number', id: 'dice-dc', value: 15, 'aria-label': 'Difficulty class' });
  const rank = h('input', { type: 'number', id: 'dmg-rank', value: 10, 'aria-label': 'Damage rank' });
  const tough = h('input', { type: 'number', id: 'tough-bonus', value: 8, 'aria-label': 'Toughness' });
  let mode = 'check';
  let last = null;
  const damageText = (deg) => TOUGHNESS_RESULTS[deg > 0 ? 0 : Math.min(4, -deg)].replace(/:.*$/, '').replace(/\.$/, '');
  const drawChart = () => {
    clear(chartHost);
    const m = mode === 'check' ? Number(mod.value || 0) : Number(tough.value || 0);
    const d = mode === 'check' ? Number(dc.value || 0) : 15 + Number(rank.value || 0);
    chartHost.append(bookDegreeTable(d, last == null ? null : last + m));
    chartHost.append(degreeChart(m, d, last, mode === 'check' ? undefined : damageText));
  };
  for (const el of [mod, dc]) el.addEventListener('input', () => { mode = 'check'; last = null; drawChart(); });
  for (const el of [rank, tough]) el.addEventListener('input', () => { mode = 'damage'; last = null; drawChart(); });
  const check = () => {
    mode = 'check';
    const r = d20(); const total = r + Number(mod.value || 0); const deg = degrees(total, Number(dc.value || 0), r);
    last = r;
    out.textContent = total;
    out.className = `dice-out num deg-text ${DEG_CLASS(deg)}`;
    sub.textContent = `d20 rolled ${r}${r === 20 ? ' (natural 20!)' : ''}. ${deg > 0 ? `Success, ${deg} degree${deg > 1 ? 's' : ''}` : `Failure, ${-deg} degree${deg < -1 ? 's' : ''}`} vs DC ${dc.value}.`;
    drawChart();
  };
  const damage = () => {
    mode = 'damage';
    const r = d20(); const total = r + Number(tough.value || 0); const dcv = 15 + Number(rank.value || 0); const deg = degrees(total, dcv, r);
    last = r;
    out.textContent = total;
    out.className = `dice-out num deg-text ${DEG_CLASS(deg)}`;
    const fails = deg > 0 ? 0 : Math.min(4, -deg);
    sub.textContent = `Toughness check: d20 ${r} + ${tough.value} = ${total} vs DC ${dcv}. ${TOUGHNESS_RESULTS[fails]}`;
    drawChart();
  };
  drawChart();
  return panel('Dice & degrees', out, sub, chartHost,
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, 'Modifier'), mod), h('label', { class: 'field' }, h('span', null, 'DC'), dc)),
    h('button', { class: 'btn primary', type: 'button', onClick: check }, 'Roll check'),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, 'Damage rank'), rank), h('label', { class: 'field' }, h('span', null, 'Target Toughness'), tough)),
    h('button', { class: 'btn', type: 'button', onClick: damage }, 'Roll Toughness vs damage'));
}

function initiativeTool() {
  const listEl = h('ol', { class: 'init-list' });
  const roundEl = h('span', { class: 'chip' }, `Round ${init.round}`);
  const name = h('input', { type: 'text', id: 'init-name', placeholder: 'Name (minions, NPCs...)', 'aria-label': 'Name' });
  const bonus = h('input', { type: 'number', id: 'init-bonus', value: 0, 'aria-label': 'Initiative bonus', style: { maxWidth: '90px' } });
  const conds = Object.keys(R.raw.gm?.conditions?.conditions || {});
  const draw = () => {
    clear(listEl);
    init.list.forEach((e, i) => listEl.append(h('li', { class: i === init.turn ? 'active' : '' },
      h('span', { class: 'ini num' }, e.total),
      h('span', null, h('b', null, e.name), e.cond && e.cond !== 'Normal' ? h('span', { class: 'chip', style: { marginLeft: '6px' } }, e.cond) : null),
      h('select', { 'aria-label': `Condition for ${e.name}`, style: { maxWidth: '130px', padding: '3px' }, onChange: (ev) => { e.cond = ev.target.value; draw(); } },
        conds.map((c) => h('option', { value: c, selected: c === (e.cond || 'Normal') }, c))),
      h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${e.name}`, onClick: () => { init.list.splice(i, 1); if (init.turn >= init.list.length) init.turn = 0; draw(); } }, '✕'))));
    roundEl.textContent = `Round ${init.round}`;
  };
  const add = (n, b) => {
    const r = d20();
    init.list.push({ name: n, bonus: b, roll: r, total: r + b, cond: 'Normal' });
    init.list.sort((a, c) => c.total - a.total || c.bonus - a.bonus);
    draw();
  };
  const addChar = (ch) => add(ch.identity?.codename || 'Hero', deriveAll(ch, R).initiative);
  draw();
  return panel('Initiative tracker',
    h('div', { class: 'btn-row' }, roundEl,
      h('button', { class: 'btn sm', type: 'button', onClick: () => { if (!init.list.length) return; init.turn = (init.turn + 1) % init.list.length; if (init.turn === 0) init.round++; draw(); } }, 'Next turn'),
      h('button', { class: 'btn sm', type: 'button', onClick: () => { init.list.forEach((e) => { e.roll = d20(); e.total = e.roll + e.bonus; }); init.list.sort((a, c) => c.total - a.total); init.turn = 0; init.round = 1; draw(); } }, 'Reroll all'),
      h('button', { class: 'btn sm ghost danger', type: 'button', onClick: () => { init.list = []; init.turn = 0; init.round = 1; draw(); } }, 'Clear')),
    listEl,
    h('div', { class: 'add-row' }, name, bonus, h('button', { class: 'btn', type: 'button', onClick: () => { if (name.value.trim()) { add(name.value.trim(), Number(bonus.value) || 0); name.value = ''; } } }, 'Add')),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm', type: 'button', disabled: !state.current, onClick: () => addChar(state.current) }, 'Add current character'),
      h('button', { class: 'btn sm', type: 'button', disabled: !state.roster.length, onClick: () => { state.roster.forEach(addChar); toast(`Added ${state.roster.length} from the roster`); } }, 'Add whole roster')));
}

function encounterTool() {
  const enc = R.raw.gm?.encounters?.encounters || [];
  const types = [...new Set(enc.map((e) => e.type))];
  const sel = h('select', { id: 'enc-type', 'aria-label': 'Difficulty' }, h('option', { value: '' }, 'Any difficulty'), types.map((t) => h('option', { value: t }, t)));
  const out = h('div', { class: 'result' }, 'Pick a difficulty and roll.');
  const roll = () => {
    const pool = enc.filter((e) => !sel.value || e.type === sel.value);
    const rng = makeRng(randomSeed());
    const e = rng.pick(pool);
    const villain = state.roster.filter((c) => c.alignment === 'villain');
    const foe = villain.length && rng.chance(0.5) ? rng.pick(villain) : null;
    append(clear(out), [h('h4', null, `${e.type} encounter`), e.description, foe ? h('p', { style: { margin: '8px 0 0' } }, h('b', null, 'Twist: '), `${foe.identity.codename} is behind it.`) : null]);
  };
  return panel('Encounter generator', h('div', { class: 'add-row' }, sel, h('button', { class: 'btn primary', type: 'button', onClick: roll }, 'Roll encounter')), out);
}

function hideoutTool() {
  const out = h('div', { class: 'result' }, 'Roll a base of operations: size, Toughness, features and cost (DCA 159-163).');
  const roll = () => {
    const q = randomHeadquarters(R, { seed: randomSeed() });
    if (!q) return;
    append(clear(out), [h('h4', null, `${q.name} (${q.setting})`), q.summary ? h('p', { style: { margin: '0 0 4px' } }, q.summary) : null, h('div', null, hqStatLine(q, R))]);
  };
  return panel('Hideout generator', h('button', { class: 'btn primary', type: 'button', onClick: roll }, 'Roll hideout'), out,
    h('p', { class: 'hint', style: { margin: 0 } }, 'Browse all of them on the Vehicles & HQs tab.'));
}

function vehicleTool() {
  const out = h('div', { class: 'result' }, 'Roll a vehicle: modern, military, sci-fi, fantasy or steampunk, priced by the book.');
  const roll = () => {
    const v = randomVehicle(R, { seed: randomSeed() });
    if (!v) return;
    append(clear(out), [h('h4', null, `${v.name} (${v.setting} ${v.category.toLowerCase()})`), v.summary ? h('p', { style: { margin: '0 0 4px' } }, v.summary) : null, h('div', null, vehicleStatLine(v, R))]);
  };
  return panel('Vehicle generator', h('button', { class: 'btn primary', type: 'button', onClick: roll }, 'Roll vehicle'), out);
}

function beastTool() {
  const all = catalogEntries(R);
  const q = h('input', { type: 'search', id: 'beast-q', placeholder: 'Search the bestiary', 'aria-label': 'Search creatures' });
  const list = h('div', { class: 'scroll' });
  const draw = () => {
    clear(list);
    const term = q.value.toLowerCase();
    for (const e of all.filter((x) => `${x.name} ${x.category} ${(x.tags || []).join(' ')}`.toLowerCase().includes(term)).slice(0, 60)) {
      let ch;
      try { ch = catalogToCharacter(e); } catch { continue; }
      const d = deriveAll(ch, R);
      const main = d.attacks?.find((a) => a.name !== 'Unarmed') || d.attacks?.[0];
      list.append(h('div', { class: 'beast' },
        h('b', null, e.name), ` · PL ${e.pl} · ${e.category}`,
        h('div', null, `Dodge ${d.defenses.Dodge}, Parry ${d.defenses.Parry}, Toughness ${d.defenses.Toughness}, Fortitude ${d.defenses.Fortitude ?? '—'}, Will ${d.defenses.Will ?? '—'} · Init ${d.initiative >= 0 ? '+' : ''}${d.initiative}`),
        main ? h('div', null, `${main.name}${main.roll && main.bonus != null ? ` +${main.bonus}` : ''} (${main.effect} ${main.rank}${main.resistance ? `, ${main.resistance}` : ''})`) : null,
        h('button', { class: 'btn sm', type: 'button', style: { marginTop: '4px' }, onClick: () => { addToInitiative(ch); renderGm(); toast(`${e.name} joins the initiative`); } }, 'Add to initiative')));
    }
  };
  q.addEventListener('input', draw);
  draw();
  return panel(`Bestiary quick add (${all.length})`, h('p', { class: 'hint', style: { margin: 0 } }, 'Full sheets, templates and filters are on the Bestiary tab.'), q, list);
}

function conditionsTool() {
  const c = R.raw.gm?.conditions?.conditions || {};
  return panel('Conditions', h('div', { class: 'scroll' }, h('dl', { class: 'story', style: { display: 'grid', gridTemplateColumns: '110px minmax(0,1fr)', gap: '4px 10px', margin: 0, fontSize: '13.5px' } },
    Object.entries(c).map(([k, v]) => [h('dt', { style: { fontWeight: 700 } }, k), h('dd', { style: { margin: 0 } }, v)]))));
}

let tab = 'table';
const TABS = [['table', 'At the table'], ['screen', 'GM screen'], ['skills', 'Skills'], ['notes', 'Notes'], ['generators', 'Generators'], ['beasts', 'Beastiary']];

export function initGm(rules, el) {
  R = rules;
  root = el;
  setRules(rules);
  try { tab = localStorage.getItem('dcugen.gmtab') || 'table'; } catch { /* ignore */ }
  renderGm();
}

/** Add any character (hero, villain, creature) to the initiative order. */
export function addToInitiative(ch) {
  const r = d20();
  const bonus = deriveAll(ch, R).initiative;
  init.list.push({ name: ch.identity?.codename || 'Character', bonus, roll: r, total: r + bonus, cond: 'Normal' });
  init.list.sort((a, c) => c.total - a.total || c.bonus - a.bonus);
}

export function renderGm() {
  if (!root) return;
  clear(root);
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'GM Tools'),
    h('p', null, 'Run the game: checks and combat odds, initiative with conditions, a GM screen with live trackers, your notes, and generators for encounters, hideouts and vehicles.'))));
  root.append(h('div', { class: 'ae-tabs', role: 'group', 'aria-label': 'GM tools', style: { marginBottom: '14px' } },
    TABS.map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(tab === id), onClick: () => { tab = id; try { localStorage.setItem('dcugen.gmtab', id); } catch { /* ignore */ } renderGm(); } }, label))));
  if (tab === 'table') root.append(h('div', { class: 'gm' }, diceTool(), initiativeTool(), combatCalculator()), h('div', { style: { marginTop: '16px', display: 'grid', gap: '16px' } }, damageMatrixTool()));
  if (tab === 'screen') root.append(gmScreen(renderGm));
  if (tab === 'notes') root.append(notesTool(renderGm));
  if (tab === 'skills') root.append(skillCheatSheet(R));
  if (tab === 'generators') root.append(h('div', { class: 'gm' }, encounterTool(), hideoutTool(), vehicleTool(), conditionsTool()));
  if (tab === 'beasts') root.append(h('div', { class: 'gm' }, beastTool(), initiativeTool()));
}
