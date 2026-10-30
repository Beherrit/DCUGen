// After a hit with an extra that comes back later: it is written down on the fighters, and extra-run.js carries it out
// when its turn comes. Secondary Effect (DCA 132: hits again on the following round, at the end of the attacker's turn),
// Increased Duration (DCA 129: the effect is kept up on the target turn after turn) and Contagious (DCA 129: the effect
// spreads to whoever touches the target).

import { log } from './util.js';
import { durationOf } from './extras.js';

const WORDS = { concentration: 'a standard action each turn (Concentration)', sustained: 'a free action each turn (Sustained)', continuous: 'no action at all (Continuous)' };

/** Write down what the hit sets going. `res` is the effect's result, `opts` the options applyEffect had. */
export function scheduleAfter(b, c, atk, t, res, opts) {
  const ex = atk.ex;
  const rankShift = opts.rankShift || 0;
  const live = !t.out && !t.fled; // a downed target is not hit again or held, but a carrier still carries
  if (ex.secondary && live) {
    // Secondary Effects do not stack: another hit only moves the second effect back a round
    t.secondary = (t.secondary || []).filter((e) => !(e.from === c.id && e.atk === atk.id));
    t.secondary.push({ from: c.id, atk: atk.id, round: b.round, rankShift });
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: Secondary Effect: it hits ${t.name} again at the end of ${c.name}'s next turn.` });
  }
  const dur = durationOf(ex);
  if (dur && live && !(c.lasting || []).some((e) => e.atk === atk.id && e.target === t.id)) {
    (c.lasting ||= []).push({ atk: atk.id, target: t.id, mode: dur, rankShift, since: b.round });
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: Increased Duration: ${c.name} keeps it on ${t.name} with ${WORDS[dur]}.` });
  }
  if (ex.contagious && res?.landed && !(t.contagion || []).some((e) => e.atk === atk.id && e.from === c.id)) {
    (t.contagion ||= []).push({ from: c.id, atk: atk.id, rankShift });
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: Contagious: ${t.name} now spreads it to anyone who touches ${t.name}.` });
  }
}

/** A ranged attack missed: it may try again next turn (Homing). A miss that concealment caused loses the lock. */
export function noteHoming(b, c, atk, t, left, lostToConcealment) {
  if (!atk.ex?.homing || atk.kind !== 'ranged' || (t.out || t.fled)) return;
  const tries = left ?? atk.ex.homing;
  if (tries <= 0) return;
  if (lostToConcealment) { log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: Homing loses its lock on ${t.name}, which concealment hid it from.` }); return; }
  c.homing = (c.homing || []).filter((h) => h.atk !== atk.id);
  c.homing.push({ atk: atk.id, target: t.id, left: tries });
  log(b, { kind: 'note', actor: c.id, target: t.id, text: `${atk.name}: Homing: it will try ${t.name} again at the start of ${c.name}'s next turn (${tries} ${tries === 1 ? 'try' : 'tries'} left).` });
}
