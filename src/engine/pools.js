// Pools: powers that are not always on. A drain that steals points, a boost, a "redistribute my stats"
// power: the character holds up to N power points and places them during play, on any ability, defense,
// skill, power or something else. A pool power counts for nothing until points are placed (p.placed), and
// the power level limits are checked on the build without them.
//
// Pools count in power points, the way Weaken drains them (DCA 122): a rank of an ability costs 2, a rank
// of a defense 1, two skill ranks 1, a rank of a power its cost per rank. So Enhanced Stamina 6 is a
// 12-point pool, and 12 points drained buy 6 ranks of an ability or 12 of a defense.
//
// A pool can be fed by a Weaken power (p.feed = its name): then it only holds what that Weaken has
// drained and still keeps (weaken.drained), which fades and is knocked loose by damage.

import { ABILITIES, BUYABLE_DEFENSES, traitKind } from './rules.js';
import { effectCost } from './costs.js';
import { weakenPoints } from './house.js';

/** Every pool power with where it lives (path as the sheet uses it). */
export function poolPowers(ch) {
  const out = [];
  const visit = (list, device) => (list || []).forEach((p, index) => {
    if (p.pool) out.push({ power: p, path: { device, index } });
    (p.alternates || []).forEach((a, alt) => { if (a.pool) out.push({ power: a, path: { device, index, alt } }); });
  });
  visit(ch.powers, null);
  (ch.devices || []).forEach((d, i) => visit(d.powers, i));
  return out;
}

/** Points placed from all pools on one target ("Strength", "Toughness", "skill:Athletics", "power:Flight"). */
export function placedOn(ch, target) {
  let n = 0;
  for (const { power } of poolPowers(ch)) for (const x of power.placed || []) if (x.target === target) n += x.points || 0;
  return n;
}

/** Ranks placed (what the pool adds to traits). */
export function poolUsed(p) {
  return (p.placed || []).reduce((s, x) => s + (x.points || 0), 0);
}

/** Power points one placed rank costs on a target. */
export function costPerRank(ch, target, R) {
  if (ABILITIES.includes(target)) return 2;
  if (BUYABLE_DEFENSES.includes(target) || target === 'Toughness') return 1;
  if (target.startsWith('skill:')) return 0.5;
  if (target.startsWith('power:')) {
    const name = target.slice(6);
    const p = findPower(ch, (x) => x.name === name);
    if (p && R) {
      try { const per = effectCost(p, R).perRank; return per >= 1 ? per : 1 / (2 - per); } catch { /* unknown effect */ }
    }
    return 1;
  }
  return 1;
}

function findPower(ch, test) {
  const all = [];
  const visit = (list) => (list || []).forEach((p) => { all.push(p); for (const l of p.linked || []) all.push(l); for (const a of p.alternates || []) visit([a]); });
  visit(ch.powers);
  for (const d of ch.devices || []) visit(d.powers);
  return all.find(test) || null;
}

/** The most power points the pool can hold: Enhanced Trait 6 on an ability is 12, a Variable is 5 per rank. */
export function poolCapacity(p, R) {
  if (p.effect === 'Enhanced Trait') {
    const kind = R ? traitKind(p.option, R) : 'ability';
    if (kind === 'ability') return p.rank * 2;
    if (kind === 'skill') return Math.ceil(p.rank / 2);
    return p.rank;
  }
  if (p.effect === 'Variable') return p.rank * 5;
  return p.rank;
}

/** Power points the placed ranks cost. */
export function poolSpent(ch, p, R) {
  return (p.placed || []).reduce((s, x) => s + (x.points || 0) * costPerRank(ch, x.target, R), 0);
}

/** The Weaken power that fills this pool, if any. */
export function poolFeeder(ch, p) {
  return p.feed ? findPower(ch, (x) => x.name === p.feed && x.effect === 'Weaken') : null;
}

/** Power points the pool has to spend right now: its capacity, or what its Weaken still holds if it is fed. */
export function poolAvailable(ch, p, R) {
  const cap = poolCapacity(p, R);
  const feeder = poolFeeder(ch, p);
  return feeder ? Math.min(cap, feeder.drained || 0) : cap;
}

/** Take placed ranks back (newest first) until the pool spends no more than it has. Mutates p. */
export function trimPool(ch, p, R) {
  const avail = poolAvailable(ch, p, R);
  const placed = p.placed || [];
  while (placed.length && poolSpent(ch, p, R) > avail + 1e-9) {
    const last = placed[placed.length - 1];
    last.points -= 1;
    if (last.points <= 0) placed.pop();
  }
  if (!placed.length) delete p.placed;
}

/**
 * Weaken: the target missed its resistance check by `missedBy`; the drain keeps that many power points,
 * up to the Weaken's rank in all (DCA 122). Returns the points actually taken. Mutates the Weaken.
 */
export function drain(weaken, missedBy) {
  const room = Math.max(0, weaken.rank - (weaken.drained || 0));
  const took = Math.max(0, Math.min(room, weakenPoints(missedBy)));
  weaken.drained = (weaken.drained || 0) + took;
  return took;
}

/** Drained points slip away (a round passes with Fades, or damage knocks them loose). Mutates. */
export function loseDrained(weaken, n = 1) {
  weaken.drained = Math.max(0, (weaken.drained || 0) - n);
  if (!weaken.drained) delete weaken.drained;
}

/** After a Weaken changes, trim every pool it feeds. Mutates ch. */
export function settlePools(ch, R) {
  for (const { power } of poolPowers(ch)) if (power.feed) trimPool(ch, power, R);
}

export const fmtPoints = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));

export function hasPlaced(ch) {
  return poolPowers(ch).some(({ power }) => poolUsed(power) > 0);
}

/** The character as built: every pool emptied. */
export function withoutPlaced(ch) {
  if (!hasPlaced(ch)) return ch;
  const c = JSON.parse(JSON.stringify(ch));
  for (const { power } of poolPowers(c)) delete power.placed;
  return c;
}

const skillLabel = (s) => (s.spec ? `${s.name} (${s.spec})` : s.name);

/** What pool points can go into, grouped for a dropdown. */
export function poolTargets(ch) {
  const powers = [];
  const visit = (list) => (list || []).forEach((p) => { if (!p.pool) powers.push(p.name); for (const a of p.alternates || []) if (!a.pool) powers.push(a.name); });
  visit(ch.powers);
  for (const d of ch.devices || []) visit(d.powers);
  return [
    ['Abilities', ABILITIES.filter((a) => ch.abilities?.[a] !== null).map((a) => [a, a])],
    ['Defenses', [...BUYABLE_DEFENSES, 'Toughness'].map((d) => [d, d])],
    ['Skills', (ch.skills || []).map((s) => [`skill:${skillLabel(s)}`, skillLabel(s)])],
    ['Powers (adds ranks)', [...new Set(powers)].map((n) => [`power:${n}`, n])],
    ['Anything else', [['other', 'Something else (write a note)']]],
  ].filter(([, list]) => list.length);
}

export function targetLabel(x) {
  if (x.target === 'other') return x.note || 'Something else';
  return x.target.replace(/^(skill|power):/, '');
}
