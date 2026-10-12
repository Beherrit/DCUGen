// Pools: powers that are not always on. A drain that steals points, a boost, a "redistribute my stats"
// power: the character has up to N points and places them during play, on any ability, defense, skill,
// power or something else. A pool power counts for nothing until points are placed (p.placed), and the
// power level limits are checked on the build without them.

import { ABILITIES, BUYABLE_DEFENSES } from './rules.js';

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

export function poolUsed(p) {
  return (p.placed || []).reduce((s, x) => s + (x.points || 0), 0);
}

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
