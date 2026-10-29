// Where a team tactic wants a fighter to stand: the line, the guard around the VIP, and kiting.

import { clamp, alive, enemiesOf } from './util.js';
import { arenaOf } from './constants.js';
import { moveZones } from './conditions.js';
import { rangePenalty } from './odds.js';
import { moveTo } from './movement.js';
import { tacticOf } from './tactics-list.js';
import { vipOf } from './tactics-marks.js';

/** An enemy that wants to fight up close. */
export const isMeleeThreat = (e) => e.attacks.some((a) => (a.kind === 'close' && !a.unarmed) || (a.unarmed && e.style === 'brawler'));

/** Tanks, brawlers, Interposers and the sturdy stand in front for Hold the Line. */
export const isFrontliner = (c) => c.style === 'tank' || c.style === 'brawler' || !!c.adv.Interpose || c.d.defenses.Toughness >= c.pl;

const mean = (list) => list.reduce((sum, x) => sum + x.pos, 0) / list.length;

/** Hold the Line: the front is the team's zone nearest the enemy; front-liners take it and the rest stand one zone behind. */
function lineGoal(b, c) {
  const team = alive(b).filter((x) => x.team === c.team);
  const foes = enemiesOf(b, c);
  const dir = foes.length ? Math.sign(mean(foes) - mean(team)) : 0;
  if (!dir || !team.some(isFrontliner)) return null;
  const front = dir > 0 ? Math.max(...team.map((x) => x.pos)) : Math.min(...team.map((x) => x.pos));
  const closeOnly = c.attacks.every((a) => a.kind === 'close');
  if (isFrontliner(c) || closeOnly) return front;
  return clamp(front - dir, 0, arenaOf(b) - 1);
}

/** The zone to move toward before attacking, or null when the tactic has no say. */
export function positionGoal(b, c) {
  const id = tacticOf(b, c);
  if (id === 'line') return lineGoal(b, c);
  if (id === 'bodyguard') {
    const vip = vipOf(b, c.team);
    return vip && vip !== c ? vip.pos : null;
  }
  return null;
}

/** Walk up to one move toward a zone. Returns true when the fighter moved. */
export function stepToZone(b, c, goal, why) {
  const zones = moveZones(c);
  if (!zones || goal === c.pos) return false;
  moveTo(b, c, c.pos + Math.sign(goal - c.pos) * Math.min(zones, Math.abs(goal - c.pos)), why);
  return true;
}

/** Kite: does this team want its shooters to keep away from melee? */
export const wantsKite = (b, c) => tacticOf(b, c) === 'kite' && c.attacks.some((a) => a.kind !== 'close');

/** A melee enemy that could reach a kiter this turn. */
export function kiteThreat(b, c, enemies) {
  if (!wantsKite(b, c)) return null;
  return enemies.find((e) => isMeleeThreat(e) && Math.abs(e.pos - c.pos) <= moveZones(e)) || null;
}

/** How far a kiter backs off: as far as it can while staying within medium range of its target. Null when not kiting. */
export function kiteZones(b, c, attack, target, dir) {
  if (!wantsKite(b, c)) return null;
  for (let s = moveZones(c); s > 1; s--) {
    const dest = clamp(c.pos + dir * s, 0, arenaOf(b) - 1);
    if (rangePenalty(attack, Math.abs(dest - target.pos)) <= 2) return s;
  }
  return Math.min(1, moveZones(c));
}

/** Kite: with nobody within two zones, line up a shot instead of firing at once. */
export const aimsAlways = (b, c, enemies) => wantsKite(b, c) && !enemies.some((e) => Math.abs(e.pos - c.pos) <= 2)
  && !enemies.some((e) => e.attacks.some((a) => a.kind !== 'close'));
