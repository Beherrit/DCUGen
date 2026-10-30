// The attacking half of a turn: step away or close in, line up a shot, pick the trade-offs, attack, then move on (Move-by Action).

import { log, alliesOf } from './util.js';
import { rollCheck } from './checks.js';
import { conditionLabels, checkPenalty, defenseOf, canAct } from './conditions.js';
import { feet, squares, squaresInMove, reachSquares, inReach, lineClear, shootSquares, templateShort, areaVictims } from './geometry.js';
import { stepToward } from './path.js';
import { hitOdds, rangePenalty, concealmentPenalty } from './odds.js';
import { bestTradeoff } from './plan.js';
import { moveTo, moveToward } from './movement.js';
import { resolveAttack } from './attacks.js';
import { positionGoal, stepToSquare, wantsKite, aimsAlways, tradeoffBias, teamAttackMin, coverStep } from './tactics.js';
import { pickEffort, extraAction, speedEffort } from './effort.js';
import { coverPenalty } from './cover.js';
import { kite, moveBy } from './move-by.js';
import { runManeuver } from './maneuver-run.js';
import { finishingFeat } from './feat.js';
import { flawedAction } from './flaw-turn.js';
import { runExtraAttacks } from './extra-attacks.js';

// Extra effort is chosen in effort.js; the tests read it from here.
export { pickEffort };

/** The attack plan chosen for this turn: move into position, maybe aim, then attack. */
export function attackTurn(b, R, c, choice, enemies, mode, rng) {
  const { attack, target } = choice;
  if (choice.plan === 'attack' && flawedAction(b, c, attack, target, mode, rng)) return; // Activation, Increased Action, Immobile (flaw-turn.js)
  coverStep(b, c, attack, mode, target, enemies);
  kite(b, c, attack, target, enemies, mode);
  if (holdPosition(b, c, attack, target, mode)) return;
  const closed = closeIn(b, c, attack, target, mode, rng);
  if (closed.over) return;
  const charge = closed.charge;
  if (attack.range !== 'close' && !lineClear(b, c, target)) { log(b, { kind: 'skip', actor: c.id, text: `${c.name} has no clear line to ${target.name} and holds the shot.` }); return; }
  if (attack.area && !areaVictims(b, c, attack, target).some((x) => x.team !== c.team)) { log(b, { kind: 'skip', actor: c.id, text: `${c.name} can't catch anyone with ${attack.name} from here and holds it.` }); return; }
  if (choice.plan !== 'attack') { runManeuver(b, c, choice, rng); moveBy(b, c, attack, target, enemies, mode); return; }
  if (!charge && lineUpShot(b, c, attack, target, enemies, rng)) return;
  finishingFeat(b, c, attack, target); // a hero point can raise the limit on a finishing blow
  const { trade, allOut, defensive } = pickTradeoffs(b, c, attack, target, enemies);
  const effort = pickEffort(b, c, attack, target, rng);
  const team = teamAttack(b, c, attack, target, rng);
  const slam = slamRank(b, c, attack, charge);
  // Takedown chains and the attack itself
  const landed = resolveAttack(b, R, c, attack, target, rng, { trade: charge ? 0 : trade, allOut: charge ? 0 : allOut, defensive: charge ? 0 : defensive, effort, charge, slam, team });
  runExtraAttacks(b, R, c, attack, target, rng, landed); // Extra Attacks: more attacks with the same power (extra-attacks.js)
  extraAction(b, R, c, rng, effort); // extra effort for another standard action (effort.js)
  moveBy(b, c, attack, target, enemies, mode);
}

/** A team tactic may call for a different spot first. True when the move used up the turn (a close attack could not reach). */
function holdPosition(b, c, attack, target, mode) {
  const goal = mode === 'full' ? positionGoal(b, c) : null;
  if (goal === null || !stepToSquare(b, c, goal, 'to hold position')) return false;
  return attack.range === 'close' && !inReach(b, c, target, attack);
}

/** Get a close attack into reach. Returns { over } when the turn went on moving, { charge } when a charge was made. */
function closeIn(b, c, attack, target, mode, rng) {
  let charge = false;
  if (attack.range === 'ranged' && rangePenalty(attack, feet(b, c, target)) > 5) {
    if (mode !== 'full') { log(b, { kind: 'skip', actor: c.id, text: `${c.name} is out of range and can't close the distance.` }); return { over: true }; }
    moveToward(b, c, target, rng, 1, shootSquares(b, c));
    if (rangePenalty(attack, feet(b, c, target)) > 5) return { over: true }; // still out of range: the turn went on moving
  }
  if (attack.range === 'ranged' && templateShort(b, c, attack, target) > 0) {
    // A Cone or Line starts at the attacker: step in until its far end reaches the target
    if (mode !== 'full') { log(b, { kind: 'skip', actor: c.id, text: `${c.name} is too far for ${attack.name} to reach and can't close the distance.` }); return { over: true }; }
    moveToward(b, c, target, rng, 1, Math.max(1, Math.floor(attack.areaFt / b.grid.squareFt)));
    if (templateShort(b, c, attack, target) > 0) return { over: true }; // still short: the turn went on moving
  }
  if (attack.range === 'close' && !inReach(b, c, target, attack)) {
    if (mode !== 'full') { log(b, { kind: 'skip', actor: c.id, text: `${c.name} is ${conditionLabels(c).join(', ').toLowerCase()} and can't close the distance.` }); return { over: true }; }
    const reach = reachSquares(b, c, attack);
    const need = squares(c, target) - reach;
    if (need > squaresInMove(b, c) * 2 && need <= squaresInMove(b, c) * 4) speedEffort(b, c, rng); // +1 speed rank: twice as far (effort.js)
    const move = squaresInMove(b, c);
    if (need > move && need <= move * 2) {
      // Charge: a move and then a charge, twice the speed, the attack at -2 (DCA 175)
      moveTo(b, c, stepToward(b, c, target, move * 2, reach), `and charges ${target.name}`);
      if (!inReach(b, c, target, attack)) return { over: true }; // walls or scenery in the way: the charge fell short
      charge = true;
    } else {
      moveToward(b, c, target, rng, 1, reach);
      if (!inReach(b, c, target, attack)) return { over: true }; // couldn't reach; used the turn moving
    }
  }
  return { over: false, charge };
}
/** Aim: a ranged fighter with poor odds and nobody on top of them lines up the shot for next turn (DCA 175). True when the turn went on aiming. */
function lineUpShot(b, c, attack, target, enemies, rng) {
  const always = aimsAlways(b, c, enemies);
  if (!(attack.roll && attack.kind === 'ranged' && (always || ((c.style === 'gunner' || c.style === 'blaster' || wantsKite(b, c)) && !enemies.some((e) => squares(e, c) === 0))))) return false; // nobody on top of them (the same square)
  const dist = feet(b, c, target);
  const def = defenseOf(target, 'Dodge');
  const now = hitOdds(attack.bonus - rangePenalty(attack, dist) - concealmentPenalty(c, target, attack) - coverPenalty(b, c, target, attack), def).hit;
  const near = inReach(b, c, target); // close or adjacent: +5, at range: +2
  const bonus = c.adv['Improved Aim'] ? (near ? 10 : 5) : (near ? 5 : 2); // Improved Aim doubles it (p75)
  if (always || (now < 0.4 && hitOdds(attack.bonus + bonus - rangePenalty(attack, dist) - concealmentPenalty(c, target, attack) - coverPenalty(b, c, target, attack), def).hit >= now + 0.2 && rng.chance(0.7))) {
    c.aiming = { target: target.id, attack: attack.id, bonus };
    log(b, { kind: 'note', actor: c.id, target: target.id, text: `${c.name} takes aim at ${target.name} (+${bonus} next turn, vulnerable until then).` });
    return true;
  }
  return false;
}

/** Go all-out or defensive (DCA 190-191). Sets the fighter's defense modifier. */
function pickStance(b, c, target, enemies) {
  const hurt = c.staggered || c.bruises >= 2;
  let allOut = 0; let defensive = 0;
  const maxTrade = (name) => (c.adv[name] ? 5 : 2);
  if (!hurt && (c.style === 'brawler' || c.style === 'tank' || c.style === 'beast' || c.style === 'minion') && (target.staggered || target.bruises >= 2 || c.adv['All-out Attack'])) allOut = Math.min(maxTrade('All-out Attack'), 2 + (c.adv['All-out Attack'] ? 2 : 0));
  if ((c.style === 'duelist' || c.style === 'support') && (hurt || enemies.length > alliesOf(b, c).length + 1)) defensive = Math.min(maxTrade('Defensive Attack'), 2 + (c.adv['Defensive Attack'] ? 2 : 0));
  c.defMod = allOut ? -allOut : defensive;
  return { allOut, defensive };
}

/** The trade-offs for this attack: the fighter's own choice, then any team tactic's override. */
function pickTradeoffs(b, c, attack, target, enemies) {
  let trade = bestTradeoff(c, attack, target, feet(b, c, target), b);
  let { allOut, defensive } = pickStance(b, c, target, enemies);
  const adj = tradeoffBias(b, c, target, attack);
  if (adj) {
    ({ allOut, defensive } = adj);
    if (adj.power !== undefined) trade = adj.power;
    c.defMod = allOut ? -allOut : defensive;
  }
  return { trade, allOut, defensive };
}

/**
 * Team attack (DCA 178): minions of a squad who haven't acted yet delay to strike together. Each helper's
 * degrees of success add to the lead attack: one degree +2 rank, three or more +5.
 */
function teamAttack(b, c, attack, target, rng) {
  if (!(c.minion && attack.roll && !attack.area)) return 0;
  const order = b.order.slice(b.turn);
  const helpers = alliesOf(b, c).filter((a) => a.minion && a.teamedRound !== b.round && order.includes(a.id) && canAct(a) === 'full').slice(0, 5);
  if (helpers.length < teamAttackMin(b, c, target)) return 0;
  let deg = 0; const parts = [];
  for (const a of helpers) {
    const atk = a.attacks.find((x) => x.effect === attack.effect && x.resistance === attack.resistance && Math.abs(x.rank - attack.rank) <= 5 && x.roll && (x.range === 'close' ? squares(a, target) - reachSquares(b, a, x) <= squaresInMove(b, a) : rangePenalty(x, feet(b, a, target)) <= 5));
    if (!atk) continue;
    a.teamedRound = b.round;
    if (atk.range === 'close' && !inReach(b, a, target, atk)) moveTo(b, a, stepToward(b, a, target, squaresInMove(b, a), reachSquares(b, a, atk)), 'to join the team attack');
    const def = defenseOf(target, atk.kind === 'close' ? 'Parry' : 'Dodge');
    const r = rollCheck(rng, atk.bonus - checkPenalty(a), 10 + def);
    const d = r.success ? r.degrees : r.crit ? 1 : 0; // a natural 20 is always a hit, if only of one degree
    deg += d;
    parts.push(`${a.name} ${d > 0 ? `${d} degree${d > 1 ? 's' : ''}` : 'misses'}`);
  }
  const team = deg >= 3 ? 5 : deg >= 1 ? 2 : 0;
  if (parts.length) log(b, { kind: 'note', actor: c.id, target: target.id, text: `Team attack: ${parts.join(', ')} — ${team ? `+${team} to ${c.name}'s ${attack.effect} rank` : 'no help lands'}.`, important: !!team });
  return team;
}

/** Slam: a charging fighter with real speed crashes into the target (DCA 178). */
function slamRank(b, c, attack, charge) {
  const movedFt = (c.squaresMoved || 0) * b.grid.squareFt; // the charge must cover at least 30 ft
  if (charge && movedFt >= 30 && attack.effect === 'Damage' && (c.moveRank || 0) >= attack.rank + 1 && ['brawler', 'tank', 'speedster', 'beast'].includes(c.style)) return Math.max(c.moveRank, attack.rank + 1);
  return null;
}

