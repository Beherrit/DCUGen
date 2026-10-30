// Ready (Hero's Handbook p177): a standard action to hold an action for later; the fighter may still move. The readied
// action is taken as a reaction when its trigger happens, any time before the fighter's next turn, and is lost if it has
// not happened by then.
//
// The AI readies two things:
// - an attack, when it cannot reach anyone this turn but a foe that can only fight up close is about to walk into reach:
//   the foe spends its move to get there and takes the first blow, instead of the fighter walking up and being struck first.
//   The trigger is a foe moving into the attack's reach or range (movement.js tells ready.js after every move).
// - a counter, when it has a power that can counter the best attack coming at it (counter.js): the counter is used the
//   moment such an attack hits, with no hero point.

import { log, rngFor, enemiesOf } from './util.js';
import { squares, squaresInMove, reachSquares, inReach, inRangeNow, lineClear } from './geometry.js';
import { onMoved } from './movement.js';
import { resolveAttack } from './attacks.js';
import { bestCounter } from './counter.js';
import { expectedValue } from './odds.js';
import { canAct } from './conditions.js';

const closeOnly = (e) => e.attacks.length > 0 && e.attacks.every((a) => a.range === 'close' && !a.area);

/** A foe that can reach c on its next turn with a move (and a charge), so it will walk into reach by itself. */
const willCome = (b, e, c) => squares(e, c) - reachSquares(b, e) <= squaresInMove(b, e) * 2 && squares(e, c) > reachSquares(b, e);

/** Is there an enemy attack coming that one of c's powers can counter well? */
function counterReady(c, enemies) {
  return enemies.some((e) => e.attacks.some((a) => a.roll && bestCounter(c, a)?.odds >= 0.5));
}

/**
 * Should c ready this turn, and which? Returns { kind: 'attack' | 'counter', atk } or null. A close fighter with nothing to hit
 * readies its best close attack when every foe is a brawler coming for it; a fighter with a good counter readies it.
 */
export function readyChoice(b, c, choice, enemies, mode) {
  if (mode !== 'full' || c.ready || c.out) return null;
  if (counterReady(c, enemies) && choice && choice.plan === 'move') return { kind: 'counter' };
  if (!choice || choice.plan !== 'move') return null;
  const close = c.attacks.filter((a) => a.range === 'close' && a.roll && !a.area);
  if (!close.length || !enemies.every(closeOnly) || !enemies.some((e) => willCome(b, e, c)) || enemies.some((e) => inReach(b, c, e))) return null;
  const best = close.map((a) => ({ a, ev: Math.max(...enemies.map((e) => expectedValue(c, a, e, { b }))) })).sort((x, y) => y.ev - x.ev)[0];
  return best.ev > 0.3 ? { kind: 'attack', atk: best.a } : null;
}

/** Ready: the standard action goes on waiting. True when the turn was used for it. */
export function readyTurn(b, c, choice, enemies, mode) {
  const pick = readyChoice(b, c, choice, enemies, mode);
  if (!pick) return false;
  c.ready = { kind: pick.kind, atk: pick.atk?.id || null, round: b.round };
  log(b, { kind: 'note', actor: c.id, text: pick.kind === 'attack' ? `${c.name} readies ${pick.atk.name}: it will strike whoever walks into reach before ${c.name}'s next turn (Ready).` : `${c.name} readies a counter for the next attack (Ready).` });
  return true;
}

/** The start of the fighter's own turn: a readied action that never happened is lost. */
export function dropReady(b, c) {
  if (!c.ready) return;
  log(b, { kind: 'note', actor: c.id, text: `${c.name}'s readied ${c.ready.kind} never came to anything, and is lost.` });
  c.ready = null;
}

/** A fighter moved: every enemy with a readied attack that the mover is now in reach or range of takes it, once. */
function onMove(b, mover) {
  for (const r of enemiesOf(b, mover)) {
    if (r.ready?.kind !== 'attack' || canAct(r) === 'none') continue;
    const atk = r.attacks.find((a) => a.id === r.ready.atk);
    if (!atk || !(atk.range === 'close' ? inReach(b, r, mover, atk) : inRangeNow(b, r, atk, mover) && lineClear(b, r, mover))) continue;
    r.ready = null;
    log(b, { kind: 'note', actor: r.id, target: mover.id, text: `${r.name} takes the readied attack as ${mover.name} comes in (reaction).`, important: true });
    resolveAttack(b, null, r, atk, mover, rngFor(b), {});
  }
}
onMoved(onMove);
