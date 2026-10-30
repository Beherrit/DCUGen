// A finished fight kept as a compact record: who fought, how it went, per-fighter numbers and the whole log.
// Pure data in, plain JSON out, so a record can be stored, listed, replayed in a viewer and counted on a leaderboard.

import { statusLine } from '../battle/summaries.js';
import { tacticOf } from '../battle/tactics-list.js';
import { MAX_ROUNDS } from '../battle/constants.js';

export const SOURCES = ['battle-room', 'city-war', 'tournament'];
export const SOURCE_LABELS = { 'battle-room': 'Battle Room', 'city-war': 'City war', tournament: 'Tournament' };

/** A short stable hash of some text (FNV-1a, base 36). */
export function hashText(text) {
  let x = 0x811c9dc5;
  for (const ch of String(text)) { x ^= ch.codePointAt(0); x = Math.imul(x, 0x01000193) >>> 0; }
  return x.toString(36);
}

/** Who a fighter is across fights: the roster id when it has one, else a hash of its name and PL. */
export function characterKey(c) {
  const rid = c.ch?.rosterId;
  if (rid) return `r:${rid}`;
  return `n:${hashText(`${String(c.name || '').trim().toLowerCase()}|${c.pl}`)}`;
}

/** How the fighter ended: still standing, knocked out (or down), fled, or got away under a withdrawal. */
export function endOf(c) {
  if (c.fled) return c.escaped ? 'got-away' : 'fled';
  return c.out ? 'out' : 'standing';
}

function fighterOf(b, c, i) {
  const s = c.stats || {};
  return {
    i, id: c.id, name: c.name, key: characterKey(c), pl: c.pl, style: c.style, tactic: tacticOf(b, c),
    stats: { attacks: s.attacks || 0, hits: s.hits || 0, crits: s.crits || 0, kos: s.kos || 0, dealt: s.degrees || 0, taken: s.taken || 0, healed: s.healed || 0 },
    end: endOf(c), status: statusLine(c),
  };
}

/** The log entries without the engine's internal fields. A key-moment flag is kept so the viewer can filter. */
export function trimLog(log) {
  return (log || []).map((e) => {
    const o = { round: e.round, kind: e.kind, actor: e.actor || null, target: e.target || null, text: e.text || '' };
    if (e.dice?.length) o.dice = e.dice.map((d) => ({ ...d }));
    if (e.important) o.important = true;
    return o;
  });
}

function optionsOf(b) {
  const o = b.options || {};
  return {
    enclosed: !!o.enclosed, ambush: o.ambush || null, tactics: { ...(o.teamTactics || {}) },
    knockback: !!o.knockback, shootThrough: !!o.shootThrough, lethal: !!o.lethal, environment: o.environment || null,
    scale: o.enclosed ? 'street' : o.scale || 'block', // grid square size: street 5 ft, block 30 ft, district 250 ft, or custom
    squareFt: o.enclosed ? 5 : o.scale === 'custom' ? Math.round(Number(o.squareFt)) || 30 : { street: 5, block: 30, district: 250 }[o.scale || 'block'] || 30,
    cover: (b.cover || []).map((p) => p.name),
  };
}

/** Stable id from the seed and a counter (the Nth record kept for that seed). */
export function recordId(seed, counter = 1) {
  const safe = String(seed || 'fight').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'fight';
  return `${safe}-${hashText(seed)}-${counter}`;
}

/**
 * A compact record of a finished battle. opts: { source, label, date (ISO text, default now), counter }.
 * Teams map a letter to its fighters; the log is kept whole.
 */
export function fightRecord(b, { source = 'battle-room', label = '', date, counter = 1 } = {}) {
  const teams = {};
  b.combatants.forEach((c, i) => { if (!c.summon) (teams[c.team] ||= []).push(fighterOf(b, c, i)); }); // called minions are in the log, not on the roster
  const max = b.options?.maxRounds || MAX_ROUNDS;
  return {
    v: 1, id: recordId(b.seed, counter), date: date || new Date().toISOString(), source, label: label || '',
    name: b.name || 'Battle', seed: String(b.seed), options: optionsOf(b), teams,
    result: { winner: b.winner || null, gotAway: !!b.gotAway, rounds: Math.max(1, Math.min(b.round, max)) },
    log: trimLog(b.log),
  };
}
