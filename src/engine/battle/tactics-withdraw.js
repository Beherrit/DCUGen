// The Fighting Withdrawal tactic: the team's goal is to get away. Fighters walk to their own edge of the grid and
// leave from it; tanks and Interpose holders cover the retreat. The team wins by escaping, or by holding out.

import { log, alive } from './util.js';
import { squaresInMove, inReach } from './geometry.js';
import { teamsOf } from './placement.js';
import { tacticOf } from './tactics-list.js';
import { stepToSquare } from './tactics-position.js';
import { releaseHolds } from './maneuvers.js';

/** Tanks and Interpose holders form the rearguard. */
export const isRearguard = (c) => c.style === 'tank' || !!c.adv.Interpose;

const isWithdrawing = (b, c) => tacticOf(b, c) === 'withdraw';

/**
 * A team's own edge of the grid: team A the west edge, B the east, C the north, D the south; other teams use the edge
 * nearest their fighter. { axis, value, inward }: the coordinate that is fixed on the edge, and the way into the grid.
 */
export function edgeOf(b, c) {
  const { x0, y0, x1, y1 } = b.grid.play;
  const edges = [{ axis: 'x', value: x0, inward: 1 }, { axis: 'x', value: x1, inward: -1 }, { axis: 'y', value: y0, inward: 1 }, { axis: 'y', value: y1, inward: -1 }];
  const i = teamsOf(b).indexOf(c.team);
  if (i >= 0 && i < 4) return edges[i];
  return edges.reduce((best, e) => (Math.abs(c[e.axis] - e.value) < Math.abs(c[best.axis] - best.value) ? e : best), edges[0]);
}
/** Is the fighter on any square of its own edge? */
export const onEdge = (b, c) => c[edgeOf(b, c).axis] === edgeOf(b, c).value;
/** The square on the edge straight across from the fighter's own. */
const edgeSquare = (c, edge) => ({ x: c.x, y: c.y, [edge.axis]: edge.value });
/** The rearguard stays one square in front (toward the enemy) of the rest of the team; with no rest left it walks out too. */
function rearGoal(b, c, edge) {
  const rest = alive(b).filter((x) => x.team === c.team && x !== c && !isRearguard(x));
  if (!rest.length) return edgeSquare(c, edge);
  const far = Math.max(...rest.map((x) => Math.abs(x[edge.axis] - edge.value)));
  const span = Math.abs(b.grid.play.x1 - b.grid.play.x0);
  return { ...edgeSquare(c, edge), [edge.axis]: edge.value + edge.inward * Math.min(far + 1, span) };
}
/**
 * A withdrawing fighter's turn: leave if it starts the turn on its edge and is free to go, otherwise walk toward the edge
 * (the rearguard toward its post). True when that used up the turn; false when the fighter has to fight instead
 * (it cannot move, or it is the rearguard and already in place).
 */
export function withdrawTurn(b, c) {
  if (!isWithdrawing(b, c) || !squaresInMove(b, c)) return false;
  const edge = edgeOf(b, c);
  if (onEdge(b, c) && !c.grabbedBy) {
    releaseHolds(b, c);
    c.escaped = true; c.fled = true;
    log(b, { kind: 'flee', actor: c.id, text: `${c.name} reaches the edge and gets away.`, important: true });
    return true;
  }
  const rear = isRearguard(c);
  const goal = rear ? rearGoal(b, c, edge) : edgeSquare(c, edge);
  return stepToSquare(b, c, goal, rear ? 'to cover the retreat' : 'toward the way out');
}

/** The rearguard in place does not chase: a plan that needs it to move is replaced by holding the post. True when it held. */
export function withdrawHolds(b, c, choice) {
  if (!isWithdrawing(b, c) || !isRearguard(c)) return false;
  const moves = ['move', 'feint', 'grab'].includes(choice.plan) || (choice.attack?.range === 'close' && !inReach(b, c, choice.target, choice.attack));
  if (!moves) return false;
  log(b, { kind: 'note', actor: c.id, text: `${c.name} holds the rear and covers the others.` });
  return true;
}

/** Defensive Attack 2 for the rearguard; null for everyone else. */
export const withdrawStance = (b, c) => (isWithdrawing(b, c) && isRearguard(c) ? { allOut: 0, defensive: 2 } : null);

/** Interpose: the rearguard always steps in for a friend next to it (true), others follow the usual rule (null). */
export const withdrawGuards = (b, guard) => (isWithdrawing(b, guard) && isRearguard(guard) ? true : null);

/** Names of teams, e.g. "Team B" or "Teams B and C". */
const teamWords = (teams) => (teams.length === 1 ? `Team ${teams[0]}` : `Teams ${teams.slice(0, -1).join(', ')} and ${teams[teams.length - 1]}`);

/**
 * Has a withdrawing team got away? Yes when at least half of its fighters have escaped, or when it has held out for the
 * rounds set in b.options.withdrawRounds[team] with anyone still standing. Ends the battle and returns true when so.
 * It does not apply once the other sides are all gone (that is an ordinary win).
 */
export function withdrawOver(b) {
  const sides = [...new Set(b.combatants.map((c) => c.team))].sort();
  for (const team of sides.filter((t) => isWithdrawing(b, { team: t }))) {
    if (!alive(b).some((x) => x.team !== team)) continue;
    const mates = b.combatants.filter((x) => x.team === team);
    const gone = mates.filter((x) => x.escaped).length;
    const rounds = b.options.withdrawRounds?.[team] || 0;
    const standing = mates.some((x) => !x.out && (!x.fled || x.escaped));
    const outRan = gone > 0 && gone * 2 >= mates.length;
    const heldOut = rounds > 0 && b.round > rounds && standing;
    if (!outRan && !heldOut) continue;
    const others = [...new Set(alive(b).filter((x) => x.team !== team).map((x) => x.team))].sort();
    b.status = 'over'; b.winner = team; b.gotAway = true;
    log(b, { kind: 'end', text: `Team ${team} gets away${outRan ? '' : ` after holding out for ${rounds} round${rounds === 1 ? '' : 's'}`}. ${teamWords(others)} ${others.length === 1 ? 'holds' : 'hold'} the field.`, important: true });
    return true;
  }
  return false;
}
