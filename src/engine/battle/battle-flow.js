// The battle itself: setting it up, starting it, ambush, joining late, and stepping through the rounds.

import { clamp, rngFor, d20, log, byId, alive, enemiesOf } from './util.js';
import { arenaOf, MAX_ROUNDS } from './constants.js';
import { STYLES } from './styles.js';
import { resetCombatant, rebuildCombatant } from './combatant.js';
import { takeTurn } from './turn.js';
import { regenerate } from './support.js';
import { endOfTurn } from './end-of-turn.js';
import { announceTactics } from './tactics.js';

export function createBattle({ seed = 'battle', name = 'Battle' } = {}) {
  return { seed, name, tick: 0, round: 0, turn: 0, order: [], combatants: [], log: [], status: 'setup', winner: null, options: { minionRule: true, heroPoints: true, extraEffort: true, enclosed: false, ambush: null, teamTactics: {}, vip: {}, maxRounds: MAX_ROUNDS }, lastEvent: 0 };
}

export function addCombatant(b, c) {
  b.combatants.push(c);
  if (b.status === 'setup') placeAll(b);
  return c;
}

export function removeCombatant(b, id) {
  b.combatants = b.combatants.filter((c) => c.id !== id);
  b.order = b.order.filter((x) => x !== id);
  if (b.status === 'setup') placeAll(b);
}

/** Teams start on opposite sides of the arena (a third or fourth team in between). */
export function placeAll(b) {
  const teams = [...new Set(b.combatants.map((c) => c.team))].sort();
  const arena = arenaOf(b);
  const spots = { [teams[0]]: arena >= 4 ? 1 : 0, [teams[1]]: arena >= 4 ? arena - 2 : arena - 1, [teams[2]]: Math.max(0, Math.floor(arena / 2) - 1), [teams[3]]: Math.floor(arena / 2) };
  const seen = {};
  for (const c of b.combatants) {
    const base = spots[c.team] ?? Math.floor(arena / 2);
    const n = (seen[c.team] = (seen[c.team] || 0) + 1);
    const spread = arena < 4 ? 0 : [0, -1, 1][n % 3] * (n > 3 ? 0 : 1);
    c.pos = clamp(base + (c.team === teams[0] ? Math.max(0, spread) : c.team === teams[1] ? Math.min(0, spread) : spread), 0, arena - 1);
  }
}

/** Roll initiative and start the fight. */
export function startBattle(b, R) {
  if (b.combatants.length < 2 || new Set(b.combatants.map((c) => c.team)).size < 2) throw new Error('Put fighters on at least two teams first.');
  b.log = []; b.tick = 0; b.round = 1; b.turn = 0; b.winner = null;
  for (const c of b.combatants) { resetCombatant(c); rebuildCombatant(c, R); }
  placeAll(b);
  const rng = rngFor(b);
  for (const c of b.combatants) {
    c.initRoll = d20(rng);
    c.init = c.initRoll + c.initBonus + (c.adv['Seize Initiative'] ? 100 : 0);
  }
  b.order = [...b.combatants].sort((x, y) => y.init - x.init || y.initBonus - x.initBonus || x.name.localeCompare(y.name)).map((c) => c.id);
  b.status = 'running';
  const amb = applyAmbush(b);
  if (b.options.enclosed) log(b, { kind: 'note', text: 'Enclosed space: a room or corridor. Everyone starts within one move and nobody can keep their distance.' });
  if (amb) log(b, { kind: 'note', text: `Ambush: team ${amb} catches the others off guard. Surprise round: only team ${amb} acts, and the surprised are vulnerable until they act.` });
  announceTactics(b);
  log(b, { kind: 'round', text: `Round 1 begins. ${b.combatants.length} fighters, ${new Set(b.combatants.map((c) => c.team)).size} sides.`, important: true });
  log(b, { kind: 'init', text: `Initiative: ${b.order.map((id) => { const c = byId(b, id); return `${c.name} ${c.init - (c.adv['Seize Initiative'] ? 100 : 0)}${c.adv['Seize Initiative'] ? ' (Seize Initiative, goes first)' : ''}`; }).join(', ')}.`, dice: b.order.map((id) => { const c = byId(b, id); return { label: `${c.name} initiative`, roll: c.initRoll, mod: c.initBonus, total: c.initRoll + c.initBonus }; }) });
  return b;
}

/** The surprise round is over: the surprised recover and the ambushers get full turns again. */
function endSurprise(b) {
  for (const c of b.combatants) {
    c.surpriseActor = false;
    if (!c.conditions.some((x) => x.source === 'surprise')) continue;
    c.conditions = c.conditions.filter((x) => x.source !== 'surprise');
    if (!c.out && !c.fled) log(b, { kind: 'recover', actor: c.id, text: `${c.name} recovers from the surprise.` });
  }
}

/** One team catches the rest off guard: ambushers close in, everyone else is surprised. Returns the team letter, or null if nothing applies. */
function applyAmbush(b) {
  const amb = b.options.ambush;
  const ambushers = amb ? alive(b).filter((c) => c.team === amb) : [];
  if (!ambushers.length) return null;
  const arena = arenaOf(b);
  for (const c of ambushers) {
    const foes = enemiesOf(b, c);
    if (!foes.length) continue;
    const e = foes.reduce((best, x) => (Math.abs(c.pos - x.pos) < Math.abs(c.pos - best.pos) ? x : best), foes[0]);
    // Ambushers are already in position: melee in the target's zone, ranged one zone off (no range penalty).
    const S = STYLES[c.style] || {};
    const ranged = c.attacks.some((a) => a.kind !== 'close') && (S.ranged ?? 1) >= (S.close ?? 1);
    c.pos = ranged ? clamp(e.pos + (e.pos <= arena / 2 ? 1 : -1), 0, arena - 1) : e.pos;
    c.surpriseActor = true;
  }
  for (const c of alive(b).filter((x) => x.team !== amb)) {
    // Surprised: stunned and vulnerable until the next round (DCA 167). Uncanny Dodge removes only the vulnerable part.
    if (c.adv['Uncanny Dodge']) {
      log(b, { kind: 'note', text: `${c.name} keeps their guard up (Uncanny Dodge): surprised, but not vulnerable.` });
      c.conditions.push({ name: 'Stunned', degree: 1, source: 'surprise', label: 'surprised', from: null });
    } else c.conditions.push({ name: 'Surprised', degree: 1, source: 'surprise', label: 'surprised', from: null });
  }
  return amb;
}
/** Throw a fighter into a battle that is already running: they roll initiative and act at the end of this round. */
export function joinBattle(b, R, c) {
  if (b.status !== 'running') return addCombatant(b, c);
  b.combatants.push(c);
  resetCombatant(c); rebuildCombatant(c, R);
  const teams = [...new Set(b.combatants.map((x) => x.team))].sort();
  const arena = arenaOf(b);
  c.pos = c.team === teams[0] ? 0 : c.team === teams[1] ? arena - 1 : Math.floor(arena / 2);
  const rng = rngFor(b);
  c.initRoll = d20(rng); c.init = c.initRoll + c.initBonus;
  b.order.push(c.id);
  log(b, { kind: 'init', text: `${c.name} joins the fight on team ${c.team} (initiative ${c.init}).`, important: true });
  return c;
}
function checkOver(b) {
  const teams = new Set(alive(b).map((c) => c.team));
  if (teams.size <= 1) {
    b.status = 'over';
    b.winner = teams.size ? [...teams][0] : null;
    const names = alive(b).map((c) => c.name).join(', ');
    log(b, { kind: 'end', text: b.winner ? `The fight is over. Team ${b.winner} wins${names ? `: ${names} ${alive(b).length === 1 ? 'is' : 'are'} still standing` : ''}.` : 'Everyone is down. Nobody wins.', important: true });
    return true;
  }
  if (b.round > b.options.maxRounds) {
    b.status = 'over'; b.winner = null;
    log(b, { kind: 'end', text: `${b.options.maxRounds} rounds and no decision: the fight ends in a stalemate.`, important: true });
    return true;
  }
  return false;
}

/** Play one combatant's turn. Returns the number of log entries added. */
export function step(b, R) {
  if (b.status === 'setup') startBattle(b, R);
  if (b.status !== 'running') return 0;
  const before = b.log.length;
  if (b.turn >= b.order.length) {
    b.turn = 0;
    b.round += 1;
    if (checkOver(b)) return b.log.length - before;
    log(b, { kind: 'round', text: `Round ${b.round}.`, important: true });
    if (b.round === 2) endSurprise(b);
    for (const c of alive(b)) regenerate(b, c);
  }
  const c = byId(b, b.order[b.turn]);
  b.turn += 1;
  if (!c || c.out || c.fled) return b.log.length - before;
  // Joined an earlier team attack this round: that was this fighter's turn (they delayed into it).
  if (c.teamedRound === b.round) return b.log.length - before;
  const rng = rngFor(b);
  if (c.conditions.some((x) => x.source === 'surprise')) log(b, { kind: 'skip', actor: c.id, text: `${c.name} is surprised and loses the round.` });
  else {
    try { takeTurn(b, R, c, rng); } catch (e) { log(b, { kind: 'note', actor: c.id, text: `${c.name} hesitates (${e.message}).` }); }
  }
  endOfTurn(b, c, rng);
  checkOver(b);
  return b.log.length - before;
}

export function runRound(b, R) {
  const start = b.round;
  let guard = 0;
  while (b.status === 'running' && (b.round === start || b.turn === 0) && guard++ < 200) {
    step(b, R);
    if (b.round !== start && b.turn === 0) break;
  }
}

export function runToEnd(b, R) {
  let guard = 0;
  while (b.status !== 'over' && guard++ < 5000) step(b, R);
  return b;
}
