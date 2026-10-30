// The free actions that martial arts advantages add around an attack (Martial Arts 3e, Chapter 3):
//   Counterstrike, p74: in a round the fighter has not attacked, a free melee attack on each foe who lands a melee attack on it, up to
//     its ranks, each at a cumulative -2. The fighter has to have had its turn already, since an attack of its own later in the round
//     would break the condition (the AI does not hold an attack back to use it, so it fires for a fighter that spent its turn moving,
//     recovering or defending).
//   Defensive Throw, p58: a close attack on the fighter that misses by 2 or more degrees lets it trip the attacker as a free action.
//   Follow-Up Strike, p62: a critical hit with a melee attack earns another attack on the same foe as a free action.
//   Sweeping Strike, p66: a successful unarmed attack is joined by a trip attempt as a free action.
//   Reversal, p65: having slipped a grab, a grab check on the one who held you. Damaging Escape, p58: and a free unarmed attack on it.
//   Quick Throw, p65: right after a successful grab, a free throw (a trip) of the foe.
// The reactions are not themselves reacted to. Attacks are made by the caller's `resolve`, so this file does not import attacks.js.

import { log } from './util.js';
import { canAct, activeConditions } from './conditions.js';
import { inReach } from './geometry.js';
import { trip } from './trip.js';
import { grab } from './maneuvers.js';

let depth = 0; // above 0 while a reaction is being made

/** Run a reaction, and keep reactions from setting off reactions. */
function react(fn) { depth++; try { fn(); } finally { depth--; } }

/** A fighter's own attack (not a reaction) counts as initiating one this round. */
export function markAttacker(b, c) { if (!depth) c.attackRound = b.round; }

/** c's best close attack that reaches t. */
const bestMelee = (b, c, t) => c.attacks.filter((a) => a.range === 'close' && a.roll && !a.area && inReach(b, c, t, a)).sort((x, y) => y.bonus + y.rank - (x.bonus + x.rank))[0];

/** Counterstrike: the defender hits back at a foe who landed a melee attack on it. */
function counterstrike(b, R, c, atk, t, rng, resolve) {
  const ranks = t.adv.Counterstrike;
  const acted = b.order.indexOf(t.id) < b.turn - 1; // its turn this round is already over
  if (!ranks || !acted || t.attackRound === b.round || canAct(t) === 'none' || t.out || c.out) return;
  const used = t.counters?.round === b.round ? t.counters.n : 0;
  const mine = bestMelee(b, t, c);
  if (used >= ranks || !mine) return;
  t.counters = { round: b.round, n: used + 1 };
  log(b, { kind: 'note', actor: t.id, target: c.id, text: `Counterstrike: ${t.name} answers ${c.name}'s blow with a free attack${used ? ` (${used + 1}th, −${2 * (used + 1)})` : ''}.` });
  react(() => resolve(b, R, t, mine, c, rng, { penalty: { n: 2 * (used + 1), why: 'Counterstrike' } }));
}

/** After a hit on the defender: Counterstrike for the defender; Follow-Up Strike and Sweeping Strike for the attacker. */
export function afterMeleeHit(b, R, c, atk, t, rng, r, resolve) {
  if (depth || atk.range !== 'close' || atk.area) return;
  counterstrike(b, R, c, atk, t, rng, resolve);
  if (c.out || t.out) return;
  if (r.crit && c.adv['Follow-Up Strike'] && inReach(b, c, t, atk)) {
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `Follow-Up Strike: ${c.name} presses the critical hit with a free attack.` });
    react(() => resolve(b, R, c, atk, t, rng, {}));
  }
  if (c.adv['Sweeping Strike'] && (atk.unarmed || atk.maneuver) && !t.out && !activeConditions(t).has('Prone') && inReach(b, c, t, atk)) {
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `Sweeping Strike: ${c.name} follows the blow with a free trip attempt.` });
    react(() => trip(b, c, t, rng));
  }
}

/** After a miss by 2 or more degrees against a close attack: Defensive Throw. */
export function afterMeleeMiss(b, c, atk, t, rng, r) {
  if (depth || atk.range !== 'close' || atk.area || !t.adv['Defensive Throw'] || t.out || canAct(t) === 'none') return;
  const degrees = 1 + Math.floor((r.dcUsed - r.total - 1) / 5);
  if (degrees < 2 || !inReach(b, t, c)) return;
  log(b, { kind: 'note', actor: t.id, target: c.id, text: `Defensive Throw: ${c.name} missed by ${degrees} degrees, and ${t.name} turns it into a free trip attempt.` });
  react(() => trip(b, t, c, rng));
}

/** Reversal: the fighter has just slipped a grab and takes hold of the grabber. */
export function reversal(b, R, c, holder, rng) {
  if (!c.adv.Reversal || c.grabbedBy || holder.out || !inReach(b, c, holder)) return;
  log(b, { kind: 'note', actor: c.id, target: holder.id, text: `Reversal: ${c.name} slips the hold and grabs ${holder.name} in turn.` });
  grab(b, R, c, holder, rng);
}

/** Damaging Escape: having slipped a grab, a free unarmed attack on the grabber (an attack that can be used against it now). */
export function damagingEscape(b, R, c, holder, rng, resolve) {
  if (!c.adv['Damaging Escape'] || holder.out || c.out) return;
  const mine = c.attacks.filter((a) => a.range === 'close' && a.roll && !a.area && (a.unarmed || a.maneuver) && inReach(b, c, holder, a)).sort((x, y) => y.bonus + y.rank - (x.bonus + x.rank))[0];
  if (!mine) return;
  log(b, { kind: 'note', actor: c.id, target: holder.id, text: `Damaging Escape: ${c.name} strikes ${holder.name} as it breaks free.` });
  react(() => resolve(b, R, c, mine, holder, rng, {}));
}

/** Quick Throw: right after a successful grab, a free throw (a trip) of the grabbed foe. */
export function quickThrow(b, c, t, rng) {
  if (!c.adv['Quick Throw'] || t.out || activeConditions(t).has('Prone')) return;
  log(b, { kind: 'note', actor: c.id, target: t.id, text: `Quick Throw: ${c.name} hurls the foe it has just grabbed to the ground as a free action.` });
  react(() => trip(b, c, t, rng));
}
