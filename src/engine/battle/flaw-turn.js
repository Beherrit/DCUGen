// Flaws that change how a turn is spent: Activation (DCA 133), Increased Action (DCA 135) and Immobile (MA 97) decide
// what the turn's actions go on, Uncontrolled (DCA 138) fires a power on its own, and Concentration (DCA 135) holds an
// effect on a target only while the user keeps its mind on it. turn.js and turn-attack.js call these; a fighter with no
// flawed attack costs them nothing (no dice, no log).

import { log, byId } from './util.js';
import { flawKey } from './flaws.js';
import { inRangeNow, reachSquares, shootSquares, squares } from './geometry.js';
import { moveToward, moveTo } from './movement.js';
import { isOpenSquare } from './path.js';
import { canAct } from './conditions.js';
import { stopOfNames } from './control-stop.js';
import { resolveAttack } from './attacks.js';

/** The start of a turn: what a Distracting use left (vulnerable) and a Push Over use (braced less) is over. */
export function flawsStartTurn(c) {
  c.distracted = false;
  c.flaw.pushOver = null;
}

/** Activation: switch the power on. A move action leaves the standard action for the attack if the target is already in range; a standard action is the whole turn. True when the turn is used. */
function activate(b, c, atk, t, mode) {
  const f = atk.flaws;
  const key = flawKey(atk);
  if (!f.activation || c.flaw.on[key]) return false;
  c.flaw.on[key] = true;
  log(b, { kind: 'note', actor: c.id, target: t.id, text: `${c.name} activates ${key} (Activation: a ${f.activation === 2 ? 'standard' : 'move'} action) before it can be used.` });
  if (f.activation === 2) return true;
  if (mode === 'full' && inRangeNow(b, c, atk, t)) { c.noMove = true; return false; }
  return true;
}

/**
 * Increased Action (a full action) and Immobile (only while stationary): the attack is made from where the fighter
 * stands, so a fighter out of range spends the turn closing in, and a dazed one cannot use a full-action effect at all.
 */
function stayPut(b, c, atk, t, mode, rng) {
  const f = atk.flaws;
  if (!f.increased && !f.immobile) return false;
  const why = f.increased ? 'Increased Action: it takes a full action' : 'Immobile: it can only be used while stationary';
  if (f.increased && mode !== 'full') { log(b, { kind: 'skip', actor: c.id, target: t.id, text: `${atk.name}: ${why}, and ${c.name} has only a standard action this turn.` }); return true; }
  if (!inRangeNow(b, c, atk, t) || c.squaresMoved > 0) {
    if (mode === 'full' && !c.squaresMoved) {
      log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: ${why}, so ${c.name} closes in first and uses it next turn.` });
      moveToward(b, c, t, rng, 1, atk.range === 'close' ? reachSquares(b, c, atk) : shootSquares(b, c));
    }
    return true;
  }
  if (f.increased || f.immobile === 2) c.noMove = true; // the whole turn, or staying put while it is used
  return false;
}

/**
 * Momentum-Based (MA 97): the effect is only as strong as the speed behind it, so the fighter runs first. A step to an open
 * square next to it that keeps the target within reach or range is the run (house rule: any move counts, see flaw-odds.js).
 * True when the turn could not go on (no room to run, or the run took it out of range and the attack must wait).
 */
function buildRun(b, c, atk, t, mode) {
  if (!atk.flaws.momentum || c.squaresMoved > 0 || !inRangeNow(b, c, atk, t)) return false; // out of range: closing in is the run
  const here = { x: c.x, y: c.y };
  const steps = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: c.x + dx, y: c.y + dy }))).filter((s) => (s.x !== c.x || s.y !== c.y) && isOpenSquare(b, s.x, s.y));
  const best = mode === 'full' ? steps.filter((s) => { c.x = s.x; c.y = s.y; const ok = inRangeNow(b, c, atk, t); c.x = here.x; c.y = here.y; return ok; }).sort((p, q) => squares(p, t) - squares(q, t))[0] : null;
  if (!best) { log(b, { kind: 'skip', actor: c.id, target: t.id, text: `${atk.name}: Momentum-Based: ${c.name} has no room or no move left to build speed, so it cannot use it.` }); return true; }
  moveTo(b, c, best, 'to build speed (Momentum-Based)');
  return false;
}

/** Before an attack turn moves or attacks: Activation, then Increased Action and Immobile, then the run-up of a Momentum-Based effect. True when the turn was used. */
export function flawedAction(b, c, atk, t, mode, rng) {
  return !!atk.flaws && (activate(b, c, atk, t, mode) || stayPut(b, c, atk, t, mode, rng) || buildRun(b, c, atk, t, mode));
}

/**
 * Uncontrolled (DCA 138): the GM, not the user, decides when it works. house rule: the book gives no table, so each turn
 * the power goes off by itself on a d20 of 11 or more, at a foe in range picked at random, using no action. The AI never
 * chooses it (flaw-odds.js values it at nothing).
 */
export function uncontrolledFire(b, R, c, enemies, rng) {
  for (const atk of c.attacks.filter((a) => a.flaws?.uncontrolled)) {
    const roll = rng.int(1, 20);
    const targets = enemies.filter((e) => !e.out && !e.fled && inRangeNow(b, c, atk, e));
    if (roll <= 10 || !targets.length) continue;
    const t = rng.pick(targets);
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: Uncontrolled: it goes off on its own (d20 ${roll}) at ${t.name}.`, important: true });
    resolveAttack(b, R, c, atk, t, rng, {});
  }
}

/** Every condition other fighters carry that c is holding on with Concentration. */
const heldBy = (b, c) => b.combatants.flatMap((t) => t.conditions.filter((x) => x.from === c.id && x.concentrate).map((cond) => ({ t, cond })));

function release(b, c, held, why) {
  for (const { t, cond } of held) t.conditions = t.conditions.filter((x) => x.source !== cond.source || x.from !== c.id);
  const names = [...new Set(held.map(({ cond }) => cond.label || 'the effect'))].join(', ');
  log(b, { kind: 'recover', actor: c.id, text: `Concentration: ${names} ends, ${why}.` });
}

/** The start of c's turn: it cannot hold a Concentration effect while it cannot act. */
export function concentrationLost(b, c, mode) {
  const held = heldBy(b, c);
  if (held.length && (mode === 'none' || mode === 'controlled')) release(b, c, held, `because ${c.name} cannot concentrate`);
}

/** Keeping an effect up takes the standard action (DCA 135). The AI does it for a control that stops its target; otherwise it lets go. True when the standard action went on it. */
export function concentrate(b, c) {
  const held = heldBy(b, c).filter(({ t }) => !t.out && !t.fled);
  if (!held.length) return false;
  const strong = held.filter(({ cond }) => stopOfNames(cond.names) >= 0.5);
  if (!strong.length) { release(b, c, held, `as ${c.name} turns to something better`); return false; }
  log(b, { kind: 'note', actor: c.id, text: `${c.name} concentrates to keep ${[...new Set(strong.map(({ cond }) => cond.label))].join(', ')} on ${[...new Set(strong.map(({ t }) => t.name))].join(', ')} (Concentration: a standard action each turn).` });
  return true;
}

/** When a holder falls, flees or is stunned, the effects it held by Concentration end (checked as the held target's turn ends). */
export function concentrationBroken(b, t) {
  for (const cond of t.conditions.filter((x) => x.concentrate)) {
    const holder = byId(b, cond.from);
    if (holder && !holder.out && !holder.fled && canAct(holder) !== 'none') continue;
    t.conditions = t.conditions.filter((x) => x.source !== cond.source || x.from !== cond.from);
    log(b, { kind: 'recover', actor: t.id, text: `Concentration: ${cond.label || 'the effect'} on ${t.name} ends, because ${holder?.name || 'its user'} can no longer concentrate.` });
  }
}
