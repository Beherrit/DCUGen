// The GM screen: the table runs itself.
//
//   Board        every character in play: players' characters live over the lobby (their Play view
//                state: damage, conditions, hero points, pools, drains), plus anyone the GM adds from
//                the roster to run on this device (villains, NPCs, or everyone at a one-screen table).
//   Hits         "Burst Damage 10 hits Shadowshot and Spark": each player's app rolls its own resistance
//                and applies the result; the GM's own characters are rolled here. Everything goes to the feed.
//   Initiative   roll for everyone, step through turns and rounds.
//   Spotlight    who hasn't had a moment yet this session; ★ marks one.
//   Complications the scene in a sentence; complications it could bring into play; +1 hero point in one tap.
//   Nemeses      recurring villains: grudge, what they learned from defeats, and the scheme clock.
//   Recap        end the session: a comic-book cover and a few lines for the group chat.

import { h, clear, toast, copyText, openDialog, download } from './dom.js';
import { state, upsert } from './store.js';
import { lobby, onLobby, lobbySend } from './lobby.js';
import { postRoll, feedEntries } from './table.js';
import { statusOf, parseHit, describeHit, resolveHit, spotlight, complicationPrompts, QUICK_CONDITIONS } from '../engine/gmboard.js';
import { makeNemesis, lessonsFromBattle, adaptNemesis, advanceScheme, schemeLabel } from '../engine/nemesis.js';
import { buildRecap, recapSvg } from '../engine/recap.js';
import { imageDialog } from './imageshare.js';
import { prepSession } from '../engine/prep.js';
import { rogueCandidates, makeRogue } from '../engine/rogues.js';
import { DIFFICULTIES } from '../engine/balance.js';
import { randomSeed } from '../engine/rng.js';
import { mapPanel } from './battlemap.js';
import { playState } from '../engine/play.js';

const KEY = 'dcugen.gmscreen.v1';
let R; let root; let hooks = {};
let gs = load();
const live = new Map(); // rosterId -> status from a player's app (with .player)

function load() {
  try { const g = JSON.parse(localStorage.getItem(KEY) || 'null'); if (g) return { board: [], issue: 0, ...g }; } catch { /* ignore */ }
  return { board: [], issue: 0, session: null, init: null, scene: '' };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(gs)); } catch { /* full */ } }
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

export function initGmScreen(rules, el, h2 = {}) { R = rules; root = el; hooks = h2; onLobby(() => { if (root && !root.hidden) renderGmScreen(); }); }

// ---- the people on the board ----------------------------------------------------------------------------------

function localChar(entry) {
  const ch = state.roster.find((c) => c.rosterId === entry.rosterId);
  if (!ch) return null;
  return entry.play ? { ...ch, play: entry.play } : ch;
}

/** Everyone on the board: [{ key, kind: 'live' | 'local', status, player, entry }]. */
function boardPeople() {
  const out = [];
  for (const [rid, st] of live) out.push({ key: rid, kind: 'live', status: st, player: st.player });
  for (const e of gs.board) {
    if (live.has(e.rosterId)) continue;
    const ch = localChar(e);
    if (!ch) continue;
    const st = statusOf(ch, R);
    if (st) out.push({ key: e.rosterId, kind: 'local', status: st, entry: e });
  }
  return out;
}

/** A status arrived from a player's app. */
export function receiveStatus(status, playerName) {
  if (!status?.rosterId) return;
  live.set(status.rosterId, { ...status, player: playerName || 'Player' });
  if (root && !root.hidden) renderGmScreen();
}

export function requestStatuses() { if (lobby.status === 'on' && lobby.role === 'host') lobbySend({ t: 'status-request' }); }

function changeLocal(rosterId, fn) {
  const e = gs.board.find((x) => x.rosterId === rosterId);
  if (!e) return;
  const st = playState({ play: e.play });
  fn(st);
  e.play = st;
  save();
}

function awardHeroPoint(person, why) {
  if (person.kind === 'live') lobbySend({ t: 'hp', rosterId: person.key, n: 1, why });
  else changeLocal(person.key, (st) => { st.heroPoints += 1; });
  postRoll({ who: 'GM', kind: 'chat', text: `⭐ ${person.status.name} gets a hero point${why ? `: ${why}` : ''}.` });
}

// ---- hits -----------------------------------------------------------------------------------------------------

function applyHit(hit, people) {
  const targets = people.filter((p) => hit.targets.includes(p.status.name));
  for (const p of targets) {
    if (p.kind === 'live') { lobbySend({ t: 'hit', rosterId: p.key, hit, by: 'GM' }); continue; }
    const ch = localChar(p.entry);
    const r = resolveHit(ch, hit, R);
    changeLocal(p.key, (st) => Object.assign(st, r.play));
    postRoll({ who: p.status.name, text: `GM: ${describeHit(hit)} → ${r.text}`, dice: r.dice[r.dice.length - 1] ? { ...r.dice[r.dice.length - 1] } : undefined });
  }
  gs.session && (gs.session.hits = (gs.session.hits || 0) + 1);
  save();
  toast(`${describeHit(hit)} → ${targets.map((t) => t.status.name).join(', ')}${targets.some((t) => t.kind === 'live') ? ' (players roll their own)' : ''}`);
}

function hitConsole(people) {
  const names = people.map((p) => p.status.name);
  const input = h('input', { type: 'text', id: 'gm-hit', placeholder: names.length ? `e.g. Burst Damage 10 hits ${names.slice(0, 2).join(' and ')}` : 'Add characters to the board first', 'aria-label': 'What hits whom', autocomplete: 'off' });
  const tiers = h('input', { type: 'text', id: 'gm-tiers', placeholder: 'Affliction degrees: Dazed / Stunned / Incapacitated', 'aria-label': 'Affliction conditions by degree', value: gs.tiers || '' });
  const preview = h('p', { class: 'hint gm-hit-preview' }, 'Type a hit in plain words: "Damage 12 hits Spark", "Burst Damage 10 hits everyone", "Affliction 8 vs Fortitude on Shadowshot", "Weaken Strength 6 hits Spark".');
  let parsed = null;
  const read = () => {
    parsed = input.value.trim() ? parseHit(input.value, names) : null;
    if (parsed && !parsed.error && parsed.effect === 'Affliction' && tiers.value.trim()) parsed.tiers = tiers.value.split('/').map((x) => x.split(/,| and /).map((y) => y.trim()).filter(Boolean).map((y) => y[0].toUpperCase() + y.slice(1).toLowerCase()));
    preview.textContent = !parsed ? preview.textContent : parsed.error ? `⚠ ${parsed.error}` : `→ ${describeHit(parsed)} on ${parsed.targets.join(', ')}`;
    preview.classList.toggle('bad', !!parsed?.error);
  };
  input.addEventListener('input', read);
  tiers.addEventListener('input', () => { gs.tiers = tiers.value; save(); read(); });
  const go = () => { read(); if (!parsed || parsed.error) { toast(parsed?.error || 'Type a hit first'); return; } applyHit(parsed, people); input.value = ''; renderGmScreen(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('section', { class: 'panel gm-hit' },
    h('h2', null, '💥 Hit them'),
    h('div', { class: 'seed-row' }, input, h('button', { class: 'btn primary', type: 'button', id: 'gm-hit-go', onClick: go }, 'Apply')),
    preview,
    h('details', null, h('summary', null, 'Affliction conditions'), tiers, h('p', { class: 'hint' }, 'What each degree of failure does, separated by "/". Leave empty for Dazed / Stunned / Incapacitated.')));
}

// ---- initiative -----------------------------------------------------------------------------------------------

function initiativePanel(people) {
  const init = gs.init;
  const roll = () => {
    const order = people.map((p) => { const r = 1 + Math.floor(Math.random() * 20); return { key: p.key, name: p.status.name, total: r + (p.status.initiative || 0), roll: r }; }).sort((a, b) => b.total - a.total);
    gs.init = { order, turn: 0, round: 1 };
    save();
    postRoll({ who: 'GM', kind: 'chat', text: `Initiative: ${order.map((o) => `${o.name} ${o.total}`).join(', ')}.` });
    renderGmScreen();
  };
  const next = () => { if (!gs.init) return; gs.init.turn += 1; if (gs.init.turn >= gs.init.order.length) { gs.init.turn = 0; gs.init.round += 1; } save(); renderGmScreen(); };
  return h('section', { class: 'panel gm-init' },
    h('div', { class: 'gm-head' }, h('h2', null, '⏱ Initiative'), init ? h('span', { class: 'chip' }, `Round ${init.round}`) : null, h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', type: 'button', id: 'gm-init-roll', disabled: !people.length, onClick: roll }, init ? 'Re-roll' : 'Roll for everyone'),
      init ? h('button', { class: 'btn sm primary', type: 'button', id: 'gm-next', onClick: next }, 'Next turn ▶') : null,
      init ? h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { gs.init = null; save(); renderGmScreen(); } }, 'End') : null),
    init ? h('ol', { class: 'gm-order' }, init.order.map((o, i) => h('li', { class: i === init.turn ? 'now' : '' }, h('b', { class: 'num' }, o.total), ' ', o.name, i === init.turn ? h('span', { class: 'chip' }, 'acting') : null)))
      : h('p', { class: 'hint', style: { margin: 0 } }, 'Rolls d20 + initiative for everyone on the board and keeps the turn order.'));
}

// ---- the board ------------------------------------------------------------------------------------------------

function card(p, spot) {
  const s = p.status;
  const pl = s.play;
  const now = gs.init && gs.init.order[gs.init.turn]?.key === p.key;
  const conds = [...(pl.damage !== 'none' ? [pl.damage[0].toUpperCase() + pl.damage.slice(1)] : []), ...pl.conditions, ...(pl.fatigue !== 'none' ? [pl.fatigue[0].toUpperCase() + pl.fatigue.slice(1)] : [])];
  const local = p.kind === 'local';
  const sp = spot.find((x) => x.key === p.key);
  const maxSpot = Math.max(1, ...spot.map((x) => x.score));
  return h('article', { class: `gm-card ${now ? 'now' : ''} ${s.villain ? 'villain' : ''} ${pl.damage === 'incapacitated' ? 'out' : ''}`, style: { '--c': s.color } },
    h('div', { class: 'gm-card-head' },
      h('span', { class: 'swatch' }),
      h('b', { class: 'gm-name' }, s.name),
      h('span', { class: 'chip' }, `PL ${s.pl}`),
      s.form ? h('span', { class: 'chip' }, `🎭 ${s.form}`) : null,
      h('span', { class: `gm-src ${p.kind}`, title: local ? 'Run on this device' : 'Live from the player\'s app' }, local ? 'GM' : `● ${p.player}`),
      h('span', { class: 'spacer' }),
      local ? h('button', { class: 'x', type: 'button', 'aria-label': `Take ${s.name} off the board`, onClick: () => { gs.board = gs.board.filter((x) => x.rosterId !== p.key); save(); renderGmScreen(); } }, '✕') : null),
    h('div', { class: 'gm-defs' }, ['Dodge', 'Parry', 'Toughness', 'Fortitude', 'Will'].map((d) => h('span', { class: 'gm-def' }, h('small', null, d.slice(0, 4)), h('b', { class: 'num' }, s.defenses[d] == null ? '—' : s.defenses[d]))),
      h('span', { class: 'gm-def' }, h('small', null, 'Init'), h('b', { class: 'num' }, sign(s.initiative)))),
    h('div', { class: 'gm-state' },
      h('span', { class: 'gm-hp', title: 'Hero points' }, '⭐ ', h('b', { class: 'num' }, pl.heroPoints)),
      h('span', { class: 'gm-bruise', title: 'Bruises (−1 Toughness each)' }, '🩹 ', h('b', { class: 'num' }, pl.bruises)),
      conds.length ? conds.map((c) => h('span', { class: `chip cond ${/Incapacitated|Stunned|Staggered/.test(c) ? 'bad' : ''}` }, c)) : h('span', { class: 'hint' }, 'fine'),
      s.penalty ? h('span', { class: 'chip warn' }, `${sign(s.penalty)} checks`) : null),
    s.pools.length || s.drains.length ? h('div', { class: 'gm-pools' },
      s.drains.map((d) => h('span', { class: 'chip' }, `🩸 ${d.name} ${d.held}/${d.rank}`)),
      s.pools.map((q) => h('span', { class: 'chip' }, `⚡ ${q.name} ${Math.round(q.spent * 10) / 10}/${q.avail} pp`))) : null,
    h('div', { class: 'gm-spot' }, h('div', { class: 'meter', title: 'Spotlight this session' }, h('i', { style: { width: `${((sp?.score || 0) / maxSpot) * 100}%` } })),
      h('small', null, sp?.score ? `${sp.score} spotlight` : 'no moment yet')),
    h('div', { class: 'gm-actions no-print' },
      h('button', { class: 'btn sm', type: 'button', title: 'Mark a great moment for the spotlight', onClick: () => { if (!gs.session) startSession(); gs.session.taps[p.key] = (gs.session.taps[p.key] || 0) + 1; save(); renderGmScreen(); } }, '★ Moment'),
      h('button', { class: 'btn sm', type: 'button', onClick: () => awardHeroPoint(p, 'from the GM') }, '+1 hero point'),
      local ? h('button', { class: 'btn sm ghost', type: 'button', title: 'Recover a bruise', disabled: !pl.bruises, onClick: () => { changeLocal(p.key, (st) => { st.bruises = Math.max(0, st.bruises - 1); }); renderGmScreen(); } }, '−1 bruise') : null,
      local ? h('select', { class: 'btn sm', 'aria-label': `Toggle a condition on ${s.name}`, onChange: (e) => { const c = e.target.value; if (!c) return; changeLocal(p.key, (st) => { st.conditions = st.conditions.includes(c) ? st.conditions.filter((x) => x !== c) : [...st.conditions, c]; }); renderGmScreen(); } },
        h('option', { value: '' }, 'Condition…'), QUICK_CONDITIONS.map((c) => h('option', { value: c }, `${pl.conditions.includes(c) ? '✓ ' : ''}${c}`))) : null,
      local ? h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { changeLocal(p.key, (st) => { st.bruises = 0; st.damage = 'none'; st.conditions = []; st.fatigue = 'none'; }); renderGmScreen(); } }, 'Clear') : null));
}

function addToBoard() {
  const have = new Set([...gs.board.map((e) => e.rosterId), ...live.keys()]);
  const list = state.roster.filter((c) => !have.has(c.rosterId));
  if (!list.length) { toast('Everyone on the roster is already on the board.'); return; }
  const sel = h('select', { multiple: true, size: Math.min(10, list.length), id: 'gm-add-list', style: { width: '100%' } }, list.map((c) => h('option', { value: c.rosterId }, `${c.identity?.codename || 'Unnamed'} · PL ${c.pl}${c.alignment === 'villain' ? ' · villain' : ''}${c.folder ? ` · ${c.folder}` : ''}`)));
  openDialog({ title: 'Put characters on the board', body: [sel, h('p', { class: 'hint' }, 'Villains, NPCs, or the whole party if everyone plays on this screen. Players who join your lobby show up on their own, live. Ctrl/Cmd-click to pick several.')],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Add', value: () => [...sel.selectedOptions].map((o) => o.value), primary: true }] }).then((ids) => {
    if (!ids?.length) return;
    for (const id of ids) gs.board.push({ rosterId: id });
    save(); renderGmScreen();
  });
}

// ---- session, spotlight, complications ---------------------------------------------------------------------------

function startSession() {
  const n = (gs.lastSession || 0) + 1;
  gs.session = { number: n, startedAt: new Date().toISOString(), taps: {}, complications: [], events: [], hits: 0 };
  gs.lastSession = n;
  save();
  postRoll({ who: 'GM', kind: 'chat', text: `🎬 Session ${n} begins.` });
}

function complicationsPanel(people) {
  const scene = h('textarea', { id: 'gm-scene', rows: 2, placeholder: 'The scene in a sentence: "A charity gala at the gold exchange, reporters everywhere"', 'aria-label': 'The scene' }, gs.scene || '');
  const list = h('div', { class: 'gm-prompts' });
  const draw = () => {
    const chars = people.map((p) => ({ key: p.key, name: p.status.name, complications: p.status.complications || [] }));
    const prompts = complicationPrompts(scene.value, chars);
    clear(list);
    if (!scene.value.trim()) { list.append(h('p', { class: 'hint', style: { margin: 0 } }, 'Describe the scene and the complications it could stir up show here.')); return; }
    if (!prompts.length) { list.append(h('p', { class: 'hint', style: { margin: 0 } }, 'No complications fit this scene. Try naming the place, who\'s there and what\'s at stake.')); return; }
    for (const pr of prompts.slice(0, 8)) {
      const p = people.find((x) => x.key === pr.key);
      const used = gs.session?.complications?.some((c) => c.key === pr.key && c.text === pr.complication.type);
      list.append(h('div', { class: 'gm-prompt' },
        h('div', null, h('b', null, `${pr.name}: `), pr.complication.type, pr.complication.text ? h('small', null, ` — ${pr.complication.text}`) : null, h('div', { class: 'hint' }, `Because: ${pr.why.join(', ')}`)),
        h('button', { class: 'btn sm primary', type: 'button', disabled: used, onClick: () => {
          if (!gs.session) startSession();
          gs.session.complications.push({ key: pr.key, name: pr.name, text: pr.complication.type });
          save();
          awardHeroPoint(p, `${pr.complication.type} comes into play`);
          postRoll({ who: 'GM', kind: 'chat', text: `🎭 ${pr.name}'s complication comes into play: ${pr.complication.type}.` });
          renderGmScreen();
        } }, used ? 'Used ✓' : 'Invoke: +1 hero point')));
    }
  };
  scene.addEventListener('input', () => { gs.scene = scene.value; save(); draw(); });
  draw();
  return h('section', { class: 'panel gm-comp' }, h('h2', null, '🎭 Complications in this scene'), scene, list);
}

function spotlightPanel(spot) {
  if (!spot.length) return null;
  const quiet = spot.filter((s) => !s.score);
  return h('section', { class: 'panel gm-spotlight' },
    h('h2', null, '🔦 Spotlight'),
    quiet.length ? h('p', { class: 'gm-quiet' }, `No moment yet: ${quiet.map((q) => q.name).join(', ')}. Give them the next scene.`) : h('p', { class: 'hint', style: { margin: 0 } }, 'Everyone has had a moment this session.'),
    h('div', { class: 'gm-spot-list' }, spot.map((s) => h('div', { class: 'gm-spot-row' }, h('span', null, s.name), h('div', { class: 'meter' }, h('i', { style: { width: `${(s.score / Math.max(1, ...spot.map((x) => x.score))) * 100}%` } })), h('small', { class: 'num' }, `${s.rolls} rolls · ${s.nat20s} nat 20s · ${s.marked} ★`)))));
}

// ---- nemeses ------------------------------------------------------------------------------------------------

function nemesisPanel() {
  const villains = state.roster.filter((c) => c.nemesis);
  const pick = state.roster.filter((c) => !c.nemesis);
  const sel = h('select', { id: 'gm-nem-pick', 'aria-label': 'Villain' }, h('option', { value: '' }, 'Make a recurring villain…'), pick.sort((a, b) => (b.alignment === 'villain') - (a.alignment === 'villain')).map((c) => h('option', { value: c.rosterId }, `${c.identity?.codename || 'Unnamed'}${c.alignment === 'villain' ? ' (villain)' : ''}`)));
  const scheme = h('input', { type: 'text', id: 'gm-nem-scheme', placeholder: 'Their scheme, e.g. "the Blackout Engine"', 'aria-label': 'Scheme' });
  const steps = h('select', { 'aria-label': 'Scheme length' }, [4, 6, 8].map((n) => h('option', { value: n, selected: n === 6 }, `${n} steps`)));
  const make = () => {
    const c = state.roster.find((x) => x.rosterId === sel.value);
    if (!c) { toast('Pick a villain first'); return; }
    upsert(makeNemesis(c, { scheme: scheme.value.trim(), steps: Number(steps.value) }));
    toast(`${c.identity?.codename} is now a recurring villain. Record fights in the World and they'll learn from every defeat.`);
    renderGmScreen();
  };
  return h('section', { class: 'panel gm-nemesis' },
    h('h2', null, '😈 Recurring villains'),
    villains.length ? villains.map((v) => {
      const n = v.nemesis; const s = n.scheme;
      const last = n.defeats[n.defeats.length - 1];
      return h('div', { class: 'gm-nem', style: { '--c': v.theme?.color || '#a33' } },
        h('div', { class: 'gm-card-head' }, h('span', { class: 'swatch' }), h('b', null, v.identity?.codename), h('span', { class: 'chip' }, `Grudge ${n.grudge}`), h('span', { class: 'chip' }, `PL ${v.pl}`)),
        last ? h('p', { class: 'hint', style: { margin: '4px 0' } }, `Last beaten in ${last.battle}${last.by?.length ? ` by ${last.by.join(', ')}` : ''}; learned ${Object.entries(last.bought || {}).map(([d, k]) => `${d} +${k}`).join(', ') || 'nothing yet'}.`) : h('p', { class: 'hint', style: { margin: '4px 0' } }, 'Not beaten yet. Record their fights in the World (Battle Room > Record) and every defeat makes them stronger where they failed.'),
        h('div', { class: 'gm-clock' }, h('span', null, `⏳ ${s.name}`), h('span', { class: 'gm-dots' }, Array.from({ length: s.steps }, (_, i) => h('i', { class: i < s.progress ? 'on' : '' }))), h('small', null, schemeLabel(v))),
        s.hints.length ? h('ul', { class: 'gm-hints' }, s.hints.slice(-3).map((x) => h('li', null, h('small', null, `Step ${x.step}: `), x.text))) : null,
        h('div', { class: 'gm-actions' },
          h('button', { class: 'btn sm primary', type: 'button', disabled: s.progress >= s.steps, title: 'Between sessions: the plan moves on, and a hint goes into the World for the Newsstand', onClick: () => {
            const r = advanceScheme(v, { city: hooks.city?.() || 'the city' });
            upsert(r.ch);
            hooks.addWorldEvent?.({ name: r.hint, summary: `${v.identity?.codename}'s scheme, ${r.ch.nemesis.scheme.name}: step ${r.ch.nemesis.scheme.progress} of ${r.ch.nemesis.scheme.steps}.`, tags: ['scheme', 'rumor'], fields: { Kind: r.phase === 'climax' ? 'Breaking' : 'Rumor' }, people: [v.identity?.codename] });
            if (gs.session) { gs.session.events.push({ name: r.hint }); save(); }
            toast(`${r.done ? 'The scheme comes to a head! ' : ''}Hint for the Newsstand: "${r.hint}"`);
            renderGmScreen();
          } }, s.progress >= s.steps ? 'Scheme complete' : 'Advance the scheme'),
          h('button', { class: 'btn sm', type: 'button', onClick: () => hooks.open?.(v) }, 'Open sheet')));
    }) : h('p', { class: 'hint', style: { margin: 0 } }, 'A recurring villain learns from every defeat (points spent on the defense that failed them) and works a scheme between sessions that leaves hints in the newspaper.'),
    h('div', { class: 'rc-row', style: { marginTop: '8px' } }, sel, scheme, steps, h('button', { class: 'btn sm', type: 'button', onClick: make }, 'Make recurring')));
}

/** After a fight is recorded in the World: recurring villains who lost learn from it. Returns messages. */
export function afterBattleRecorded(battle, ev) {
  const out = [];
  if (gs.session) { gs.session.events.push({ name: ev?.name || battle.name, summary: ev?.summary || '' }); save(); }
  for (const c of battle.combatants) {
    const rid = c.ch?.rosterId;
    const v = rid && state.roster.find((x) => x.rosterId === rid && x.nemesis);
    if (!v) continue;
    const lesson = lessonsFromBattle(battle, c.id);
    if (!lesson?.lost) continue;
    const r = adaptNemesis(v, R, lesson, { battleName: battle.name || 'a fight' });
    upsert(r.ch);
    out.push(r.text);
  }
  return out;
}

// ---- recap --------------------------------------------------------------------------------------------------

async function endSession(people, spot) {
  const s = gs.session;
  if (!s) { toast('Start a session first.'); return; }
  gs.issue = (gs.issue || 0) + 1;
  const r = buildRecap({
    campaign: hooks.campaign?.() || 'Our Campaign', issue: gs.issue,
    cast: people.filter((p) => !p.status.villain).map((p) => ({ name: p.status.name, color: p.status.color })),
    entries: feedEntries(), events: s.events, spotlight: spot, complications: s.complications, since: s.startedAt,
  });
  const svg = recapSvg(r);
  postRoll({ who: 'GM', kind: 'chat', text: `🎬 Session ${s.number} ends. ${r.headline}` });
  hooks.addWorldEvent?.({ name: `${r.campaign} #${r.issue}: ${r.headline}`, summary: r.blurbs.join(' '), tags: ['recap', 'session'], fields: { Kind: 'Session recap', Session: s.number }, people: r.cast.map((c) => c.name) });
  gs.lastRecap = r; gs.session = null; gs.init = null;
  save();
  renderGmScreen();
  await imageDialog({ title: `Recap: ${r.campaign} #${r.issue}`, svg, text: r.text, file: `${r.campaign}-${r.issue}`, alt: `Comic cover: ${r.headline}`, note: 'Also saved in the World as an event, so it shows on the campaign timeline and in the Newsstand.' });
}

// ---- prep: Session in a Box, rogues' gallery -----------------------------------------------------------------

/** The party: heroes on the board, or else the heroes saved on the roster. */
function partyChars() {
  const onBoard = boardPeople().filter((p) => !p.status.villain).map((p) => state.roster.find((c) => c.rosterId === p.key)).filter(Boolean);
  if (onBoard.length) return onBoard;
  return state.roster.filter((c) => c.alignment !== 'villain' && !c.minion && !c.catalogId && !c.companionKind).slice(0, 6);
}

/** Save a character for tonight (in a "Session N" folder) and put it on the board. */
function toBoard(ch, folder) {
  const saved = ch.rosterId && state.roster.some((c) => c.rosterId === ch.rosterId) ? ch : upsert({ ...ch, folder: ch.folder || folder });
  if (!gs.board.some((e) => e.rosterId === saved.rosterId)) gs.board.push({ rosterId: saved.rosterId });
  save();
  return saved;
}

function prepPanel() {
  const party = partyChars();
  const plan = gs.plan;
  const diff = h('select', { id: 'prep-diff', 'aria-label': 'How hard' }, Object.entries(DIFFICULTIES).map(([k, d]) => h('option', { value: k, selected: k === (gs.prepDifficulty || 'tense') }, d.label)));
  const run = () => {
    if (!party.length) { toast('Save the heroes to the roster (or put them on the board) first.'); return; }
    gs.prepDifficulty = diff.value;
    ui.busy = true; renderGmScreen();
    setTimeout(() => {
      try {
        const quiet = spotlight(party.map((c) => ({ key: c.rosterId, name: c.identity?.codename })), feedEntries(), gs.session?.taps || {}, gs.session?.startedAt || 0).map((x) => x.name);
        const p = prepSession(R, { heroes: party, roster: state.roster, quiet, difficulty: diff.value, seed: randomSeed(), n: 40 });
        gs.plan = { ...p, made: new Date().toISOString() };
        save();
      } catch (e) { toast(e.message); }
      ui.busy = false; renderGmScreen();
    }, 30);
  };
  const folder = `Session ${(gs.lastSession || 0) + 1}`;
  return h('section', { class: 'panel gm-prep' },
    h('div', { class: 'gm-head' }, h('h2', null, '🧰 Session in a Box'), h('span', { class: 'spacer' }),
      h('label', { class: 'wd-inline' }, 'Showdown', diff),
      h('button', { class: 'btn primary', type: 'button', id: 'prep-go', disabled: ui.busy, onClick: run }, ui.busy ? 'Building…' : plan ? '↻ Prep again' : 'Prep next session')),
    h('p', { class: 'hint', style: { margin: '4px 0 10px' } }, party.length ? `For ${party.map((c) => c.identity?.codename).join(', ')}. Scenes come from their bios and complications; the quiet players get the first scenes; the showdown is checked against the party in the Battle Room.` : 'Save your heroes to the roster (or put them on the board) and five minutes of prep become one click.'),
    plan ? [
      h('div', { class: 'prep-villain', style: { '--c': plan.villain.ch.theme?.color || '#a33' } },
        h('div', { class: 'gm-card-head' }, h('span', { class: 'swatch' }), h('b', null, `Villain: ${plan.villain.ch.identity?.codename}`), h('span', { class: 'chip' }, `PL ${plan.villain.ch.pl}`), plan.villain.odds != null ? h('span', { class: 'chip' }, `Heroes win ~${Math.round(plan.villain.odds * 100)}%`) : null),
        h('p', { class: 'hint', style: { margin: '4px 0' } }, plan.villain.why),
        h('div', { class: 'gm-actions' },
          h('button', { class: 'btn sm primary', type: 'button', onClick: () => { const v = toBoard(plan.villain.ch, folder); plan.villain.ch = v; save(); toast(`${v.identity?.codename} is on the board (saved in ${folder})`); renderGmScreen(); } }, 'Put on the board'),
          h('button', { class: 'btn sm', type: 'button', onClick: () => hooks.open?.(plan.villain.ch) }, 'Open sheet'),
          h('button', { class: 'btn sm', type: 'button', onClick: () => { hooks.throwIn?.(plan.villain.ch, { team: 'B' }); for (const c of party) hooks.throwIn?.(c, { team: 'A' }); toast('Party on A, villain on B: the Battle Room is set'); } }, '⚔ Set up the fight'))),
      h('div', { class: 'prep-minions' }, h('b', null, `Minions: ${plan.minions.count} × ${plan.minions.name}`), h('span', { class: 'hint' }, ` PL ${plan.minions.rank} · ${plan.minions.villainCost.minionAdvantage.text}`),
        h('button', { class: 'btn sm', type: 'button', onClick: () => { const m = { ...plan.minions.member, minion: true, identity: { ...plan.minions.member.identity, codename: `${plan.minions.name} (×${plan.minions.count})` } }; toBoard(m, folder); toast('Squad on the board'); renderGmScreen(); } }, 'Put on the board')),
      h('ol', { class: 'prep-scenes' }, plan.scenes.map((sc) => h('li', { class: `prep-scene ${sc.kind}` },
        h('div', { class: 'gm-card-head' }, h('b', null, sc.title), h('span', { class: 'chip' }, `🔦 ${sc.spotlight}`), sc.complication ? h('span', { class: 'chip warn' }, `🎭 ${sc.complication.hero}`) : null),
        h('p', null, sc.text), h('p', { class: 'hint' }, sc.stakes),
        h('div', { class: 'gm-actions' },
          h('button', { class: 'btn sm', type: 'button', onClick: () => { gs.scene = sc.scene; gs.view = 'run'; save(); renderGmScreen(); toast('Scene set: its complications are up on the Run page'); } }, 'Play this scene'),
          sc.minions || sc.villain ? h('button', { class: 'btn sm', type: 'button', onClick: () => { if (sc.villain) hooks.throwIn?.(plan.villain.ch, { team: 'B' }); else hooks.throwIn?.({ ...plan.minions.member, minion: true }, { team: 'B', copies: plan.minions.count }); for (const c of party) hooks.throwIn?.(c, { team: 'A' }); toast('The Battle Room is set'); } }, '⚔ To the Battle Room') : null)))),
      h('div', { class: 'prep-rumor' }, h('span', null, `📰 Rumor: ${plan.rumor}`), h('button', { class: 'btn sm', type: 'button', onClick: () => { hooks.addWorldEvent?.({ name: plan.rumor, summary: `Rumor ahead of session ${(gs.lastSession || 0) + 1}.`, tags: ['rumor'], fields: { Kind: 'Rumor' } }); toast('In the World: the Newsstand will run it'); } }, 'Put it in the newspaper')),
    ] : null);
}

function roguesPanel() {
  const party = partyChars();
  const list = rogueCandidates(party, state.roster).slice(0, 8);
  const made = state.roster.filter((c) => c.foilOf);
  return h('section', { class: 'panel gm-rogues' },
    h('h2', null, '🦹 Rogues\' gallery'),
    h('p', { class: 'hint', style: { margin: '0 0 8px' } }, 'People from the heroes\' own pasts, back as villains built to beat them: their attack goes after that hero\'s weakest defense, and they\'re hardened against the hero\'s best attack.'),
    list.length ? h('div', { class: 'rogue-list' }, list.map((c) => h('div', { class: 'rogue' },
      h('div', null, h('b', null, c.person.name), h('span', { class: 'chip' }, `${c.hero.identity?.codename}'s ${String(c.person.relation).toLowerCase()}`), h('div', { class: 'hint' }, c.person.who)),
      h('button', { class: 'btn sm primary', type: 'button', onClick: () => {
        const r = makeRogue(R, c.hero, c.person);
        const saved = upsert({ ...r.ch, folder: c.hero.folder || 'Villains' });
        toast(r.text);
        hooks.open?.(saved);
      } }, 'Make the villain')))) : h('p', { class: 'hint' }, party.length ? 'Everyone in their pasts has already turned (or their bios are empty: roll a bio on the Bio page).' : 'Save the heroes to the roster first.'),
    made.length ? [h('div', { class: 'label', style: { marginTop: '10px' } }, 'Already back'), h('div', { class: 'tagwrap' }, made.map((v) => h('button', { class: 'chip', type: 'button', title: v.notes || '', onClick: () => hooks.open?.(v) }, `${v.identity?.codename} (${v.foilOf.name}'s ${String(v.foilOf.relation).toLowerCase()})`)))] : null);
}

const ui = { busy: false };

// ---- the page -----------------------------------------------------------------------------------------------

export function renderGmScreen() {
  if (!root) return;
  clear(root);
  const people = boardPeople();
  const spot = spotlight(people.filter((p) => !p.status.villain).map((p) => ({ key: p.key, name: p.status.name })), feedEntries(), gs.session?.taps || {}, gs.session?.startedAt || 0);
  const lobbyLine = lobby.status === 'on'
    ? (lobby.role === 'host' ? `Table open: ${lobby.members.filter((m) => m.role !== 'host').length} player(s) connected. Their characters appear here live once they open them.` : 'You joined as a player: the GM screen is for the host.')
    : 'No table open: run everyone on this screen, or open a table for phones so players join with a QR code and roll their own hits.';
  root.append(
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'GM Screen'), h('p', null, 'Everyone at the table on one screen, live. Type a hit and their apps roll it. Track initiative, give the quiet player the spotlight, cash in complications for hero points, and send the recap when you\'re done.')),
      h('span', { class: 'spacer' }),
      h('div', { class: 'btn-row' },
        gs.session ? h('span', { class: 'chip gm-session' }, `🎬 Session ${gs.session.number} · since ${new Date(gs.session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`) : null,
        gs.session ? h('button', { class: 'btn primary', type: 'button', id: 'gm-end', onClick: () => endSession(people, spot) }, 'End session & make the recap') : h('button', { class: 'btn primary', type: 'button', id: 'gm-start', onClick: () => { startSession(); renderGmScreen(); } }, '🎬 Start a session'),
        h('button', { class: 'btn', type: 'button', id: 'gm-add', onClick: addToBoard }, '+ Characters'),
        h('button', { class: 'btn', type: 'button', id: 'gm-invite', title: 'Players scan a QR code and join from their phones', onClick: async () => { await hooks.invite?.(); renderGmScreen(); } }, lobby.status === 'on' && lobby.role === 'host' ? '📱 Invite players' : '📱 Open a table for phones'),
        lobby.status === 'on' && lobby.role === 'host' ? h('button', { class: 'btn', type: 'button', onClick: requestStatuses }, '⟳ Refresh players') : null)),
    h('p', { class: 'hint gm-lobby' }, lobbyLine),
    h('div', { class: 'seg gm-views', role: 'tablist', 'aria-label': 'GM screen' },
      [['run', '▶ Run the session'], ['prep', '🧰 Prep'], ['map', '🗺 Map']].map(([v, t]) => h('button', { type: 'button', role: 'tab', id: `gm-view-${v}`, 'aria-pressed': String((gs.view || 'run') === v), onClick: () => { gs.view = v; save(); renderGmScreen(); } }, t))),
    (gs.view || 'run') === 'prep'
      ? h('div', { class: 'gm-layout' }, h('div', { class: 'gm-main' }, prepPanel()), h('div', { class: 'gm-side' }, roguesPanel(), nemesisPanel()))
      : gs.view === 'map'
        ? mapPanel({ R, people, gs, save, rerender: renderGmScreen, applyHit: (hit) => applyHit(hit, people) })
        : h('div', { class: 'gm-layout' },
          h('div', { class: 'gm-main' },
            hitConsole(people),
            people.length ? h('div', { class: 'gm-board' }, people.map((p) => card(p, spot)))
              : h('div', { class: 'empty' }, h('h2', null, 'Nobody on the board yet'), h('p', null, 'Add characters from your roster, prep a session, or open a table so your players\' characters show up live.'), h('button', { class: 'btn primary', type: 'button', onClick: addToBoard }, '+ Characters'))),
          h('div', { class: 'gm-side' }, initiativePanel(people), spotlightPanel(spot), complicationsPanel(people))));
}
