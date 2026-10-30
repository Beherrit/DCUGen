// A campaign turn: every team still standing acts once, in a seeded order. It recovers if it was resting; otherwise it
// finds the nearest other team and fights it (next door), rests (hurt) or marches one cell toward it.

import { makeRng } from '../rng.js';
import { standingTeams, teamById, fighters, hurtCount, outCount, terrainOf } from './war.js';
import { cellName } from './terrain.js';
import { planFight, playFight, applyOutcome, fightHeadline, fightResultLine, fightLabel } from './fight.js';

const NEVER_REST = new Set(['alpha', 'noretreat']);
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const note = (war, kind, text, extra = {}) => war.log.push({ turn: war.turn, kind, text, ...extra });

/** A team that never rests only does so when nobody is left standing. */
const stubborn = (team) => NEVER_REST.has(team.tactic) && fighters(team).length > 0;

/** Rest instead of marching: Sustain when anyone is hurt, or any team that is mostly out. */
export function restsBeforeMarching(team) {
  if (stubborn(team)) return false;
  return (team.tactic === 'sustain' && hurtCount(team) > 0) || outCount(team) * 2 > team.members.length || fighters(team).length === 0;
}

/** Rest after a fight: at least half the members hurt or out; Sustain when anyone is hurt; Alpha and No Retreat never. */
export function restsAfterFight(team) {
  if (stubborn(team)) return false;
  if (team.tactic === 'sustain') return hurtCount(team) > 0;
  return hurtCount(team) * 2 >= team.members.length;
}

function startRest(war, team, why) {
  team.resting = true;
  note(war, 'rest', `Turn ${war.turn}: ${team.name} ${why} at ${cellName(team.x, team.y)}, ${terrainOf(war, team) === 'park' ? 'hidden in the park' : 'to rest'}.`);
}

/** A resting team gets up: knocked-out members come back and bruises and fatigue clear. */
function recover(war, team) {
  const back = outCount(team);
  team.state = team.members.map(() => ({ out: false, bruises: 0, fatigue: 0 }));
  team.resting = false;
  note(war, 'recover', `Turn ${war.turn}: ${team.name} recover${back ? ` and bring back ${back} ${back === 1 ? 'fighter' : 'fighters'}` : ''} at ${cellName(team.x, team.y)}.`);
}

/** The nearest other team still in the war; ties are broken by the turn's random stream. */
function nearestFoe(war, team, rng) {
  const others = standingTeams(war).filter((t) => t.id !== team.id);
  const best = Math.min(...others.map((t) => dist(team, t)));
  return rng.pick(others.filter((t) => dist(team, t) === best));
}

/** One cell toward a foe, 8-way; a taken cell is walked around if the cell beside it is closer, else the team stays. */
function march(war, team, foe) {
  const dx = Math.sign(foe.x - team.x); const dy = Math.sign(foe.y - team.y);
  const tries = [[dx, dy], [dx, 0], [0, dy]].filter(([a, b]) => a || b);
  const taken = (x, y) => standingTeams(war).some((t) => t.x === x && t.y === y) || x < 0 || y < 0 || x >= war.size || y >= war.size;
  const to = tries.map(([a, b]) => ({ x: team.x + a, y: team.y + b })).find((p) => !taken(p.x, p.y));
  if (!to) return;
  team.x = to.x; team.y = to.y;
  note(war, 'move', `Turn ${war.turn}: ${team.name} move to ${cellName(to.x, to.y)}, toward ${foe.name}.`);
}

/** A team that got away leaves the city: it is out of the war without having been beaten. */
function leaveCity(war, team) {
  team.status = 'out'; team.left = true; team.resting = false; team.outTurn = war.turn;
  note(war, 'out', `Turn ${war.turn}: ${team.name} get away and leave the city.`);
}

function eliminate(war, team) {
  team.status = 'out'; team.resting = false; team.outTurn = war.turn;
  note(war, 'out', `Turn ${war.turn}: ${team.name} are out of the war.`);
}

/** After a fight each team still in decides whether to rest; the winner decides, and in a stalemate both do. */
function afterFight(war, teams) {
  for (const t of teams) {
    t.resting = false;
    if (restsAfterFight(t)) startRest(war, t, 'are battered and stop');
  }
}

/** The defender has nobody standing: the attacker walks over it without a fight. */
function overrun(war, attacker, defender) {
  attacker.won++;
  note(war, 'out', `Turn ${war.turn}: ${attacker.name} overrun ${defender.name} at ${cellName(defender.x, defender.y)}: nobody was left standing to fight.`);
  eliminate(war, defender);
}

/** Fight the team next door. onFight(battle, rec, war) lets the caller keep the finished battle. */
function fight(war, R, attacker, defender, onFight) {
  if (!fighters(defender).length) { overrun(war, attacker, defender); return; }
  const rec = planFight(war, attacker, defender);
  const head = fightHeadline(war, rec);
  const b = playFight(war, R, rec);
  applyOutcome(war, b, rec);
  war.battles.push(rec);
  note(war, 'fight', `${head} ${fightResultLine(war, rec)}`, { battle: rec.n });
  if (onFight) onFight(b, rec, war, fightLabel(war, rec));
  if (!rec.winner) { afterFight(war, [attacker, defender]); return; }
  const [won, lost] = rec.winner === 'A' ? [attacker, defender] : [defender, attacker];
  // Getting away (Fighting Withdrawal) defeats nobody. The runners leave the city: out of the war, but not beaten,
  // and their pursuers get no win. (Slipping one block away only led to the same chase every turn.)
  if (rec.gotAway) { leaveCity(war, won); afterFight(war, [lost]); return; }
  won.won++;
  eliminate(war, lost);
  afterFight(war, [won]);
}

function actTeam(war, R, team, rng, onFight) {
  if (team.resting) { recover(war, team); return; }
  if (!fighters(team).length) { startRest(war, team, 'have nobody standing and stop'); return; }
  const foe = nearestFoe(war, team, rng);
  if (dist(team, foe) === 1) fight(war, R, team, foe, onFight);
  else if (restsBeforeMarching(team)) startRest(war, team, 'are hurt and stop');
  else march(war, team, foe);
}

function finish(war) {
  war.status = 'over';
  const left = standingTeams(war);
  war.winner = left.length === 1 ? left[0].id : null;
  const w = teamById(war, war.winner);
  note(war, 'end', w ? `Turn ${war.turn}: ${w.name} are the last team standing.` : `Turn ${war.turn}: the war ends with ${left.length} teams still standing.`);
}

/** Play one campaign turn. Returns true while the war is still going. opts: { onFight(battle, record, war, label) }. */
export function stepCity(war, R, { onFight } = {}) {
  if (war.status === 'over') return false;
  if (standingTeams(war).length < 2) { finish(war); return false; }
  war.status = 'running';
  war.turn++;
  const rng = makeRng(`${war.seed}::turn::${war.turn}`);
  for (const id of rng.shuffle(standingTeams(war).map((t) => t.id))) {
    const team = teamById(war, id);
    if (team.status !== 'alive') continue;
    if (standingTeams(war).length < 2) break;
    actTeam(war, R, team, rng, onFight);
  }
  if (standingTeams(war).length < 2) finish(war);
  return war.status !== 'over';
}
