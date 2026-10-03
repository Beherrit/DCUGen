// The Battle Room: throw characters, creatures and minions into an arena, pick sides, and watch
// the fight play out turn by turn with a full log. Pause, step, run to the end, or run the same
// match a hundred times for the odds.

import { h, clear, toast, copyText, download, inkFor, openDialog } from './dom.js';
import { state } from './store.js';
import { randomSeed } from '../engine/rng.js';
import { catalogEntries } from '../engine/workshop.js';
import { catalogToCharacter } from '../engine/catalog.js';
import { createBattle, addCombatant, removeCombatant, makeCombatant, joinBattle, startBattle, step, runRound, runToEnd, battleText, simulateMany, serializeBattle, reviveBattle, placeAll, STYLES, TACTICS, ARENA, statusLine, conditionLabels, detectStyle, rebuildCombatant } from '../engine/battle.js';

const KEY = 'dcugen.battle.v1';
let R;
let root;
let hooks = {};
let battle;
let timer = null;
let ui = { speed: 700, filter: 'all', bestiaryQ: '', team: 'A', mc: null, mcBusy: false, showHelp: false };
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
  const conds = c.out || c.fled ? [] : conditionLabels(c).filter((x) => !['Dazed', 'Staggered'].includes(x));
  const main = c.attacks.filter((a) => !a.unarmed).sort((a, b) => b.rank - a.rank)[0] || c.attacks[0];
  const styleSel = h('select', { class: 'bt-mini', 'aria-label': `${c.name} fighting style`, onChange: (e) => { c.style = e.target.value; rebuildCombatant(c, R); save(); renderBattle(); } },
    Object.entries(STYLES).map(([k, v]) => h('option', { value: k, selected: k === c.style }, `${v.glyph} ${v.label}`)));
  const tacSel = h('select', { class: 'bt-mini', 'aria-label': `${c.name} target choice`, onChange: (e) => { c.tactics = e.target.value; save(); } },
    Object.entries(TACTICS).map(([k, v]) => h('option', { value: k, selected: k === c.tactics }, k === 'auto' ? `Target: ${S.target === 'lowWill' ? 'weakest will' : TACTICS[S.target]?.toLowerCase() || 'by style'}` : v)));
  const teamSel = h('select', { class: 'bt-mini', 'aria-label': `${c.name} team`, onChange: (e) => { c.team = e.target.value; placeAll(battle); save(); renderBattle(); } },
    TEAMS.map((t) => h('option', { value: t, selected: t === c.team }, `Team ${t}`)));
  const hp = h('input', { type: 'number', class: 'bt-hp', min: 0, max: 9, value: c.heroPoints, 'aria-label': `${c.name} hero points`, title: 'Hero points', onChange: (e) => { c.heroPoints = Math.max(0, Number(e.target.value) || 0); save(); } });
  return h('article', { class: `bt-card ${c.out ? 'out' : ''} ${c.fled ? 'fled' : ''}`, style: { '--c': c.color, '--t': teamColor(c.team), '--c-ink': inkFor(c.color) } },
    h('div', { class: 'bt-card-head' },
      h('span', { class: 'bt-token', title: `Zone ${c.pos + 1}` }, initials(c.name)),
      h('div', { class: 'bt-names' },
        h('b', null, c.name),
        h('span', null, `PL ${c.pl} · ${S.glyph} ${S.label}${c.minion ? ' · minion' : ''}`)),
      h('span', { class: 'bt-team', style: { background: teamColor(c.team) } }, c.team),
      h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${c.name}`, title: 'Remove from the battle', onClick: () => { removeCombatant(battle, c.id); save(); renderBattle(); } }, '✕')),
    h('div', { class: 'bt-stats' },
      [['DOD', d.defenses.Dodge], ['PAR', d.defenses.Parry], ['TOU', d.defenses.Toughness - c.bruises], ['FOR', d.defenses.immune?.Fortitude ? '—' : d.defenses.Fortitude], ['WIL', d.defenses.immune?.Will ? '—' : d.defenses.Will], ['INI', (d.initiative >= 0 ? '+' : '') + d.initiative]].map(([k, v]) => h('div', null, h('b', { class: 'num' }, v), h('span', null, k)))),
    main ? h('div', { class: 'bt-main' }, `${main.name}: ${main.roll ? `+${main.bonus}, ` : `${main.area ? `${main.area} area` : 'perception'}, `}${main.effect} ${main.rank} (${main.resistance})`, c.attacks.length > 2 ? h('small', null, ` +${c.attacks.length - 1} more`) : null) : null,
    setup ? h('div', { class: 'bt-opts' }, teamSel, styleSel, tacSel, h('label', { class: 'bt-hp-wrap', title: 'Hero points' }, '★', hp)) : null,
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

function logEntry(e) {
  const actor = e.actor ? battle.combatants.find((c) => c.id === e.actor) : null;
  const el = h('div', { class: `bt-log-row ${KIND_CLASS[e.kind] || ''} ${e.important ? 'key' : ''}`, style: actor ? { '--t': teamColor(actor.team) } : null },
    actor && e.kind !== 'round' ? h('span', { class: 'bt-log-team', style: { background: teamColor(actor.team) } }, actor.team) : null,
    h('span', { class: 'bt-log-text' }, e.text),
    e.dice?.length ? h('span', { class: 'bt-log-dice', title: e.dice.map((d) => `${d.label}: ${d.roll}${d.mod != null ? ` ${d.mod >= 0 ? '+' : ''}${d.mod}` : ''} = ${d.total}${d.dc != null ? ` vs ${d.dc}` : ''}`).join('\n') }, e.dice.map((d) => h('b', { class: `num ${d.roll === 20 ? 'nat20' : d.roll === 1 ? 'nat1' : ''}` }, d.roll))) : null);
  return el;
}

let logHost; let liveHost; let arenaHost; let cardsHost;

function renderLog() {
  if (!logHost) return;
  clear(logHost);
  const list = battle.log.filter((e) => ui.filter === 'all' || e.important || e.kind === 'round' || e.kind === 'ko' || e.kind === 'end' || e.kind === 'crit' || e.kind === 'hero');
  if (!list.length) { logHost.append(h('p', { class: 'hint', style: { margin: 0 } }, 'The log fills in as the fight runs: every roll, every check, every condition.')); return; }
  let round = null;
  let group = null;
  for (const e of list) {
    if (e.kind === 'round' || e.round !== round) {
      round = e.round;
      group = h('div', { class: 'bt-log-round' });
      logHost.append(group);
    }
    group.append(logEntry(e));
  }
  logHost.scrollTop = logHost.scrollHeight;
}

/** Cheap re-render while the fight plays: cards, arena and log only. */
function renderLive() {
  if (arenaHost) { clear(arenaHost); arenaHost.append(arena()); }
  if (cardsHost) { clear(cardsHost); cardsHost.append(...teamColumns()); }
  if (liveHost) { clear(liveHost); liveHost.append(...statusBar()); }
  renderLog();
}

function teamColumns() {
  const teams = [...new Set(battle.combatants.map((c) => c.team))].sort();
  if (!teams.length) return [h('div', { class: 'empty bt-empty' }, h('h2', null, 'The arena is empty'), h('p', null, 'Throw in fighters from the panel on the left, or press "Throw in Battle Room" on any character sheet, roster card or Bestiary creature.'))];
  return teams.map((t) => h('section', { class: 'bt-team-col', style: { '--t': teamColor(t) } },
    h('div', { class: 'bt-team-head' }, h('span', { class: 'bt-team', style: { background: teamColor(t) } }, t), h('b', null, `Team ${t}`), h('span', { class: 'hint' }, `${battle.combatants.filter((c) => c.team === t && !c.out && !c.fled).length} of ${battle.combatants.filter((c) => c.team === t).length} standing`)),
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

function addPanel() {
  const teamSel = h('select', { id: 'bt-team', 'aria-label': 'Team to add to', onChange: (e) => { ui.team = e.target.value; } }, TEAMS.map((t) => h('option', { value: t, selected: t === ui.team }, `Team ${t}`)));
  const copies = h('input', { type: 'number', id: 'bt-copies', min: 1, max: 20, value: 1, 'aria-label': 'How many copies', title: 'Copies (for squads of minions)', style: { maxWidth: '64px' } });
  const add = (ch, name) => {
    const r = throwIn(ch, { team: teamSel.value, copies: Number(copies.value) || 1, name });
    toast(`${r.count > 1 ? `${r.count} × ` : ''}${name || ch.identity?.codename} join${r.count > 1 ? '' : 's'} team ${r.team}`);
  };
  // open tabs and roster
  const mine = [];
  for (const t of state.tabs || []) mine.push({ ch: t, from: 'tab' });
  for (const c of state.roster) if (!mine.some((m) => m.ch.rosterId && m.ch.rosterId === c.rosterId)) mine.push({ ch: c, from: 'roster' });
  const mineList = h('div', { class: 'bt-pick-list' }, mine.length ? mine.slice(0, 40).map(({ ch, from }) => h('button', { type: 'button', class: 'bt-pick', style: { '--c': ch.theme?.color || '#888' }, onClick: () => add(ch) },
    h('span', { class: 'swatch' }), h('span', { class: 'bt-pick-name' }, ch.identity?.codename || 'Unnamed'), h('span', { class: 'bt-pick-meta' }, `PL ${ch.pl} · ${ch.alignment === 'villain' ? 'villain' : 'hero'} · ${from === 'tab' ? 'open' : 'roster'}`)))
    : h('p', { class: 'hint', style: { margin: 0 } }, 'Roll or open characters on the Forge, or save some to the roster, and they show up here.'));
  // bestiary quick search
  const all = catalogEntries(R);
  const q = h('input', { type: 'search', id: 'bt-beast-q', placeholder: 'Bestiary: dragon, thug, wolf, robot…', value: ui.bestiaryQ, 'aria-label': 'Search the bestiary' });
  const beastList = h('div', { class: 'bt-pick-list' });
  const drawBeasts = () => {
    clear(beastList);
    const term = q.value.trim().toLowerCase();
    ui.bestiaryQ = q.value;
    const found = all.filter((e) => !term || `${e.name} ${e.category} ${e.realm || ''} ${(e.tags || []).join(' ')}`.toLowerCase().includes(term)).slice(0, term ? 40 : 12);
    for (const e of found) beastList.append(h('button', { type: 'button', class: 'bt-pick', style: { '--c': e.minion ? '#8a5a44' : '#7a3fb8' }, onClick: () => {
      let ch;
      try { ch = catalogToCharacter(e); } catch (err) { toast(err.message); return; }
      ch.alignment = 'villain';
      add(ch, e.name);
    } }, h('span', { class: 'swatch' }), h('span', { class: 'bt-pick-name' }, e.name), h('span', { class: 'bt-pick-meta' }, `PL ${e.pl} · ${e.category}${e.minion ? ' · minion' : ''}`)));
    if (!found.length) beastList.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing matches.'));
  };
  q.addEventListener('input', drawBeasts);
  drawBeasts();
  const randomFoe = () => {
    const pl = Math.round(battle.combatants.filter((c) => c.team !== teamSel.value).reduce((s, c) => s + c.pl, 0) / Math.max(1, battle.combatants.filter((c) => c.team !== teamSel.value).length)) || 8;
    const pool = all.filter((e) => Math.abs(e.pl - pl) <= 2 && !e.minion);
    const e = pool[Math.floor(Math.random() * pool.length)] || all[Math.floor(Math.random() * all.length)];
    try { const ch = catalogToCharacter(e); ch.alignment = 'villain'; add(ch, e.name); } catch (err) { toast(err.message); }
  };
  return h('aside', { class: 'rail bt-rail', 'aria-label': 'Add fighters' },
    h('h2', null, 'Throw in'),
    h('div', { class: 'add-row', style: { marginTop: 0 } }, teamSel, copies),
    h('div', { class: 'label' }, 'Your characters'),
    mineList,
    h('div', { class: 'label' }, 'Bestiary'),
    q, beastList,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm', type: 'button', title: 'A random creature near the other side\'s power level', onClick: randomFoe }, '🎲 Random foe'),
      h('button', { class: 'btn sm', type: 'button', onClick: () => hooks.goBestiary?.() }, 'Open Bestiary')),
    h('p', { class: 'hint' }, 'Heroes default to team A, villains and creatures to team B. Change teams, styles and targeting on the cards before the fight starts.'));
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

function helpPanel() {
  return h('section', { class: 'panel bt-help' },
    h('h2', null, 'How the fight is run'),
    h('p', { style: { margin: 0 } }, 'Attack rolls against defense + 10, resistance checks against DC 15 + rank (Damage) or 10 + rank (everything else), degrees of failure, bruises that stack, dazed, staggered and incapacitated, and minions dropping on any failed Toughness check (DCA 194). Afflictions use their three degrees and get an end-of-turn recovery check. Area effects give a Dodge check for half. Impervious, Penetrating, Multiattack, Immunity, Concealment, Healing and Regeneration all count.'),
    h('p', { style: { margin: 0 } }, 'Fighters act by style: a brawler closes in and goes all-out, a skilled fighter picks the hurt target, feints a defense it can\'t crack and chains Takedowns; a gear fighter or blaster keeps its distance and trades accuracy for effect; a spellcaster rotates effects to the target\'s weak defense; a mentalist breaks the weakest will and turns controlled enemies on their friends; a beast lunges, grabs and may bolt when hurt; minions mob and break. Hero points re-roll a miss or shake off a daze; extra effort pushes a power a rank and leaves the fighter fatigued.'),
    h('p', { style: { margin: 0, color: 'var(--ink-3)' } }, 'Not simulated: Summon, Create, Illusion, Deflect, Insubstantial, Environment, cover, team attacks and power stunts beyond Variable. The arena is eight zones in a line; a zone apart is short range, three is medium (−2), five is long (−5).'));
}

// ---- the page --------------------------------------------------------------------------------------------

export function renderBattle() {
  if (!root) return;
  clear(root);
  const setup = battle.status === 'setup';
  const over = battle.status === 'over';
  const nameIn = h('input', { type: 'text', value: battle.name || 'Battle', 'aria-label': 'Battle name', class: 'bt-name', onChange: (e) => { battle.name = e.target.value.trim() || 'Battle'; save(); } });
  const speed = h('input', { type: 'range', min: 100, max: 2000, step: 100, value: 2100 - ui.speed, 'aria-label': 'Playback speed', style: { width: '120px' }, onInput: (e) => { ui.speed = 2100 - Number(e.target.value); if (timer) play(); } });
  const controls = h('div', { class: 'bt-controls' },
    setup ? h('button', { class: 'btn primary', type: 'button', disabled: battle.combatants.length < 2, onClick: () => { try { stopTimer(); startBattle(battle, R); save(); renderBattle(); } catch (e) { toast(e.message); } } }, '⚔ Roll initiative') : null,
    !setup && !over ? h('button', { class: 'btn primary', type: 'button', onClick: () => (timer ? (stopTimer(), renderBattle()) : play()) }, timer ? '❚❚ Pause' : '▶ Play') : null,
    !setup && !over ? h('button', { class: 'btn', type: 'button', onClick: doStep }, 'Step') : null,
    !setup && !over ? h('button', { class: 'btn', type: 'button', onClick: doRound }, 'Round') : null,
    !setup && !over ? h('button', { class: 'btn', type: 'button', onClick: doEnd }, 'Run to the end') : null,
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
  const filter = h('div', { class: 'seg', role: 'group', 'aria-label': 'Log filter', style: { width: '220px' } },
    [['all', 'Everything'], ['key', 'Key moments']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(ui.filter === v), onClick: () => { ui.filter = v; renderBattle(); } }, t)));

  const result = over ? resultPanel() : null;

  root.append(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'Battle Room'), h('p', null, 'Throw anyone in: heroes, villains, your roster, the whole Bestiary. Each fighter fights in its own style, and the log shows every roll as it happens. Pause, step through, or run a hundred fights for the odds.')),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn sm ghost', type: 'button', 'aria-pressed': String(ui.showHelp), onClick: () => { ui.showHelp = !ui.showHelp; renderBattle(); } }, ui.showHelp ? 'Hide the rules used' : 'What\'s simulated?')));
  if (ui.showHelp) root.append(helpPanel());
  root.append(h('div', { class: 'bt-layout' },
    addPanel(),
    h('div', { class: 'bt-main-col' },
      h('section', { class: 'panel bt-panel' },
        h('div', { class: 'bt-top' }, nameIn, liveHost),
        controls,
        arenaHost,
        result,
        cardsHost),
      h('section', { class: 'panel bt-panel' },
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, h('h2', null, 'Fight log'), h('span', { class: 'hint' }, `${battle.log.length} entries`), h('span', { style: { flex: 1 } }), filter),
        logHost),
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
    hooks.recordBattle ? h('div', { class: 'btn-row', style: { marginTop: '6px' } },
      h('button', { class: 'btn', type: 'button', disabled: battle.recorded, title: 'Adds an event page to the World wiki, linked to everyone who fought', onClick: () => { try { hooks.recordBattle(battle); battle.recorded = true; save(); renderBattle(); } catch (e) { toast(e.message); } } }, battle.recorded ? '✓ Recorded in the World' : '🌐 Record this fight in the World')) : null);
}

export { STYLES, detectStyle };
