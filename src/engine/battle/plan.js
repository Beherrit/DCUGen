// Choosing what to attack and with what: the best attack against a target, the trade-off, and the plan.

import { STYLES } from './styles.js';
import { activeConditions, defenseOf, resistOf, moveZones } from './conditions.js';
import { hitOdds, expectedValue, rangePenalty, threatOn } from './odds.js';
import { targetBias, attackBias, feintBias, grabChance } from './tactics.js';
import { blocksDirect } from './cover.js';
import { coverPlan, throughFactor } from './cover-plan.js';

/** Best attack for c against t, with the trade-off already folded in. */
export function bestAttackVs(c, t, rng, { dist = Math.abs(c.pos - t.pos), reachable = true, charge = false, b = null } = {}) {
  const S = STYLES[c.style];
  let best = { attack: null, ev: 0, score: 0 };
  for (const atk of c.attacks) {
    if (atk.kind === 'close' && !reachable) continue;
    if (atk.kind === 'ranged' && rangePenalty(atk, reachable ? Math.min(dist, 1) : dist) > 50) continue;
    if (b && blocksDirect(b, c, atk, t)) continue; // total cover: the target cannot be picked
    const trade = bestTradeoff(c, atk, t, atk.kind === 'close' ? 0 : dist, b);
    const ev = expectedValue(c, atk, t, { bonusShift: -trade - (charge && atk.kind === 'close' ? 2 : 0), rankShift: trade, dist: atk.kind === 'close' ? 0 : dist, b });
    let score = ev * (atk.kind === 'close' ? S.close : S.ranged);
    if (c.style === 'gunner' && (atk.equipment || atk.device)) score *= 1.3;
    if (c.style === 'mentalist' && atk.resistance === 'Will') score *= 1.3;
    if (c.style === 'mage' && atk.effect !== 'Damage') score *= 1.15;
    if (S.variety && atk.id === c.lastAttackId) score *= 0.7;
    if (atk.stunt) score *= 0.95;
    if (atk.unarmed && c.attacks.length > 1) score *= 0.9;
    if (b) score *= attackBias(b, c, atk, t) * throughFactor(b, c, atk, t, dist);
    score *= 0.9 + rng.next() * 0.2;
    if (score > best.score) best = { attack: atk, ev, score };
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

/** Feint: skilled fighters against a defense they can't crack. */
function wantsFeint(b, c, t, top, mode) {
  const flank = feintBias(b, c);
  if (!((flank || c.style === 'duelist' || c.adv['Agile Feint']) && top.pick.attack?.roll && top.reachable && top.dist <= moveZones(c) && !t.feinted && mode === 'full')) return false;
  const atk = top.pick.attack;
  const def = defenseOf(t, atk.kind === 'close' ? 'Parry' : 'Dodge');
  const now = hitOdds(atk.bonus, def).hit;
  const after = hitOdds(atk.bonus, Math.ceil(def / 2)).hit;
  const feintSkill = Math.max(c.skills.Deception, c.adv['Agile Feint'] ? c.skills.Acrobatics : -99);
  const opposed = Math.max(t.skills.Insight, t.skills.Deception);
  if (flank) return feintSkill >= opposed - flank.slack && after >= now * flank.ratio;
  const pFeint = hitOdds(feintSkill, opposed).hit;
  return after * pFeint > now * 2.1;
}

/** How much this fighter wants to hit that target: the tactic, then who threatens us and who is nearly down. */
function targetPref(c, t, dist, tactic, rng) {
    let pref = 1;
    if (tactic === 'closest') pref = 1 / (1 + dist);
    if (tactic === 'weakest') pref = 1 + (30 - Math.min(30, defenseOf(t, 'Dodge') + resistOf(t, 'Toughness'))) / 20;
    if (tactic === 'strongest') pref = 1 + t.pl / 10;
    if (tactic === 'hurt') pref = 1 + t.bruises * 0.4 + (t.staggered ? 1 : 0);
    if (tactic === 'lowWill') pref = 1 + (20 - Math.min(20, resistOf(t, 'Will') ?? 20)) / 10;
    if (tactic === 'random') pref = 0.6 + rng.next() * 0.8;
    if (t.minion) pref *= 0.75;
    // Smarter targeting: knock out whoever hurts us most, and finish fighters who are nearly down.
    pref *= 1 + Math.min(1, threatOn(t, c, dist)) * 0.5;
    if (t.staggered || activeConditions(t).has('Defenseless')) pref *= 1.35;
    if (t.aiming || t.holding) pref *= 1.15; // break the aim, or free the friend in their grip
  return pref;
}

export function choosePlan(b, R, c, enemies, rng, mode) {
  const S = STYLES[c.style];
  const tactic = c.tactics === 'auto' ? S.target : c.tactics;
  const zones = moveZones(c);
  const scored = [];
  for (const t of enemies) {
    const dist = Math.abs(c.pos - t.pos);
    // In reach with a move, or with a move and a charge (twice the speed, −2 to hit: DCA 175)
    const reachable = dist === 0 || (mode === 'full' && dist <= zones * 2);
    const pick = bestAttackVs(c, t, rng, { dist, reachable, charge: dist > zones, b });
    const pref = targetPref(c, t, dist, tactic, rng) * targetBias(b, c, t, { dist, enemies });
    scored.push({ t, dist, reachable, pick, score: (pick.score || 0.01) * pref });
  }
  scored.sort((x, y) => y.score - x.score);
  const top = scored[0];
  if (!top) return null;
  const shot = coverPlan(b, c, scored);
  if (shot) return shot;
  const t = top.t;
  // Nothing usable right now: close the distance
  if (!top.pick.attack || top.pick.ev <= 0.02) {
    const closeAtk = c.attacks.some((a) => a.kind === 'close');
    if (closeAtk && top.dist > 0) return { target: t, attack: null, plan: 'move' };
    const alt = scored.find((s) => s.pick.attack && s.pick.ev > 0.02);
    if (alt) return { target: alt.t, attack: alt.pick.attack, plan: 'attack' };
    if (top.dist > 1) return { target: t, attack: null, plan: 'move' };
    return null;
  }
  // Grab: beasts, brawlers and tanks with the knack, against someone they can reach
  if ((S.grabs || c.adv['Fast Grab'] || c.adv['Improved Grab'] || c.adv.Chokehold) && !c.holding && top.reachable && top.dist <= zones && (c.d.abilities.Strength ?? 0) >= (t.d.abilities.Strength ?? 0) + 2 && !t.grabbedBy && !t.minion && rng.chance(grabChance(b, c, t, c.style === 'beast' ? 0.45 : 0.3))) {
    return { target: t, attack: top.pick.attack, plan: 'grab' };
  }
  if (wantsFeint(b, c, t, top, mode)) return { target: t, attack: top.pick.attack, plan: 'feint' };
  return { target: t, attack: top.pick.attack, plan: 'attack', ev: top.pick.ev };
}
