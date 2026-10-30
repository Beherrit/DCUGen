// What a deflection leaves behind: the log line for the attack it turned aside, and Reflect (Hero's Handbook p95). A
// deflector with Reflect makes a normal attack check with its own best attack bonus; the reflected attack has its normal
// effect if it hits. With Redirect it may pick any enemy within the attack's normal range instead of the attacker.
// An Immunity with Reflect and Redirect (p102) sends back, the same way, the attacks it is immune to.

import { log, enemiesOf } from './util.js';
import { inRangeNow } from './geometry.js';
import { expectedValue } from './odds.js';
import { rollToHit } from './attack-roll.js';
import { applyEffect, onImmuneReflect } from './attack-effects.js';
import { deflectLine } from './deflect.js';

const NO_TRADE = { trade: 0, allOut: 0, defensive: 0, charge: false };

/** The deflector's own best attack bonus, or null when it has no attack with a check. */
function bestBonus(d) {
  const rolled = d.attacks.filter((a) => a.roll && a.bonus !== null);
  return rolled.length ? Math.max(...rolled.map((a) => a.bonus)) : null;
}

/** Who a reflected attack goes at: the attacker, or with Redirect the enemy it would hurt most from where the deflector stands. */
function reflectTarget(b, d, c, atk, redirect) {
  if (!redirect) return c.out || c.fled ? null : c;
  const options = enemiesOf(b, d).filter((e) => inRangeNow(b, d, atk, e));
  const value = (e) => expectedValue(d, atk, e, { dist: 0, b });
  return options.sort((x, y) => value(y) - value(x))[0] || null;
}

/** d sends c's attack back (or on, with redirect): its own attack check, and the attack's normal effect if that hits. */
function sendBack(b, R, d, c, atk, rng, { redirect, rankShift }) {
  const bonus = bestBonus(d);
  if (bonus === null || atk.reflected) return;
  const ratk = { ...atk, bonus, reflected: true };
  const target = reflectTarget(b, d, c, ratk, redirect);
  if (!target || !inRangeNow(b, d, ratk, target)) return;
  log(b, { kind: 'note', actor: d.id, target: target.id, text: `${d.name} reflects the attack ${redirect && target !== c ? `at ${target.name}` : `back at ${c.name}`}.` });
  const notes = [];
  d.stats.attacks++;
  const rr = rollToHit(b, d, ratk, target, rng, NO_TRADE, 0, notes);
  const tail = notes.length ? ` (${notes.join('; ')})` : '';
  if (!rr.hit) { log(b, { kind: 'miss', actor: d.id, target: target.id, text: `${rr.text} — miss${tail}.`, dice: rr.dice }); return; }
  d.stats.hits++;
  log(b, { kind: rr.crit ? 'crit' : 'hit', actor: d.id, target: target.id, text: `${rr.text} — ${rr.crit ? 'CRITICAL HIT' : 'hit'}${tail}.`, dice: rr.dice });
  applyEffect(b, R, d, ratk, target, rng, { crit: rr.crit, rankShift });
}

/** An attack on t was beaten by a deflection: say so, and send it back when the deflector can. */
export function afterDeflect(b, R, c, atk, t, rng, r, rankShift) {
  const d = r.deflect?.by;
  if (!d || r.hit || r.roll === 1 || r.total >= r.deflect.total) return;
  log(b, { kind: 'note', actor: d.id, target: t.id, text: deflectLine(t, r), important: true });
  if (d.deflect.reflect) sendBack(b, R, d, c, atk, rng, { redirect: d.deflect.redirect, rankShift });
}

// An Immunity with Reflect: the attack it stopped goes back at the attacker (or on, with Redirect).
onImmuneReflect((b, R, c, atk, t, entry, rng, rankShift) => sendBack(b, R, t, c, atk, rng, { redirect: entry.redirect, rankShift }));
