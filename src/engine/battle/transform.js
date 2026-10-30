// Transform (Hero's Handbook p120): change objects into other objects. It needs a touch, "a close attack check if the object is
// held or worn by another character," and "characters can make Dodge resistance checks for their held or worn items, with a +5
// circumstance bonus for hand-held and similar sized objects." The fight uses it two ways:
//  - an enemy's weapon or device: a close attack check against Parry, then the item's Dodge resistance check (+5 if held) against
//    10 + rank. A failed check turns the item into something harmless and every attack from it is gone for the fight.
//  - a being without a Stamina (a construct, a robot): "when dealing with non-living creatures (those absent Stamina) capable of
//    resistance checks (possessing Will) the GM may permit Transform to function like an Affliction against them." house rule:
//    that GM option is on. A Will check against 10 + rank: one degree impaired, two degrees dazed and hindered, three degrees
//    Transformed, out of the fight until the transformer lets go or the target recovers (its recovery Will check each round).
//    Living beings cannot be transformed: "transforming living or otherwise animate beings requires an effect other than Transform."
// Transform is sustained: a being transformed reverts when the transformer can no longer keep it up. Not modelled: transforming
// scenery (turning a wall to water), an item coming back when the effect ends, and the cost bands of what may be changed into what.

import { allPowers } from '../derive.js';
import { log, sign } from './util.js';
import { canAct, checkPenalty, defenseOf, resistOf } from './conditions.js';
import { rollCheck, critNote } from './checks.js';
import { squares, squaresInMove, reachSquares, inReach, feet } from './geometry.js';
import { stepToward } from './path.js';
import { moveTo } from './movement.js';
import { hitOdds, resistOdds, bestEvNow } from './odds.js';
import { itemsOf, loseItem } from './items.js';
import { releaseHolds } from './maneuvers.js';

const HORIZON = 3;
const TIERS = [['Impaired'], ['Dazed', 'Hindered'], ['Transformed']];

/** The Transform powers of a character: [{ power, name, rank }]. */
export function transformsOf(ch) {
  return allPowers(ch, { includeAlternates: true }).filter(({ power: p }) => p.effect === 'Transform' && p.rank > 0 && p.role !== 'defense').map(({ power: p }) => ({ power: p, name: p.name, rank: p.rank }));
}

/** A being without a Stamina: it has no Fortitude to resist with. */
export const inanimate = (t) => !!t.d.defenses.immune?.Fortitude;

const touchBonus = (c) => (c.attacks.find((a) => a.unarmed)?.bonus ?? c.d.abilities.Fighting ?? 0) - checkPenalty(c);

/** The check to touch the target: d20 + the close attack bonus against Parry. Returns { hit, text, dice }. */
function touch(c, t, rng) {
  const dc = 10 + defenseOf(t, 'Parry');
  const bonus = touchBonus(c);
  const roll = rng.int(1, 20);
  const total = roll + bonus;
  return { hit: roll === 20 || (roll !== 1 && total >= dc), text: `d20 ${roll} ${sign(bonus)} = ${total} vs Parry DC ${dc}`, dice: { label: 'Touch', roll, mod: bonus, total, dc } };
}

/** The item of the target that is worth most to it: the one whose loss costs it the most of its best attack. */
function bestItem(b, c, t, foes) {
  const near = foes.reduce((m, f) => (!m || squares(t, f) < squares(t, m) ? f : m), null);
  if (!near) return null;
  const ev = (list) => Math.max(0, ...list.map((a) => bestEvNow({ ...t, attacks: [a] }, near, feet(b, t, near), 0, true)));
  const all = ev(t.attacks);
  let best = null;
  for (const item of itemsOf(t)) {
    const loss = all - ev(t.attacks.filter((a) => a.item?.key !== item.key));
    if (loss > 0 && (!best || loss > best.loss)) best = { item, loss };
  }
  return best;
}

/** Carry out a Transform on t: walk up, touch, then the resistance. */
function run(b, c, s, t, item, rng) {
  if (!inReach(b, c, t) && canAct(c) === 'full') moveTo(b, c, stepToward(b, c, t, squaresInMove(b, c), reachSquares(b, c)), `to touch ${t.name}`);
  if (!inReach(b, c, t)) return;
  const k = touch(c, t, rng);
  const head = `${c.name} reaches for ${t.name}${item ? `'s ${item.name}` : ''} with ${s.name} (rank ${s.rank}): ${k.text}`;
  if (!k.hit) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${head} — miss.`, dice: [k.dice] }); return; }
  const dc = 10 + s.rank;
  if (item) {
    const bonus = defenseOf(t, 'Dodge') - checkPenalty(t) + (item.held ? 5 : 0);
    const r = rollCheck(rng, bonus, dc);
    const base = `${head} — touched. ${t.name} resists for the item: Dodge d20 ${r.roll} ${sign(bonus)} = ${r.total} vs DC ${dc}${critNote(r)}`;
    if (r.success) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${base} — the ${item.name} is unchanged.`, dice: [k.dice, { label: 'Dodge', roll: r.roll, mod: bonus, total: r.total, dc }] }); return; }
    loseItem(t, item);
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${base} — the ${item.name} is transformed into something harmless: its attacks are gone.`, important: true, dice: [k.dice, { label: 'Dodge', roll: r.roll, mod: bonus, total: r.total, dc }] });
    return;
  }
  const resist = resistOf(t, 'Will') ?? 0;
  const r = rollCheck(rng, resist, dc);
  const base = `${head} — touched. ${t.name} resists: Will d20 ${r.roll} ${sign(resist)} = ${r.total} vs DC ${dc}${critNote(r)}`;
  if (!r.fails) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${base} — no effect.`, dice: [k.dice] }); return; }
  const degree = Math.min(3, r.fails);
  const names = TIERS[degree - 1];
  t.conditions = t.conditions.filter((x) => x.source !== `transform|${c.id}`);
  for (const n of names) t.conditions.push({ name: n, names, degree, from: c.id, source: `transform|${c.id}`, label: s.name, dc, resist: 'Will', tiers: TIERS, maxDegree: 3 });
  if (degree === 3) { t.out = true; t.outReason = 'transformed'; releaseHolds(b, t); c.stats.kos++; }
  log(b, { kind: degree === 3 ? 'ko' : 'condition', actor: c.id, target: t.id, text: `${base} — ${r.fails} degree${r.fails > 1 ? 's' : ''}: ${t.name} is ${degree === 3 ? 'TRANSFORMED and out of the fight' : names.join(' and ').toLowerCase()}.`, important: degree === 3, dice: [k.dice] });
}

/** The best Transform c could do this turn: { kind: 'transform', u, run }, or null. */
export function transformOption(b, c, enemies, mode) {
  if (canAct(c) === 'none') return null;
  let best = null;
  for (const s of transformsOf(c.ch)) {
    const dc = 10 + s.rank;
    for (const t of enemies) {
      if (!(inReach(b, c, t) || (mode === 'full' && squares(c, t) - reachSquares(b, c) <= squaresInMove(b, c)))) continue;
      const hit = hitOdds(touchBonus(c), defenseOf(t, 'Parry')).hit;
      const foes = [c, ...b.combatants.filter((x) => x.team === c.team && !x.out && !x.fled && x !== c)];
      const item = bestItem(b, c, t, foes);
      let u = 0; let pick = null;
      if (item) {
        const bonus = defenseOf(t, 'Dodge') - checkPenalty(t) + (item.item.held ? 5 : 0);
        u = hit * (1 - resistOdds(bonus, dc)[0]) * item.loss * HORIZON;
        pick = item.item;
      }
      if (inanimate(t) && resistOf(t, 'Will') !== null) {
        const dist = resistOdds(resistOf(t, 'Will'), dc);
        const threat = Math.max(0, ...t.attacks.map((a) => bestEvNow({ ...t, attacks: [a] }, c, feet(b, t, c), 0, true)));
        const out = hit * (dist[3] + dist[4]) * Math.max(threat, 1) * HORIZON;
        if (out > u) { u = out; pick = null; }
      }
      if (u > 0 && (!best || u > best.u)) best = { kind: 'transform', u, run: (bb, R, cc, rng) => run(bb, cc, s, t, pick, rng) };
    }
  }
  return best;
}

/** A being transformed reverts when the one holding the change can no longer keep it up. Called with the other upkeeps before every end check. */
export function transformUpkeep(b) {
  for (const t of b.combatants) {
    const mine = t.conditions.filter((x) => String(x.source).startsWith('transform|'));
    if (!mine.length) continue;
    const owner = b.combatants.find((x) => x.id === mine[0].from);
    if (owner && !owner.out && !owner.fled && canAct(owner) !== 'none') continue;
    t.conditions = t.conditions.filter((x) => !mine.includes(x));
    if (t.outReason === 'transformed') { t.out = false; t.outReason = null; }
    log(b, { kind: 'recover', actor: t.id, text: `${t.name} changes back: ${owner?.name || 'the one who held the change'} can no longer keep it up.` });
  }
}
