// The Battle Room: throw characters, creatures and minions into an arena, pick sides, and watch
// the fight play out turn by turn with a full log. Pause, step, run to the end, or run the same
// match a hundred times for the odds.

import { sortChars, sortSelect, sortPref } from './sorting.js';
import { hasForms, activeForm, switchForm } from '../engine/forms.js';
import { h, clear, toast, copyText, download, inkFor, openDialog } from './dom.js';
import { state } from './store.js';
import { randomSeed } from '../engine/rng.js';
import { catalogEntries } from '../engine/workshop.js';
import { catalogToCharacter } from '../engine/catalog.js';
import { DIFFICULTIES, verdict, heroOdds, tuneBattle, scaleCharacter } from '../engine/balance.js';
import { battleComic, comicSvg } from '../engine/comic.js';
import { portraitOf } from '../engine/portrait.js';
import { imageDialog } from './imageshare.js';
import { createBattle, addCombatant, removeCombatant, makeCombatant, joinBattle, startBattle, step, runRound, runToEnd, battleText, simulateMany, serializeBattle, reviveBattle, placeAll, STYLES, TACTICS, ARENA, statusLine, conditionLabels, detectStyle, rebuildCombatant } from '../engine/battle.js';

const KEY = 'dcugen.battle.v1';
let R;
let root;
let hooks = {};
let battle;
let timer = null;
let ui = { showDice: true, logWho: null, moreTeams: false, mineQ: '', speed: 700, filter: 'all', bestiaryQ: '', team: 'A', copies: 1, mc: null, mcBusy: false, showHelp: false };
const TEAM_COLORS = { A: '#1f4fbf', B: '#c8202f', C: '#1a7f4b', D: '#a8670b' };
const TEAMS = ['A', 'B', 'C', 'D'];

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw?.combatants) return reviveBattle(R, raw);
  } catch { /* ignore */ }
  return createBattle({ seed: randomSeed(), name: 'Battle' });
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(serializeBattle(battle))); } catch { /* storage full */ }
}

export function initBattle(rules, el, h2 = {}) {
  R = rules;
  root = el;
  hooks = h2;
  battle = load();
  document.addEventListener('keydown', (e) => {
    if (!root || root.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    if (document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    if (k === ' ' && battle.status === 'running') { e.preventDefault(); if (timer) { stopTimer(); renderBattle(); } else play(); }
    else if (k === 'n' && battle.status === 'running') doStep();
    else if (k === 'r' && battle.status === 'running') doRound();
    else if (k === 'e' && battle.status === 'running') doEnd();
    else if (k === 'enter' && battle.status === 'setup' && battle.combatants.length >= 2) { e.preventDefault(); begin(); }
    else if (k === ' ' && battle.status === 'setup' && readyToFight().ok) { e.preventDefault(); begin(); }
  });
}

/** Roll initiative and start. The fight plays straight away; stepwise starts paused for one action at a time. */
function begin({ stepwise = false } = {}) {
  if (!readyToFight().ok) { toast(readyToFight().why); return; }
  try {
    stopTimer(); startBattle(battle, R); save();
    if (stepwise) renderBattle(); else play();
  } catch (e) { toast(e.message); }
}

/** Can the fight start? Needs fighters on at least two sides. */
function readyToFight() {
  const teams = new Set(battle.combatants.map((c) => c.team));
  if (!battle.combatants.length) return { ok: false, why: 'The arena is empty: throw someone in first.' };
  if (teams.size < 2) return { ok: false, why: `Everyone is on team ${[...teams][0]}. Move someone to another team (click a team letter on their card).` };
  return { ok: true, why: '' };
}

/** Power on each side: total and average PL, for the balance readout. */
function sidePower() {
  const out = {};
  // minions count for a third: five PL 8 thugs are not a PL 40 side
  for (const c of battle.combatants) { out[c.team] = out[c.team] || { n: 0, pl: 0, w: 0, standing: 0 }; out[c.team].n++; out[c.team].pl += c.pl; out[c.team].w += c.minion ? c.pl / 3 : c.pl; if (!c.out && !c.fled) out[c.team].standing++; }
  for (const t of Object.keys(out)) { out[t].avg = out[t].pl / out[t].n; out[t].w = Math.round(out[t].w); }
  return out;
}

/** Throw any character into the battle (from the Forge, Roster, Bestiary or Workshop). */
export function throwIn(ch, { team, copies = 1, name } = {}) {
  if (!battle) battle = load();
  const side = team || (ch.alignment === 'villain' || ch.minion || ['creature', 'animal', 'monster'].includes(ch.kind) ? 'B' : 'A');
  const added = [];
  for (let i = 0; i < Math.max(1, Math.min(20, copies)); i++) {
    const copy = JSON.parse(JSON.stringify(ch));
    const base = name || copy.identity?.codename || copy.identity?.realName || 'Fighter';
    const same = battle.combatants.filter((c) => c.name === base || c.name.startsWith(`${base} #`)).length;
    const label = copies > 1 || same ? `${base} #${same + 1}` : base;
    const c = makeCombatant(R, copy, { team: side, name: label });
    if (battle.status === 'running') joinBattle(battle, R, c); else addCombatant(battle, c);
    added.push(c);
  }
  save();
  if (!root?.hidden) renderBattle();
  return { team: side, count: added.length, names: added.map((c) => c.name) };
}

export function battleCount() { return battle?.combatants.length || 0; }

function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

function play() {
  stopTimer();
  if (battle.status === 'over') return;
  timer = setInterval(() => {
    if (battle.status === 'over') { stopTimer(); renderBattle(); return; }
    step(battle, R);
    save();
    renderLive();
  }, ui.speed);
  renderBattle();
}

function doStep() { stopTimer(); step(battle, R); save(); renderLive(); if (battle.status === 'over') renderBattle(); }
function doRound() { stopTimer(); runRound(battle, R); save(); renderLive(); if (battle.status === 'over') renderBattle(); }
function doEnd() { stopTimer(); runToEnd(battle, R); save(); renderBattle(); }

function reset({ newSeed = false } = {}) {
  stopTimer();
  const chars = battle.combatants.map((c) => ({ ch: c.ch, team: c.team, style: c.style, tactics: c.tactics, heroPoints: c.heroPoints, name: c.name, id: c.id }));
  battle = createBattle({ seed: newSeed ? randomSeed() : battle.seed, name: battle.name });
  for (const x of chars) addCombatant(battle, makeCombatant(R, x.ch, x));
  ui.mc = null;
  save();
  renderBattle();
}

function clearAll() {
  stopTimer();
  battle = createBattle({ seed: randomSeed(), name: 'Battle' });
  ui.mc = null;
  save();
  renderBattle();
}

// ---- pieces ---------------------------------------------------------------------------------------------

const teamColor = (t) => TEAM_COLORS[t] || '#666';
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function fighterCard(c) {
  const setup = battle.status === 'setup';
  const S = STYLES[c.style] || STYLES.brawler;
  const d = c.d;
  const dmg = h('div', { class: 'bt-track', title: `${c.bruises} bruise${c.bruises === 1 ? '' : 's'}${c.dazed ? ', dazed' : ''}${c.staggered ? ', staggered' : ''}` },
    Array.from({ length: 4 }, (_, i) => h('i', { class: i < c.bruises ? 'on' : '' })),
    c.staggered ? h('span', { class: 'bt-flag stag' }, 'STAGGERED') : c.dazed ? h('span', { class: 'bt-flag dazed' }, 'DAZED') : null);
  const conds = c.out || c.fled ? [] : conditionLabels(c).filter((x) => !['Dazed', 'Staggered', 'Fatigued', 'Exhausted'].includes(x));
  const main = c.attacks.filter((a) => !a.unarmed).sort((a, b) => b.rank - a.rank)[0] || c.attacks[0];
  const styleSel = h('select', { class: 'bt-mini', 'aria-label': `${c.name} fighting style`, onChange: (e) => { c.style = e.target.value; rebuildCombatant(c, R); save(); renderBattle(); } },
    Object.entries(STYLES).map(([k, v]) => h('option', { value: k, selected: k === c.style }, `${v.glyph} ${v.label}`)));
  const tacSel = h('select', { class: 'bt-mini', 'aria-label': `${c.name} target choice`, onChange: (e) => { c.tactics = e.target.value; save(); } },
    Object.entries(TACTICS).map(([k, v]) => h('option', { value: k, selected: k === c.tactics }, k === 'auto' ? `Target: ${S.target === 'lowWill' ? 'weakest will' : TACTICS[S.target]?.toLowerCase() || 'by style'}` : v)));
  const teamSel = h('div', { class: 'bt-sides', role: 'group', 'aria-label': `${c.name} team` }, TEAMS.map((t) => h('button', { type: 'button', class: `bt-side ${t === c.team ? 'on' : ''}`, style: { '--t': teamColor(t) }, title: `Move to team ${t}`, 'aria-pressed': String(t === c.team), onClick: () => { c.team = t; placeAll(battle); save(); renderBattle(); } }, t)));
  // Alternate forms: fight in any of them (DCA 88: each form is its own build)
  const formSel = hasForms(c.ch) ? h('select', { class: 'bt-mini', 'aria-label': `${c.name} form`, title: 'Which form they fight in', onChange: (e) => {
    const ch = switchForm(c.ch, Number(e.target.value));
    Object.assign(c, makeCombatant(R, ch, { id: c.id, team: c.team, style: null, tactics: c.tactics, heroPoints: c.heroPoints, name: c.name }));
    placeAll(battle); save(); renderBattle();
  } }, c.ch.forms.map((f, i) => h('option', { value: i, selected: i === activeForm(c.ch) }, `🎭 ${f.name || `Form ${i + 1}`}`))) : null;
  const hp = h('input', { type: 'number', class: 'bt-hp', min: 0, max: 9, value: c.heroPoints, 'aria-label': `${c.name} hero points`, title: 'Hero points', onChange: (e) => { c.heroPoints = Math.max(0, Number(e.target.value) || 0); save(); } });
  return h('article', { class: `bt-card ${c.out ? 'out' : ''} ${c.fled ? 'fled' : ''}`, style: { '--c': c.color, '--t': teamColor(c.team), '--c-ink': inkFor(c.color) } },
    h('div', { class: 'bt-card-head' },
      h('span', { class: 'bt-token', title: `Zone ${c.pos + 1}` }, initials(c.name)),
      h('div', { class: 'bt-names' },
        h('b', null, c.name),
        h('span', null, `PL ${c.pl} · ${S.glyph} ${S.label}${c.minion ? ' · minion' : ''}${hasForms(c.ch) ? ` · 🎭 ${c.ch.forms[activeForm(c.ch)]?.name || 'form'}` : ''}`)),
      h('span', { class: 'bt-team', style: { background: teamColor(c.team) } }, c.team),
      h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${c.name}`, title: 'Remove from the battle', onClick: () => { removeCombatant(battle, c.id); save(); renderBattle(); } }, '✕')),
    h('div', { class: 'bt-stats' },
      [['DOD', d.defenses.Dodge], ['PAR', d.defenses.Parry], ['TOU', d.defenses.Toughness - c.bruises], ['FOR', d.defenses.immune?.Fortitude ? '—' : d.defenses.Fortitude], ['WIL', d.defenses.immune?.Will ? '—' : d.defenses.Will], ['INI', (d.initiative >= 0 ? '+' : '') + d.initiative]].map(([k, v]) => h('div', null, h('b', { class: 'num' }, v), h('span', null, k)))),
    main ? h('div', { class: 'bt-main' }, `${main.name}: ${main.roll ? `+${main.bonus}, ` : `${main.area ? `${main.area} area` : 'perception'}, `}${main.effect} ${main.rank} (${main.resistance})`, c.attacks.length > 2 ? h('small', null, ` +${c.attacks.length - 1} more`) : null) : null,
    setup ? h('div', { class: 'bt-opts' }, teamSel, formSel, styleSel, h('details', { class: 'bt-more' }, h('summary', null, 'More'), h('div', { class: 'bt-more-body' }, tacSel, h('label', { class: 'bt-hp-wrap', title: 'Hero points: re-roll a miss or shake off a daze' }, '★ Hero points', hp)))) : null,
    !setup ? h('div', { class: 'bt-state' }, dmg,
      h('div', { class: 'bt-conds' },
        c.fled ? h('span', { class: 'bt-cond fled' }, 'Fled') : c.out ? h('span', { class: 'bt-cond ko' }, statusLine(c)) : null,
        conds.map((x) => h('span', { class: 'bt-cond' }, x)),
        c.heroPoints ? h('span', { class: 'bt-cond hp', title: 'Hero points' }, `★ ${c.heroPoints}`) : null,
        c.fatigue ? h('span', { class: 'bt-cond' }, c.fatigue >= 2 ? 'Exhausted' : 'Fatigued') : null),
      h('div', { class: 'bt-record' }, `${c.stats.hits}/${c.stats.attacks} hits · ${c.stats.kos} KO${c.stats.kos === 1 ? '' : 's'} · dealt ${c.stats.degrees}, took ${c.stats.taken}`)) : null,
    S.blurb && setup ? h('p', { class: 'bt-blurb' }, S.blurb) : null);
}

function arena() {
  const zones = Array.from({ length: ARENA }, (_, i) => h('div', { class: 'bt-zone' }, h('span', { class: 'bt-zone-n' }, i + 1)));
  const active = battle.status === 'running' ? battle.order[Math.min(battle.turn, battle.order.length - 1)] : null;
  for (const c of battle.combatants) {
    const tok = h('span', { class: `bt-token ${c.out || c.fled ? 'down' : ''} ${c.id === battle.order[battle.turn - 1] ? 'acting' : ''}`, title: `${c.name} (team ${c.team}) · ${statusLine(c)}`, style: { '--c': c.color, '--t': teamColor(c.team), '--c-ink': inkFor(c.color) } }, initials(c.name));
    zones[Math.max(0, Math.min(ARENA - 1, c.pos))].append(tok);
  }
  void active;
  return h('div', { class: 'bt-arena', role: 'img', 'aria-label': 'The arena, with every fighter in their zone' }, zones);
}

const KIND_CLASS = { round: 'round', init: 'init', hit: 'hit', crit: 'crit', miss: 'miss', resist: 'resist', condition: 'cond', ko: 'ko', heal: 'heal', hero: 'hero', move: 'move', flee: 'ko', end: 'end', skip: 'skip', attack: 'attack', recover: 'heal', note: 'note' };

const diceText = (d) => `${d.label}: d20 ${d.roll}${d.mod != null ? ` ${d.mod >= 0 ? '+' : '−'} ${Math.abs(d.mod)}` : ''}${d.total != null ? ` = ${d.total}` : ''}${d.dc != null ? ` vs ${d.dc}` : ''}`;

function logEntry(e) {
  const el = h('div', { class: `bt-log-row ${KIND_CLASS[e.kind] || ''} ${e.important ? 'key' : ''}` },
    h('span', { class: 'bt-log-text' }, e.text,
      ui.showDice && e.dice?.length && e.kind !== 'init' && !/d20 \d/.test(e.text || '') ? h('small', { class: 'bt-log-roll' }, e.dice.map(diceText).join(' · ')) : null),
    e.dice?.length ? h('span', { class: 'bt-log-dice', title: e.dice.map(diceText).join('\n') }, e.dice.slice(0, 4).map((d) => h('b', { class: `num ${d.roll === 20 ? 'nat20' : d.roll === 1 ? 'nat1' : ''}` }, d.roll))) : null);
  return el;
}

/**
 * The log as turns: each fighter's turn is a block with who acted and everything that happened in it (moves,
 * attacks, rolls, what the target rolled, conditions), so you can read the fight action by action.
 */
function logTurns(list) {
  const blocks = [];
  let cur = null;
  for (const e of list) {
    if (e.kind === 'round' || e.kind === 'end' || e.kind === 'init' && !e.actor) { blocks.push({ kind: e.kind, entries: [e] }); cur = null; continue; }
    if (!cur || (e.actor && e.actor !== cur.actor) || e.round !== cur.round) {
      cur = { kind: 'turn', actor: e.actor || null, round: e.round, entries: [] };
      blocks.push(cur);
    }
    cur.entries.push(e);
  }
  return blocks;
}

let logHost; let liveHost; let arenaHost; let cardsHost; let nowHost;

/** What just happened and who is up, in big type, so you need not read the log. */
function nowBanner() {
  if (battle.status === 'setup') return [];
  const last = [...battle.log].reverse().find((e) => e.kind !== 'round' && e.kind !== 'init') || battle.log[battle.log.length - 1];
  const next = battle.status === 'running' ? battle.combatants.find((c) => c.id === battle.order[battle.turn]) : null;
  const actor = last?.actor ? battle.combatants.find((c) => c.id === last.actor) : null;
  return [
    last ? h('div', { class: `bt-now-line ${KIND_CLASS[last.kind] || ''}`, style: actor ? { '--t': teamColor(actor.team) } : null }, h('span', { class: 'bt-now-label' }, 'Just now'), h('span', null, last.text)) : null,
    next ? h('div', { class: 'bt-now-next', style: { '--t': teamColor(next.team) } }, h('span', { class: 'bt-now-label' }, 'Up next'), h('b', null, next.name), h('span', { class: 'hint' }, ` · round ${battle.round}`)) : null,
  ].filter(Boolean);
}

function renderLog() {
  if (!logHost) return;
  clear(logHost);
  const who = ui.logWho && battle.combatants.some((c) => c.id === ui.logWho) ? ui.logWho : null;
  const list = battle.log.filter((e) => (ui.filter === 'all' || e.important || ['round', 'ko', 'end', 'crit', 'hero'].includes(e.kind))
    && (!who || e.kind === 'round' || e.actor === who || e.target === who || (e.text || '').includes(battle.combatants.find((c) => c.id === who)?.name || '\u0000')));
  if (!list.length) { logHost.append(h('p', { class: 'hint', style: { margin: 0 } }, battle.status === 'setup' ? 'Start the fight and every action shows here, turn by turn: who moved, who they attacked, every roll and what it did.' : 'Nothing for this filter yet.')); return; }
  const blocks = logTurns(list);
  blocks.forEach((b, i) => {
    if (b.kind !== 'turn') { for (const e of b.entries) logHost.append(logEntry(e)); return; }
    const actor = b.actor ? battle.combatants.find((c) => c.id === b.actor) : null;
    const last = i === blocks.length - 1;
    logHost.append(h('div', { class: `bt-turn ${last && battle.status === 'running' ? 'latest' : ''}`, style: actor ? { '--t': teamColor(actor.team) } : null },
      actor ? h('div', { class: 'bt-turn-head' }, h('span', { class: 'bt-log-team', style: { background: teamColor(actor.team) } }, actor.team), h('b', null, actor.name), h('span', { class: 'hint' }, `round ${b.round}`)) : null,
      b.entries.map(logEntry)));
  });
  logHost.scrollTop = logHost.scrollHeight;
}

/** Cheap re-render while the fight plays: cards, arena and log only. */
function renderLive() {
  if (arenaHost) { clear(arenaHost); arenaHost.append(arena()); }
  if (cardsHost) { clear(cardsHost); cardsHost.append(...teamColumns()); }
  if (liveHost) { clear(liveHost); liveHost.append(...statusBar()); }
  if (nowHost) { clear(nowHost); nowHost.append(...nowBanner()); }
  renderLog();
}

function teamColumns() {
  const teams = [...new Set(battle.combatants.map((c) => c.team))].sort();
  if (!teams.length) return [h('div', { class: 'empty bt-empty' }, h('h2', null, 'The arena is empty'), h('p', null, 'Pick fighters on the left, or use a quick start:'), h('div', { class: 'bt-quicks' }, quickStarts()), h('p', { class: 'hint' }, 'Every character sheet, roster card and Bestiary creature also has a "⚔ Battle Room" button to throw them in.'))];
  return teams.map((t) => h('section', { class: 'bt-team-col', style: { '--t': teamColor(t) } },
    h('div', { class: 'bt-team-head' }, h('span', { class: 'bt-team', style: { background: teamColor(t) } }, t), h('b', null, `Team ${t}`), h('span', { class: 'hint' }, (() => { const p = sidePower()[t]; return battle.status === 'setup' ? `${p.n} fighter${p.n === 1 ? '' : 's'} · PL ${p.avg.toFixed(p.avg % 1 ? 1 : 0)} avg · ${p.pl} total` : `${p.standing} of ${p.n} standing`; })())),
    battle.combatants.filter((c) => c.team === t).map(fighterCard)));
}

function statusBar() {
  const acting = battle.status === 'running' && battle.turn > 0 ? battle.combatants.find((c) => c.id === battle.order[battle.turn - 1]) : null;
  const next = battle.status === 'running' ? battle.combatants.find((c) => c.id === battle.order[battle.turn]) : null;
  const chip = (text, cls = '') => h('span', { class: `chip ${cls}` }, text);
  return [
    chip(battle.status === 'setup' ? 'Setting up' : battle.status === 'over' ? (battle.winner ? `Team ${battle.winner} wins` : 'Stalemate') : timer ? 'Playing' : 'Paused', battle.status === 'over' ? 'bt-chip-win' : ''),
    battle.status !== 'setup' ? chip(`Round ${battle.round}`) : null,
    acting ? chip(`Last: ${acting.name}`) : null,
    next && battle.status === 'running' ? chip(`Next: ${next.name}`) : null,
    chip(`Seed ${battle.seed}`),
  ];
}

// ---- adding fighters ------------------------------------------------------------------------------------

/** One-click set-ups: the roster, a foe, a squad, an even match. */
function quickStarts() {
  const all = catalogEntries(R);
  const heroes = state.roster.filter((c) => c.alignment !== 'villain' && !c.minion);
  const villains = state.roster.filter((c) => c.alignment === 'villain');
  const foe = (team, { minion = false, near = null } = {}) => {
    const pl = near ?? (Math.round(battle.combatants.filter((c) => c.team !== team).reduce((s, c) => s + c.pl, 0) / Math.max(1, battle.combatants.filter((c) => c.team !== team).length)) || 8);
    const pool = all.filter((e) => Math.abs(e.pl - pl) <= 2 && !!e.minion === minion);
    const e = pool[Math.floor(Math.random() * pool.length)] || all[Math.floor(Math.random() * all.length)];
    const ch = catalogToCharacter(e); ch.alignment = 'villain';
    return { ch, name: e.name };
  };
  const evenUp = () => {
    const p = sidePower();
    const a = p.A?.w || 0; const b = p.B?.w || 0;
    if (!a && !b) { toast('Add fighters first'); return; }
    const weak = a <= b ? 'A' : 'B';
    const gap = Math.abs(a - b);
    if (gap < 3) { toast('The sides are already close'); return; }
    let added = 0; let left = gap;
    while (left > 2 && added < 6) { const f = foe(weak, { near: Math.min(left, Math.max(4, Math.round(p[weak]?.avg || p[weak === 'A' ? 'B' : 'A']?.avg || 8))) }); throwIn(f.ch, { team: weak, name: f.name }); left -= f.ch.pl; added++; }
    toast(`Evened up: ${added} more on team ${weak}`);
  };
  const btn = (label, hint, fn, disabled = false) => h('button', { type: 'button', class: 'btn sm', title: hint, disabled, onClick: () => { try { fn(); } catch (e) { toast(e.message); } } }, label);
  return [
    btn(`My heroes → A${heroes.length ? ` (${heroes.length})` : ''}`, 'Everyone on the roster who is not a villain', () => { for (const c of heroes) throwIn(c, { team: 'A' }); toast(`${heroes.length} heroes on team A`); }, !heroes.length),
    btn(`My villains → B${villains.length ? ` (${villains.length})` : ''}`, 'Every villain on the roster', () => { for (const c of villains) throwIn(c, { team: 'B' }); toast(`${villains.length} villains on team B`); }, !villains.length),
    btn('🎲 Random foe → B', 'A creature or villain from the Bestiary near side A\'s power level', () => { const f = foe('B'); throwIn(f.ch, { team: 'B', name: f.name }); toast(`${f.name} steps in on team B`); }),
    btn('👥 Squad of 5 minions → B', 'Five of the same minion from the Bestiary', () => { const f = foe('B', { minion: true }); throwIn(f.ch, { team: 'B', copies: 5, name: f.name }); toast(`5 × ${f.name} on team B`); }),
    btn('⚖ Even it up', 'Adds Bestiary fighters to the weaker team until the power levels are close', evenUp, battle.combatants.length < 1),
  ];
}

/** The team letters to offer on each row: A and B, and C and D once a fight uses more sides (or asks for them). */
function rowTeams() {
  const used = new Set(battle.combatants.map((c) => c.team));
  return TEAMS.filter((t, i) => i < 2 || used.has(t) || ui.moreTeams);
}

/** A pickable fighter: its name and PL, and a button per team to throw it straight onto that side. */
function pickRow({ name, meta, color, onAdd }) {
  return h('div', { class: 'bt-pick', style: { '--c': color || '#888' } },
    h('span', { class: 'swatch' }), h('span', { class: 'bt-pick-text' }, h('span', { class: 'bt-pick-name', title: name }, name), h('span', { class: 'bt-pick-meta' }, meta)),
    h('span', { class: 'bt-pick-to' }, rowTeams().map((t) => h('button', { type: 'button', class: 'bt-side', style: { '--t': teamColor(t) }, title: `Add ${name} to team ${t}`, 'aria-label': `Add ${name} to team ${t}`, onClick: () => onAdd(t) }, t))));
}

function addPanel() {
  const copies = h('input', { type: 'number', id: 'bt-copies', min: 1, max: 20, value: ui.copies || 1, 'aria-label': 'How many copies', title: 'Copies (for squads of minions)', style: { maxWidth: '64px' }, onChange: (e) => { ui.copies = Number(e.target.value) || 1; } });
  const add = (ch, name, team) => {
    const r = throwIn(ch, { team, copies: Number(copies.value) || 1, name });
    toast(`${r.count > 1 ? `${r.count} × ` : ''}${name || ch.identity?.codename} join${r.count > 1 ? '' : 's'} team ${r.team}`);
  };
  // open tabs and roster
  const mine = [];
  for (const t of state.tabs || []) mine.push({ ch: t, from: 'tab' });
  for (const c of state.roster) if (!mine.some((m) => m.ch.rosterId && m.ch.rosterId === c.rosterId)) mine.push({ ch: c, from: 'roster' });
  const mineQ = h('input', { type: 'search', id: 'bt-mine-q', placeholder: 'Find a character…', value: ui.mineQ || '', 'aria-label': 'Find one of your characters' });
  const mineList = h('div', { class: 'bt-pick-list', id: 'bt-mine' });
  const drawMine = () => {
    clear(mineList);
    ui.mineQ = mineQ.value;
    const term = mineQ.value.trim().toLowerCase();
    const shown = sortChars(mine.filter(({ ch }) => !term || `${ch.identity?.codename || ''} ${ch.identity?.realName || ''}`.toLowerCase().includes(term)), sortPref('battle-mine'), (m) => m.ch);
    if (!mine.length) { mineList.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Roll or open characters on the Forge, or save some to the roster, and they show up here.')); return; }
    for (const { ch, from } of shown.slice(0, 80)) mineList.append(pickRow({ name: ch.identity?.codename || 'Unnamed', meta: `PL ${ch.pl} · ${ch.alignment === 'villain' ? 'villain' : 'hero'}${from === 'tab' ? ' · open' : ''}`, color: ch.theme?.color, onAdd: (t) => add(ch, null, t) }));
    if (!shown.length) mineList.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing matches.'));
  };
  mineQ.addEventListener('input', drawMine);
  drawMine();
  // bestiary quick search
  const all = catalogEntries(R);
  const q = h('input', { type: 'search', id: 'bt-beast-q', placeholder: 'Bestiary: dragon, thug, wolf, robot…', value: ui.bestiaryQ, 'aria-label': 'Search the bestiary' });
  const beastList = h('div', { class: 'bt-pick-list', id: 'bt-beasts' });
  const drawBeasts = () => {
    clear(beastList);
    const term = q.value.trim().toLowerCase();
    ui.bestiaryQ = q.value;
    const found = sortChars(all.filter((e) => !term || `${e.name} ${e.category} ${e.realm || ''} ${(e.tags || []).join(' ')}`.toLowerCase().includes(term)), sortPref('battle-beasts', 'plAsc')).slice(0, term ? 60 : 30);
    for (const e of found) beastList.append(pickRow({ name: e.name, meta: `PL ${e.pl} · ${e.category}${e.minion ? ' · minion' : ''}`, color: e.minion ? '#8a5a44' : '#7a3fb8', onAdd: (t) => {
      let ch;
      try { ch = catalogToCharacter(e); } catch (err) { toast(err.message); return; }
      ch.alignment = 'villain';
      add(ch, e.name, t);
    } }));
    if (!found.length) beastList.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing matches.'));
  };
  q.addEventListener('input', drawBeasts);
  drawBeasts();
  return h('aside', { class: 'rail bt-rail', 'aria-label': 'Add fighters' },
    h('h2', null, 'Pick the fighters'),
    h('p', { class: 'hint', style: { margin: 0 } }, 'Press a team letter on a row to put them on that side.'),
    h('div', { class: 'label' }, 'Quick starts'),
    h('div', { class: 'bt-quicks' }, quickStarts()),
    h('div', { class: 'bt-list-head' }, h('span', { class: 'label' }, 'Your characters'), sortSelect('battle-mine', drawMine, { id: 'bt-mine-sort' })),
    mineQ, mineList,
    h('div', { class: 'bt-list-head' }, h('span', { class: 'label' }, 'Bestiary'), sortSelect('battle-beasts', drawBeasts, { fallback: 'plAsc', modes: ['name', 'plAsc', 'plDesc'], id: 'bt-beast-sort' })),
    q, beastList,
    h('div', { class: 'add-row', style: { alignItems: 'center' } },
      h('label', { class: 'bt-copies', title: 'Add several of the same (a squad of minions)' }, 'Copies ×', copies),
      h('label', { class: 'bt-copies' }, h('input', { type: 'checkbox', checked: !!ui.moreTeams, onChange: (e) => { ui.moreTeams = e.target.checked; renderBattle(); } }), ' Teams C and D')),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', type: 'button', onClick: () => hooks.goBestiary?.() }, 'Open the Bestiary')));
}

// ---- the match-up at a glance ------------------------------------------------------------------------------

/** "Team A (3, PL 30) vs Team B (5 minions, PL 18)": who is fighting whom, before and during the fight. */
function versusBar() {
  const p = sidePower();
  const teams = Object.keys(p).sort();
  if (!teams.length) return null;
  const side = (t) => {
    const who = battle.combatants.filter((c) => c.team === t);
    const names = who.length <= 3 ? who.map((c) => c.name).join(', ') : `${who.slice(0, 2).map((c) => c.name).join(', ')} +${who.length - 2}`;
    return h('div', { class: 'bt-vs-side', style: { '--t': teamColor(t) } },
      h('span', { class: 'bt-team', style: { background: teamColor(t) } }, t),
      h('div', null, h('b', null, names), h('small', null, battle.status === 'setup' ? `${p[t].n} fighter${p[t].n === 1 ? '' : 's'} · ${p[t].pl} PL total` : `${p[t].standing} of ${p[t].n} standing`)));
  };
  const parts = [];
  teams.forEach((t, i) => { if (i) parts.push(h('span', { class: 'bt-vs' }, 'vs')); parts.push(side(t)); });
  return h('div', { class: 'bt-versus', id: 'bt-versus' }, parts);
}

// ---- odds -----------------------------------------------------------------------------------------------

function oddsPanel() {
  const run = (n) => {
    if (battle.combatants.length < 2) { toast('Add fighters on at least two teams first.'); return; }
    ui.mcBusy = true; renderBattle();
    setTimeout(() => {
      try { ui.mc = simulateMany(battle, R, n, { seed: `${battle.seed}-odds-${Date.now().toString(36)}` }); } catch (e) { toast(e.message); }
      ui.mcBusy = false; renderBattle();
    }, 30);
  };
  const mc = ui.mc;
  const teams = [...new Set(battle.combatants.map((c) => c.team))].sort();
  return h('section', { class: 'panel bt-odds' },
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      h('h2', null, 'Odds'),
      h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn sm', type: 'button', disabled: ui.mcBusy, onClick: () => run(100) }, ui.mcBusy ? 'Running…' : 'Run 100 fights'),
      h('button', { class: 'btn sm', type: 'button', disabled: ui.mcBusy, onClick: () => run(500) }, '500')),
    h('p', { class: 'hint', style: { margin: 0 } }, 'Replays this match-up with fresh dice each time and counts who wins. The current fight is left alone.'),
    mc ? h('div', { class: 'bt-mc' },
      h('div', { class: 'bt-mc-bars' }, [...teams, 'draw'].map((t) => {
        const w = mc.wins[t] || 0;
        if (t === 'draw' && !w) return null;
        return h('div', { class: 'bt-mc-row' }, h('span', { class: 'bt-mc-label' }, t === 'draw' ? 'Stalemate' : `Team ${t}`),
          h('div', { class: 'meter' }, h('i', { style: { width: `${(w / mc.n) * 100}%`, background: t === 'draw' ? 'var(--ink-3)' : teamColor(t) } })),
          h('b', { class: 'num' }, `${Math.round((w / mc.n) * 100)}%`));
      })),
      h('p', { class: 'hint', style: { margin: '6px 0 0' } }, `${mc.n} fights, ${mc.avgRounds.toFixed(1)} rounds on average.`),
      h('table', { class: 'skills bt-mc-table' }, h('thead', null, h('tr', null, h('th', null, 'Fighter'), h('th', null, 'Still standing'), h('th', null, 'Knocked out'), h('th', null, 'KOs per fight'))),
        h('tbody', null, battle.combatants.map((c) => h('tr', null, h('td', null, h('b', null, c.name), h('span', { class: 'bt-team sm', style: { background: teamColor(c.team) } }, c.team)),
          h('td', { class: 'num' }, `${Math.round(((mc.survived[c.id] || 0) / mc.n) * 100)}%`), h('td', { class: 'num' }, `${Math.round(((mc.out[c.id] || 0) / mc.n) * 100)}%`), h('td', { class: 'num' }, ((mc.kos[c.id] || 0) / mc.n).toFixed(2))))))) : null);
}

// ---- balance: will this fight wreck the party? -------------------------------------------------------------

function balancePanel() {
  const teams = [...new Set(battle.combatants.map((c) => c.team))].sort();
  if (!ui.heroTeam || !teams.includes(ui.heroTeam)) ui.heroTeam = teams[0] || 'A';
  const bal = ui.balance;
  const heroSel = h('select', { 'aria-label': 'The heroes are', id: 'bal-heroes', onChange: (e) => { ui.heroTeam = e.target.value; ui.balance = null; renderBattle(); } }, teams.map((t) => h('option', { value: t, selected: t === ui.heroTeam }, `Team ${t}`)));
  const goalSel = h('select', { 'aria-label': 'The fight should be', id: 'bal-goal', onChange: (e) => { ui.balanceGoal = e.target.value; } }, Object.entries(DIFFICULTIES).map(([k, d]) => h('option', { value: k, selected: k === (ui.balanceGoal || 'tense') }, `${d.label} (~${Math.round(d.target * 100)}%)`)));
  const busy = (fn) => {
    if (teams.length < 2) { toast('Put the heroes and the opposition on two teams first.'); return; }
    ui.balanceBusy = true; renderBattle();
    setTimeout(() => { try { fn(); } catch (e) { toast(e.message); } ui.balanceBusy = false; renderBattle(); }, 30);
  };
  const check = () => busy(() => { ui.balance = { odds: heroOdds(battle, R, ui.heroTeam, 100, `${battle.seed}-check-${Date.now().toString(36)}`) }; });
  const tune = () => busy(() => {
    const goal = DIFFICULTIES[ui.balanceGoal || 'tense'];
    const t = tuneBattle(battle, R, { heroTeam: ui.heroTeam, target: goal.target, n: 100 });
    ui.balance = { ...(ui.balance || {}), odds: ui.balance?.odds || { rate: t.before, n: 60 }, tune: { ...t, goal } };
  });
  const apply = () => {
    const k = bal?.tune?.best.k;
    if (!k) return;
    for (const c of battle.combatants) {
      if (c.team === ui.heroTeam) continue;
      const ch = scaleCharacter(c.ch, k, R);
      Object.assign(c, makeCombatant(R, ch, { id: c.id, team: c.team, style: c.style, tactics: c.tactics, heroPoints: c.heroPoints, name: ch.identity.codename }));
    }
    placeAll(battle);
    save();
    ui.balance = null; ui.mc = null;
    toast(`Opposition ${k > 0 ? 'strengthened' : 'weakened'} by ${Math.abs(k)} rank${Math.abs(k) === 1 ? '' : 's'} (attacks and defenses). Run the odds again to check.`);
    renderBattle();
  };
  const pct = (r) => `${Math.round(r * 100)}%`;
  const odds = bal?.odds;
  const tuned = bal?.tune;
  const foes = battle.combatants.filter((c) => c.team !== ui.heroTeam).map((c) => c.name).join(', ') || 'the other side';
  return h('section', { class: 'panel bt-balance', id: 'balance' },
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      h('h2', null, '⚖ Will this fight wreck the party?'), h('span', { style: { flex: 1 } })),
    h('div', { class: 'rc-row' }, h('label', null, 'Heroes are', heroSel), h('label', null, 'The fight should be', goalSel),
      h('button', { class: 'btn sm', type: 'button', id: 'bal-check', disabled: ui.balanceBusy, onClick: check }, ui.balanceBusy ? 'Running…' : 'Check the odds'),
      h('button', { class: 'btn sm primary', type: 'button', id: 'bal-tune', disabled: ui.balanceBusy, onClick: tune }, 'Tune the opposition')),
    odds ? h('p', { class: `bal-verdict ${odds.rate < 0.4 ? 'bad' : odds.rate >= 0.85 ? 'easy' : 'ok'}` }, h('b', null, `Heroes win ${pct(odds.rate)}`), ` of ${odds.n} fights: ${verdict(odds.rate)}.`) : h('p', { class: 'hint', style: { margin: '6px 0 0' } }, 'Runs this match-up 100 times with fresh dice and tells you how often the heroes win. "Tune" finds how much stronger or weaker the opposition should be.'),
    tuned ? h('div', { class: 'bal-tune' },
      tuned.best.k
        ? h('p', null, `For ${tuned.goal.label.toLowerCase()} (~${pct(tuned.goal.target)}), make ${foes} `, h('b', null, `${tuned.best.k > 0 ? '+' : ''}${tuned.best.k} rank${Math.abs(tuned.best.k) === 1 ? '' : 's'}`), ` on attacks and defenses: heroes then win about ${pct(tuned.best.rate)}.`)
        : h('p', null, `It's already about right for ${tuned.goal.label.toLowerCase()}: heroes win ${pct(tuned.before)}.`),
      h('div', { class: 'bal-steps' }, tuned.tried.map((t) => h('span', { class: `chip ${t.k === tuned.best.k ? 'pick' : ''}` }, `${t.k > 0 ? '+' : ''}${t.k}: ${pct(t.rate)}`))),
      tuned.best.k ? h('button', { class: 'btn sm primary', type: 'button', id: 'bal-apply', onClick: apply }, `Apply ${tuned.best.k > 0 ? '+' : ''}${tuned.best.k} to ${foes}`) : null,
      h('p', { class: 'hint', style: { margin: '6px 0 0' } }, 'Applying changes the fighters in this Battle Room only. To keep the tuned villain, open them from their card and save to the roster.')) : null);
}

function helpPanel() {
  return h('section', { class: 'panel bt-help' },
    h('h2', null, 'How the fight is run'),
    h('p', { style: { margin: 0 } }, 'By the Hero\'s Handbook: attack checks against defense + 10, resistance checks against DC 15 + rank (Damage) or 10 + rank, degrees of failure, bruises that stack, dazed until the end of the next turn, staggered and incapacitated. A natural 20 always hits and is a critical (+5 to the DC) when the total also beats the defense. Minions drop on any failed Toughness check, never crit heroes, and heroes hit them with routine attacks (DCA 175). Afflictions get an end-of-turn recovery check; area effects a Dodge check for half. Concealment is −2 (partial) or −5 (total) to hit. Impervious, Penetrating, Multiattack, Immunity, Healing and Regeneration all count.'),
    h('p', { style: { margin: 0 } }, 'Actions and maneuvers: Charge (twice the speed, −2 to hit) and Slam for fast heavy hitters, Aim (+5 close, +2 far, vulnerable meanwhile), Recover once per fight (the worst damage level goes, +2 defenses), Defend (attackers must beat a rolled defense), Feint, Grab and Escape (Athletics or Sleight of Hand), Power, Accurate, All-out and Defensive Attack (only on attacks with an attack check), Interpose, Takedown, Move-by Action, and team attacks by minion squads (+2 or +5 to the lead attack). Hero points re-roll a miss and keep the better roll (1–10 counts +10), or shake off dazed, stunned or fatigue; extra effort pushes a power a rank.'),
    h('p', { style: { margin: 0 } }, 'How they think: each fighter plays to its style (brawlers charge and go all-out, blasters keep distance and aim, mentalists break the weakest will, support heals and interposes) and picks targets by what its attacks can do to them, how dangerous they are, and who is nearly down.'),
    h('p', { style: { margin: 0, color: 'var(--ink-3)' } }, 'Not simulated yet: Summon, Create, Illusion, Deflect, Insubstantial, Environment, cover, Aid, Disarm, Trip and Smash. The arena is eight zones in a line; a zone apart is short range, three is medium (−2), five is long (−5).'));
}

// ---- the page --------------------------------------------------------------------------------------------

export function renderBattle() {
  if (!root) return;
  clear(root);
  const setup = battle.status === 'setup';
  const over = battle.status === 'over';
  const nameIn = h('input', { type: 'text', value: battle.name || 'Battle', 'aria-label': 'Battle name', class: 'bt-name', onChange: (e) => { battle.name = e.target.value.trim() || 'Battle'; save(); } });
  const speed = h('input', { type: 'range', min: 100, max: 2000, step: 100, value: 2100 - ui.speed, 'aria-label': 'Playback speed', style: { width: '120px' }, onInput: (e) => { ui.speed = 2100 - Number(e.target.value); if (timer) play(); } });
  const ready = readyToFight();
  const p = sidePower();
  const sides = Object.keys(p).sort();
  const lopsided = setup && sides.length >= 2 && Math.max(...sides.map((t) => p[t].w)) >= Math.min(...sides.map((t) => p[t].w)) * 1.6 + 4;
  const stepN = setup ? (battle.combatants.length ? 2 : 1) : over ? 4 : 3;
  const steps = h('ol', { class: 'bt-steps', 'aria-label': 'Where you are' },
    [['Pick fighters', 'Press A or B on the left'], ['Check the sides', 'Styles, hero points, odds'], ['Fight!', 'Watch it, or step through'], ['Result', 'Rematch, comic, save it']].map(([t, hint], i) => h('li', { class: i + 1 < stepN ? 'done' : i + 1 === stepN ? 'now' : '' }, h('b', null, `${i + 1}`), h('span', null, t), h('small', null, hint))));
  const controls = h('div', { class: 'bt-controls' },
    setup ? h('button', { class: 'btn primary big', type: 'button', id: 'bt-fight', disabled: !ready.ok, title: ready.ok ? 'Roll initiative and play the fight (Enter)' : ready.why, onClick: () => begin() }, '⚔ Fight!') : null,
    setup && ready.ok ? h('button', { class: 'btn', type: 'button', id: 'bt-stepwise', title: 'Roll initiative and wait: press Step for one action at a time', onClick: () => begin({ stepwise: true }) }, 'Step through it') : null,
    setup && !ready.ok ? h('span', { class: 'hint' }, ready.why) : null,
    setup && ready.ok && lopsided ? h('span', { class: 'bt-warn' }, `Looks one-sided: ${sides.map((t) => `${t} ${p[t].w}`).join(' vs ')} (PL, minions count a third). `, h('button', { type: 'button', class: 'linkish', onClick: () => quickStarts()[4].click() }, 'Even it up')) : null,
    !setup && !over ? h('button', { class: 'btn primary big', type: 'button', id: 'bt-play', title: 'Space', onClick: () => (timer ? (stopTimer(), renderBattle()) : play()) }, timer ? '❚❚ Pause' : '▶ Play') : null,
    !setup && !over ? h('button', { class: 'btn', type: 'button', title: 'One action (N)', onClick: doStep }, 'Step') : null,
    !setup && !over ? h('button', { class: 'btn', type: 'button', title: 'One round (R)', onClick: doRound }, 'Round') : null,
    !setup && !over ? h('button', { class: 'btn', type: 'button', title: 'Finish it (E)', onClick: doEnd }, 'Run to the end') : null,
    !setup && !over ? h('label', { class: 'bt-speed' }, h('span', null, 'Speed'), speed) : null,
    !setup ? h('button', { class: 'btn', type: 'button', title: 'Same fighters, same seed: replays this exact fight', onClick: () => reset() }, '↺ Replay') : null,
    !setup ? h('button', { class: 'btn', type: 'button', title: 'Same fighters, new dice', onClick: () => reset({ newSeed: true }) }, '🎲 Rematch') : null,
    setup ? h('button', { class: 'btn', type: 'button', title: 'New seed (different dice)', onClick: () => { battle.seed = randomSeed(); save(); renderBattle(); } }, '🎲 New seed') : null,
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', disabled: !battle.log.length, onClick: async () => toast((await copyText(battleText(battle))) ? 'Fight log copied' : 'Copy failed') }, 'Copy log'),
    h('button', { class: 'btn', type: 'button', disabled: !battle.log.length, onClick: () => { download(`${(battle.name || 'battle').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-log.txt`, battleText(battle), 'text/plain'); } }, 'Save log'),
    h('button', { class: 'btn ghost danger', type: 'button', disabled: !battle.combatants.length, onClick: async () => {
      const ok = await openDialog({ title: 'Clear the arena?', body: h('p', { style: { margin: 0 } }, 'Removes every fighter and the log. Your characters are not affected.'), buttons: [{ label: 'Keep', value: false }, { label: 'Clear', value: true, danger: true }] });
      if (ok) clearAll();
    } }, 'Clear'));

  liveHost = h('div', { class: 'bt-status' }, ...statusBar());
  arenaHost = h('div'); arenaHost.append(arena());
  cardsHost = h('div', { class: 'bt-teams' }); cardsHost.append(...teamColumns());
  logHost = h('div', { class: 'bt-log', 'aria-live': 'polite' });
  const filter = h('div', { class: 'seg', role: 'group', 'aria-label': 'Log filter', style: { width: '200px' } },
    [['all', 'Every action'], ['key', 'Key moments']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(ui.filter === v), onClick: () => { ui.filter = v; renderLog(); renderBattle(); } }, t)));
  const whoSel = h('select', { id: 'bt-log-who', 'aria-label': 'Show one fighter', onChange: (e) => { ui.logWho = e.target.value || null; renderLog(); } },
    h('option', { value: '' }, 'Everyone'), sortChars(battle.combatants, 'name').map((c) => h('option', { value: c.id, selected: c.id === ui.logWho }, `${c.name} (${c.team})`)));
  const diceToggle = h('label', { class: 'bt-copies', title: 'Show every roll written out: d20, bonus, total and the DC' }, h('input', { type: 'checkbox', id: 'bt-log-dice', checked: ui.showDice !== false, onChange: (e) => { ui.showDice = e.target.checked; renderLog(); } }), ' Rolls');

  const result = over ? resultPanel() : null;

  root.append(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'Battle Room'), h('p', null, 'Put anyone against anyone: press A or B next to a fighter, then Fight! Each fighter plays to its strengths, and "What happened" shows every action and roll. Space plays and pauses, N steps, R runs a round, E runs to the end.')),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn sm ghost', type: 'button', 'aria-pressed': String(ui.showHelp), onClick: () => { ui.showHelp = !ui.showHelp; renderBattle(); } }, ui.showHelp ? 'Hide the rules used' : 'What\'s simulated?')));
  if (ui.showHelp) root.append(helpPanel());
  nowHost = h('div', { class: 'bt-now' }); nowHost.append(...nowBanner());
  const logPanel = h('section', { class: 'panel bt-panel bt-log-panel', id: 'bt-log-panel' },
    h('div', { class: 'bt-log-tools' }, h('h2', null, 'What happened'), h('span', { class: 'spacer' }), whoSel, diceToggle),
    filter,
    logHost);
  root.append(h('div', { class: 'bt-layout' },
    addPanel(),
    h('div', { class: 'bt-main-col' },
      steps,
      versusBar(),
      h('div', { class: 'bt-stage' },
        h('section', { class: 'panel bt-panel' },
          h('div', { class: 'bt-top' }, nameIn, liveHost),
          controls,
          nowHost,
          arenaHost,
          result,
          cardsHost),
        logPanel),
      balancePanel(),
      oddsPanel())));
  renderLog();
}

function resultPanel() {
  const standing = battle.combatants.filter((c) => !c.out && !c.fled);
  const mvp = [...battle.combatants].sort((a, b) => (b.stats.kos * 10 + b.stats.degrees) - (a.stats.kos * 10 + a.stats.degrees))[0];
  return h('div', { class: 'bt-result', style: { '--t': battle.winner ? teamColor(battle.winner) : 'var(--ink-3)' } },
    h('b', null, battle.winner ? `Team ${battle.winner} wins in ${battle.round} round${battle.round === 1 ? '' : 's'}` : `Stalemate after ${battle.round - 1} rounds`),
    h('span', null, standing.length ? `Still standing: ${standing.map((c) => `${c.name} (${statusLine(c).toLowerCase()})`).join(', ')}.` : 'Nobody is left standing.'),
    mvp && (mvp.stats.kos || mvp.stats.degrees) ? h('span', null, `Fight of the night: ${mvp.name}, ${mvp.stats.hits} hits, ${mvp.stats.kos} KO${mvp.stats.kos === 1 ? '' : 's'}.`) : null,
    h('div', { class: 'btn-row', style: { marginTop: '6px' } },
      h('button', { class: 'btn primary', type: 'button', id: 'bt-comic', title: 'Turn this fight into a six-panel comic page to share', onClick: () => {
        const comic = battleComic(battle, { portraitOf: (ch) => { const p = portraitOf(ch); return p.image || p.avatar; } });
        const svg = comicSvg(comic);
        imageDialog({ title: `📖 ${comic.title}`, svg, file: `${comic.title}-comic`, text: `📖 ${comic.title.toUpperCase()}: ${comic.subtitle}\n${comic.panels.map((p) => `• ${p.sfx} ${p.caption}`).join('\n')}`, alt: `Comic page of ${comic.title}` });
      } }, '📖 Make the comic'),
      hooks.recordBattle ? [
        h('button', { class: 'btn', type: 'button', id: 'bt-record', disabled: battle.recorded, title: 'Adds the fight to the World: an event page on the campaign timeline, linked to everyone who fought (knocked out, fled or standing). It goes in the running session\'s recap, and a recurring villain who lost learns from it.', onClick: () => { try { hooks.recordBattle(battle); battle.recorded = true; save(); renderBattle(); } catch (e) { toast(e.message); } } }, battle.recorded ? '✓ Saved to the campaign' : '🌐 Save this fight to the campaign'),
        battle.recorded ? null : h('p', { class: 'hint bt-record-hint' }, 'Puts it on the World\'s timeline with everyone who fought, in tonight\'s recap, and lets a recurring villain who lost learn from it.'),
      ] : null));
}

export { STYLES, detectStyle };
