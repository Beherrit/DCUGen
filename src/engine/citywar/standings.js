// The table at the end of (or during) a war: one row per team, best first.

import { fighters } from './war.js';

/**
 * Rows of { id, name, color, tactic, fights, won, left, kos, outTurn, alive }. A team still in the war ranks above
 * one that is out; teams that are out rank by how long they lasted; ties by fights won and KOs dealt.
 */
export function standings(war) {
  const rows = war.teams.map((t) => ({
    id: t.id, name: t.name, color: t.color, tactic: t.tactic, fights: t.fights, won: t.won, kos: t.kos,
    left: t.status === 'alive' ? fighters(t).length : 0, outTurn: t.outTurn, alive: t.status === 'alive',
  }));
  const last = (r) => (r.alive ? Infinity : r.outTurn ?? 0);
  return rows.sort((a, b) => last(b) - last(a) || b.won - a.won || b.kos - a.kos || (a.name < b.name ? -1 : 1));
}
