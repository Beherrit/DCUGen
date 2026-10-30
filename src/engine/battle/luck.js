// Luck Control (Hero's Handbook p106): each rank buys one capability, and each is a reaction that hooks into the re-roll
// code (fortune.js for checks, luck-attack.js for attack rolls).
//
// - grant: spend a luck or hero point so an ally gets a re-roll without paying for it.
// - bestow: give an ally a luck point to use as its own (one per ally per round, and it costs the controller nothing).
// - negate: spend a point so an enemy's re-roll is wasted.
// - force: spend a point to make an enemy re-roll a roll and keep the worse one. The enemy may spend a point to avoid it.
// The capabilities come from the power's detail text; with none named, a power of rank N has the first N in the order above.
// A power whose text says "against me" (or "you") works only on rolls aimed at its owner.
// Each controller makes one such reaction a round. The AI decisions (when a use is worth it) are made by the callers.

import { allPowers } from '../derive.js';
import { log, d20, alive } from './util.js';
import { canAct } from './conditions.js';
import { lineClear } from './geometry.js';
import { canReroll, payReroll, luckReady, fortuneOn } from './points.js';

export const LUCK_CAPS = ['grant', 'bestow', 'negate', 'force'];
const WORDS = { grant: /\bgrant/i, bestow: /\bbestow/i, negate: /\bnegat/i, force: /\bforce[sd]?\b|\bworse\b/i };
const MINE_ONLY = /\bagainst (?:me|you)\b/i;

/** What a character's Luck Control can do: { name, rank, caps, mineOnly } for its highest-ranked power, or null. */
export function luckControlOf(ch) {
  const powers = allPowers(ch, { includeAlternates: false }).map((x) => x.power).filter((p) => p.effect === 'Luck Control');
  const p = powers.sort((x, y) => y.rank - x.rank)[0];
  if (!p) return null;
  const text = `${p.detail || ''} ${p.description || ''}`;
  const named = LUCK_CAPS.filter((cap) => WORDS[cap].test(text));
  const caps = (named.length ? named : LUCK_CAPS).slice(0, Math.max(1, p.rank));
  return { name: p.name, rank: p.rank, caps, mineOnly: MINE_ONLY.test(text) };
}

/**
 * The fighters who may use `cap` for `roller`'s roll. Grant and bestow help the roller's own side; negate and force help
 * `on` (the side the roll threatens, or the side whose attack is being resisted). `against` is the fighter the roll is
 * aimed at: a mine-only power needs it to be the controller itself.
 */
function controllers(b, roller, cap, { on = null, against = null } = {}) {
  if (!fortuneOn(b)) return [];
  return alive(b).filter((d) => {
    const lc = d.luckCtl;
    if (d === roller || !lc?.caps.includes(cap) || d.luckCtlRound === b.round || canAct(d) === 'none' || !lineClear(b, d, roller)) return false;
    if (lc.mineOnly && against?.id !== d.id) return false;
    if (cap === 'grant' || cap === 'bestow') return d.team === roller.team && (cap === 'bestow' || canReroll(b, d));
    return d.team === on?.team && canReroll(b, d);
  });
}

/** Does an ally of `c` have a grant or a bestow ready for it? (Cheap enough to ask for every check.) */
export function assistReady(b, c) {
  if (c.bestowedRound !== b.round && c.luckRound !== b.round && controllers(b, c, 'bestow').length) return true;
  return controllers(b, c, 'grant').length > 0;
}

/**
 * c has nothing of its own to re-roll with: an ally bestows a luck point (c then pays it as Luck) or grants the re-roll.
 * Returns 'Luck' (c holds the bestowed point and has paid it), 'granted', or null.
 */
export function assistReroll(b, c, label) {
  if (c.bestowedRound !== b.round && c.luckRound !== b.round) {
    const d = controllers(b, c, 'bestow')[0];
    if (d) {
      d.luckCtlRound = b.round; c.bestowedRound = b.round; c.luck = (c.luck || 0) + 1;
      log(b, { kind: 'hero', actor: d.id, target: c.id, text: `${d.name} bestows a luck point on ${c.name} with ${d.luckCtl.name} (Luck Control) for the ${label}.`, important: true });
      return payReroll(b, c);
    }
  }
  const g = controllers(b, c, 'grant')[0];
  if (!g) return null;
  g.luckCtlRound = b.round;
  const how = payReroll(b, g);
  log(b, { kind: 'hero', actor: g.id, target: c.id, text: `${g.name} spends ${how === 'Luck' ? 'Luck' : 'a hero point'} to grant ${c.name} a re-roll of the ${label} with ${g.luckCtl.name} (Luck Control).`, important: true });
  return 'granted';
}

/** An enemy controller wastes `roller`'s re-roll of an attack on `against`. True when one did. */
export function negateReroll(b, roller, against, label) {
  const d = controllers(b, roller, 'negate', { on: against, against })[0];
  if (!d) return false;
  d.luckCtlRound = b.round;
  const how = payReroll(b, d);
  log(b, { kind: 'hero', actor: d.id, target: roller.id, text: `${d.name} spends ${how === 'Luck' ? 'Luck' : 'a hero point'} to negate ${roller.name}'s re-roll of the ${label} with ${d.luckCtl.name} (Luck Control): it is wasted.`, important: true });
  return true;
}

/**
 * Force `roller` to re-roll a roll of `roll` and keep the worse. `on` is who gains, `against` who the roll is aimed at.
 * The roller avoids it by paying a point when it can; a controller only forces such a roller when it has Luck to spare.
 * Returns { roll, natural } for the roll to use now, or null when nothing changed.
 */
export function forceWorse(b, roller, rng, { on, against = null, label, roll }) {
  const d = controllers(b, roller, 'force', { on, against }).find((x) => !canReroll(b, roller) || luckReady(b, x));
  if (!d) return null;
  d.luckCtlRound = b.round;
  const how = payReroll(b, d);
  const spend = how === 'Luck' ? 'Luck' : 'a hero point';
  const saved = payReroll(b, roller);
  if (saved) {
    log(b, { kind: 'hero', actor: d.id, target: roller.id, text: `${d.name} spends ${spend} to force ${roller.name} to re-roll the ${label} with ${d.luckCtl.name} (Luck Control), but ${roller.name} spends ${saved === 'Luck' ? 'Luck' : 'a hero point'} to avoid it.`, important: true });
    return null;
  }
  const second = d20(rng);
  const worse = Math.min(roll, second);
  log(b, { kind: 'hero', actor: d.id, target: roller.id, text: `${d.name} spends ${spend} to force ${roller.name} to re-roll the ${label} with ${d.luckCtl.name} (Luck Control): d20 ${roll}, then ${second} — takes the worse, ${worse}.`, important: true });
  return worse === roll ? null : { roll: worse, natural: worse === 20 };
}
