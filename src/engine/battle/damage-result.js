// What a failed Toughness (or Will) check against Damage does (Hero's Handbook p93): the bruise, daze, stagger and
// incapacitation by degrees; a minion going down on any failure (p174); Sleep leaving the fighter asleep instead of
// incapacitated (p132); Incurable damage that Healing and Regeneration cannot take off (p130); and, in a lethal fight,
// dying and death (dying.js).

import { log } from './util.js';
import { releaseHolds } from './maneuvers.js';
import { lethalOn, downedHit, minionKilled, incapacitatedByDamage } from './dying.js';

/** Incurable Damage: remember what it did, so Healing and Regeneration leave that part alone (heal.js reads t.incurable). */
function markIncurable(t, what) {
  t.incurable ||= { bruises: 0, staggered: false };
  if (what === 'bruise') t.incurable.bruises++;
  else t.incurable[what] = true;
}

/** The damage conditions a fighter has that Healing or Regeneration may still take off. */
export function healableDamage(t) {
  const inc = t.incurable || { bruises: 0, staggered: false };
  return { staggered: !!t.staggered && !inc.staggered, bruises: Math.max(0, t.bruises - inc.bruises), dazed: !!t.dazed };
}

export function damageResult(b, c, t, fails, base, dice, atk = null, rng = null) {
  if (t.out && lethalOn(b) && !t.dead && t.outReason !== 'asleep') { // more damage on a fighter already down (dying.js)
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${base} — failed, and ${t.name} is already down.`, dice, important: true });
    downedHit(b, t, rng);
    return { landed: true, ko: false, degrees: fails };
  }
  const minionDown = t.minion && b.options.minionRule;
  const inc = !!atk?.ex?.incurable;
  let text; let ko = false;
  if (minionDown) { t.out = true; t.outReason = 'minion'; ko = true; text = `${base} — failed: ${t.name} goes down (minions drop on any failed check).`; }
  else {
    const deg = Math.min(4, fails);
    t.bruises++;
    if (inc) markIncurable(t, 'bruise');
    if (deg === 1) text = `${base} — 1 degree: bruised (−${t.bruises} to Toughness).`;
    else if (deg === 2) { t.dazed = true; text = `${base} — 2 degrees: dazed and bruised (−${t.bruises}).`; }
    else if (deg === 3) {
      if (t.staggered) { t.out = true; ko = true; text = `${base} — 3 degrees, and already staggered: ${t.name} is INCAPACITATED.`; }
      else { t.staggered = true; if (inc) markIncurable(t, 'staggered'); text = `${base} — 3 degrees: staggered and bruised (−${t.bruises}).`; }
    } else { t.out = true; ko = true; text = `${base} — ${fails} degrees: ${t.name} is INCAPACITATED.`; }
    // Hero point recover from a knockout? (not in the rules: incapacitated needs recovery time)
  }
  if (ko && atk?.ex?.sleep) { t.outReason = 'asleep'; text = text.replace('INCAPACITATED', 'put to SLEEP (Sleep)'); }
  if (ko) { t.outReason = t.outReason || 'ko'; c.stats.kos++; releaseHolds(b, t); }
  if (inc && !minionDown) text += ' The damage is Incurable: Healing and Regeneration cannot take it off.';
  log(b, { kind: ko ? 'ko' : 'condition', actor: c.id, target: t.id, text, dice, important: ko || fails >= 3 });
  if (ko) { if (minionDown) minionKilled(b, t); else incapacitatedByDamage(b, t, rng); } // a lethal fight: dying, or killed (dying.js)
  return { landed: true, ko, degrees: fails };
}
