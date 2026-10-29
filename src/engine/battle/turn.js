// One fighter's turn: the checks that can end it early, then the choice of plan. The attack itself is in turn-attack.js.

import { log, byId, enemiesOf, alliesOf } from './util.js';
import { STYLES } from './styles.js';
import { activeConditions, conditionLabels, canAct, moveZones } from './conditions.js';
import { choosePlan, bestAttackVs } from './plan.js';
import { moveTo, moveToward } from './movement.js';
import { resolveAttack } from './attacks.js';
import { applyEffect } from './attack-effects.js';
import { feint, grab, tryEscape } from './maneuvers.js';
import { heal, spendHeroPoint, recoverAction } from './support.js';
import { attackTurn } from './turn-attack.js';
import { markTurn, mayFlee, mayDefend, recoverEarly, healsFreely, healThreshold, coverDefends, fleeChance, withdrawTurn, withdrawHolds } from './tactics.js';
import { supportTurn } from './support-plan.js';
import { shootCover } from './cover-damage.js';

const isHurt = (c) => c.staggered || c.bruises >= 2;

/** Every step below returns true when it used up the turn. */
export function takeTurn(b, R, c, rng) {
  c.defMod = 0;
  markTurn(b, c);
  const mode = canAct(c);
  const conds = conditionLabels(c).filter((x) => x !== 'Fled');
  c.defending = false;
  if (mode === 'none' && cannotAct(b, c, conds)) return;
  if (mode === 'controlled') { controlledTurn(b, R, c, rng); return; }
  const enemies = enemiesOf(b, c);
  if (!enemies.length) return;
  if (losesNerve(b, c, enemies, rng)) return;
  if (escapeGrab(b, c, rng)) return;
  recoverFromDaze(b, c, mode, rng);
  if (withdrawTurn(b, c)) return;
  if (catchBreath(b, c, rng)) return;
  if (takeAimedShot(b, R, c, rng)) return;
  if (healFirst(b, c, rng)) return;
  if (crushHeld(b, R, c, rng)) return;
  const choice = choosePlan(b, R, c, enemies, rng, mode);
  if (!choice) { log(b, { kind: 'skip', actor: c.id, text: `${c.name} finds nothing worth doing and holds position.` }); return; }
  if (withdrawHolds(b, c, choice)) return;
  if (supportTurn(b, c, choice, enemies, mode, rng)) return;
  if (digIn(b, c, choice, enemies, mode)) return;
  if (nonAttackPlan(b, R, c, choice, mode, rng)) return;
  attackTurn(b, R, c, choice, enemies, mode, rng);
}

/** Stunned or worse: a hero point can get the fighter back on its feet. True when the turn is lost. */
function cannotAct(b, c, conds) {
  // Hero point: recover from stunned (DCA 21)
  if (b.options.heroPoints && c.heroPoints > 0 && c.conditions.some((x) => x.name === 'Stunned' && x.degree <= 2)) {
    spendHeroPoint(b, c, 'recover');
    if (canAct(c) === 'none') { log(b, { kind: 'skip', actor: c.id, text: `${c.name} is ${conds.join(', ').toLowerCase()} and loses the turn.` }); return true; }
    return false;
  }
  log(b, { kind: 'skip', actor: c.id, text: `${c.name} is ${conds.join(', ').toLowerCase()} and can't act.` });
  return true;
}

/** Controlled by an enemy: attack one of your own side. Always uses up the turn. */
function controlledTurn(b, R, c, rng) {
  const ctrl = c.conditions.find((x) => x.name === 'Controlled');
  const master = byId(b, ctrl?.from);
  const victims = alliesOf(b, c);
  if (master && victims.length) {
    const t = victims[Math.floor(rng.next() * victims.length)];
    log(b, { kind: 'condition', actor: c.id, text: `${c.name} is controlled by ${master.name} and turns on ${t.name}!`, important: true });
    const atk = bestAttackVs(c, t, rng).attack;
    if (atk) { moveToward(b, c, t, rng); resolveAttack(b, R, c, atk, t, rng, {}); }
    return;
  }
  log(b, { kind: 'skip', actor: c.id, text: `${c.name} stands controlled, with no one to turn on.` });
}

/** Morale: beasts and minions may break and run. */
function losesNerve(b, c, enemies, rng) {
  const S = STYLES[c.style];
  if (!mayFlee(b, c)) return false;
  if (!(S.flees && !c.adv.Fearless && (c.staggered || (c.minion && c.bruises >= 1 && alliesOf(b, c).length < enemies.length)) && rng.chance(fleeChance(b, c, c.minion ? 0.35 : 0.3)))) return false;
  c.fled = true;
  log(b, { kind: 'flee', actor: c.id, text: `${c.name} has had enough and ${c.style === 'beast' ? 'bolts for cover' : 'runs for it'}.`, important: true });
  return true;
}

/** Escape a grab? True when the struggle used up the turn. */
function escapeGrab(b, c, rng) {
  if (!c.grabbedBy) return false;
  const holder = byId(b, c.grabbedBy);
  if (!holder || holder.out || holder.fled) { c.grabbedBy = null; return false; }
  if (tryEscape(b, c, holder, rng)) return true;
  return activeConditions(c).has('Bound');
}

/** Hero point on a dazed turn: recover to act fully (a hero point removes dazed, not staggered: DCA 21). */
function recoverFromDaze(b, c, mode, rng) {
  if (mode === 'standard' && b.options.heroPoints && c.heroPoints > 0 && c.dazed && !c.staggered && (isHurt(c) || rng.chance(0.4))) {
    spendHeroPoint(b, c, 'recover');
  }
}

/** Recover (once per conflict, DCA 177): badly hurt with no healer coming, catch your breath. */
function catchBreath(b, c, rng) {
  if (recoverEarly(b, c) && c.staggered && !c.recovered && !c.minion) { recoverAction(b, c); return true; }
  if (!c.recovered && !c.minion && (c.staggered || c.fatigue >= 2 || (c.bruises >= 3 && c.dazed)) && !alliesOf(b, c).some((a) => a.healing && !a.out)
    && (c.style === 'tank' || c.style === 'support' || c.style === 'duelist' || alliesOf(b, c).length > 0 || rng.chance(0.5))) {
    recoverAction(b, c);
    return true;
  }
  return false;
}

/** An aimed attack: take the shot lined up last turn (DCA 175). */
function takeAimedShot(b, R, c, rng) {
  if (!c.aiming) return false;
  const t = byId(b, c.aiming.target);
  const atk = c.attacks.find((a) => a.id === c.aiming.attack);
  if (t && !t.out && !t.fled && atk && (atk.kind !== 'close' || t.pos === c.pos)) {
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${c.name} takes the aimed shot (+${c.aiming.bonus}).` });
    resolveAttack(b, R, c, atk, t, rng, { aimed: c.aiming.bonus });
    c.aiming = null;
    return true;
  }
  c.aiming = null;
  return false;
}

/** Support: heal first if someone needs it. */
function healFirst(b, c, rng) {
  if (!(c.healing && (c.style === 'support' || healsFreely(b, c) || rng.chance(0.4)))) return false;
  const need = healThreshold(b, c);
  const patient = alliesOf(b, c).concat([c]).filter((a) => a.bruises >= need || a.staggered || (need < 2 && a.dazed)).sort((x, y) => (y.staggered ? 10 : 0) + y.bruises - ((x.staggered ? 10 : 0) + x.bruises))[0];
  if (patient && (c.healing.ranged || Math.abs(patient.pos - c.pos) <= moveZones(c))) {
    if (!c.healing.ranged && patient.pos !== c.pos && canAct(c) === 'full') moveTo(b, c, patient.pos, `to reach ${patient.name}`);
    if (c.healing.ranged || patient.pos === c.pos) { heal(b, c, patient, rng); return true; }
  }
  return false;
}

/** Hold: keep crushing a grabbed enemy. */
function crushHeld(b, R, c, rng) {
  if (!c.holding) return false;
  const victim = byId(b, c.holding);
  if (!victim || victim.out || victim.fled || victim.grabbedBy !== c.id) { c.holding = null; return false; }
  const unarmed = c.attacks.find((a) => a.unarmed) || c.attacks.find((a) => a.kind === 'close');
  if (!unarmed) return false;
  log(b, { kind: 'attack', actor: c.id, target: victim.id, text: `${c.name} ${c.style === 'beast' ? 'worries' : 'crushes'} ${victim.name} in ${c.style === 'beast' ? 'its jaws' : 'the hold'}: Damage ${unarmed.rank}, no attack roll needed.` });
  applyEffect(b, R, c, unarmed, victim, rng, { auto: true, crit: false });
  return true;
}

/** Defend (DCA 175): hurt, already recovered, outnumbered and with nothing that would land: dig in. */
function digIn(b, c, choice, enemies, mode) {
  if (!mayDefend(b, c)) return false;
  if (coverDefends(b, c, choice, enemies, mode)) {
    c.defending = true;
    log(b, { kind: 'note', actor: c.id, text: `${c.name} keeps their head down and defends: attackers must beat a rolled defense until their next turn.` });
    return true;
  }
  if (!(choice.plan === 'attack' && c.staggered && c.recovered && (choice.ev ?? 1) < 0.12 && enemies.length > alliesOf(b, c).length && ['support', 'duelist', 'tank'].includes(c.style))) return false;
  c.defending = true;
  log(b, { kind: 'note', actor: c.id, text: `${c.name} goes on the defensive: attackers must beat a rolled defense until their next turn.` });
  return true;
}

/** The plans that are not an attack: close in, feint, grab. */
function nonAttackPlan(b, R, c, choice, mode, rng) {
  const { target, plan } = choice;
  if (plan === 'cover') { shootCover(b, c, choice, rng); return true; }
  if (plan === 'move') { moveToward(b, c, target, rng, mode === 'full' ? 2 : 1); return true; }
  if (plan === 'feint') {
    if (mode === 'full') moveToward(b, c, target, rng);
    feint(b, c, target, rng);
    return true;
  }
  if (plan === 'grab') {
    if (mode === 'full') moveToward(b, c, target, rng);
    if (target.pos === c.pos) grab(b, R, c, target, rng);
    return true;
  }
  return false;
}
