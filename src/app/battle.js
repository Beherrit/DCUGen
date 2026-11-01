// The Battle Room: throw characters, creatures and minions into an arena, pick sides, and watch
// the fight play out turn by turn with a full log. Pause, step, run to the end, or run the same
// match a hundred times for the odds.

import { hasForms, activeForm, switchForm } from '../engine/forms.js';
import { h, clear, toast, copyText, download, inkFor, openDialog } from './dom.js';
import { randomSeed } from '../engine/rng.js';
import { DIFFICULTIES, verdict, heroOdds, tuneBattle, scaleCharacter } from '../engine/balance.js';
import { battleComic, comicSvg } from '../engine/comic.js';
import { portraitOf } from '../engine/portrait.js';
import { imageDialog } from './imageshare.js';
import { addPanel, quickStarts } from './battle-setup.js';
import { tacticChips } from './battle-tactics.js';
import { notSimulatedLine } from './battle-report.js';
import { rolesNote } from './battle-roles.js';
import { styleLine } from './battle-style.js';
import { descriptorTags, attackTitle, insubChip } from './battle-descriptors.js';
import { keepFinishedFight, keptNote, roomTabs } from './records/room.js';
import { renderFights, openFight } from './records/fights-view.js';
import { renderCityWar } from './citywar/view.js';
import { renderTournament } from './tournament/view.js';
import { KIND_CLASS, teamColor, renderLogInto, logControls } from './battle-log.js';
import { uiBattle, wholeCover } from './battle-cover.js';
import { gridBoard, initials } from './battle-grid.js';
import { createBattle, addCombatant, removeCombatant, makeCombatant, joinBattle, startBattle, step, runRound, runToEnd, battleText, simulateMany, serializeBattle, reviveBattle, placeAll, squareName, STYLES, TACTICS, statusLine, conditionLabels, detectStyle, rebuildCombatant } from '../engine/battle.js';
import { variablesOf } from '../engine/active-powers.js';
import { setActiveConfig } from '../engine/variable-config.js';
import { visibleTeams } from './battle-teams.js';

const KEY = 'dcugen.battle.v1';
let R;
let root;
let hooks = {};
let battle;
let timer = null;
let ui = { sub: 'fight', showDice: true, logWho: null, teamCount: 2, mineQ: '', speed: 700, filter: 'all', bestiaryQ: '', team: 'A', copies: 1, mc: null, mcBusy: false, showHelp: false };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw?.combatants) return reviveBattle(R, raw);
  } catch { /* ignore */ }
  return uiBattle(randomSeed());
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
    if (!root || root.hidden || ui.sub !== 'fight' || e.ctrlKey || e.metaKey || e.altKey) return;
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
  const chars = battle.combatants.filter((c) => !c.summon).map((c) => ({ ch: c.ch, team: c.team, style: c.style, tactics: c.tactics, heroPoints: c.heroPoints, name: c.name, id: c.id, carry: c.carry }));
  const oldOptions = battle.options;
  const oldCover = wholeCover(battle.cover);
  battle = createBattle({ seed: newSeed ? randomSeed() : battle.seed, name: battle.name });
  battle.options = { ...battle.options, ...oldOptions };
  battle.cover = oldCover;
  for (const x of chars) addCombatant(battle, makeCombatant(R, x.ch, x));
  ui.mc = null;
  save();
  renderBattle();
}

function clearAll() {
  stopTimer();
  battle = uiBattle(randomSeed());
  ui.mc = null;
  save();
  renderBattle();
}

/** What the setup rail needs from this page (read fresh at each render, since the battle can be replaced). */
const setupCx = () => ({ battle, R, ui, hooks, throwIn, save, render: renderBattle, sidePower, teamColor });

// ---- pieces ---------------------------------------------------------------------------------------------


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
    Object.entries(STYLES).map(([k, v]) => h('option', { value: k, selected: k === c.style }, v.label)));
  const tacSel = h('select', { class: 'bt-mini', 'aria-label': `${c.name} target choice`, onChange: (e) => { c.tactics = e.target.value; save(); } },
    Object.entries(TACTICS).map(([k, v]) => h('option', { value: k, selected: k === c.tactics }, k === 'auto' ? `Target: ${S.target === 'lowWill' ? 'weakest will' : TACTICS[S.target]?.toLowerCase() || 'by style'}` : v)));
  const teamSel = h('div', { class: 'bt-sides', role: 'group', 'aria-label': `${c.name} team` }, visibleTeams(battle, ui).map((t) => h('button', { type: 'button', class: `bt-side ${t === c.team ? 'on' : ''}`, style: { '--t': teamColor(t) }, title: `Move to team ${t}`, 'aria-pressed': String(t === c.team), onClick: () => { c.team = t; placeAll(battle); save(); renderBattle(); } }, t)));
  // Alternate forms: fight in any of them (DCA 88: each form is its own build)
  const formSel = hasForms(c.ch) ? h('select', { class: 'bt-mini', 'aria-label': `${c.name} form`, title: 'Which form they fight in', onChange: (e) => {
    const ch = switchForm(c.ch, Number(e.target.value));
    Object.assign(c, makeCombatant(R, ch, { id: c.id, team: c.team, style: null, tactics: c.tactics, heroPoints: c.heroPoints, name: c.name }));
    placeAll(battle); save(); renderBattle();
  } }, c.ch.forms.map((f, i) => h('option', { value: i, selected: i === activeForm(c.ch) }, f.name || `Form ${i + 1}`))) : null;
  // A Variable's menu of configurations (DCA 121): fight in the one picked
  const vars = variablesOf(c.ch).filter(({ power }) => (power.configs || []).length);
  const cfgSel = vars.length ? h('select', { class: 'bt-mini', 'aria-label': `${c.name} Variable configuration`, title: 'Which Variable configuration they fight in', onChange: (e) => {
    const [vi, id] = e.target.value.split('|');
    const ch = setActiveConfig(c.ch, vars[Number(vi)].path, id || null);
    Object.assign(c, makeCombatant(R, ch, { id: c.id, team: c.team, style: c.style, tactics: c.tactics, heroPoints: c.heroPoints, name: c.name }));
    placeAll(battle); save(); renderBattle();
  } }, vars.map(({ power }, vi) => h('optgroup', { label: power.name },
    h('option', { value: `${vi}|`, selected: !power.activeConfig }, `${power.name}: off`),
    power.configs.map((cfg) => h('option', { value: `${vi}|${cfg.id}`, selected: power.activeConfig === cfg.id }, `${power.name}: ${cfg.name}`))))) : null;
  const hp = h('input', { type: 'number', class: 'bt-hp', min: 0, max: 9, value: c.heroPoints, 'aria-label': `${c.name} hero points`, title: 'Hero points', onChange: (e) => { c.heroPoints = Math.max(0, Number(e.target.value) || 0); save(); } });
  return h('article', { class: `bt-card ${c.out ? 'out' : ''} ${c.fled ? 'fled' : ''}`, style: { '--c': c.color, '--t': teamColor(c.team), '--c-ink': inkFor(c.color) } },
    h('div', { class: 'bt-card-head' },
      h('span', { class: 'bt-token', title: `Square ${squareName(c.x, c.y)}` }, initials(c.name)),
      h('div', { class: 'bt-names' },
        h('b', null, c.name),
        h('span', null, `PL ${c.pl} · ${S.label}${c.minion ? ' · minion' : ''}${rolesNote(c)}${hasForms(c.ch) ? ` · form: ${c.ch.forms[activeForm(c.ch)]?.name || 'form'}` : ''}`)),
      h('span', { class: 'bt-team', style: { background: teamColor(c.team) } }, c.team),
      h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${c.name}`, title: 'Remove from the battle', onClick: () => { removeCombatant(battle, c.id); save(); renderBattle(); } }, 'Remove')),
    h('div', { class: 'bt-stats' },
      [['DOD', d.defenses.Dodge], ['PAR', d.defenses.Parry], ['TOU', d.defenses.Toughness - c.bruises], ['FOR', d.defenses.immune?.Fortitude ? '—' : d.defenses.Fortitude], ['WIL', d.defenses.immune?.Will ? '—' : d.defenses.Will], ['INI', (d.initiative >= 0 ? '+' : '') + d.initiative]].map(([k, v]) => h('div', null, h('b', { class: 'num' }, v), h('span', null, k)))),
    main ? h('div', { class: 'bt-main', title: attackTitle(c) }, `${main.name}: ${main.roll ? `+${main.bonus}, ` : `${main.area ? `${main.area} area` : 'perception'}, `}${main.effect} ${main.rank} (${main.resistance})`, c.attacks.length > 2 ? h('small', null, ` +${c.attacks.length - 1} more`) : null) : null,
    styleLine(c),
    descriptorTags(c),
    setup ? h('div', { class: 'bt-opts' }, teamSel, formSel, cfgSel, styleSel, h('details', { class: 'bt-more' }, h('summary', null, 'More'), h('div', { class: 'bt-more-body' }, tacSel, h('label', { class: 'bt-hp-wrap', title: 'Hero points: re-roll a miss or shake off a daze' }, 'Hero points', hp), notSimulatedLine(c)))) : null,
    !setup ? h('div', { class: 'bt-state' }, dmg,
      h('div', { class: 'bt-conds' },
        c.fled ? h('span', { class: 'bt-cond fled' }, c.escaped ? 'Got away' : 'Fled') : c.out ? h('span', { class: 'bt-cond ko' }, statusLine(c)) : null,
        conds.map((x) => h('span', { class: 'bt-cond' }, x)),
        insubChip(c) ? h('span', { class: 'bt-cond', title: 'Insubstantial form (Hero\'s Handbook p103)' }, insubChip(c)) : null,
        c.heroPoints ? h('span', { class: 'bt-cond hp', title: 'Hero points' }, `Hero points ${c.heroPoints}`) : null,
        c.fatigue ? h('span', { class: 'bt-cond' }, c.fatigue >= 2 ? 'Exhausted' : 'Fatigued') : null),
      h('div', { class: 'bt-record' }, `${c.stats.hits}/${c.stats.attacks} hits · ${c.stats.kos} KO${c.stats.kos === 1 ? '' : 's'} · dealt ${c.stats.degrees}, took ${c.stats.taken}`)) : null,
    S.blurb && setup ? h('p', { class: 'bt-blurb' }, S.blurb) : null);
}

/** The grid board. Selecting a fighter shades its ranges; in setup tokens can be dragged and cover dropped on a square. */
const arena = () => gridBoard({ battle, ui, save, render: renderBattle, teamColor });

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
  renderLogInto(logHost, { log: battle.log, fighters: battle.combatants, status: battle.status, filter: ui.filter, logWho: ui.logWho, showDice: ui.showDice }, teamColor);
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
  if (!teams.length) return [h('div', { class: 'empty bt-empty' }, h('h2', null, 'The arena is empty'), h('p', null, 'Pick fighters on the left, or use a quick start:'), h('div', { class: 'bt-quicks' }, quickStarts(setupCx())), h('p', { class: 'hint' }, 'Every character sheet, roster card and Bestiary creature also has a "Battle Room" button to throw them in.'))];
  return teams.map((t) => h('section', { class: 'bt-team-col', style: { '--t': teamColor(t) } },
    h('div', { class: 'bt-team-head' }, h('span', { class: 'bt-team', style: { background: teamColor(t) } }, t), h('b', null, `Team ${t}`), h('span', { class: 'hint' }, (() => { const p = sidePower()[t]; return battle.status === 'setup' ? `${p.n} fighter${p.n === 1 ? '' : 's'} · PL ${p.avg.toFixed(p.avg % 1 ? 1 : 0)} avg · ${p.pl} total` : `${p.standing} of ${p.n} standing`; })())),
    battle.combatants.filter((c) => c.team === t).map(fighterCard)));
}

function statusBar() {
  const acting = battle.status === 'running' && battle.turn > 0 ? battle.combatants.find((c) => c.id === battle.order[battle.turn - 1]) : null;
  const next = battle.status === 'running' ? battle.combatants.find((c) => c.id === battle.order[battle.turn]) : null;
  const chip = (text, cls = '') => h('span', { class: `chip ${cls}` }, text);
  return [
    chip(battle.status === 'setup' ? 'Setting up' : battle.status === 'over' ? (battle.winner ? `Team ${battle.winner} ${battle.gotAway ? 'got away' : 'wins'}` : 'Stalemate') : timer ? 'Playing' : 'Paused', battle.status === 'over' ? 'bt-chip-win' : ''),
    battle.status !== 'setup' ? chip(`Round ${battle.round}`) : null,
    acting ? chip(`Last: ${acting.name}`) : null,
    next && battle.status === 'running' ? chip(`Next: ${next.name}`) : null,
    chip(`Seed ${battle.seed}`),
    battle.options.enclosed ? chip('Enclosed space') : null,
    battle.options.ambush ? chip(`Team ${battle.options.ambush} ambushes`) : null,
    ...(battle.status === 'setup' ? [] : tacticChips(battle, chip)),
  ];
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
      h('h2', null, 'Will this fight wreck the party?'), h('span', { style: { flex: 1 } })),
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
    h('p', { style: { margin: 0 } }, 'By the Hero\'s Handbook: attack checks against defense + 10, resistance checks against DC 15 + rank (Damage) or 10 + rank, degrees of failure, bruises that stack, dazed until the end of the next turn, staggered and incapacitated. A natural 20 always hits and is a critical (+5 to the DC) when the total also beats the defense. Minions drop on any failed Toughness check, never crit heroes, and heroes hit them with routine attacks (DCA 175). Afflictions get an end-of-turn recovery check; area effects a Dodge check for half. Concealment and cover are −2 (partial) or −5 (total) to hit; total cover cannot be shot past, and cover can be shot, blasted or smashed to pieces. Knockback and shooting through cover are optional rules in the Scenery panel. Impervious, Penetrating, Multiattack, Immunity, Healing and Regeneration all count.'),
    h('p', { style: { margin: 0 } }, 'Actions and maneuvers: Charge (twice the speed, −2 to hit) and Slam for fast heavy hitters, Aim (+5 close, +2 far, doubled with Improved Aim, vulnerable meanwhile), Recover once per fight (the worst damage level goes, +2 defenses), Defend (attackers must beat a rolled defense), Feint, Trip, Disarm and Smash (Improved Trip, Disarm and Smash remove the penalties), Grab and Escape (Athletics or Sleight of Hand), Stand and Drop Prone, Power, Accurate, All-out and Defensive Attack (only on attacks with an attack check), Interpose, Takedown, Move-by Action, and team attacks by minion squads (+2 or +5 to the lead attack). Hero points re-roll a miss and keep the better roll (1–10 counts +10), or shake off dazed, stunned or fatigue; extra effort pushes a power a rank.'),
    h('p', { style: { margin: 0 } }, 'How they think: each fighter plays to its style (brawlers charge and go all-out, blasters keep distance and aim, mentalists break the weakest will, support heals and interposes) and picks targets by what its attacks can do to them, how dangerous they are, and who is nearly down.'),
    h('p', { style: { margin: 0, color: 'var(--ink-3)' } }, 'Not simulated yet: Communal, and the parts of each effect the coverage list marks partial. The battlefield is a 12 by 12 grid (Street 5 ft, Block 30 ft or District 250 ft squares); a move covers the fighter\'s speed in feet, and a ranged attack is short to rank × 25 ft, medium to rank × 50 ft (−2) and long to rank × 100 ft (−5).'));
}

// ---- the page --------------------------------------------------------------------------------------------

/** Switch between the Battle Room's pages: 'fight' (the arena), 'citywar', 'tournament' and 'fights' (saved fights and the leaderboard). */
function goSub(sub) { ui.sub = sub; renderBattle(); }

/** Load a City war fight (built by the City war, not yet started) into One fight; Fight! plays it exactly as the war did. */
function watchFight(b) {
  stopTimer();
  b.keptId = 'city-war'; // the war already kept it in Fights, so it is not saved again as a Battle Room fight
  battle = b; ui.mc = null; ui.sub = 'fight';
  save();
  renderBattle();
}

export function renderBattle() {
  if (!root) return;
  keepFinishedFight(battle, save);
  if (ui.sub === 'fights') { renderFights(root, goSub); return; }
  if (ui.sub === 'citywar') { renderCityWar(root, { R, go: goSub, watch: watchFight }); return; }
  if (ui.sub === 'tournament') { renderTournament(root, { R, go: goSub }); return; }
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
    setup ? h('button', { class: 'btn primary big', type: 'button', id: 'bt-fight', disabled: !ready.ok, title: ready.ok ? 'Roll initiative and play the fight (Enter)' : ready.why, onClick: () => begin() }, 'Fight!') : null,
    setup && ready.ok ? h('button', { class: 'btn', type: 'button', id: 'bt-stepwise', title: 'Roll initiative and wait: press Step for one action at a time', onClick: () => begin({ stepwise: true }) }, 'Step through it') : null,
    setup && !ready.ok ? h('span', { class: 'hint' }, ready.why) : null,
    setup && ready.ok && lopsided ? h('span', { class: 'bt-warn' }, `Looks one-sided: ${sides.map((t) => `${t} ${p[t].w}`).join(' vs ')} (PL, minions count a third). `, h('button', { type: 'button', class: 'linkish', onClick: () => quickStarts(setupCx())[4].click() }, 'Even it up')) : null,
    !setup && !over ? h('button', { class: 'btn primary big', type: 'button', id: 'bt-play', title: 'Space', onClick: () => (timer ? (stopTimer(), renderBattle()) : play()) }, timer ? 'Pause' : 'Play') : null,
    !setup && !over ? h('button', { class: 'btn', type: 'button', title: 'One action (N)', onClick: doStep }, 'Step') : null,
    !setup && !over ? h('button', { class: 'btn', type: 'button', title: 'One round (R)', onClick: doRound }, 'Round') : null,
    !setup && !over ? h('button', { class: 'btn', type: 'button', title: 'Finish it (E)', onClick: doEnd }, 'Run to the end') : null,
    !setup && !over ? h('label', { class: 'bt-speed' }, h('span', null, 'Speed'), speed) : null,
    !setup ? h('button', { class: 'btn', type: 'button', title: 'Same fighters, same seed: replays this exact fight', onClick: () => reset() }, 'Replay') : null,
    !setup ? h('button', { class: 'btn', type: 'button', title: 'Same fighters, new dice', onClick: () => reset({ newSeed: true }) }, 'Rematch') : null,
    setup ? h('button', { class: 'btn', type: 'button', title: 'New seed (different dice)', onClick: () => { battle.seed = randomSeed(); save(); renderBattle(); } }, 'New seed') : null,
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
  const { filter, whoSel, diceToggle } = logControls(ui, battle.combatants, { onLog: renderLog, onFilter: () => { renderLog(); renderBattle(); } });

  const result = over ? resultPanel() : null;

  root.append(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'Battle Room'), h('p', null, 'Put anyone against anyone: press A or B next to a fighter, then Fight! Each fighter plays to its strengths, and "What happened" shows every action and roll. Space plays and pauses, N steps, R runs a round, E runs to the end.')),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn sm ghost', type: 'button', 'aria-pressed': String(ui.showHelp), onClick: () => { ui.showHelp = !ui.showHelp; renderBattle(); } }, ui.showHelp ? 'Hide the rules used' : 'What\'s simulated?')));
  root.append(roomTabs('fight', goSub));
  if (ui.showHelp) root.append(helpPanel());
  nowHost = h('div', { class: 'bt-now' }); nowHost.append(...nowBanner());
  const logPanel = h('section', { class: 'panel bt-panel bt-log-panel', id: 'bt-log-panel' },
    h('div', { class: 'bt-log-tools' }, h('h2', null, 'What happened'), h('span', { class: 'spacer' }), whoSel, diceToggle),
    filter,
    logHost);
  root.append(h('div', { class: 'bt-layout' },
    addPanel(setupCx()),
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
    h('b', null, battle.winner ? `Team ${battle.winner} ${battle.gotAway ? 'gets away' : 'wins'} in ${battle.round} round${battle.round === 1 ? '' : 's'}` : `Stalemate after ${battle.round - 1} rounds`),
    h('span', null, standing.length ? `Still standing: ${standing.map((c) => `${c.name} (${statusLine(c).toLowerCase()})`).join(', ')}.` : 'Nobody is left standing.'),
    keptNote(battle, (id) => { openFight(id); goSub('fights'); }),
    mvp && (mvp.stats.kos || mvp.stats.degrees) ? h('span', null, `Fight of the night: ${mvp.name}, ${mvp.stats.hits} hits, ${mvp.stats.kos} KO${mvp.stats.kos === 1 ? '' : 's'}.`) : null,
    h('div', { class: 'btn-row', style: { marginTop: '6px' } },
      h('button', { class: 'btn primary', type: 'button', id: 'bt-comic', title: 'Turn this fight into a six-panel comic page to share', onClick: () => {
        const comic = battleComic(battle, { portraitOf: (ch) => { const p = portraitOf(ch); return p.image || p.avatar; } });
        const svg = comicSvg(comic);
        imageDialog({ title: comic.title, svg, file: `${comic.title}-comic`, text: `${comic.title.toUpperCase()}: ${comic.subtitle}\n${comic.panels.map((p) => `• ${p.sfx} ${p.caption}`).join('\n')}`, alt: `Comic page of ${comic.title}` });
      } }, 'Make the comic'),
      hooks.recordBattle ? [
        h('button', { class: 'btn', type: 'button', id: 'bt-record', disabled: battle.recorded, title: 'Adds the fight to the World: an event page on the campaign timeline, linked to everyone who fought (knocked out, fled or standing). It goes in the running session\'s recap, and a recurring villain who lost learns from it.', onClick: () => { try { hooks.recordBattle(battle); battle.recorded = true; save(); renderBattle(); } catch (e) { toast(e.message); } } }, battle.recorded ? 'Saved to the campaign' : 'Save this fight to the campaign'),
        battle.recorded ? null : h('p', { class: 'hint bt-record-hint' }, 'Puts it on the World\'s timeline with everyone who fought, in tonight\'s recap, and lets a recurring villain who lost learn from it.'),
      ] : null));
}

export { STYLES, detectStyle };
