// Moving the bracket on after a match: filling the slots that a finished match feeds, giving byes where a slot will never
// be filled, skipping the grand final reset when it is not needed, and saying when the tournament is over.

export const matchById = (t, id) => t.matches.find((m) => m.id === id) || null;

/** The entrant a finished feeder gives to a slot: its winner or loser, or nobody (a bye, or a skipped match). */
function taken(feeder, take) {
  if (feeder.skipped || feeder.dead) return null;
  return (take === 'winner' ? feeder.winner : feeder.loser) || null;
}

function fillSlot(t, slot) {
  if (!slot.from || slot.id || slot.dead) return false;
  const feeder = matchById(t, slot.from.match);
  if (!feeder || !feeder.done) return false;
  const id = taken(feeder, slot.from.take);
  if (id) slot.id = id; else slot.dead = true;
  return true;
}

/** The grand final reset is played only when the losers' side won the grand final. */
function settleReset(t, m) {
  const f1 = matchById(t, 'F1');
  if (!f1 || !f1.done) return false;
  if (f1.winner !== f1.a.id) return false;
  Object.assign(m, { done: true, skipped: true });
  return true;
}

/** A match with a dead slot is a walkover for the other side (a bye); with two dead slots it never happens. */
function settleByes(m) {
  const dead = [m.a.dead, m.b.dead];
  if (dead[0] && dead[1]) { Object.assign(m, { done: true, dead: true }); return true; }
  if (dead[0] && m.b.id) { Object.assign(m, { done: true, bye: true, winner: m.b.id }); return true; }
  if (dead[1] && m.a.id) { Object.assign(m, { done: true, bye: true, winner: m.a.id }); return true; }
  return false;
}

/** The winner of an elimination bracket, or null while it is still going. (A round robin is decided by its table.) */
export function eliminationChampion(t) {
  if (t.format === 'double') {
    const f1 = matchById(t, 'F1'); const f2 = matchById(t, 'F2');
    if (!f2.done) return null;
    return f2.skipped ? f1.winner : f2.winner;
  }
  const final = t.matches[t.matches.length - 1];
  return final.done ? final.winner : null;
}

/** Bring every slot and bye up to date. Run after any change to the matches. */
export function resolve(t) {
  let changed = true; let guard = 0;
  while (changed && guard++ < 1000) {
    changed = false;
    for (const m of t.matches) {
      if (m.done) continue;
      if (m.reset && settleReset(t, m)) { changed = true; continue; }
      changed = fillSlot(t, m.a) || changed;
      changed = fillSlot(t, m.b) || changed;
      if (settleByes(m)) changed = true;
    }
  }
  return t;
}

/** The next match to play: the first one in play order that has both entrants and has not been played. */
export function nextMatch(t) {
  return t.matches.find((m) => !m.done && m.a.id && m.b.id) || null;
}
