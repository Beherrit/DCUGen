// Where a team tactic wants a fighter to stand: the line, the guard around the VIP, and kiting.
import { alive, enemiesOf } from './util.js';
import { clampToPlay } from './grid.js';
import { rangePenalty } from './odds.js';
import { squares, feet, squaresInMove, reachSquares, lineClear } from './geometry.js';
import { moveTo } from './movement.js';
import { stepToward, retreatSquare } from './path.js';
import { tacticOf } from './tactics-list.js';
import { vipOf } from './tactics-marks.js';

/** An enemy that wants to fight up close. */
export const isMeleeThreat = (e) => e.attacks.some((a) => (a.range === 'close' && !a.unarmed) || (a.unarmed && e.style === 'brawler'));

/** Tanks, brawlers, Interposers and the sturdy stand in front for Hold the Line. */
export const isFrontliner = (c) => c.style === 'tank' || c.style === 'brawler' || !!c.adv.Interpose || c.d.defenses.Toughness >= c.pl;

const centroid = (list) => ({ x: list.reduce((s, p) => s + p.x, 0) / list.length, y: list.reduce((s, p) => s + p.y, 0) / list.length });
const reach = (p, q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));

/**
 * Hold the Line: the front is the squares between the team and the enemy's center. The team's member nearest the
 * enemy sets how far forward that is; front-liners stand on it and the rest one square behind it.
 */
function lineGoal(b, c) {
  const team = alive(b).filter((x) => x.team === c.team);
  const foes = enemiesOf(b, c);
  if (!foes.length || !team.some(isFrontliner)) return null;
  const mid = centroid(foes);
  const front = Math.min(...team.map((x) => reach(x, mid)));
  const closeOnly = c.attacks.every((a) => a.range === 'close');
  const want = isFrontliner(c) || closeOnly ? front : front + 1;
  const now = reach(c, mid);
  if (Math.abs(now - want) < 0.75) return { x: c.x, y: c.y };
  const dx = c.x - mid.x; const dy = c.y - mid.y;
  const m = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
  return clampToPlay(b, Math.round(mid.x + (dx * want) / m), Math.round(mid.y + (dy * want) / m));
}

/** The square to move toward before attacking ({ x, y, stopAt }), or null when the tactic has no say. */
export function positionGoal(b, c) {
  const id = tacticOf(b, c);
  if (id === 'line') return lineGoal(b, c);
  if (id === 'bodyguard') {
    const vip = vipOf(b, c.team);
    return vip && vip !== c ? { x: vip.x, y: vip.y, stopAt: 1 } : null; // next to the VIP
  }
  return null;
}

/** Walk up to one move toward a square, stopping within goal.stopAt squares of it. Returns true when the fighter moved. */
export function stepToSquare(b, c, goal, why) {
  const stopAt = goal.stopAt || 0;
  const budget = squaresInMove(b, c);
  if (!budget || squares(c, goal) <= stopAt) return false;
  const dest = stepToward(b, c, goal, budget, stopAt);
  if (dest.x === c.x && dest.y === c.y) return false;
  moveTo(b, c, dest, why);
  return true;
}

/** Kite: does this team want its shooters to keep away from melee? */
export const wantsKite = (b, c) => tacticOf(b, c) === 'kite' && c.attacks.some((a) => a.range !== 'close');

/** A melee enemy that could reach a kiter this turn. */
export function kiteThreat(b, c, enemies) {
  if (!wantsKite(b, c)) return null;
  return enemies.find((e) => isMeleeThreat(e) && squares(e, c) - reachSquares(b, e) <= squaresInMove(b, e)) || null;
}

/**
 * Where a shooter backs off to: out of the foes' reach as far as its squares allow, staying within medium range of its
 * target with a clear line. Null when no square is farther from the foes.
 */
export function kiteSquare(b, c, attack, target, foes, budget) {
  if (!budget) return null;
  return retreatSquare(b, c, foes, budget, (p) => rangePenalty(attack, feet(b, p, target)) <= 2 && lineClear(b, p, target));
}

/** Kite: with nobody near (adjacent, or within 60 ft), line up a shot instead of firing at once. */
export const aimsAlways = (b, c, enemies) => wantsKite(b, c) && !enemies.some((e) => squares(e, c) <= 1 || feet(b, e, c) <= 60)
  && !enemies.some((e) => e.attacks.some((a) => a.range !== 'close'));
