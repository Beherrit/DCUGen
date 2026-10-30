// When a fighter with Deflect (and no Reaction) spends its standard action on the Defend action to deflect for the team: when
// its own best attack is worth less than the harm the enemies' attacks would do to the allies it can cover, or when a
// Bodyguard team asks it to protect the VIP or a Hold the Line team asks a fighter behind the line to cover the front.

import { log, alliesOf } from './util.js';
import { defenseOf } from './conditions.js';
import { squares, squaresInMove, reachSquares, feet } from './geometry.js';
import { expectedValue, rangePenalty } from './odds.js';
import { deflectPenalty } from './deflect.js';
import { tacticOf } from './tactics-list.js';
import { vipOf } from './tactics-marks.js';
import { isFrontliner } from './tactics-position.js';
import { protectWeight } from './utility-protect.js';

const WORTH_IT = 0.05;

/** The chance that a Deflect roll (a 10 or less counts as 11) beats the flat defense it stands in for. */
function beatsFlat(total, defense) {
  let n = 0;
  for (let r = 1; r <= 20; r++) if ((r <= 10 ? r + 10 : r) + total > 10 + defense) n++;
  return n / 20;
}

/** Can enemy e's attack get at ally a this round (after a move, or two for a charge)? Only attacks with a check and no area can be deflected. */
function reaches(b, e, atk, a) {
  const move = squaresInMove(b, e);
  if (atk.range === 'close') return squares(e, a) - reachSquares(b, e, atk) <= move * 2;
  const sq = b.grid.squareFt;
  return rangePenalty(atk, Math.max(sq, feet(b, e, a) - move * sq)) <= 5;
}

/** The harm the enemies would do this round to the allies c could cover (or only `only`), counting how often a deflection would beat their defense. */
export function deflectHarm(b, c, enemies, only = null) {
  const allies = alliesOf(b, c).concat([c]).filter((a) => (!only || a === only) && deflectPenalty(b, c, a) !== null);
  let total = 0;
  for (const e of enemies) {
    let worst = 0;
    for (const a of allies) {
      const pen = deflectPenalty(b, c, a);
      for (const atk of e.attacks) {
        if (!atk.roll || atk.area || atk.perception || !reaches(b, e, atk, a)) continue;
        const share = beatsFlat(c.deflect.rank + pen, defenseOf(a, atk.kind === 'close' ? 'Parry' : 'Dodge'));
        worst = Math.max(worst, share * expectedValue(e, atk, a, { dist: atk.range === 'close' ? 0 : feet(b, e, a), b }));
      }
    }
    total += worst;
  }
  return total;
}

/** Does the team tactic ask this fighter to protect someone? */
function asked(b, c, enemies) {
  const id = tacticOf(b, c);
  if (id === 'bodyguard') { const vip = vipOf(b, c.team); return !!vip && vip !== c && deflectHarm(b, c, enemies, vip) > WORTH_IT; }
  return id === 'line' && !isFrontliner(c);
}

/** Take the Defend action to deflect, if it is worth more than the fighter's own attack. True when the turn is used up. */
export function deflectTurn(b, c, choice, enemies, mode) {
  if (!c.deflect || c.deflect.reaction || (mode !== 'full' && mode !== 'standard')) return false;
  const harm = deflectHarm(b, c, enemies);
  if (harm <= WORTH_IT) return false;
  const own = choice.plan === 'attack' ? (choice.utility ?? choice.ev ?? 0) : 0; // the attack, in the same units as the harm kept off the team
  if (!(harm * protectWeight(b, c) > own || asked(b, c, enemies))) return false;
  c.defending = true;
  c.deflecting = true;
  log(b, { kind: 'note', actor: c.id, text: `${c.name} takes the Defend action to deflect (Deflect ${c.deflect.rank}): attacks on the team must beat a deflection roll until their next turn.`, important: true });
  return true;
}
