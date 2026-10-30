// What an Attack-extra effect does to a target that failed its check (Hero's Handbook p128). A Teleport Attack sends the
// target away: up to the Teleport's distance from where it stands, to the open square farthest from the attacker.

import { log } from './util.js';
import { rankFt } from '../range.js';
import { squares } from './geometry.js';
import { isPlayable, spotName } from './grid.js';
import { isOpenSquare } from './path.js';
import { releaseHolds } from './maneuvers.js';

/** The open square the attacker would send the target to: within the effect's distance of the target, as far from the attacker as it goes. */
function farthest(b, c, t, rank) {
  const reach = Math.max(1, Math.floor(rankFt(rank) / b.grid.squareFt));
  let best = null;
  for (let y = b.grid.play.y0; y <= b.grid.play.y1; y++) {
    for (let x = b.grid.play.x0; x <= b.grid.play.x1; x++) {
      if (!isPlayable(b, x, y) || !isOpenSquare(b, x, y) || squares(t, { x, y }) > reach) continue;
      const d = squares(c, { x, y });
      if (!best || d > best.d) best = { x, y, d };
    }
  }
  return best;
}

/** The target failed its check against an Attack-extra effect: carry the effect out. */
export function attackFormResult(b, c, atk, t, fails, base, dice, rank) {
  if (atk.effect !== 'Teleport') return { landed: false };
  const to = farthest(b, c, t, rank);
  if (!to || to.d <= squares(c, t)) {
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${base} — ${fails} degree${fails > 1 ? 's' : ''}: ${atk.name} has nowhere farther to send ${t.name}.`, dice });
    return { landed: true, degrees: fails };
  }
  const from = spotName(t);
  t.x = to.x; t.y = to.y;
  if (t.grabbedBy || t.holding) releaseHolds(b, t);
  log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${base} — ${fails} degree${fails > 1 ? 's' : ''}: ${t.name} is teleported away from ${from} to ${spotName(t)} (Teleport Attack).`, dice, important: true });
  return { landed: true, degrees: fails };
}
