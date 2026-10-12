// Play view: one screen for running a character at the table, made for a phone. Damage track, hero
// points, conditions and fatigue; tap a defense, attack or skill to roll it (results go to the Table
// feed, with condition penalties already counted); drain and pool trackers; the character's companions.

import { h, toast } from './dom.js';
import { deriveAll } from '../engine/derive.js';
import { rollCheck } from './dice.js';
import { stepper, poolTracker, drainTracker } from './sheetview.js';
import { playState, effectiveDefenses, checkPenalty, applyDamage, endScene, DAMAGE_STATES, FATIGUE, QUICK_CONDITIONS } from '../engine/play.js';
import { companionsOf } from '../engine/companions.js';
import { costBreakdown } from '../engine/costs.js';
import { openRangeCalculator } from './rangecalc.js';
import { rangeInfo } from '../engine/range.js';

const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const recent = []; // this visit's rolls, newest first

/**
 * opts: { change(fn) — apply fn to a copy of the character and keep it, openCompanion(i) }
 */
export function renderPlay(ch, R, opts) {
  const s = playState(ch);
  const setPlay = (fn) => opts.change((c) => { const st = playState(c); fn(st); c.play = st; });
  let d;
  try { d = deriveAll(ch, R); } catch (e) { return h('p', null, e.message); }
  const who = ch.identity?.codename || 'Someone';
  const pen = checkPenalty(s);
  const roll = (label, mod, extra = {}) => {
    const e = rollCheck({ who, label, mod: mod + pen, note: pen ? `${sign(pen)} from conditions` : '', ...extra });
    recent.unshift(e.text); recent.length = Math.min(recent.length, 8);
    toast(e.text);
    return e;
  };
  const def = effectiveDefenses(d, s);

  // ---- status: hero points, damage, fatigue ----
  const hitRank = h('input', { type: 'number', min: 1, max: 40, placeholder: 'rank', class: 'play-hit', 'aria-label': 'Damage rank of the hit' });
  const takeHit = () => {
    const rank = Number(hitRank.value);
    if (!(rank > 0)) { toast('Type the damage rank of the hit first'); return; }
    const e = roll('Toughness vs damage', def.Toughness + 0 - pen, { dc: 15 + rank });
    const { total, dc } = e.dice || {};
    const r = applyDamage(s, { total, dc });
    setPlay((st) => Object.assign(st, r.state));
    toast(`${e.text} → ${r.text}`);
  };
  let saved = 0;
  try { const c = costBreakdown(ch, R); saved = c.budget - c.total; } catch { /* unknown */ }
  const status = h('section', { class: 'play-card play-status' },
    h('div', { class: 'play-row' },
      saved > 0 ? h('div', { class: 'play-hp', title: 'Power points from the GM not spent yet' }, h('span', { class: 'label' }, 'Saved pp'), h('b', { class: 'num' }, saved)) : null,
      h('div', { class: 'play-hp' }, h('span', { class: 'label' }, 'Hero points'), h('b', { class: 'num' }, s.heroPoints),
        stepper(s.heroPoints, (x) => setPlay((st) => { st.heroPoints = Math.max(0, st.heroPoints + x); }), { min: 0, label: 'hero points' })),
      h('div', { class: 'play-hp' }, h('span', { class: 'label' }, 'Bruises'), h('b', { class: 'num' }, s.bruises),
        stepper(s.bruises, (x) => setPlay((st) => { st.bruises = Math.max(0, st.bruises + x); }), { min: 0, label: 'bruises' }))),
    h('div', { class: 'seg play-seg', role: 'group', 'aria-label': 'Damage condition' },
      DAMAGE_STATES.map((st) => h('button', { type: 'button', 'aria-pressed': String(s.damage === st), onClick: () => setPlay((x) => { x.damage = st; }) }, st === 'none' ? 'OK' : st[0].toUpperCase() + st.slice(1)))),
    h('div', { class: 'play-row play-hit-row' },
      h('label', null, 'Hit by Damage', hitRank), h('button', { class: 'btn primary', type: 'button', onClick: takeHit }, 'Resist'),
      h('button', { class: 'btn', type: 'button', title: 'Recover a bruise (a minute of rest, or a recovery action)', disabled: !s.bruises, onClick: () => setPlay((st) => { st.bruises = Math.max(0, st.bruises - 1); }) }, 'Recover 1')),
    h('div', { class: 'play-row' },
      h('span', { class: 'label' }, 'Fatigue'),
      h('div', { class: 'seg play-seg small', role: 'group', 'aria-label': 'Fatigue' },
        FATIGUE.map((f) => h('button', { type: 'button', 'aria-pressed': String(s.fatigue === f), onClick: () => setPlay((x) => { x.fatigue = f; }) }, f === 'none' ? 'Fresh' : f[0].toUpperCase() + f.slice(1))))),
    h('div', { class: 'play-row' },
      h('button', { class: 'btn', type: 'button', title: 'Extra effort: +1 rank, a power stunt, an extra action... then fatigued next turn unless you spend a hero point', onClick: () => {
        setPlay((st) => { const i = FATIGUE.indexOf(st.fatigue); st.fatigue = FATIGUE[Math.min(FATIGUE.length - 1, i + 1)]; });
        toast('Extra effort: you become more fatigued (spend a hero point to cancel it: press − on Hero points and set Fatigue back)');
      } }, '💪 Extra effort'),
      h('button', { class: 'btn', type: 'button', disabled: !s.heroPoints, title: 'Spend a hero point: re-roll, improve a check, recover...', onClick: () => setPlay((st) => { st.heroPoints = Math.max(0, st.heroPoints - 1); }) }, '⭐ Spend hero point'),
      h('button', { class: 'btn ghost', type: 'button', title: 'Damage, conditions and fatigue clear; hero points stay', onClick: () => setPlay((st) => Object.assign(st, endScene(st))) }, 'End of scene')));

  // ---- defenses ----
  const defTile = (name, v, label) => h('button', { type: 'button', class: 'play-tile', disabled: v == null, onClick: () => roll(`${name} check`, v) },
    h('span', { class: 'label' }, label || name), h('b', { class: 'num' }, v == null ? '—' : v), h('small', null, v == null ? 'immune' : 'tap to roll'));
  const defenses = h('section', { class: 'play-card' }, h('h3', null, 'Defenses', pen ? h('span', { class: 'chip warn' }, `${sign(pen)} on checks`) : null),
    h('div', { class: 'play-tiles' },
      defTile('Dodge', def.Dodge), defTile('Parry', def.Parry), defTile('Toughness', def.Toughness, s.bruises ? `Toughness (−${s.bruises})` : 'Toughness'), defTile('Fortitude', def.Fortitude), defTile('Will', def.Will),
      h('button', { type: 'button', class: 'play-tile', onClick: () => roll('initiative', d.initiative) }, h('span', { class: 'label' }, 'Initiative'), h('b', { class: 'num' }, sign(d.initiative)), h('small', null, 'tap to roll'))));

  // ---- attacks ----
  const attacks = h('section', { class: 'play-card' }, h('h3', null, 'Attacks'),
    h('div', { class: 'play-list' }, d.attacks.map((a) => {
      const dc = (a.effect === 'Damage' || a.resistance === 'Toughness' ? 15 : 10) + a.rank;
      return h('button', { type: 'button', class: 'play-line', onClick: () => (a.roll ? roll(`${a.name} attack`, a.bonus, { note: `${a.effect} ${a.rank}: ${a.resistance || 'resist'} DC ${dc}` }) : toast(`${a.name}: no attack roll. ${a.effect} ${a.rank}: targets resist with ${a.resistance} against DC ${dc}.`)) },
        h('b', null, a.name), h('span', { class: 'num' }, a.roll ? sign(a.bonus + pen) : a.kind), h('small', null, `${a.effect} ${a.rank} · ${a.resistance || ''} DC ${dc}${a.power ? ` · 📏 ${rangeInfo(a.power, R)?.text || ''}` : a.kind === 'close' ? ' · 📏 close' : ''}`));
    })),
    h('button', { class: 'btn sm', type: 'button', style: { marginTop: '8px' }, onClick: () => openRangeCalculator(ch, R) }, '📏 Range calculator'));

  // ---- skills ----
  const skills = h('section', { class: 'play-card' }, h('h3', null, 'Skills'),
    h('div', { class: 'play-chips' }, [...d.skills].sort((a, b) => a.name.localeCompare(b.name)).map((sk) => h('button', { type: 'button', class: 'chip play-chip', onClick: () => roll(`${sk.name}${sk.spec ? ` (${sk.spec})` : ''}`, sk.bonus) }, `${sk.name}${sk.spec ? ` (${sk.spec})` : ''} ${sign(sk.bonus + pen)}`)),
      h('button', { type: 'button', class: 'chip play-chip', onClick: () => roll('d20', 0) }, 'd20')));

  // ---- conditions ----
  const conds = (R.raw.gm?.conditions?.conditions) || {};
  const conditions = h('section', { class: 'play-card' }, h('h3', null, 'Conditions'),
    h('div', { class: 'play-chips' }, QUICK_CONDITIONS.map((c) => h('button', { type: 'button', class: 'chip play-chip', 'aria-pressed': String(s.conditions.includes(c)), title: conds[c] || '', onClick: () => setPlay((st) => { st.conditions = st.conditions.includes(c) ? st.conditions.filter((x) => x !== c) : [...st.conditions, c]; }) }, c))),
    s.conditions.length ? h('ul', { class: 'play-cond-notes' }, s.conditions.map((c) => h('li', null, h('b', null, `${c}: `), conds[c] || ''))) : null);

  // ---- drain & pools ----
  const trackers = [];
  const change = (fn) => opts.change(fn);
  (ch.powers || []).forEach((p, index) => {
    const path = { device: null, index };
    const t = [drainTracker(ch, p, path, change, R), poolTracker(ch, p, path, change, R)].filter(Boolean);
    if (t.length) trackers.push(h('div', { class: 'play-tracker' }, h('b', null, p.name), t));
  });
  const powers = trackers.length ? h('section', { class: 'play-card' }, h('h3', null, 'Drain & pools'), trackers) : null;

  // ---- companions ----
  const comps = companionsOf(ch);
  const companions = comps.length ? h('section', { class: 'play-card' }, h('h3', null, 'Companions'),
    h('div', { class: 'play-list' }, comps.map((c, i) => {
      let cd = null;
      try { cd = deriveAll(c, R); } catch { /* unknown */ }
      return h('div', { class: 'play-line' },
        h('b', null, c.identity?.codename || 'Companion'),
        h('small', null, cd ? `Dodge ${cd.defenses.Dodge} · Parry ${cd.defenses.Parry} · Tough ${cd.defenses.Toughness}` : ''),
        cd?.attacks?.[1] || cd?.attacks?.[0] ? h('button', { class: 'btn sm', type: 'button', onClick: () => { const a = cd.attacks.find((x) => x.name !== 'Unarmed') || cd.attacks[0]; const e = rollCheck({ who: c.identity?.codename || 'Companion', label: `${a.name} attack`, mod: a.bonus ?? 0, note: `${a.effect} ${a.rank}` }); toast(e.text); } }, '🎲 Attack') : null,
        h('button', { class: 'btn sm', type: 'button', onClick: () => opts.openCompanion?.(i) }, 'Sheet'));
    }))) : null;

  const log = recent.length ? h('section', { class: 'play-card' }, h('h3', null, 'Recent rolls'), h('ol', { class: 'play-log' }, recent.map((t) => h('li', null, t)))) : null;

  return h('div', { class: 'play' }, status, defenses, attacks, skills, conditions, powers, companions, log);
}
