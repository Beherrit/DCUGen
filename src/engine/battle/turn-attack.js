// The attacking half of a turn: step away or close in, line up a shot, pick the trade-offs, attack, then hit and run.

import { clamp, d20, log, alliesOf } from './util.js';
import { arenaOf } from './constants.js';
import { STYLES } from './styles.js';
import { conditionLabels, checkPenalty, defenseOf, canAct, moveZones } from './conditions.js';
import { hitOdds, rangePenalty, concealmentPenalty } from './odds.js';
import { bestTradeoff } from './plan.js';
import { moveTo, moveToward } from './movement.js';
import { resolveAttack } from './attacks.js';

/** The attack plan chosen for this turn: move into position, maybe aim, then attack. */
export function attackTurn(b, R, c, choice, enemies, mode, rng) {
  const { attack, target } = choice;
  kite(b, c, attack, enemies, mode);
  const closed = closeIn(b, c, attack, target, mode, rng);
  if (closed.over) return;
  const charge = closed.charge;
  if (!charge && lineUpShot(b, c, attack, target, enemies, rng)) return;
  const trade = bestTradeoff(c, attack, target, Math.abs(c.pos - target.pos));
  const { allOut, defensive } = pickStance(b, c, target, enemies);
  const effort = pickEffort(b, c, attack, target, rng);
  const team = teamAttack(b, c, attack, target, rng);
  const slam = slamRank(c, attack, charge);
  // Takedown chains and the attack itself
  resolveAttack(b, R, c, attack, target, rng, { trade: charge ? 0 : trade, allOut: charge ? 0 : allOut, defensive: charge ? 0 : defensive, effort, charge, slam, team });
  hitAndRun(b, c, attack, enemies, mode);
}

/** Kiting: ranged fighters step away from melee threats before shooting. */
function kite(b, c, attack, enemies, mode) {
  const S = STYLES[c.style];
  if (!(mode === 'full' && attack.kind !== 'close' && S.ranged >= 1.2 && !c.grabbedBy)) return;
  const threat = enemies.find((e) => e.pos === c.pos && e.attacks.some((a) => a.kind === 'close' && !a.unarmed || (a.unarmed && e.style === 'brawler')));
  if (threat && rangePenalty(attack, 1) === 0) {
    const dir = c.pos <= threat.pos ? -1 : 1;
    const dest = clamp(c.pos + dir * Math.min(moveZones(c), 1), 0, arenaOf(b) - 1);
    if (dest !== c.pos) moveTo(b, c, dest, `away from ${threat.name}`);
  }
}

/** Get a close attack into reach. Returns { over } when the turn went on moving, { charge } when a charge was made. */
function closeIn(b, c, attack, target, mode, rng) {
  let charge = false;
  if (attack.kind === 'close' && target.pos !== c.pos) {
    if (mode !== 'full') { log(b, { kind: 'skip', actor: c.id, text: `${c.name} is ${conditionLabels(c).join(', ').toLowerCase()} and can't close the distance.` }); return { over: true }; }
    const dist = Math.abs(c.pos - target.pos);
    if (dist > moveZones(c) && dist <= moveZones(c) * 2) {
      // Charge: a move and then a charge, twice the speed, the attack at -2 (DCA 175)
      moveTo(b, c, target.pos, `and charges ${target.name}`);
      charge = true;
    } else {
      moveToward(b, c, target, rng);
      if (target.pos !== c.pos) return { over: true }; // couldn't reach; used the turn moving
    }
  }
  return { over: false, charge };
}

/** Aim: a ranged fighter with poor odds and nobody on top of them lines up the shot for next turn (DCA 175). True when the turn went on aiming. */
function lineUpShot(b, c, attack, target, enemies, rng) {
  if (!(attack.roll && attack.kind === 'ranged' && (c.style === 'gunner' || c.style === 'blaster') && !enemies.some((e) => e.pos === c.pos))) return false;
  const dist = Math.abs(c.pos - target.pos);
  const def = defenseOf(target, 'Dodge');
  const now = hitOdds(attack.bonus - rangePenalty(attack, dist) - concealmentPenalty(c, target, attack), def).hit;
  const bonus = dist <= 1 ? 5 : 2;
  if (now < 0.4 && hitOdds(attack.bonus + bonus - rangePenalty(attack, dist) - concealmentPenalty(c, target, attack), def).hit >= now + 0.2 && rng.chance(0.7)) {
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

/** Extra effort: push a power when losing (DCA 19). */
function pickEffort(b, c, attack, target, rng) {
  const hurt = c.staggered || c.bruises >= 2;
  if (b.options.extraEffort && c.fatigue < 2 && attack.power && !attack.equipment && (hurt || (b.round >= 3 && target.bruises === 0)) && ['mage', 'omni', 'blaster', 'tank', 'brawler', 'mentalist'].includes(c.style) && rng.chance(0.45)) {
    return 'power';
  }
  return null;
}

/**
 * Team attack (DCA 178): minions of a squad who haven't acted yet delay to strike together. Each helper's
 * degrees of success add to the lead attack: one degree +2 rank, three or more +5.
 */
function teamAttack(b, c, attack, target, rng) {
  if (!(c.minion && attack.roll && !attack.area)) return 0;
  const order = b.order.slice(b.turn);
  const helpers = alliesOf(b, c).filter((a) => a.minion && a.teamedRound !== b.round && order.includes(a.id) && canAct(a) === 'full'
    && Math.abs(a.pos - target.pos) <= moveZones(a)).slice(0, 5);
  if (helpers.length < 2) return 0;
  let deg = 0; const parts = [];
  for (const a of helpers) {
    const atk = a.attacks.find((x) => x.effect === attack.effect && x.resistance === attack.resistance && Math.abs(x.rank - attack.rank) <= 5 && x.roll && (x.kind !== 'close' || Math.abs(a.pos - target.pos) <= moveZones(a)));
    if (!atk) continue;
    a.teamedRound = b.round;
    if (atk.kind === 'close' && a.pos !== target.pos) a.pos = target.pos;
    const def = defenseOf(target, atk.kind === 'close' ? 'Parry' : 'Dodge');
    const r = d20(rng); const tot = r + atk.bonus - checkPenalty(a);
    const d = r === 20 || tot >= 10 + def ? 1 + Math.floor((tot - 10 - def) / 5) : 0;
    deg += Math.max(0, d);
    parts.push(`${a.name} ${d > 0 ? `${d} degree${d > 1 ? 's' : ''}` : 'misses'}`);
  }
  const team = deg >= 3 ? 5 : deg >= 1 ? 2 : 0;
  if (parts.length) log(b, { kind: 'note', actor: c.id, target: target.id, text: `Team attack: ${parts.join(', ')} — ${team ? `+${team} to ${c.name}'s ${attack.effect} rank` : 'no help lands'}.`, important: !!team });
  return team;
}

/** Slam: a charging fighter with real speed crashes into the target (DCA 178). */
function slamRank(c, attack, charge) {
  if (charge && attack.effect === 'Damage' && (c.moveRank || 0) >= attack.rank + 1 && ['brawler', 'tank', 'speedster', 'beast'].includes(c.style)) return Math.max(c.moveRank, attack.rank + 1);
  return null;
}

/** Hit and run: strike and end the turn out of reach. */
function hitAndRun(b, c, attack, enemies, mode) {
  const S = STYLES[c.style];
  if (!(S.hitAndRun && c.adv['Move-by Action'] && mode === 'full' && attack.kind === 'close' && !c.holding)) return;
  const dir = c.pos >= arenaOf(b) / 2 ? 1 : -1;
  const dest = clamp(c.pos + dir * Math.max(1, Math.floor(moveZones(c) / 2)), 0, arenaOf(b) - 1);
  if (dest !== c.pos && !enemies.some((e) => e.pos === dest)) moveTo(b, c, dest, 'and is gone before anyone can answer');
}
