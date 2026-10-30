// Round robin tiebreaks. Entrants level on points are ordered by their results against each other (head-to-head), then
// by knockouts dealt in the whole tournament, then by a coin flip drawn from the tournament seed (so it is always
// the same for the same tournament). Each tied entrant records which rule split it from the others.

import { makeRng } from '../rng.js';

/** Points an entrant earned in matches against the others in `group` only. */
function headToHead(t, group) {
  const pts = Object.fromEntries(group.map((id) => [id, 0]));
  for (const m of t.matches) {
    if (!m.done || !m.games.length || !(m.a.id in pts) || !(m.b.id in pts)) continue;
    if (m.draw) { pts[m.a.id] += 1; pts[m.b.id] += 1; } else pts[m.winner] += 3;
  }
  return pts;
}

/** Order one group of tied entrants (ids), noting in `why` which rule decided each. */
function settle(t, group, kos, why, steps) {
  if (group.length < 2) return group;
  const [name, score] = steps[0];
  const pts = score(t, group, kos);
  const values = [...new Set(group.map((id) => pts[id]))].sort((x, y) => y - x);
  if (values.length === 1) return settle(t, group, kos, why, steps.slice(1));
  for (const id of group) why[id] = name;
  return values.flatMap((v) => settle(t, group.filter((id) => pts[id] === v), kos, why, steps.slice(1)));
}

const coinFlip = (t, group) => {
  const order = makeRng(`${t.seed}::tiebreak::${[...group].sort().join(',')}`).shuffle(group);
  return Object.fromEntries(order.map((id, i) => [id, order.length - i]));
};

const STEPS = [
  ['head-to-head', headToHead],
  ['KOs dealt', (t, group, kos) => Object.fromEntries(group.map((id) => [id, kos[id]]))],
  ['coin flip', coinFlip],
];

/**
 * Sort the table rows ({ id, points, kos }) by points, breaking ties. Returns the rows in order, each with `decidedBy`
 * (the rule that separated it from the entrants level with it, or null when its points were its own).
 */
export function orderTable(t, rows) {
  const kos = Object.fromEntries(rows.map((r) => [r.id, r.kos]));
  const byPoints = [...new Set(rows.map((r) => r.points))].sort((x, y) => y - x);
  const why = {};
  const ids = byPoints.flatMap((p) => settle(t, rows.filter((r) => r.points === p).map((r) => r.id), kos, why, STEPS));
  return ids.map((id) => ({ ...rows.find((r) => r.id === id), decidedBy: why[id] || null }));
}
