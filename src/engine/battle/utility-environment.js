// Environment as a utility (environment.js): the worth of each change to the surroundings over the next rounds, net of what it does
// to our own side standing in the same radius.
//  - impede movement: each foe that must still close in loses turns getting to us (extra turns to cross the gap at the slower
//    speed, up to 3), each worth the foe's harm per round (utility-scale.js); our own melee fighters in the radius lose the same.
//  - light: the attack odds our side gains against foes hidden by darkness, when the light takes the concealment off.
//  - extreme cold or heat: a fatigue check only every tenth round, so it is worth something only to a fight that may last that long.

import { alliesOf } from './util.js';
import { canAct } from './conditions.js';
import { feet, squares, reachSquares } from './geometry.js';
import { bestEvNow, expectedValue } from './odds.js';
import { TURN_PER_HARM } from './utility-scale.js';
import { environmentsOf, startEnvironment, radiusFt } from './environment.js';

const HORIZON = 3;
const SLOW_TURNS = 3;        // lost turns counted at most
const FATIGUE_WORTH = 0.5;   // a fatigued fighter, in expected degrees
const REACHES_TENTH = 0.1;   // share of fights that last to the tenth round

const nearest = (f, others) => others.reduce((best, o) => (!best || squares(f, o) < squares(f, best) ? o : best), null);
const stepSquares = (b, f, slow) => Math.max(1, Math.floor(30 * 2 ** ((f.moveRank ?? 0) - slow) / b.grid.squareFt));
const bestEv = (f, foe, b, close) => Math.max(0, ...f.attacks.filter((a) => (a.range === 'close') === close).map((a) => expectedValue(f, a, foe, { b, dist: close ? 0 : feet(b, f, foe) })));

/** Turns a melee fighter loses crossing to the nearest of `foes` when `level` ranks of speed are taken off, valued at its harm per round. */
function slowCost(b, f, foes, level) {
  const foe = nearest(f, foes);
  if (!foe) return 0;
  const melee = bestEv(f, foe, b, true);
  if (melee <= bestEv(f, foe, b, false)) return 0; // a fighter that would shoot is not held up by having to walk
  const need = Math.max(0, squares(f, foe) - reachSquares(b, f));
  const turns = (slow) => Math.ceil(need / stepSquares(b, f, slow));
  const lost = Math.min(SLOW_TURNS, turns(level) - turns(0));
  return lost > 0 ? lost * TURN_PER_HARM * melee : 0;
}

function impedeWorth(b, c, s, enemies) {
  const reach = (f) => squares(c, f) * b.grid.squareFt <= radiusFt(s.rank);
  const allies = [c, ...alliesOf(b, c)];
  const foes = enemies.filter(reach).reduce((sum, e) => sum + slowCost(b, e, allies, s.level), 0);
  const mine = allies.filter(reach).reduce((sum, a) => sum + slowCost(b, a, enemies, s.level), 0);
  return foes - mine;
}

function lightWorth(b, c, s, enemies) {
  const allies = [c, ...alliesOf(b, c)];
  let gain = 0;
  for (const t of enemies.filter((x) => x.concealDark && x.concealment && (x.lit || 0) < s.level)) {
    const now = t.concealment === 'total' ? 5 : 2;
    const after = s.level >= 2 ? 0 : t.concealment === 'total' ? 2 : 0;
    for (const a of allies) gain += Math.max(0, bestEvNow(a, t, feet(b, a, t), -after, true) - bestEvNow(a, t, feet(b, a, t), -now, true));
  }
  return gain * HORIZON;
}

function temperatureWorth(b, c, s, enemies) {
  if (s.level < 2 || b.round + 10 > (b.options.maxRounds || 40)) return 0;
  const inRadius = (f) => squares(c, f) * b.grid.squareFt <= radiusFt(s.rank);
  const net = enemies.filter(inRadius).length - [c, ...alliesOf(b, c)].filter(inRadius).length;
  return Math.max(0, net) * FATIGUE_WORTH * REACHES_TENTH;
}

const WORTH = { impede: impedeWorth, light: lightWorth, cold: temperatureWorth, heat: temperatureWorth };

/** The best Environment effect c could start this turn: { kind: 'environment', u, run }, or null. */
export function environmentOption(b, c, enemies) {
  if (canAct(c) === 'none' || !enemies.length) return null;
  let best = null;
  for (const s of environmentsOf(c.ch)) {
    const scored = s.kinds.filter((k) => WORTH[k] && !(b.env || []).some((e) => e.owner === c.id && e.kind === k && e.power === s.name)).map((k) => ({ k, u: WORTH[k](b, c, s, enemies) })).filter((x) => x.u > 0);
    if (!scored.length) continue;
    const pick = s.selective ? scored : [scored.reduce((m, x) => (x.u > m.u ? x : m))];
    const u = pick.reduce((sum, x) => sum + x.u, 0);
    if (!best || u > best.u) best = { kind: 'environment', u, run: (bb, R, cc) => { startEnvironment(bb, cc, s, pick.map((x) => x.k)); } };
  }
  return best;
}
