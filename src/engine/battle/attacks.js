// Making an attack: the extra effort and trade-off notes, the hit or miss, Interpose, Fast Grab, Takedown, and area attacks.

import { sign, d20, log, enemiesOf, alliesOf } from './util.js';
import { checkPenalty, defenseOf } from './conditions.js';
import { applyEffect } from './attack-effects.js';
import { grab, grabAppetite } from './maneuvers.js';
import { rollCheck, critNote } from './checks.js';
import { dodgeFx } from './fortune.js';
import { featInterposer } from './feat.js';
import { attackVerb, rollToHit } from './attack-roll.js';
import { afterDeflect } from './reflect.js';
import { noteAttack, interposeFor } from './tactics.js';
import { shieldFor, coverLevel, coverDodgeBonus } from './cover.js';
import { shootThrough, areaOnPieces, pieceMod } from './cover-damage.js';
import { maybeKnockback } from './knockback.js';
import { squares, squaresInMove, feet, inReach, areaVictims } from './geometry.js';
import { spotName } from './grid.js';
import { traceAttack } from './trace.js';

export function resolveAttack(b, R, c, atk, t, rng, { trade = 0, allOut = 0, defensive = 0, effort = null, charge = false, slam = null, aimed = 0, team = 0 } = {}) {
  c.lastAttackId = atk.id;
  traceAttack(b, c, atk, t);
  noteAttack(b, c, t);
  c.stats.attacks++;
  const m = shiftAndNotes(b, c, atk, rng, { trade, allOut, defensive, effort, charge, slam, team });
  const { notes } = m;
  let { rankShift } = m;
  if (atk.area) { areaAttack(b, R, c, atk, t, rng, rankShift, notes); return; }
  if (!atk.roll) {
    log(b, { kind: 'attack', actor: c.id, target: t.id, text: `${c.name} ${attackVerb(c, atk, t, rng)} (perception range, no attack roll)${notes.length ? ` — ${notes.join('; ')}` : ''}.` });
    applyEffect(b, R, c, atk, t, rng, { auto: true, crit: false, rankShift });
    return;
  }
  if (b.options.shootThrough) {
    const through = throughCover(b, c, atk, t, rng, m, aimed);
    if (through === null) return;
    rankShift = through;
  }
  const r = rollToHit(b, c, atk, t, rng, m, aimed, notes);
  if (!r.hit) {
    log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${r.text} — ${r.roll === 1 ? 'natural 1, a clean miss' : 'miss'}${notes.length ? ` (${notes.join('; ')})` : ''}.`, dice: r.dice });
    afterDeflect(b, R, c, atk, t, rng, r, rankShift);
    return;
  }
  const result = landHit(b, R, c, atk, t, rng, r, { rankShift, notes, slam: m.slam });
  if (!result) return;
  followUps(b, R, c, atk, t, rng, result, r.mod);
}

/**
 * Apply the trade-offs, charge, slam, team bonus and extra effort to the attack. Maneuvers only apply to attacks
 * with an attack check (DCA 178). Returns the trade-offs that stand, the rank shift, and the notes for the log.
 */
function shiftAndNotes(b, c, atk, rng, { trade, allOut, defensive, effort, charge, slam, team }) {
  if (!atk.roll || atk.area) { trade = 0; allOut = 0; defensive = 0; }
  let rankShift = trade;
  const notes = [];
  if (charge) notes.push('charge: −2 to hit');
  if (slam) { rankShift += slam - atk.rank; notes.push(`slam: Damage ${slam} from momentum`); }
  if (team) { rankShift += team; notes.push(`team attack: +${team} rank`); }
  if (trade > 0) notes.push(`Power Attack${trade > 2 ? ' (advantage)' : ''}: −${trade} to hit, +${trade} effect`);
  if (trade < 0) notes.push(`Accurate Attack: +${-trade} to hit, ${trade} effect`);
  if (allOut) notes.push(`All-out Attack: +${allOut} to hit, −${allOut} defenses until next turn`);
  if (defensive) notes.push(`Defensive Attack: −${defensive} to hit, +${defensive} defenses`);
  if (effort === 'power') {
    rankShift += 1;
    c.fatigue += 1;
    c.usedEffort++;
    notes.push(`extra effort: +1 rank, now ${c.fatigue >= 2 ? 'exhausted' : 'fatigued'}`);
    if (b.options.heroPoints && c.heroPoints > 0 && rng.chance(0.5)) { c.heroPoints--; c.fatigue--; notes.push('spends a hero point to shrug off the fatigue'); }
  }
  return { trade, allOut, defensive, charge, rankShift, notes, slam: !!slam };
}

/** Optional rule: a shot at a target behind total cover goes through the cover first. Returns the rank shift, or null when the cover stops the shot. */
function throughCover(b, c, atk, t, rng, m, aimed) {
  const piece = shieldFor(b, c, atk, t);
  if (!piece || coverLevel(piece) !== 'total') return m.rankShift;
  const mod = pieceMod(c, atk, m, feet(b, c, t), aimed);
  const s = shootThrough(b, c, atk, piece, rng, { mod, rankShift: m.rankShift });
  return s.go ? s.rankShift : null;
}

/**
 * The ally who takes this hit, or null. One with Interpose goes by its tactics, else when the victim is hurt or weaker; with
 * no such ally, one without Interpose may borrow it with a hero point (Heroic Feat) to save a victim who would go down.
 */
function pickGuard(b, c, atk, t, rankShift, crit) {
  const regular = alliesOf(b, t).find((a) => a.adv.Interpose && !a.interposed && squares(a, t) <= Math.max(1, squaresInMove(b, a)) && !a.staggered && a.style !== 'minion');
  if (regular) return (interposeFor(b, regular, t) ?? (t.staggered || t.bruises >= 2 || t.pl < regular.pl)) ? regular : null;
  return featInterposer(b, c, atk, t, atk.rank + rankShift, crit);
}

/** A hit: count it, log it, and apply the effect (to an Interposing ally if there is one). Returns the effect result, or null if it was interposed. */
function landHit(b, R, c, atk, t, rng, r, { rankShift, notes, slam }) {
  const { crit, total, dcUsed, dice } = r;
  let text = r.text;
  c.stats.hits++;
  if (crit) c.stats.crits++;
  text += ` — ${crit ? 'CRITICAL HIT' : 'hit'}${notes.length ? ` (${notes.join('; ')})` : ''}.`;
  // Interpose: an ally within range of its normal movement (p76) takes the hit
  const guard = pickGuard(b, c, atk, t, rankShift, crit);
  if (guard) {
    guard.interposed = true;
    log(b, { kind: 'hit', actor: c.id, target: t.id, text, dice });
    log(b, { kind: 'condition', actor: guard.id, target: t.id, text: `${guard.name} interposes and takes the hit meant for ${t.name}!`, important: true });
    applyEffect(b, R, c, atk, guard, rng, { crit, rankShift, multi: 0 });
    return null;
  }
  let multi = 0;
  if (atk.multiattack) {
    const deg = 1 + Math.floor((total - dcUsed) / 5);
    multi = deg >= 3 ? 5 : deg === 2 ? 2 : 0;
    if (multi) text += ` Multiattack: ${deg} degrees, +${multi} to the DC.`;
  }
  log(b, { kind: crit ? 'crit' : 'hit', actor: c.id, target: t.id, text, dice });
  const result = applyEffect(b, R, c, atk, t, rng, { crit, rankShift, multi });
  maybeKnockback(b, R, c, atk, t, result, rng, { slam });
  return result;
}

/** After a hit: Fast Grab can turn it into a hold (the unarmed hit counts as the grab's attack check, p74), and Takedown lets the attacker swing at the next minion. */
function followUps(b, R, c, atk, t, rng, result, mod) {
  if (result && atk.unarmed && c.adv['Fast Grab'] && !c.holding && !t.out && !t.grabbedBy && rng.chance(0.6 * grabAppetite(b, c, t))) {
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${c.name} uses Fast Grab to turn the hit into a hold.` });
    grab(b, R, c, t, rng, { free: true });
  }
  if (result?.ko && t.minion && c.adv.Takedown && atk.kind === 'close' && !atk.area) {
    let chain = 0;
    let next = enemiesOf(b, c).find((e) => e.minion && inReach(b, c, e, atk));
    while (next && chain < 5) {
      chain++;
      log(b, { kind: 'note', actor: c.id, target: next.id, text: `Takedown: ${c.name} keeps moving and swings at ${next.name}.` });
      const r = resolveSimpleAttack(b, R, c, atk, next, rng, mod);
      if (!r?.ko) break;
      next = enemiesOf(b, c).find((e) => e.minion && inReach(b, c, e, atk));
    }
  }
}

function resolveSimpleAttack(b, R, c, atk, t, rng, mod) {
  const which = atk.kind === 'close' ? 'Parry' : 'Dodge';
  const dc = 10 + defenseOf(t, which);
  const roll = d20(rng);
  const total = roll + mod;
  const hit = roll === 20 || (roll !== 1 && total >= dc);
  const crit = !(c.minion && !t.minion) && hit && (roll === 20 ? total >= dc : roll >= atk.crit);
  c.stats.attacks++;
  if (!hit) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${c.name} swings at ${t.name}: d20 ${roll} ${sign(mod)} = ${total} vs ${which} DC ${dc} — miss.`, dice: [{ label: 'Attack', roll, mod, total, dc }] }); return null; }
  c.stats.hits++;
  log(b, { kind: crit ? 'crit' : 'hit', actor: c.id, target: t.id, text: `${c.name} hits ${t.name}: d20 ${roll} ${sign(mod)} = ${total} vs ${which} DC ${dc} — ${crit ? 'critical hit' : 'hit'}.`, dice: [{ label: 'Attack', roll, mod, total, dc }] });
  return applyEffect(b, R, c, atk, t, rng, { crit });
}

function areaAttack(b, R, c, atk, t, rng, rankShift, notes) {
  const inArea = areaVictims(b, c, atk, t).filter((x) => !atk.selective || x.team !== c.team);
  const victims = inArea.filter((x) => x.team !== c.team);
  const friendly = inArea.filter((x) => x.team === c.team);
  log(b, { kind: 'attack', actor: c.id, target: t.id, text: `${c.name} drops ${atk.name} (${atk.area} area) ${atk.range === 'close' ? 'around itself' : `on ${spotName(t)}`}: ${inArea.map((x) => x.name).join(', ') || 'nobody'} ${inArea.length === 1 ? 'is' : 'are'} caught in it${friendly.length && !atk.selective ? ` (${friendly.map((x) => x.name).join(', ')} too!)` : ''}${notes.length ? ` — ${notes.join('; ')}` : ''}.`, important: true });
  for (const v of [...victims, ...friendly]) {
    const shelter = coverDodgeBonus(b, c, v);
    const dodge = defenseOf(v, 'Dodge') - checkPenalty(v) + (v.adv.Evasion >= 2 ? 5 : v.adv.Evasion ? 2 : 0) + shelter;
    const dc = 10 + atk.rank + rankShift;
    const dodgeCheck = rollCheck(rng, dodge, dc, dodgeFx(b, v, atk, atk.rank + rankShift));
    const { roll, total } = dodgeCheck;
    const half = dodgeCheck.success;
    log(b, { kind: half ? 'resist' : 'hit', actor: c.id, target: v.id, text: `${v.name} dives for cover: Dodge d20 ${roll} ${sign(dodge)} = ${total} vs DC ${dc}${shelter ? ` (includes +${shelter} for cover)` : ''}${critNote(dodgeCheck)} — ${half ? 'half effect' : 'full effect'}.`, dice: [{ label: 'Dodge', roll, mod: dodge, total, dc }] });
    // A successful Dodge halves the rank, rounding down, minimum 1 (Area, Hero's Handbook p126). Evasion only adds
    // its +2 or +5 to the Dodge check (p76); it never lets a target slip clear entirely.
    const full = atk.rank + rankShift;
    const r = applyEffect(b, R, c, atk, v, rng, { auto: true, crit: false, rankShift: rankShift - (half ? full - Math.max(1, Math.floor(full / 2)) : 0) });
    if (r?.landed && v.team !== c.team) c.stats.hits++;
    maybeKnockback(b, R, c, atk, v, r, rng);
  }
  areaOnPieces(b, c, atk, t, atk.rank + rankShift, rng);
}
