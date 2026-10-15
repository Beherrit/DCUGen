// Turns at the table: what a character's conditions let them do when their turn comes, and what the end
// of their turn does (DCA, as the Battle Room plays it): a resistance check against each Affliction to shake
// it off, Dazed from damage wearing off after their next turn, weakened traits coming back a point a round,
// and Surprised ending. Works on the play state (ch.play), so each player's own app rolls for their own
// character, the way hits are resolved (engine/gmboard.js).

import { deriveAll } from './derive.js';
import { playState, effectiveDefenses } from './play.js';

/** What each condition means for the turn, in a line. */
export const CONDITION_NOTES = {
  Dazed: 'one standard action (plus free actions) this turn',
  Staggered: 'dazed and hindered: one standard action, half speed',
  Stunned: 'no actions this turn',
  Hindered: 'half speed',
  Immobile: 'can\'t move from this spot',
  Vulnerable: 'Dodge and Parry are halved',
  Defenseless: 'Dodge and Parry are 0',
  Impaired: '−2 on checks',
  Disabled: '−5 on checks',
  Prone: 'hindered; −5 on close attacks; standing up is a move action',
  Fatigued: 'hindered',
  Exhausted: 'impaired and hindered',
  Surprised: 'stunned and vulnerable until the end of this turn',
  Entranced: 'only free actions, until threatened',
  Compelled: 'one standard action, chosen by whoever controls you',
  Controlled: 'whoever controls you decides your actions',
  Blind: 'can\'t see: visual concealment on everything',
  Deaf: 'can\'t hear',
  Unaware: 'can\'t perceive anything',
  Asleep: 'unaware and defenseless until woken',
  Bound: 'defenseless, immobile and impaired',
  Restrained: 'hindered and vulnerable',
  Paralyzed: 'defenseless, immobile and physically helpless',
  Transformed: 'changed into something else',
  Weakened: 'traits lowered for now; they come back a point a round',
  Incapacitated: 'out of the fight: defenseless, stunned and unaware',
};

const NO_ACTION = ['Stunned', 'Incapacitated', 'Asleep', 'Paralyzed', 'Unaware', 'Surprised'];

/** Every condition on a play state, damage and fatigue included, in display form. */
export function allConditions(play) {
  const s = playState({ play });
  const cap = (x) => x[0].toUpperCase() + x.slice(1);
  return [...(s.damage !== 'none' ? [cap(s.damage)] : []), ...s.conditions, ...(s.fatigue !== 'none' ? [cap(s.fatigue)] : [])];
}

/**
 * The reminder when a character's turn starts: { lines: ['Dazed: one standard action…'], canAct, tip }.
 * tip suggests a hero point when one would get them out of it.
 */
export function turnReminder(play) {
  const s = playState({ play });
  const conds = allConditions(play);
  const lines = conds.filter((c) => CONDITION_NOTES[c]).map((c) => `${c}: ${CONDITION_NOTES[c]}`);
  const canAct = !conds.some((c) => NO_ACTION.includes(c));
  const shakeable = conds.filter((c) => ['Dazed', 'Stunned', 'Fatigued', 'Staggered', 'Exhausted'].includes(c));
  const tip = shakeable.length && s.heroPoints > 0 && s.damage !== 'incapacitated'
    ? `A hero point can help you recover from ${shakeable.join(' and ').toLowerCase()} (you have ${s.heroPoints}).` : null;
  return { lines, canAct, tip };
}

const d20 = () => 1 + Math.floor(Math.random() * 20);
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The end of a character's turn. roll() returns a d20 (pass a seeded one in tests).
 * Returns { play, text, dice, changed } where text says what happened ('' when nothing did).
 */
export function endOfTurn(ch, R, roll = d20) {
  const d = deriveAll(ch, R);
  const s = playState(ch);
  const def = effectiveDefenses(d, s);
  const name = ch.identity?.codename || 'Someone';
  const play = { ...s, conditions: [...s.conditions] };
  const said = [];
  const dice = [];

  // Afflictions: one resistance check each to shake it off.
  const keep = [];
  for (const a of s.afflictions || []) {
    const mod = def[a.resist] ?? null;
    if (mod == null) { said.push(`immune to ${a.label} now (${a.resist})`); continue; }
    const r = roll(); const total = r + mod;
    dice.push({ label: `Recover (${a.resist})`, roll: r, mod, total, dc: a.dc });
    if (r === 20 || total >= a.dc) said.push(`shakes off ${a.label}: ${a.resist} d20 ${r} ${sign(mod)} = ${total} vs DC ${a.dc}`);
    else { keep.push(a); said.push(`fails to shake off ${a.label}: ${a.resist} d20 ${r} ${sign(mod)} = ${total} vs DC ${a.dc}`); }
  }
  if ((s.afflictions || []).length) {
    // Conditions only an affliction gave go when the last affliction giving them does.
    const still = new Set(keep.flatMap((a) => a.conditions));
    for (const a of s.afflictions) {
      if (keep.includes(a)) continue;
      for (const c of a.conditions) {
        if (still.has(c)) continue;
        if (c === 'Incapacitated') { if (play.damage === 'incapacitated' && !a.wasOut) play.damage = 'none'; }
        else play.conditions = play.conditions.filter((x) => x !== c);
      }
    }
    play.afflictions = keep;
    if (!keep.length) delete play.afflictions;
  }

  // Dazed from damage: until the end of their next turn.
  if (s.dazedTurns != null) {
    const left = s.dazedTurns - 1;
    if (left < 0) { if (play.damage === 'dazed') { play.damage = 'none'; said.push('is no longer dazed'); } delete play.dazedTurns; }
    else play.dazedTurns = left;
  }

  // Weakened traits come back a point a round.
  if (s.weakened && Object.keys(s.weakened).length) {
    const w = {};
    for (const [k, v] of Object.entries(s.weakened)) if (v - 1 > 0) w[k] = v - 1;
    const back = Object.keys(s.weakened).filter((k) => !w[k]);
    if (Object.keys(w).length) play.weakened = w; else { delete play.weakened; play.conditions = play.conditions.filter((x) => x !== 'Weakened'); }
    said.push(back.length ? `${back.join(', ')} fully back` : 'weakened traits recover a point');
  }

  // Surprise lasts one turn.
  if (play.conditions.includes('Surprised')) { play.conditions = play.conditions.filter((x) => x !== 'Surprised'); said.push('is no longer surprised'); }

  const changed = said.length > 0;
  return { play, changed, dice, text: changed ? `${name}, end of turn: ${said.join('; ')}.` : '' };
}

// ---- the turn order shared with the table ----------------------------------------------------------------

/**
 * What the GM sends the table about initiative: small, names only. order: [{ key, name, total }].
 * Returns { order, turn, round, now, next } with now and next as entries (or null).
 */
export function initView(init) {
  if (!init?.order?.length) return null;
  const n = init.order.length;
  const turn = Math.min(Math.max(0, init.turn || 0), n - 1);
  return {
    order: init.order.map((o) => ({ key: o.key, name: o.name, total: o.total })),
    turn, round: init.round || 1,
    now: init.order[turn] || null,
    next: n > 1 ? init.order[(turn + 1) % n] : null,
  };
}

/** Move the acting character to after the next one (Delay). Returns a new init. */
export function delayTurn(init) {
  if (!init?.order?.length || init.order.length < 2) return init;
  const order = [...init.order];
  const [me] = order.splice(init.turn, 1);
  const at = Math.min(init.turn + 1, order.length);
  order.splice(at, 0, me);
  // The next character now acts in this slot (same turn index); the round stays.
  return { ...init, order };
}

/** Advance to the next turn: { turn, round, ended } where ended is the entry whose turn just ended. */
export function advanceTurn(init) {
  if (!init?.order?.length) return init;
  const ended = init.order[init.turn] || null;
  let turn = init.turn + 1; let round = init.round || 1;
  if (turn >= init.order.length) { turn = 0; round += 1; }
  return { ...init, turn, round, ended };
}

/** One line per character for the players' party view: no numbers they shouldn't see about villains. */
export function partyEntry(status, player) {
  const p = status.play || {};
  return {
    key: status.rosterId, name: status.name, color: status.color, player: player || null,
    heroPoints: p.heroPoints ?? 1, bruises: p.bruises || 0,
    conditions: allConditions(p),
    out: p.damage === 'incapacitated',
  };
}
