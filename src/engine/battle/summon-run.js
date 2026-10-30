// Carrying out a Summon or Duplication: the minion appears beside the summoner, joins the initiative order and acts from the
// next round; the Command action (p175); and the minions vanishing when the summoner can no longer keep the effect up.

import { log, byId, d20 } from './util.js';
import { makeCombatant } from './combatant.js';
import { rollCheck, critNote } from './checks.js';
import { resistOf } from './conditions.js';
import { squares } from './geometry.js';
import { isOpenSquare } from './path.js';
import { joinSpot } from './placement.js';
import { spotName } from './grid.js';
import { minionOf, minionName } from './summon-build.js';
import { summonRoom, liveSummons, uncommanded } from './summon.js';

const RING = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

/** The open square beside the summoner nearest the foes, preferring one nobody stands on; the summoner's own square when none is open. */
function squareBeside(b, c, foes) {
  const free = RING.map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy })).filter((p) => isOpenSquare(b, p.x, p.y));
  const empty = free.filter((p) => !b.combatants.some((o) => !o.out && o.x === p.x && o.y === p.y));
  const pool = empty.length ? empty : free;
  if (!pool.length) return { x: c.x, y: c.y };
  const near = (p) => (foes.length ? Math.min(...foes.map((f) => squares(p, f))) : 0);
  return pool.reduce((best, p) => (near(p) < near(best) ? p : best), pool[0]);
}

/** Put the new minion in the initiative order where its roll puts it. A place already passed this round just moves the pointer on. */
function enterOrder(b, m) {
  let i = b.order.findIndex((id) => (byId(b, id)?.init ?? -Infinity) < m.init);
  if (i < 0) i = b.order.length;
  b.order.splice(i, 0, m.id);
  if (i < b.turn) b.turn += 1;
}

/** The fighter for the n-th minion of a power, placed and entered in the order. */
function makeMinion(b, R, c, s, rng, n) {
  const ch = minionOf(R, c, s, n, b.seed);
  const label = ch.identity.codename || minionName(s);
  const same = b.combatants.filter((x) => x.name === label || x.name.startsWith(`${label} #`)).length;
  const m = makeCombatant(R, ch, { id: `${c.id}-m${(c.summoned || []).length + 1}`, team: c.team, name: `${label} #${same + 1}`, ...(s.heroic ? { style: 'duelist' } : {}) });
  m.summon = { by: c.id, power: s.name, rank: s.rank, since: b.round, needsOrders: !(s.active || s.duplicate), commanded: false, duplicate: s.duplicate, heroic: s.heroic, calling: s.calling, sacrifice: s.sacrifice, feedback: s.feedback };
  m.summonDazed = !s.active;
  const at = s.calling ? joinSpot(b, c.team) : squareBeside(b, c, b.combatants.filter((x) => x.team !== c.team && !x.out && !x.fled));
  m.x = at.x; m.y = at.y;
  m.initRoll = d20(rng); m.init = m.initRoll + m.initBonus;
  b.combatants.push(m);
  c.summoned.push(m.id);
  enterOrder(b, m);
  return m;
}

/** A Resistible summon: the minion rolls Will against 10 + rank; a success means no minion and no second try in the scene. */
function minionResists(b, R, c, s, rng) {
  if (!s.resistible) return false;
  const probe = makeCombatant(R, minionOf(R, c, s, 0, b.seed), { id: `${c.id}-probe`, team: c.team, name: 'the minion' });
  const will = resistOf(probe, s.resistible) ?? 0;
  const dc = 10 + s.rank;
  const r = rollCheck(rng, will, dc);
  const text = `${c.name} calls on ${s.name}, Resistible: the minion rolls ${s.resistible} d20 ${r.roll} ${will >= 0 ? '+' : ''}${will} = ${r.total} vs DC ${dc}${critNote(r)}`;
  if (!r.success) { log(b, { kind: 'note', actor: c.id, text: `${text} — it fails and must come.` }); return false; }
  (c.resistedSummon ||= {})[s.name] = true;
  log(b, { kind: 'miss', actor: c.id, text: `${text} — it resists and does not come. ${c.name} cannot try again this fight without extra effort.`, important: true });
  return true;
}

/** How many minions one use of the power calls: all that are left with Horde, else one. */
export const batchSize = (b, c, s) => (s.horde ? summonRoom(b, c, s) : Math.min(1, summonRoom(b, c, s)));

/** Use the power (a standard action). Returns the minions that came. */
export function callSummons(b, R, c, s, rng) {
  c.summoned ||= [];
  if (minionResists(b, R, c, s, rng)) return [];
  const n = batchSize(b, c, s);
  const came = [];
  for (let k = 0; k < n; k++) came.push(makeMinion(b, R, c, s, rng, (c.summoned || []).length + 1));
  if (!came.length) return came;
  const first = came[0];
  const what = s.duplicate ? `a duplicate of itself (power level ${first.pl})` : came.length > 1 ? `${came.length} minions` : first.name;
  const how = s.calling ? `they hear the call and walk in from the edge (Calling)` : `at ${spotName(first)}`;
  const state = s.active ? 'with a full set of actions' : 'dazed, one standard action a round';
  log(b, { kind: 'note', actor: c.id, text: `${c.name} uses ${s.name} (rank ${s.rank}) and calls ${what}, built on ${s.rank * 15} points: ${how}, ${state}, acting from the next round.${s.horde && came.length > 1 ? ` Horde: ${c.name} is vulnerable until the next turn.` : ''}`, important: true });
  if (s.horde && came.length > 1) c.distracted = true;
  return came;
}

/** The Command action (p175), a move action: orders to every minion that waits for them ("attack"), which stand until the task is done. */
export function issueCommand(b, c) {
  const waiting = uncommanded(b, c);
  if (!waiting.length) return false;
  for (const m of waiting) m.summon.commanded = true;
  log(b, { kind: 'note', actor: c.id, text: `${c.name} commands ${waiting.length > 1 ? `${waiting.length} minions` : waiting[0].name} to attack (Command, a move action).` });
  return true;
}

/** Skip this fighter's turn? A minion does not act on the round it came, and without orders it waits for them. True when the turn is lost. */
export function summonSkip(b, c) {
  const s = c.summon;
  if (!s) return false;
  if (b.round <= s.since) return true;
  if (s.needsOrders && !s.commanded) {
    log(b, { kind: 'skip', actor: c.id, text: `${c.name} waits for ${byId(b, s.by)?.name || 'its summoner'}'s orders.` });
    return true;
  }
  return false;
}

/** The summoner is out (or gone): sustained summons end. A Calling minion that was already down stays where it fell. Called before every end check. */
export function summonUpkeep(b) {
  for (const c of b.combatants) {
    if (!c.summoned?.length || !(c.out || c.fled)) continue;
    const gone = liveSummons(b, c);
    for (const m of gone) { m.out = true; m.vanished = true; m.outReason = 'vanished'; }
    if (gone.length) log(b, { kind: 'ko', actor: c.id, text: `${c.name} can no longer keep ${gone.length > 1 ? 'the summons' : gone[0].summon.duplicate ? 'the duplicate' : 'the summon'} up: ${gone.map((m) => m.name).join(', ')} vanish${gone.length > 1 ? '' : 'es'}.`, important: true });
  }
}
