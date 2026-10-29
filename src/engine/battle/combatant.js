// Building a combatant from a character: its attacks, defenses, immunities and fight state.

import { deriveAll, advantageRank, allPowers } from '../derive.js';
import { repairPowerRoles } from '../repair.js';
import { hasExtra, extraOpt, clamp } from './util.js';
import { STYLES, detectStyle } from './styles.js';
import { SEVERITY, parseAffliction } from './conditions.js';

export function effectWeights(attack) {
  if (attack.effect === 'Damage') return [0, 1, 2.3, 3.8, 6.5];
  if (attack.effect === 'Weaken') return [0, 0.8, 1.6, 2.6, 3.2];
  if (attack.effect === 'Nullify') return [0, 0.9, 1.4, 1.8, 2];
  // afflictions: worth depends on how bad the top tier is
  const w = [0];
  for (let i = 0; i < 3; i++) {
    const tier = attack.tiers?.[Math.min(i, (attack.tiers?.length || 1) - 1)] || ['Impaired'];
    const sev = Math.max(...tier.map((c) => SEVERITY[c] || 2));
    w.push(i < (attack.tiers?.length || 3) ? sev * 0.55 : w[w.length - 1]);
  }
  w.push(w[3]);
  return w;
}

/** Everything the simulator needs about one attack, from derive.attacks() plus the power itself. */
function buildAttack(c, a, R) {
  const p = a.power || null;
  const eff = R.effect(a.effect);
  const atk = {
    id: `${a.name}|${a.effect}|${a.rank}|${a.kind}`,
    name: a.name, effect: a.effect, kind: a.kind, rank: a.rank, bonus: a.roll ? a.bonus : null, roll: !!a.roll,
    resistance: a.resistance || eff.resistance || 'Toughness',
    equipment: !!a.equipment, device: !!(p && (c.ch.devices || []).some((d) => d.powers.includes(p) || d.powers.some((q) => (q.alternates || []).includes(p)))),
    unarmed: a.name === 'Unarmed', alternate: !!a.alternate,
    crit: a.crit || (p ? Math.max(16, 20 - advantageRank(c.ch, 'Improved Critical', p.name) - advantageRank(c.ch, 'Improved Critical')) : 20),
    descriptors: attackDescriptors(c, a, p),
    multiattack: hasExtra(p, 'Multiattack'), penetrating: hasExtra(p, 'Penetrating'), selective: hasExtra(p, 'Selective'),
    area: a.kind === 'area' ? (extraOpt(p, 'Area') || 'Burst') : null,
    perception: a.kind === 'perception',
    fear: /terror|fear|despair|cowering/i.test(p?.detail || ''),
    power: p,
  };
  if (['Affliction', 'Dazzle', 'Sleep', 'Snare', 'Mind Control', 'Suffocation'].includes(a.effect)) Object.assign(atk, parseAffliction(p || { effect: a.effect }, R));
  if (a.effect === 'Weaken') {
    const detail = String(p?.detail || '');
    atk.resist = (/resisted by ([A-Za-z]+)/i.exec(detail)?.[1]) || 'Fortitude';
    atk.weakens = /tough/i.test(detail) ? 'Toughness' : /strength/i.test(detail) ? 'Strength' : /will|intellect|awareness|presence/i.test(detail) ? 'Will' : /dodge|agility/i.test(detail) ? 'Dodge' : /fort/i.test(detail) ? 'Fortitude' : 'Toughness';
    atk.resistance = atk.resist;
  }
  if (a.effect === 'Nullify') atk.resistance = 'Rank or Will';
  if (a.effect === 'Mental Blast') atk.resistance = 'Will';
  if (atk.resist && !atk.resistance) atk.resistance = atk.resist;
  if (atk.resistance === 'Fortitude or Will') atk.resistance = atk.resist || 'Fortitude';
  if (/^(Will|Fortitude|Dodge|Toughness|Parry)$/i.test(atk.resistance)) atk.resistance = atk.resistance.replace(/^./, (x) => x.toUpperCase());
  atk.weights = effectWeights(atk);
  return atk;
}

function bestMoveRank(ch) {
  let best = 0;
  let flying = false;
  for (const { power: p } of allPowers(ch, { includeAlternates: false })) {
    if (['Speed', 'Flight', 'Teleport', 'Swimming'].includes(p.effect)) { best = Math.max(best, p.rank); if (p.effect === 'Flight') flying = true; }
    if (p.effect === 'Leaping') best = Math.max(best, Math.floor(p.rank / 2));
  }
  return { rank: best, flying };
}

/**
 * What a fighter is immune to, from Immunity powers and absent defenses: lower-case phrases like "fire damage",
 * "fortitude effects", "life support". Immunity with Limited to Half Effect is marked " #half" (DCA 104).
 */
function immunities(ch, d) {
  const words = [];
  if (d.defenses.immune?.Fortitude) words.push('fortitude effects');
  if (d.defenses.immune?.Will) words.push('will effects');
  for (const { power: p } of allPowers(ch, { includeAlternates: false })) {
    if (p.effect !== 'Immunity' || !p.detail) continue;
    const half = (p.flaws || []).some((f) => /half effect/i.test(f.name || f));
    words.push(`${String(p.detail).toLowerCase()}${half ? ' #half' : ''}`);
  }
  return words;
}

/**
 * An attack's descriptors: its power's own, plus what it obviously is. Fists, claws, thrown cars and weapons
 * are physical (and a weapon is a weapon); a power with an energy descriptor isn't physical.
 */
function attackDescriptors(c, a, p) {
  const own = (p?.descriptors || []).map((x) => String(x).toLowerCase());
  const out = new Set(own);
  const energy = own.some((x) => /fire|heat|cold|ice|electric|lightning|light|laser|sonic|sound|radiation|cosmic|magic|mystic|psychic|mental|darkness|shadow|plasma|force|energy|acid|poison|chemical|toxic|disease|gravity|vibration/.test(x));
  const strengthBased = a.name === 'Unarmed' || (a.kind === 'close' && !p) || (p && a.effect === 'Damage' && /strength/i.test(`${p.name} ${p.detail || ''}`));
  if (a.name === 'Unarmed') { out.add('bludgeoning'); out.add('unarmed'); }
  if (a.equipment) out.add('weapon');
  if (!energy && a.effect === 'Damage' && (strengthBased || a.equipment || (p && /punch|fist|claw|bite|kick|strike|club|blade|sword|bullet|gun|arrow|projectile|thrown|slam|tail|horn|talon|fang/i.test(`${p.name} ${a.name}`)))) out.add('physical');
  if (out.has('bullet') || out.has('bullets') || /gun|pistol|rifle|bullet/i.test(a.name)) out.add('ballistic');
  return [...out];
}

/** Build a combatant from a character. opts: { team, style, tactics, heroPoints, name } */
export function makeCombatant(R, ch, opts = {}) {
  repairPowerRoles(ch, R);
  const d = deriveAll(ch, R);
  const style = opts.style && STYLES[opts.style] ? opts.style : detectStyle(ch, R);
  const c = {
    id: opts.id || `b-${Math.random().toString(36).slice(2, 9)}`,
    name: opts.name || ch.identity?.codename || ch.identity?.realName || 'Fighter',
    team: opts.team || 'A',
    color: ch.theme?.color || '#6b7480',
    ch,
    pl: ch.pl || 10,
    minion: !!ch.minion || style === 'minion',
    style, tactics: opts.tactics || 'auto',
    heroPoints: opts.heroPoints ?? (ch.minion || style === 'minion' || style === 'beast' ? 0 : 1 + advantageRank(ch, 'Luck')),
    pos: 0,
  };
  resetCombatant(c);
  rebuildCombatant(c, R, d);
  return c;
}

/** The fight-state part of a combatant (kept when a battle is reset). */
export function resetCombatant(c) {
  Object.assign(c, {
    init: 0, initRoll: 0, bruises: 0, dazed: false, staggered: false, out: false, outReason: null, fled: false,
    conditions: [],        // [{ name, degree, from, source, dc, resist, cumulative, progressive, tiers, extraCondition, until }]
    weakened: {},          // trait -> ranks lost
    fatigue: 0, defMod: 0, feinted: false, grabbedBy: null, holding: null, nullified: 0, regen: 0, interposed: false,
    lastAttackId: null, usedEffort: 0, teamedRound: null, surpriseActor: false,
    recovered: false,      // the Recover action: once per conflict (DCA 177)
    aiming: null,          // { target, bonus } after an Aim action (DCA 175)
    defending: false,      // the Defend action, until the start of their next turn (DCA 175)
    stats: { attacks: 0, hits: 0, crits: 0, degrees: 0, kos: 0, healed: 0, taken: 0 },
  });
}

/** Derived numbers (recomputed on load, since only the character is saved). */
export function rebuildCombatant(c, R, d = null) {
  // A fighter saved before hand-built attack powers were repaired: repair it, and redo the style that was
  // guessed from the broken build (it saw no attacks, so a ranged fighter read as a brawler or powerhouse).
  const was = JSON.stringify(c.ch?.powers || []);
  repairPowerRoles(c.ch, R);
  if (!d && JSON.stringify(c.ch?.powers || []) !== was && c.style !== 'minion') c.style = detectStyle(c.ch, R);
  d = d || deriveAll(c.ch, R);
  c.d = d;
  c.initBonus = d.initiative;
  c.attacks = d.attacks.map((a) => buildAttack(c, a, R)).filter((a) => a.rank > 0 || a.effect !== 'Damage');
  powerStats(c);
  c.immune = immunities(c.ch, d);
  const mv = bestMoveRank(c.ch);
  c.speed = 1 + Math.min(4, Math.floor(mv.rank / 3));
  c.flying = mv.flying;
  c.adv = Object.fromEntries(['Power Attack', 'Accurate Attack', 'All-out Attack', 'Defensive Attack', 'Takedown', 'Interpose', 'Evasion', 'Fearless', 'Seize Initiative', 'Move-by Action', 'Fast Grab', 'Improved Grab', 'Improved Hold', 'Chokehold', 'Agile Feint', 'Uncanny Dodge', 'Improved Initiative', 'Diehard', 'Instant Up', 'Luck'].map((n) => [n, advantageRank(c.ch, n)]));
  const sk = (name) => d.skills.find((s) => s.name === name)?.bonus ?? (d.abilities[R.skillAbility(name)] ?? 0);
  c.skills = { Deception: sk('Deception'), Insight: sk('Insight'), Acrobatics: sk('Acrobatics'), Athletics: sk('Athletics'), Intimidation: sk('Intimidation'), 'Sleight of Hand': sk('Sleight of Hand') };
  c.moveRank = mv.rank;
  addOmniStunts(c, d);
  return c;
}

/** What the character's powers add up to: Impervious, sustained protection, Regeneration, Healing, Concealment, senses, Variable. */
function powerStats(c) {
  const pw = allPowers(c.ch, { includeAlternates: false }).map((x) => x.power);
  c.impervious = pw.filter((p) => ['Protection', 'Force Field'].includes(p.effect) && hasExtra(p, 'Impervious')).reduce((s, p) => s + p.rank, 0);
  c.sustainedProtection = pw.filter((p) => p.effect === 'Force Field' || (p.effect === 'Protection' && hasExtra(p, 'Sustained'))).reduce((s, p) => s + p.rank, 0);
  c.regenRank = pw.filter((p) => p.effect === 'Regeneration').reduce((s, p) => s + p.rank, 0);
  const heal = allPowers(c.ch).map((x) => x.power).find((p) => p.effect === 'Healing');
  c.healing = heal ? { name: heal.name, rank: heal.rank, ranged: (heal.range || 'Close') !== 'Close' } : null;
  const conceal = pw.find((p) => ['Concealment', 'Invisibility'].includes(p.effect) && (!p.detail || /visual|sight|vision/i.test(p.detail)));
  c.concealment = conceal ? ((conceal.flaws || []).some((f) => /Blending|Limited|Partial/i.test(f.name)) || conceal.rank < 2 ? 'partial' : 'total') : null;
  c.senses = pw.filter((p) => p.effect === 'Senses').map((p) => p.detail || '').join(' ');
  const variable = pw.find((p) => p.effect === 'Variable');
  c.variable = variable ? { name: variable.name, points: variable.rank * 5 } : null;
}

/** Omni-powers: a Variable pool can be configured into an attack each turn. */
function addOmniStunts(c, d) {
  if (c.variable && c.style === 'omni') {
    const base = d.abilities.Dexterity ?? 0;
    const rank = clamp(Math.floor(c.variable.points / 2), 1, 2 * c.pl - base);
    const stunt = (name, effect, extra) => ({ id: `variable|${effect}|${name}`, name: `${c.variable.name}: ${name}`, effect, kind: 'ranged', rank, bonus: base, roll: true, resistance: 'Toughness', descriptors: ['variable'], crit: 20, weights: null, stunt: true, power: null, ...extra });
    const stunts = [
      stunt('Energy Blast', 'Damage', { resistance: 'Toughness' }),
      stunt('Stunning Pulse', 'Affliction', { resistance: 'Fortitude', resist: 'Fortitude', tiers: [['Dazed'], ['Stunned'], ['Incapacitated']], maxDegree: 3 }),
      stunt('Mind Lock', 'Affliction', { resistance: 'Will', resist: 'Will', tiers: [['Entranced'], ['Compelled'], ['Controlled']], maxDegree: 3 }),
      stunt('Binding Field', 'Affliction', { resistance: 'Dodge', resist: 'Dodge', tiers: [['Hindered', 'Vulnerable'], ['Defenseless', 'Immobile']], maxDegree: 2 }),
    ];
    for (const s of stunts) s.weights = effectWeights(s);
    c.attacks.push(...stunts);
  }
}
