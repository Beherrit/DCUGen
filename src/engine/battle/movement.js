// Moving across the arena.

import { log } from './util.js';
import { moveZones } from './conditions.js';

export function moveTo(b, c, dest, why) {
  if (dest === c.pos) return;
  const from = c.pos;
  c.pos = dest;
  log(b, { kind: 'move', actor: c.id, text: `${c.name} ${c.flying ? 'flies' : c.speed >= 3 ? 'blurs' : 'moves'} ${why ? `${why} ` : ''}(zone ${from + 1} → ${dest + 1}).` });
}

export function moveToward(b, c, t, rng, moves = 1) {
  void rng;
  const zones = moveZones(c) * moves;
  if (!zones) { log(b, { kind: 'skip', actor: c.id, text: `${c.name} can't move.` }); return; }
  if (t.pos === c.pos) return;
  const dir = t.pos > c.pos ? 1 : -1;
  const dist = Math.abs(t.pos - c.pos);
  const dest = c.pos + dir * Math.min(zones, dist);
  moveTo(b, c, dest, dest === t.pos ? `${moves > 1 ? 'all the way ' : ''}to ${t.name}` : `toward ${t.name}`);
}
