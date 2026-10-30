// Choosing what to attack and with what: the best attack against a target, the trade-off, and the plan.

import { STYLES } from './styles.js';
import { activeConditions, defenseOf, resistOf } from './conditions.js';
import { squares, squaresInMove, reachSquares, lineClear, shootSquares, templateShort } from './geometry.js';
import { hitOdds, expectedValue, rangePenalty, threatOn } from './odds.js';
import { targetBias, attackBias, feintBias, grabChance } from './tactics.js';
import { blocksDirect } from './cover.js';
import { coverPlan, throughFactor } from './cover-plan.js';
import { gripOf, grabAppetite } from './maneuvers.js';
import { maneuverPlan } from './plan-maneuvers.js';
import { feintPick, setUpAllies, closeBest } from './tricks.js';
import { interactionImmune, slipsHold } from './immunity.js';
import { attackValue } from './utility-attack.js';

/**
 * Best attack for c against t, with the trade-off already folded in. A close attack counts when the target is in reach, or
 * (when the fighter can move: `full`) within one move, or two moves and a charge. A ranged one counts when the target is
 * in range now or after one move closer. Walls in the way rule out everything but a close attack.
 */
export function bestAttackVs(b, c, t, rng, { full = false } = {}) {
  const S = STYLES[c.style];
  const sq = b.grid.squareFt;
  const n = squares(c, t);
  const moveSq = full ? squaresInMove(b, c) : 0;
  let best = { attack: null, ev: 0, score: 0, base: 0 };
  for (const atk of c.attacks) {
    const close = atk.range === 'close';
    let from = n * sq;
    let charge = false;
    if (close) {
      const need = Math.max(0, n - reachSquares(b, c, atk));
      if (need > moveSq * 2) continue;
      charge = need > moveSq;
    } else {
      if (!lineClear(b, c, t)) continue;
      if (rangePenalty(atk, from) > 5) from = Math.max(sq, from - moveSq * sq); // out of range: a move closer
      if (rangePenalty(atk, from) > 5) continue; // out of range even after a move
      if (templateShort(b, c, atk, t) > moveSq) continue; // a Cone or Line that cannot reach, even after a move
    }
    if (blocksDirect(b, c, atk, t)) continue; // total cover: the target cannot be picked
    const dist = close ? 0 : from;
    const trade = bestTradeoff(c, atk, t, dist, b);
    const opts = { bonusShift: -trade - (charge && close ? 2 : 0), rankShift: trade, dist, b };
    const ev = attackValue(b, c, atk, t, expectedValue(c, atk, t, opts), opts); // utility.js: control and Weaken count for more than their degrees
    let score = ev * (close ? S.close : S.ranged);
    if (c.style === 'gunner' && (atk.equipment || atk.device)) score *= 1.3;
    if (c.style === 'mentalist' && atk.resistance === 'Will') score *= 1.3;
    if (c.style === 'mage' && atk.effect !== 'Damage') score *= 1.15;
    if (S.variety && atk.id === c.lastAttackId) score *= 0.7;
    if (atk.stunt) score *= 0.95;
    if (atk.unarmed && c.attacks.length > 1) score *= 0.9;
    score *= attackBias(b, c, atk, t) * throughFactor(b, c, atk, t, from);
    const base = score; // the attack's utility before the die-roll wobble
    score *= 0.9 + rng.next() * 0.2;
    if (score > best.score) best = { attack: atk, ev, score, base };
  }
  return best;
}

export function bestTradeoff(c, atk, t, dist, b = null) {
  if (!atk.roll || atk.unarmed && !c.adv['Power Attack'] && c.style !== 'brawler') return 0;
  const limitUp = c.adv['Power Attack'] ? 5 : 2;      // bonus -> rank
  const limitDown = c.adv['Accurate Attack'] ? 5 : 2;  // rank -> bonus
  const base = expectedValue(c, atk, t, { dist, b });
  let best = 0; let bestEv = base;
  const def = defenseOf(t, atk.kind === 'close' ? 'Parry' : 'Dodge');
  for (let s = -limitDown; s <= limitUp; s++) {
    if (s === 0) continue;
    if (atk.rank + s < 1) continue;
    // Power Attack only makes sense while the attack still has a fair chance to land
    if (s > 0 && hitOdds(atk.bonus - s - rangePenalty(atk, dist), def).hit < 0.35) continue;
    const ev = expectedValue(c, atk, t, { bonusShift: -s, rankShift: s, dist, b });
    if (ev > bestEv * 1.03 && ev - base > 0.03) { best = s; bestEv = ev; }
  }
  return best;
}

/**
 * Feint: skilled fighters against a defense they can't crack. With Set-up the follow-up that counts is the best ally's
 * (see tricks.js), who gets the benefit instead of the feinter.
 */
function wantsFeint(b, c, t, top, mode) {
  const flank = feintBias(b, c);
  const gift = setUpAllies(b, c, t);
  if (!((flank || c.style === 'duelist' || c.adv['Agile Feint'] || c.adv.Startle || gift.length) && top.pick.attack?.roll && top.reachable && top.need <= squaresInMove(b, c) && !t.feinted && mode === 'full') || interactionImmune(t)) return false;
  const atk = gift.length ? closeBest(b, gift[0], t).atk : top.pick.attack;
  const def = defenseOf(t, atk.kind === 'close' ? 'Parry' : 'Dodge');
  const now = hitOdds(atk.bonus, def).hit;
  const after = hitOdds(atk.bonus, Math.ceil(def / 2)).hit;
  const { mine: feintSkill, theirs: opposed } = feintPick(c, t);
  if (flank) return feintSkill >= opposed - flank.slack && after >= now * flank.ratio;
  const pFeint = hitOdds(feintSkill, opposed).hit;
  return after * pFeint > now * 2.1;
}

/** How much this fighter wants to hit that target: the tactic, then who threatens us and who is nearly down. */
function targetPref(c, t, n, ft, tactic, rng) {
    let pref = 1;
    if (tactic === 'closest') pref = 1 / (1 + n);
    if (tactic === 'weakest') pref = 1 + (30 - Math.min(30, defenseOf(t, 'Dodge') + resistOf(t, 'Toughness'))) / 20;
    if (tactic === 'strongest') pref = 1 + t.pl / 10;
    if (tactic === 'hurt') pref = 1 + t.bruises * 0.4 + (t.staggered ? 1 : 0);
    if (tactic === 'lowWill') pref = 1 + (20 - Math.min(20, resistOf(t, 'Will') ?? 20)) / 10;
    if (tactic === 'random') pref = 0.6 + rng.next() * 0.8;
    if (t.minion) pref *= 0.75;
    // Smarter targeting: knock out whoever hurts us most, and finish fighters who are nearly down.
    pref *= 1 + Math.min(1, threatOn(t, c, ft)) * 0.5;
    if (t.staggered || activeConditions(t).has('Defenseless')) pref *= 1.35;
    if (t.aiming || t.holding) pref *= 1.15; // break the aim, or free the friend in their grip
  return pref;
}

export function choosePlan(b, R, c, enemies, rng, mode) {
  const S = STYLES[c.style];
  const tactic = c.tactics === 'auto' ? S.target : c.tactics;
  const moveSq = squaresInMove(b, c);
  const scored = [];
  for (const t of enemies) {
    const n = squares(c, t);
    // How many squares short of reach: in reach with a move, or with a move and a charge (twice the speed, −2 to hit: DCA 175)
    const need = Math.max(0, n - reachSquares(b, c));
    const reachable = need === 0 || (mode === 'full' && need <= moveSq * 2);
    const ft = n * b.grid.squareFt;
    const pick = bestAttackVs(b, c, t, rng, { full: mode === 'full' });
    const tb = targetBias(b, c, t, { dist: n, enemies });
    const pref = targetPref(c, t, n, ft, tactic, rng) * tb;
    scored.push({ t, n, ft, need, reachable, pick, tb, score: (pick.score || 0.01) * pref });
  }
  scored.sort((x, y) => y.score - x.score);
  const top = scored[0];
  if (!top) return null;
  const shot = coverPlan(b, c, scored);
  if (shot) return shot;
  const t = top.t;
  // Nothing usable right now: close the distance
  if (!top.pick.attack || top.pick.ev <= 0.02) {
    const closeAtk = c.attacks.some((a) => a.range === 'close');
    const S = STYLES[c.style] || {};
    const shooter = c.attacks.some((a) => a.range === 'ranged' && a.roll) && (S.ranged ?? 1) > (S.close ?? 1);
    const stopAt = shooter ? shootSquares(b, c) : reachSquares(b, c);
    if (closeAtk && top.need > 0 && !shooter) return { target: t, attack: null, plan: 'move', stopAt };
    const alt = scored.find((s) => s.pick.attack && s.pick.ev > 0.02);
    if (alt) return { target: alt.t, attack: alt.pick.attack, plan: 'attack', utility: alt.pick.base * alt.tb };
    if (top.n > stopAt) return { target: t, attack: null, plan: 'move', stopAt };
    return null;
  }
  // Grab: beasts, brawlers and tanks with the knack, against someone they can reach
  if ((S.grabs || c.adv['Fast Grab'] || c.adv['Improved Grab'] || c.adv.Chokehold) && !c.holding && top.reachable && top.need <= moveSq && gripOf(c) >= (t.d.abilities.Strength ?? 0) + 2 && !t.grabbedBy && !slipsHold(t) && !t.minion && rng.chance(grabChance(b, c, t, c.style === 'beast' ? 0.45 : 0.3) * grabAppetite(b, c, t))) {
    return { target: t, attack: top.pick.attack, plan: 'grab' };
  }
  const maneuver = maneuverPlan(b, c, top, mode);
  if (maneuver) return maneuver;
  if (wantsFeint(b, c, t, top, mode)) return { target: t, attack: top.pick.attack, plan: 'feint' };
  return { target: t, attack: top.pick.attack, plan: 'attack', ev: top.pick.ev, utility: top.pick.base * top.tb }; // utility: what the attack is worth next to a heal, a buff or a guard
}
