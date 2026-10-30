// The Attack extra (Hero's Handbook p128): a personal effect made into a close range attack on someone else, which the
// target resists (Dodge or Will, set when it is built; Will unless the power says otherwise). A Teleport Attack sends the
// target away: up to the Teleport's distance from where it stands, to the open square farthest from the attacker. Other
// effects with the Attack extra (Shrinking, Insubstantial, Morph...) have no rule here yet and are left out of the fight
// when the attacks are built (supportsForm).

import { log } from './util.js';
import { rankFt } from '../range.js';
import { squares } from './geometry.js';
import { isPlayable, spotName } from './grid.js';
import { isOpenSquare } from './path.js';
import { releaseHolds } from './maneuvers.js';

const FORMS = ['Teleport'];

/** Does the engine know what this effect does as an Attack? */
export const supportsForm = (effect) => FORMS.includes(effect);

/**
 * Called as an attack is built. An Attack extra on an effect that is an attack already changes nothing. On a personal effect
 * the engine knows (Teleport) it sets the target's resistance (Will, or the one the power names) and a control value for the
 * AI; on any other it leaves the attack unmarked (`formOk`), and the fight leaves it out.
 */
export function formAttack(atk, p, eff) {
  if (!atk.ex?.attackForm) return;
  if (eff.attack === true || eff.type === 'Attack') { atk.formOk = true; atk.ex = { ...atk.ex, attackForm: false }; return; }
  if (!supportsForm(atk.effect)) return;
  const named = /resisted by ([A-Za-z]+)/i.exec(String(p?.detail || ''))?.[1];
  atk.formOk = true;
  atk.resistance = named ? named[0].toUpperCase() + named.slice(1).toLowerCase() : 'Will';
  atk.tiers = [['Stunned']]; atk.maxDegree = 1;
}

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
