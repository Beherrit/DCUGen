// Carrying out the extras that come back later (extra-after.js writes them down):
// - Secondary Effect (DCA 132): at the end of the attacker's next turn the effect hits again, with the target's normal check.
// - Increased Duration (DCA 129): a held effect is applied again on each of the user's turns, with no new attack check and
//   no critical hit: concentration takes the standard action, sustained a free action, continuous nothing.
// - Contagious (DCA 129): a carrier that ends its turn touching someone (next to them) passes the effect on, and they resist it normally.
// - Homing (DCA 129): a ranged attack that missed tries again at the start of the attacker's next turn, as a free action,
//   one extra try per rank; a miss that concealment caused loses the lock.

import { log, byId } from './util.js';
import { squares, inRangeNow, lineClear } from './geometry.js';
import { expectedValue } from './odds.js';
import { applyEffect } from './attack-effects.js';
import { resolveAttack } from './attacks.js';
import { ownUtility } from './utility.js';

const gone = (x) => !x || x.out || x.fled;
const attackOf = (c, id) => c.attacks.find((a) => a.id === id);

/** The end of c's turn: every Secondary Effect it set on the previous round hits again. */
export function runSecondary(b, R, c, rng) {
  for (const t of b.combatants) {
    const due = (t.secondary || []).filter((e) => e.from === c.id && e.round < b.round);
    if (!due.length) continue;
    t.secondary = t.secondary.filter((e) => !due.includes(e));
    for (const e of due) {
      const atk = attackOf(c, e.atk);
      if (!atk || gone(t)) continue;
      log(b, { kind: 'attack', actor: c.id, target: t.id, text: `${atk.name}: Secondary Effect hits ${t.name} again.`, important: true });
      applyEffect(b, R, c, atk, t, rng, { auto: true, crit: false, rankShift: e.rankShift, later: true });
    }
  }
}

/** One held effect, applied again. */
function reapply(b, R, c, e, atk, t, rng) {
  log(b, { kind: 'attack', actor: c.id, target: t.id, text: `${c.name} keeps ${atk.name} on ${t.name} (Increased Duration, ${e.mode}): no new attack check.` });
  applyEffect(b, R, c, atk, t, rng, { auto: true, crit: false, rankShift: e.rankShift, later: true });
}

/** The held effects that are still on a live target; the rest are dropped. */
function liveHeld(b, c) {
  c.lasting = (c.lasting || []).filter((e) => attackOf(c, e.atk) && !gone(byId(b, e.target)));
  return c.lasting;
}

/** The start of c's turn: sustained and continuous effects are kept up with a free action (or none). */
export function freeHeld(b, R, c, rng) {
  for (const e of liveHeld(b, c).filter((x) => x.mode !== 'concentration')) {
    if (e.mode === 'sustained' && (c.out || c.fled)) continue;
    reapply(b, R, c, e, attackOf(c, e.atk), byId(b, e.target), rng);
  }
}

/** Keep a concentration effect up with the standard action when that beats the turn the fighter had planned; otherwise let it go. True when the standard action went on it. */
export function concentrateHeld(b, R, c, choice, rng) {
  const held = liveHeld(b, c).filter((e) => e.mode === 'concentration');
  if (!held.length) return false;
  const own = ownUtility(choice);
  const scored = held.map((e) => ({ e, atk: attackOf(c, e.atk), t: byId(b, e.target) })).map((x) => ({ ...x, u: expectedValue(c, x.atk, x.t, { autoHit: true, b }) })).sort((p, q) => q.u - p.u);
  const best = scored[0];
  if (best.u > own) {
    c.lasting = c.lasting.filter((e) => e === best.e || e.mode !== 'concentration');
    reapply(b, R, c, best.e, best.atk, best.t, rng);
    return true;
  }
  log(b, { kind: 'recover', actor: c.id, text: `${c.name} lets go of ${[...new Set(scored.map((x) => x.atk.name))].join(', ')} to do something better.` });
  c.lasting = c.lasting.filter((e) => e.mode !== 'concentration');
  return false;
}

/** Is the carrier still showing signs of this effect? An Affliction wears off, Weaken returns; Damage lasts the fight. */
function stillCarries(carrier, atk, e) {
  if (atk.tiers && atk.effect !== 'Damage') return carrier.conditions.some((x) => x.source === atk.id && x.from === e.from);
  if (atk.effect === 'Weaken') return Object.keys(carrier.weakened).length > 0;
  return true;
}

/** The end of the carrier's turn: whoever it is touching (next to it) is exposed to every Contagious effect it carries. */
export function spreadContagion(b, R, c, rng) {
  if (!c.contagion?.length || gone(c)) return;
  for (const e of [...c.contagion]) {
    const owner = byId(b, e.from);
    const atk = owner && attackOf(owner, e.atk);
    if (!atk || !stillCarries(c, atk, e)) { c.contagion = c.contagion.filter((x) => x !== e); continue; }
    for (const x of b.combatants.filter((y) => !gone(y) && y !== c && y !== owner && squares(y, c) <= 1 && !(y.contagion || []).some((z) => z.atk === e.atk && z.from === e.from))) {
      log(b, { kind: 'note', actor: c.id, target: x.id, text: `${atk.name}: Contagious: ${x.name} touches ${c.name} and is exposed to it.` });
      const res = applyEffect(b, R, owner, atk, x, rng, { auto: true, crit: false, rankShift: e.rankShift, later: true });
      if (res?.landed) (x.contagion ||= []).push({ from: e.from, atk: e.atk, rankShift: e.rankShift });
    }
  }
}

/** The start of c's turn: every Homing attack that missed tries again, as a free action. */
export function runHoming(b, R, c, rng) {
  const tries = c.homing || [];
  c.homing = [];
  for (const h of tries) {
    const atk = attackOf(c, h.atk); const t = byId(b, h.target);
    if (!atk || gone(t) || !inRangeNow(b, c, atk, t) || !lineClear(b, c, t)) continue;
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: Homing tries ${t.name} again (free action).` });
    resolveAttack(b, R, c, atk, t, rng, { homing: h.left - 1 });
  }
}
