// The Battle Room: a seeded fight simulator built on the DC Adventures combat rules (DCA ch. 8).
//
// Combatants come from any character, creature or minion in the app. Each one fights in a style
// that fits its build (a brawler closes in, a blaster keeps its distance, a spellcaster rotates
// its effects, a beast lunges and grabs, minions mob and break) and the log tells the fight as it
// happens: every attack roll, resistance check, condition, hero point and extra effort.
//
// Deterministic: a battle has a seed and a tick, and each turn uses makeRng(`${seed}::${tick}`),
// so a saved battle resumes exactly and a re-run with the same seed replays the same fight.
//
// What is simulated: attack rolls against defense + 10, Toughness checks with cumulative bruises,
// dazed / staggered / incapacitated, minions going down on any failed check, Afflictions with their
// three degrees and end-of-turn recovery (Cumulative, Progressive, Limited Degree, Extra Condition),
// Weaken, Nullify on sustained defenses, Area effects with Dodge for half, Multiattack, Penetrating
// vs Impervious, Immunity by descriptor and defense, Concealment misses, Healing and Regeneration,
// Power / Accurate / All-out / Defensive Attack trade-offs, feints, grabs (restrained and bound),
// Takedown, Interpose, Evasion, Luck, Seize Initiative, Fearless, hero points (improve a roll,
// recover) and extra effort with fatigue, range bands and movement, prone, vulnerable, defenseless.
// Not simulated: Summon, Create, Illusion, Deflect, Insubstantial, Environment, team attacks, cover.

import { makeRng } from './rng.js';
import { deriveAll, advantageRank, allPowers } from './derive.js';

export const ARENA = 8;           // zones, left to right
export const MAX_ROUNDS = 40;

// ---- fighting styles ------------------------------------------------------------------------------

export const STYLES = {
  brawler: { label: 'Brawler', glyph: '👊', blurb: 'Closes in and hits hard with fists, claws or sheer strength. All-out when the enemy is reeling.', close: 1.45, ranged: 0.7, target: 'closest' },
  duelist: { label: 'Skilled fighter', glyph: '🗡', blurb: 'Lives on skill: picks the hurt target, feints high defenses, fights defensively when pressed, chains Takedowns through minions.', close: 1.3, ranged: 0.9, target: 'hurt' },
  gunner: { label: 'Gear fighter', glyph: '🔫', blurb: 'Depends on equipment and devices. Keeps its distance, picks the best weapon for the target, and is in trouble if it gets grabbed.', close: 0.8, ranged: 1.35, target: 'weakest' },
  blaster: { label: 'Blaster', glyph: '💥', blurb: 'Ranged powers. Stays out of reach, trades accuracy for power against soft targets, and drops area effects on groups.', close: 0.6, ranged: 1.35, target: 'weakest' },
  mage: { label: 'Spellcaster', glyph: '🔮', blurb: 'Chooses the effect that fits the target: afflictions against weak wills, damage against the fragile, dispels sustained defenses. Pushes with extra effort when losing.', close: 0.7, ranged: 1.2, target: 'weakest', variety: true },
  mentalist: { label: 'Mentalist', glyph: '🧠', blurb: 'Perception-range mental attacks. Goes for the weakest Will first and turns controlled enemies on their friends.', close: 0.5, ranged: 1.1, target: 'lowWill' },
  tank: { label: 'Powerhouse', glyph: '🛡', blurb: 'Takes hits and gives them back. Charges the biggest threat and leans on Power Attack and Impervious.', close: 1.35, ranged: 0.9, target: 'strongest' },
  speedster: { label: 'Speedster', glyph: '⚡', blurb: 'Hit and run with Move-by Action: strikes and ends the turn out of reach, so slow fighters have to chase.', close: 1.3, ranged: 0.9, target: 'hurt', hitAndRun: true },
  support: { label: 'Support', glyph: '✚', blurb: 'Heals the worst-hurt ally first, interposes to take hits, and otherwise sets up the team with afflictions.', close: 0.8, ranged: 1.1, target: 'strongest' },
  beast: { label: 'Beast', glyph: '🐾', blurb: 'Instinct: lunges at the closest prey, bites and grabs, and may break off when badly hurt.', close: 1.5, ranged: 0.6, target: 'closest', grabs: true, flees: true },
  minion: { label: 'Minion', glyph: '👥', blurb: 'Mobs the closest enemy, goes down on any failed Toughness check (DCA 194), and may run once the fight turns.', close: 1.1, ranged: 1.1, target: 'closest', flees: true },
  omni: { label: 'Omni-power', glyph: '✦', blurb: 'Variable or sprawling arrays: reconfigures every turn to whatever hurts this enemy most.', close: 1.0, ranged: 1.1, target: 'weakest', variety: true },
};
export const TACTICS = { auto: 'By style', closest: 'Closest', weakest: 'Weakest defenses', strongest: 'Biggest threat', hurt: 'Most hurt', lowWill: 'Weakest will', random: 'Anyone' };

const ARCH_STYLE = {
  paragon: 'tank', powerhouse: 'tank', speedster: 'speedster', blaster: 'blaster', crimefighter: 'duelist', martialartist: 'duelist',
  weaponmaster: 'gunner', gadgeteer: 'gunner', battlesuit: 'gunner', mystic: 'mage', psychic: 'mentalist', shapeshifter: 'omni',
  sizechanger: 'tank', totem: 'beast', elemental: 'blaster', infiltrator: 'duelist', mastermind: 'mentalist', healer: 'support',
  android: 'gunner', robot: 'tank',
};

/** Guess how a character fights from its build. */
export function detectStyle(ch, R) {
  if (ch.minion) return 'minion';
  const kind = String(ch.kind || '').toLowerCase();
  const arch = ch.archetype?.id || '';
  if (/^m-/.test(arch)) return 'minion';
  if (ARCH_STYLE[arch]) return ARCH_STYLE[arch];
  const pw = allPowers(ch).map((x) => x.power);
  if (pw.some((p) => p.effect === 'Variable' && p.rank >= 3)) return 'omni';
  if (pw.some((p) => ['Mind Control', 'Mental Blast'].includes(p.effect) || (p.effect === 'Affliction' && (p.range || '') === 'Perception'))) return 'mentalist';
  if (pw.some((p) => p.effect === 'Healing')) return 'support';
  if (['animal', 'beast', 'creature', 'monster'].includes(kind) && (ch.abilities?.Intellect ?? 0) < 0) return 'beast';
  const d = deriveAll(ch, R);
  const atks = d.attacks.filter((a) => a.name !== 'Unarmed');
  const eq = atks.filter((a) => a.equipment).length;
  const dev = (ch.devices || []).reduce((n, x) => n + x.powers.filter((p) => R.effect(p.effect).attack).length, 0);
  const ranged = atks.filter((a) => a.kind === 'ranged' || a.kind === 'area').length;
  const close = atks.filter((a) => a.kind === 'close').length;
  const magic = pw.some((p) => (p.descriptors || []).some((x) => /magic|mystic|arcane|spell/i.test(x))) || /magic/i.test(ch.theme?.id || '');
  if (magic && pw.filter((p) => R.effect(p.effect).attack).length + pw.reduce((n, p) => n + (p.alternates || []).length, 0) >= 2) return 'mage';
  if (eq + dev >= 1 && eq + dev >= atks.length - eq - dev) return 'gunner';
  if (ranged > close) return 'blaster';
  const fgt = d.abilities.Fighting ?? 0;
  if ((d.abilities.Strength ?? 0) >= 8 || d.defenses.Toughness >= ch.pl + 2) return 'tank';
  const speedy = pw.some((p) => ['Speed', 'Flight'].includes(p.effect) && p.rank >= 7) && advantageRank(ch, 'Move-by Action');
  if (speedy) return 'speedster';
  if (fgt >= ch.pl - 1 && (advantageRank(ch, 'Defensive Roll') || advantageRank(ch, 'Takedown') || advantageRank(ch, 'Improved Critical'))) return 'duelist';
  if (['animal', 'beast', 'creature', 'monster'].includes(kind)) return 'beast';
  return close >= 1 ? 'brawler' : 'blaster';
}

// ---- conditions ---------------------------------------------------------------------------------------

// Composite conditions break down into the basic ones (DCA 19-21).
const COMPOSITE = {
  Staggered: ['Dazed', 'Hindered'], Incapacitated: ['Defenseless', 'Stunned', 'Unaware', 'Prone'], Asleep: ['Defenseless', 'Stunned', 'Unaware'],
  Paralyzed: ['Defenseless', 'Immobile', 'Stunned'], Bound: ['Defenseless', 'Immobile', 'Impaired'], Restrained: ['Hindered', 'Vulnerable'],
  Exhausted: ['Impaired', 'Hindered'], Fatigued: ['Hindered'], Blind: ['Hindered', 'Vulnerable', 'Blinded'], Surprised: ['Stunned', 'Vulnerable'],
  Entranced: ['Stunned'], Prone: ['Prone', 'Hindered'],
};
const KNOWN = ['Asleep', 'Blind', 'Bound', 'Compelled', 'Controlled', 'Dazed', 'Deaf', 'Defenseless', 'Disabled', 'Entranced', 'Exhausted', 'Fatigued', 'Hindered', 'Immobile', 'Impaired', 'Incapacitated', 'Paralyzed', 'Prone', 'Restrained', 'Staggered', 'Stunned', 'Surprised', 'Transformed', 'Unaware', 'Vulnerable', 'Weakened'];
const SEVERITY = { Incapacitated: 10, Asleep: 9, Paralyzed: 9, Controlled: 9, Bound: 8, Stunned: 8, Unaware: 7, Staggered: 7, Compelled: 6, Entranced: 6, Defenseless: 6, Transformed: 6, Exhausted: 5, Restrained: 5, Immobile: 5, Disabled: 5, Dazed: 4, Blind: 4, Prone: 3, Vulnerable: 3, Impaired: 3, Fatigued: 2, Hindered: 2, Deaf: 1, Weakened: 1 };

/** Turn one tier of an affliction's text ("Dazed and Vision Impaired") into condition names. */
function parseTier(text, index) {
  const found = KNOWN.filter((k) => new RegExp(`\\b${k}\\b`, 'i').test(text));
  if (/immobiliz/i.test(text) && !found.includes('Immobile')) found.push('Immobile');
  if (/transform/i.test(text) && !found.includes('Transformed')) found.push('Transformed');
  if (found.length) return found;
  return [['Impaired', 'Disabled', 'Incapacitated'][Math.min(2, index)]];
}

/** Resistance and the three degrees of an Affliction-type power from its detail text. */
export function parseAffliction(p, R) {
  const eff = R.effect(p.effect);
  const detail = String(p.detail || '');
  const resist = (/Resisted by ([A-Za-z]+)/i.exec(detail)?.[1]) || p.resistance || (eff.resistance === 'Fortitude or Will' ? 'Fortitude' : eff.resistance) || 'Fortitude';
  const afterSemi = detail.includes(';') ? detail.split(';').slice(1).join(';') : (/Resisted by/i.test(detail) ? '' : detail);
  const tierTexts = afterSemi.split(',').map((s) => s.trim()).filter(Boolean);
  let tiers = tierTexts.length ? tierTexts.map((t, i) => parseTier(t, i)) : [['Dazed'], ['Stunned'], ['Incapacitated']];
  if (p.effect === 'Snare' && !tierTexts.length) tiers = [['Hindered', 'Vulnerable'], ['Defenseless', 'Immobile']];
  if (p.effect === 'Dazzle' && !tierTexts.length) tiers = [['Impaired'], ['Disabled'], ['Unaware']];
  if (p.effect === 'Sleep' && !tierTexts.length) tiers = [['Fatigued'], ['Exhausted'], ['Asleep']];
  if (p.effect === 'Mind Control' && !tierTexts.length) tiers = [['Dazed'], ['Compelled'], ['Controlled']];
  const limited = (p.flaws || []).filter((f) => f.name === 'Limited Degree').reduce((s, f) => s + (f.steps ?? 1), 0);
  const maxDegree = Math.max(1, Math.min(tiers.length, 3 - limited));
  const cap = (v) => v.charAt(0).toUpperCase() + v.slice(1);
  return { resist: cap(resist.toLowerCase()), tiers: tiers.slice(0, maxDegree), maxDegree, cumulative: hasExtra(p, 'Cumulative'), progressive: hasExtra(p, 'Progressive'), extraCondition: hasExtra(p, 'Extra Condition') };
}

const hasExtra = (p, name) => (p?.extras || []).some((m) => m.name === name);
const extraOpt = (p, name) => (p?.extras || []).find((m) => m.name === name)?.option;
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- combatants ------------------------------------------------------------------------------------------

function effectWeights(attack) {
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
    descriptors: [...(p?.descriptors || []), ...(a.equipment ? ['weapon'] : []), ...(a.name === 'Unarmed' ? ['bludgeoning'] : [])],
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

function immunities(ch, d) {
  const words = [];
  if (d.defenses.immune?.Fortitude) words.push('fortitude effects');
  if (d.defenses.immune?.Will) words.push('will effects');
  for (const { power: p } of allPowers(ch, { includeAlternates: false })) if (p.effect === 'Immunity' && p.detail) words.push(String(p.detail).toLowerCase());
  return words;
}

/** Build a combatant from a character. opts: { team, style, tactics, heroPoints, name } */
export function makeCombatant(R, ch, opts = {}) {
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
function resetCombatant(c) {
  Object.assign(c, {
    init: 0, initRoll: 0, bruises: 0, dazed: false, staggered: false, out: false, outReason: null, fled: false,
    conditions: [],        // [{ name, degree, from, source, dc, resist, cumulative, progressive, tiers, extraCondition, until }]
    weakened: {},          // trait -> ranks lost
    fatigue: 0, defMod: 0, feinted: false, grabbedBy: null, holding: null, nullified: 0, regen: 0, interposed: false,
    lastAttackId: null, usedEffort: 0,
    stats: { attacks: 0, hits: 0, crits: 0, degrees: 0, kos: 0, healed: 0, taken: 0 },
  });
}

/** Derived numbers (recomputed on load, since only the character is saved). */
export function rebuildCombatant(c, R, d = deriveAll(c.ch, R)) {
  c.d = d;
  c.initBonus = d.initiative;
  c.attacks = d.attacks.map((a) => buildAttack(c, a, R)).filter((a) => a.rank > 0 || a.effect !== 'Damage');
  const pw = allPowers(c.ch, { includeAlternates: false }).map((x) => x.power);
  c.impervious = pw.filter((p) => ['Protection', 'Force Field'].includes(p.effect) && hasExtra(p, 'Impervious')).reduce((s, p) => s + p.rank, 0);
  c.sustainedProtection = pw.filter((p) => p.effect === 'Force Field' || (p.effect === 'Protection' && hasExtra(p, 'Sustained'))).reduce((s, p) => s + p.rank, 0);
  c.regenRank = pw.filter((p) => p.effect === 'Regeneration').reduce((s, p) => s + p.rank, 0);
  const heal = allPowers(c.ch).map((x) => x.power).find((p) => p.effect === 'Healing');
  c.healing = heal ? { name: heal.name, rank: heal.rank, ranged: (heal.range || 'Close') !== 'Close' } : null;
  const conceal = pw.find((p) => ['Concealment', 'Invisibility'].includes(p.effect) && (!p.detail || /visual|sight|vision/i.test(p.detail)));
  c.concealment = conceal ? ((conceal.flaws || []).some((f) => /Blending|Limited|Partial/i.test(f.name)) || conceal.rank < 2 ? 'partial' : 'total') : null;
  c.senses = pw.filter((p) => p.effect === 'Senses').map((p) => p.detail || '').join(' ');
  c.immune = immunities(c.ch, d);
  const mv = bestMoveRank(c.ch);
  c.speed = 1 + Math.min(4, Math.floor(mv.rank / 3));
  c.flying = mv.flying;
  const variable = pw.find((p) => p.effect === 'Variable');
  c.variable = variable ? { name: variable.name, points: variable.rank * 5 } : null;
  c.adv = Object.fromEntries(['Power Attack', 'Accurate Attack', 'All-out Attack', 'Defensive Attack', 'Takedown', 'Interpose', 'Evasion', 'Fearless', 'Seize Initiative', 'Move-by Action', 'Fast Grab', 'Improved Grab', 'Improved Hold', 'Chokehold', 'Agile Feint', 'Uncanny Dodge', 'Improved Initiative', 'Diehard', 'Instant Up', 'Luck'].map((n) => [n, advantageRank(c.ch, n)]));
  const sk = (name) => d.skills.find((s) => s.name === name)?.bonus ?? (d.abilities[R.skillAbility(name)] ?? 0);
  c.skills = { Deception: sk('Deception'), Insight: sk('Insight'), Acrobatics: sk('Acrobatics'), Athletics: sk('Athletics'), Intimidation: sk('Intimidation') };
  // Omni-powers: a Variable pool can be configured into an attack each turn.
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
  return c;
}

// ---- condition helpers --------------------------------------------------------------------------------

/** The basic conditions in force on a combatant right now. */
export function activeConditions(c) {
  const set = new Set();
  const add = (name) => { set.add(name); for (const sub of COMPOSITE[name] || []) if (sub !== name) add(sub); };
  if (c.dazed) add('Dazed');
  if (c.staggered) add('Staggered');
  if (c.out && !c.fled) add('Incapacitated');
  if (c.fatigue >= 2) add('Exhausted'); else if (c.fatigue === 1) add('Fatigued');
  if (c.grabbedBy) add(c.conditions.some((x) => x.name === 'Bound') ? 'Bound' : 'Restrained');
  for (const x of c.conditions) add(x.name);
  return set;
}

export function conditionLabels(c) {
  if (c.fled) return ['Fled'];
  if (c.out) return [c.outReason === 'minion' ? 'Down' : c.outReason === 'asleep' ? 'Asleep' : c.outReason === 'paralyzed' ? 'Paralyzed' : 'Incapacitated'];
  const basic = activeConditions(c);
  const named = new Set();
  if (c.staggered && !c.out) named.add('Staggered');
  else if (c.dazed && !c.out) named.add('Dazed');
  if (c.fatigue === 1) named.add('Fatigued'); if (c.fatigue >= 2) named.add('Exhausted');
  if (c.grabbedBy) named.add(basic.has('Bound') ? 'Bound' : 'Restrained');
  for (const x of c.conditions) named.add(x.name);
  for (const n of ['Prone', 'Vulnerable', 'Defenseless', 'Hindered', 'Immobile', 'Impaired', 'Disabled', 'Stunned', 'Unaware']) if (basic.has(n) && ![...named].some((m) => (COMPOSITE[m] || []).includes(n))) named.add(n);
  return [...named];
}

function checkPenalty(c) {
  const s = activeConditions(c);
  return (s.has('Disabled') ? 5 : s.has('Impaired') ? 2 : 0);
}

function defenseOf(c, which) {
  const s = activeConditions(c);
  let v = (c.d.defenses[which] ?? 0) + c.defMod - (c.weakened[which] || 0);
  if (s.has('Defenseless')) return 0;
  if (s.has('Vulnerable')) v = Math.ceil(v / 2);
  return v;
}

function resistOf(c, which) {
  const dd = c.d.defenses;
  if (which === 'Toughness') return Math.max(-5, dd.Toughness - c.bruises - c.nullified - (c.weakened.Toughness || 0) - (c.weakened.Strength ? Math.floor(c.weakened.Strength / 2) : 0)) - checkPenalty(c);
  if (which === 'Dodge' || which === 'Parry') return defenseOf(c, which) - checkPenalty(c);
  const v = dd[which];
  if (typeof v !== 'number') return null; // immune
  return v - (c.weakened[which] || 0) - checkPenalty(c);
}

function canAct(c) {
  const s = activeConditions(c);
  if (c.out) return 'none';
  if (s.has('Stunned') || s.has('Unaware')) return 'none';
  if (s.has('Controlled')) return 'controlled';
  if (s.has('Dazed') || s.has('Compelled')) return 'standard';
  return 'full';
}

function moveZones(c) {
  const s = activeConditions(c);
  if (s.has('Immobile') || c.grabbedBy) return 0;
  return s.has('Hindered') ? Math.max(1, Math.ceil(c.speed / 2)) : c.speed;
}

// ---- probability helpers (same math as the GM Tools calculator) ------------------------------------------

export function hitOdds(bonus, defense) {
  let hit = 0;
  for (let r = 2; r <= 19; r++) if (r + bonus >= 10 + defense) hit++;
  return { hit: (hit + 1) / 20, crit: 1 / 20 };
}

export function resistOdds(resist, dc) {
  const out = [0, 0, 0, 0, 0];
  for (let r = 1; r <= 20; r++) {
    const total = r + resist;
    let fails = total < dc ? 1 + Math.floor((dc - total - 1) / 5) : 0;
    if (r === 20) fails = Math.max(0, fails - 1);
    out[Math.min(4, fails)] += 1 / 20;
  }
  return out;
}

function dcOf(atk, rank = atk.rank) {
  return (atk.effect === 'Damage' || atk.effect === 'Mental Blast' ? 15 : 10) + rank;
}

function isImmune(target, atk) {
  const res = String(atk.resistance || '').toLowerCase();
  for (const w of target.immune) {
    if (w.includes('fortitude effects') && res === 'fortitude') return 'immune to Fortitude effects';
    if (w.includes('will effects') && res === 'will') return 'immune to Will effects';
    for (const dsc of atk.descriptors || []) {
      const d = String(dsc).toLowerCase().replace(/\s*\(.*$/, '');
      if (d.length > 2 && !['weapon', 'bludgeoning', 'variable', 'super-science', 'technology', 'power armor'].includes(d) && new RegExp(`\\b${d.replace(/[^a-z\-]/g, '')}\\b`).test(w) && /damage|effects|attacks|\ball\b|^[a-z, &-]+$/.test(w)) return `immune to ${dsc}`;
    }
    if (atk.effect === 'Mind Control' && /mind control|mental/.test(w)) return 'immune to mental effects';
  }
  if (atk.fear && target.adv.Fearless) return 'Fearless';
  if (target.minion === false && atk.effect === 'Sleep' && target.immune.some((w) => /sleep/.test(w))) return 'immune to sleep';
  return null;
}

/** Expected "harm" of an attack on a target: how much it would change the fight, in rough degrees. */
function expectedValue(c, atk, target, { bonusShift = 0, rankShift = 0, autoHit = false, dist = 0 } = {}) {
  if (isImmune(target, atk)) return 0;
  const rank = atk.rank + rankShift;
  let hit = 1; let crit = 0;
  if (atk.roll && !autoHit) {
    const def = defenseOf(target, atk.kind === 'close' ? 'Parry' : 'Dodge');
    let bonus = atk.bonus + bonusShift - checkPenalty(c) - rangePenalty(atk, dist);
    if (activeConditions(target).has('Prone')) bonus += atk.kind === 'close' ? 5 : -5;
    if (activeConditions(c).has('Prone') && atk.kind === 'close') bonus -= 5;
    ({ hit, crit } = hitOdds(bonus, def));
    if (target.concealment && !seesThrough(c, target)) hit *= target.concealment === 'total' ? 0.5 : 0.8;
    if (activeConditions(c).has('Blinded')) hit *= 0.5;
    if (activeConditions(target).has('Defenseless')) crit = hit;
  }
  if (atk.effect === 'Damage' && !atk.penetrating && rank <= Math.floor(target.impervious / 2)) return 0.05 * hit;
  const resist = resistOf(target, atk.resistance);
  if (resist === null) return 0;
  const dc = dcOf(atk, rank);
  const dist1 = resistOdds(resist, dc);
  const dist2 = resistOdds(resist, dc + 5);
  const w = atk.weights || effectWeights(atk);
  let ev = 0;
  for (let i = 1; i < 5; i++) {
    let wi = w[i];
    if (atk.effect === 'Damage') {
      // bruises stack: what matters is the condition that lands
      if (i >= 3 && target.staggered) wi = w[4];
      if (target.minion) wi = w[4];
    }
    if (atk.tiers && i > (atk.maxDegree || 3)) wi = w[atk.maxDegree || 3];
    ev += ((hit - crit) * dist1[i] + crit * dist2[i]) * wi;
  }
  if (atk.area) ev *= 0.85; // Dodge for half
  // An affliction that is already on the target (and doesn't stack) is worth much less than something new
  if (atk.tiers && !atk.cumulative && target.conditions.some((x) => x.source === atk.id && x.from === c.id)) ev *= 0.4;
  if (!atk.roll && !atk.area) { const r = c.stats; void r; }
  return ev;
}

function rangePenalty(atk, dist) {
  if (atk.kind !== 'ranged') return 0;
  if (dist <= 1) return 0;
  if (dist <= 3) return 2;
  if (dist <= 5) return 5;
  return 99;
}

function seesThrough(c, target) {
  if (!target.concealment) return true;
  return /radar|accurate|tremor|awareness|danger sense|mental|infravision|ultravision|detect/i.test(c.senses);
}

// ---- the battle -----------------------------------------------------------------------------------------------

export function createBattle({ seed = 'battle', name = 'Battle' } = {}) {
  return { seed, name, tick: 0, round: 0, turn: 0, order: [], combatants: [], log: [], status: 'setup', winner: null, options: { minionRule: true, heroPoints: true, extraEffort: true, maxRounds: MAX_ROUNDS }, lastEvent: 0 };
}

export function addCombatant(b, c) {
  b.combatants.push(c);
  if (b.status === 'setup') placeAll(b);
  return c;
}

export function removeCombatant(b, id) {
  b.combatants = b.combatants.filter((c) => c.id !== id);
  b.order = b.order.filter((x) => x !== id);
  if (b.status === 'setup') placeAll(b);
}

/** Teams start on opposite sides of the arena (a third or fourth team in between). */
export function placeAll(b) {
  const teams = [...new Set(b.combatants.map((c) => c.team))].sort();
  const spots = { [teams[0]]: 1, [teams[1]]: ARENA - 2, [teams[2]]: Math.floor(ARENA / 2) - 1, [teams[3]]: Math.floor(ARENA / 2) };
  const seen = {};
  for (const c of b.combatants) {
    const base = spots[c.team] ?? Math.floor(ARENA / 2);
    const n = (seen[c.team] = (seen[c.team] || 0) + 1);
    const spread = [0, -1, 1][n % 3] * (n > 3 ? 0 : 1);
    c.pos = clamp(base + (c.team === teams[0] ? Math.max(0, spread) : c.team === teams[1] ? Math.min(0, spread) : spread), 0, ARENA - 1);
  }
}

function rngFor(b) { return makeRng(`${b.seed}::${b.tick++}`); }
const d20 = (rng) => rng.int(1, 20);

function log(b, entry) {
  b.log.push({ round: b.round, i: b.log.length, ...entry });
}

/** Roll initiative and start the fight. */
export function startBattle(b, R) {
  if (b.combatants.length < 2 || new Set(b.combatants.map((c) => c.team)).size < 2) throw new Error('Put fighters on at least two teams first.');
  b.log = []; b.tick = 0; b.round = 1; b.turn = 0; b.winner = null;
  for (const c of b.combatants) { resetCombatant(c); rebuildCombatant(c, R); }
  placeAll(b);
  const rng = rngFor(b);
  for (const c of b.combatants) {
    c.initRoll = d20(rng);
    c.init = c.initRoll + c.initBonus + (c.adv['Seize Initiative'] ? 100 : 0);
  }
  b.order = [...b.combatants].sort((x, y) => y.init - x.init || y.initBonus - x.initBonus || x.name.localeCompare(y.name)).map((c) => c.id);
  b.status = 'running';
  log(b, { kind: 'round', text: `Round 1 begins. ${b.combatants.length} fighters, ${new Set(b.combatants.map((c) => c.team)).size} sides.`, important: true });
  log(b, { kind: 'init', text: `Initiative: ${b.order.map((id) => { const c = byId(b, id); return `${c.name} ${c.init - (c.adv['Seize Initiative'] ? 100 : 0)}${c.adv['Seize Initiative'] ? ' (Seize Initiative, goes first)' : ''}`; }).join(', ')}.`, dice: b.order.map((id) => { const c = byId(b, id); return { label: `${c.name} initiative`, roll: c.initRoll, mod: c.initBonus, total: c.initRoll + c.initBonus }; }) });
  return b;
}

export function byId(b, id) { return b.combatants.find((c) => c.id === id); }

/** Throw a fighter into a battle that is already running: they roll initiative and act at the end of this round. */
export function joinBattle(b, R, c) {
  if (b.status !== 'running') return addCombatant(b, c);
  b.combatants.push(c);
  resetCombatant(c); rebuildCombatant(c, R);
  const teams = [...new Set(b.combatants.map((x) => x.team))].sort();
  c.pos = c.team === teams[0] ? 0 : c.team === teams[1] ? ARENA - 1 : Math.floor(ARENA / 2);
  const rng = rngFor(b);
  c.initRoll = d20(rng); c.init = c.initRoll + c.initBonus;
  b.order.push(c.id);
  log(b, { kind: 'init', text: `${c.name} joins the fight on team ${c.team} (initiative ${c.init}).`, important: true });
  return c;
}
const alive = (b) => b.combatants.filter((c) => !c.out && !c.fled);
const enemiesOf = (b, c) => alive(b).filter((x) => x.team !== c.team);
const alliesOf = (b, c) => alive(b).filter((x) => x.team === c.team && x !== c);

function checkOver(b) {
  const teams = new Set(alive(b).map((c) => c.team));
  if (teams.size <= 1) {
    b.status = 'over';
    b.winner = teams.size ? [...teams][0] : null;
    const names = alive(b).map((c) => c.name).join(', ');
    log(b, { kind: 'end', text: b.winner ? `The fight is over. Team ${b.winner} wins${names ? `: ${names} ${alive(b).length === 1 ? 'is' : 'are'} still standing` : ''}.` : 'Everyone is down. Nobody wins.', important: true });
    return true;
  }
  if (b.round > b.options.maxRounds) {
    b.status = 'over'; b.winner = null;
    log(b, { kind: 'end', text: `${b.options.maxRounds} rounds and no decision: the fight ends in a stalemate.`, important: true });
    return true;
  }
  return false;
}

/** Play one combatant's turn. Returns the number of log entries added. */
export function step(b, R) {
  if (b.status === 'setup') startBattle(b, R);
  if (b.status !== 'running') return 0;
  const before = b.log.length;
  if (b.turn >= b.order.length) {
    b.turn = 0;
    b.round += 1;
    if (checkOver(b)) return b.log.length - before;
    log(b, { kind: 'round', text: `Round ${b.round}.`, important: true });
    for (const c of alive(b)) regenerate(b, c);
  }
  const c = byId(b, b.order[b.turn]);
  b.turn += 1;
  if (!c || c.out || c.fled) return b.log.length - before;
  const rng = rngFor(b);
  try { takeTurn(b, R, c, rng); } catch (e) { log(b, { kind: 'note', actor: c.id, text: `${c.name} hesitates (${e.message}).` }); }
  endOfTurn(b, c, rng);
  checkOver(b);
  return b.log.length - before;
}

export function runRound(b, R) {
  const start = b.round;
  let guard = 0;
  while (b.status === 'running' && (b.round === start || b.turn === 0) && guard++ < 200) {
    step(b, R);
    if (b.round !== start && b.turn === 0) break;
  }
}

export function runToEnd(b, R) {
  let guard = 0;
  while (b.status !== 'over' && guard++ < 5000) step(b, R);
  return b;
}

// ---- a turn ----------------------------------------------------------------------------------------------------

function takeTurn(b, R, c, rng) {
  c.defMod = 0;
  const mode = canAct(c);
  const conds = conditionLabels(c).filter((x) => x !== 'Fled');
  if (mode === 'none') {
    // Hero point: recover from stunned / dazed / staggered (DCA 23)
    if (b.options.heroPoints && c.heroPoints > 0 && (c.staggered || c.dazed || c.conditions.some((x) => ['Stunned', 'Entranced'].includes(x.name) && x.degree <= 2))) {
      spendHeroPoint(b, c, 'recover');
      if (canAct(c) === 'none') { log(b, { kind: 'skip', actor: c.id, text: `${c.name} is ${conds.join(', ').toLowerCase()} and loses the turn.` }); return; }
    } else { log(b, { kind: 'skip', actor: c.id, text: `${c.name} is ${conds.join(', ').toLowerCase()} and can't act.` }); return; }
  }
  if (mode === 'controlled') {
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
    return;
  }
  const enemies = enemiesOf(b, c);
  if (!enemies.length) return;
  const hurt = c.staggered || c.bruises >= 2;
  const S = STYLES[c.style];

  // Morale: beasts and minions may break and run.
  if (S.flees && !c.adv.Fearless && (c.staggered || (c.minion && c.bruises >= 1 && alliesOf(b, c).length < enemies.length)) && rng.chance(c.minion ? 0.35 : 0.3)) {
    c.fled = true;
    log(b, { kind: 'flee', actor: c.id, text: `${c.name} has had enough and ${c.style === 'beast' ? 'bolts for cover' : 'runs for it'}.`, important: true });
    return;
  }

  // Escape a grab?
  if (c.grabbedBy) {
    const holder = byId(b, c.grabbedBy);
    if (!holder || holder.out || holder.fled) { c.grabbedBy = null; }
    else if (tryEscape(b, c, holder, rng)) return;
    else if (activeConditions(c).has('Bound')) return;
  }

  // Hero point on a dazed-only turn: recover to act fully (if worth it)
  if (mode === 'standard' && b.options.heroPoints && c.heroPoints > 0 && (c.dazed || c.staggered) && (hurt || rng.chance(0.3))) {
    spendHeroPoint(b, c, 'recover');
  }

  // Support: heal first if someone needs it
  if (c.healing && (c.style === 'support' || rng.chance(0.4))) {
    const patient = alliesOf(b, c).concat([c]).filter((a) => a.bruises >= 2 || a.staggered).sort((x, y) => (y.staggered ? 10 : 0) + y.bruises - ((x.staggered ? 10 : 0) + x.bruises))[0];
    if (patient && (c.healing.ranged || Math.abs(patient.pos - c.pos) <= moveZones(c))) {
      if (!c.healing.ranged && patient.pos !== c.pos && canAct(c) === 'full') moveTo(b, c, patient.pos, `to reach ${patient.name}`);
      if (c.healing.ranged || patient.pos === c.pos) { heal(b, c, patient, rng); return; }
    }
  }

  // Hold: keep crushing a grabbed enemy
  if (c.holding) {
    const victim = byId(b, c.holding);
    if (!victim || victim.out || victim.fled || victim.grabbedBy !== c.id) c.holding = null;
    else {
      const unarmed = c.attacks.find((a) => a.unarmed) || c.attacks.find((a) => a.kind === 'close');
      if (unarmed) {
        log(b, { kind: 'attack', actor: c.id, target: victim.id, text: `${c.name} ${c.style === 'beast' ? 'worries' : 'crushes'} ${victim.name} in ${c.style === 'beast' ? 'its jaws' : 'the hold'}: Damage ${unarmed.rank}, no attack roll needed.` });
        applyEffect(b, R, c, unarmed, victim, rng, { auto: true, crit: false });
        return;
      }
    }
  }

  // Pick a target and an attack
  const choice = choosePlan(b, R, c, enemies, rng, mode);
  if (!choice) { log(b, { kind: 'skip', actor: c.id, text: `${c.name} finds nothing worth doing and holds position.` }); return; }
  const { attack, target, plan } = choice;

  if (plan === 'move') {
    moveToward(b, c, target, rng, mode === 'full' ? 2 : 1);
    return;
  }
  if (plan === 'feint') {
    if (mode === 'full') moveToward(b, c, target, rng);
    feint(b, c, target, rng);
    return;
  }
  if (plan === 'grab') {
    if (mode === 'full') moveToward(b, c, target, rng);
    if (target.pos === c.pos) grab(b, R, c, target, rng);
    return;
  }

  // Kiting: ranged fighters step away from melee threats before shooting.
  if (mode === 'full' && attack.kind !== 'close' && S.ranged >= 1.2 && !c.grabbedBy) {
    const threat = enemies.find((e) => e.pos === c.pos && e.attacks.some((a) => a.kind === 'close' && !a.unarmed || (a.unarmed && e.style === 'brawler')));
    if (threat && rangePenalty(attack, 1) === 0) {
      const dir = c.pos <= threat.pos ? -1 : 1;
      const dest = clamp(c.pos + dir * Math.min(moveZones(c), 1), 0, ARENA - 1);
      if (dest !== c.pos) moveTo(b, c, dest, `away from ${threat.name}`);
    }
  }
  if (attack.kind === 'close' && target.pos !== c.pos) {
    if (mode !== 'full') { log(b, { kind: 'skip', actor: c.id, text: `${c.name} is ${conditionLabels(c).join(', ').toLowerCase()} and can't close the distance.` }); return; }
    moveToward(b, c, target, rng);
    if (target.pos !== c.pos) return; // couldn't reach; used the turn moving
  }

  // Trade-offs: shift accuracy for effect, or go all-out / defensive (DCA 190-191)
  const trade = bestTradeoff(c, attack, target, Math.abs(c.pos - target.pos));
  let allOut = 0; let defensive = 0;
  const maxTrade = (name) => (c.adv[name] ? 5 : 2);
  if (!hurt && (c.style === 'brawler' || c.style === 'tank' || c.style === 'beast' || c.style === 'minion') && (target.staggered || target.bruises >= 2 || c.adv['All-out Attack'])) allOut = Math.min(maxTrade('All-out Attack'), 2 + (c.adv['All-out Attack'] ? 2 : 0));
  if ((c.style === 'duelist' || c.style === 'support') && (hurt || enemies.length > alliesOf(b, c).length + 1)) defensive = Math.min(maxTrade('Defensive Attack'), 2 + (c.adv['Defensive Attack'] ? 2 : 0));
  c.defMod = allOut ? -allOut : defensive;

  // Extra effort: push a power when losing (DCA 19)
  let effort = null;
  if (b.options.extraEffort && c.fatigue < 2 && attack.power && !attack.equipment && (hurt || (b.round >= 3 && target.bruises === 0)) && ['mage', 'omni', 'blaster', 'tank', 'brawler', 'mentalist'].includes(c.style) && rng.chance(0.45)) {
    effort = 'power';
  }
  // Takedown chains and the attack itself
  resolveAttack(b, R, c, attack, target, rng, { trade, allOut, defensive, effort });

  // Hit and run
  if (S.hitAndRun && c.adv['Move-by Action'] && mode === 'full' && attack.kind === 'close' && !c.holding) {
    const dir = c.pos >= ARENA / 2 ? 1 : -1;
    const dest = clamp(c.pos + dir * Math.max(1, Math.floor(moveZones(c) / 2)), 0, ARENA - 1);
    if (dest !== c.pos && !enemies.some((e) => e.pos === dest)) moveTo(b, c, dest, 'and is gone before anyone can answer');
  }
}

/** Best attack for c against t, with the trade-off already folded in. */
function bestAttackVs(c, t, rng, { dist = Math.abs(c.pos - t.pos), reachable = true } = {}) {
  const S = STYLES[c.style];
  let best = { attack: null, ev: 0, score: 0 };
  for (const atk of c.attacks) {
    if (atk.kind === 'close' && !reachable) continue;
    if (atk.kind === 'ranged' && rangePenalty(atk, reachable ? Math.min(dist, 1) : dist) > 50) continue;
    const trade = bestTradeoff(c, atk, t, atk.kind === 'close' ? 0 : dist);
    const ev = expectedValue(c, atk, t, { bonusShift: -trade, rankShift: trade, dist: atk.kind === 'close' ? 0 : dist });
    let score = ev * (atk.kind === 'close' ? S.close : S.ranged);
    if (c.style === 'gunner' && (atk.equipment || atk.device)) score *= 1.3;
    if (c.style === 'mentalist' && atk.resistance === 'Will') score *= 1.3;
    if (c.style === 'mage' && atk.effect !== 'Damage') score *= 1.15;
    if (S.variety && atk.id === c.lastAttackId) score *= 0.7;
    if (atk.stunt) score *= 0.95;
    if (atk.unarmed && c.attacks.length > 1) score *= 0.9;
    score *= 0.9 + rng.next() * 0.2;
    if (score > best.score) best = { attack: atk, ev, score };
  }
  return best;
}

function bestTradeoff(c, atk, t, dist) {
  if (!atk.roll || atk.unarmed && !c.adv['Power Attack'] && c.style !== 'brawler') return 0;
  const limitUp = c.adv['Power Attack'] ? 5 : 2;      // bonus -> rank
  const limitDown = c.adv['Accurate Attack'] ? 5 : 2;  // rank -> bonus
  const base = expectedValue(c, atk, t, { dist });
  let best = 0; let bestEv = base;
  const def = defenseOf(t, atk.kind === 'close' ? 'Parry' : 'Dodge');
  for (let s = -limitDown; s <= limitUp; s++) {
    if (s === 0) continue;
    if (atk.rank + s < 1) continue;
    // Power Attack only makes sense while the attack still has a fair chance to land
    if (s > 0 && hitOdds(atk.bonus - s - rangePenalty(atk, dist), def).hit < 0.35) continue;
    const ev = expectedValue(c, atk, t, { bonusShift: -s, rankShift: s, dist });
    if (ev > bestEv * 1.03 && ev - base > 0.03) { best = s; bestEv = ev; }
  }
  return best;
}

function choosePlan(b, R, c, enemies, rng, mode) {
  const S = STYLES[c.style];
  const tactic = c.tactics === 'auto' ? S.target : c.tactics;
  const zones = moveZones(c);
  const scored = [];
  for (const t of enemies) {
    const dist = Math.abs(c.pos - t.pos);
    const reachable = dist === 0 || (mode === 'full' && dist <= zones);
    const pick = bestAttackVs(c, t, rng, { dist, reachable });
    let pref = 1;
    if (tactic === 'closest') pref = 1 / (1 + dist);
    if (tactic === 'weakest') pref = 1 + (30 - Math.min(30, defenseOf(t, 'Dodge') + resistOf(t, 'Toughness'))) / 20;
    if (tactic === 'strongest') pref = 1 + t.pl / 10;
    if (tactic === 'hurt') pref = 1 + t.bruises * 0.4 + (t.staggered ? 1 : 0);
    if (tactic === 'lowWill') pref = 1 + (20 - Math.min(20, resistOf(t, 'Will') ?? 20)) / 10;
    if (tactic === 'random') pref = 0.6 + rng.next() * 0.8;
    if (t.minion) pref *= 0.75;
    scored.push({ t, dist, reachable, pick, score: (pick.score || 0.01) * pref });
  }
  scored.sort((x, y) => y.score - x.score);
  const top = scored[0];
  if (!top) return null;
  const t = top.t;
  // Nothing usable right now: close the distance
  if (!top.pick.attack || top.pick.ev <= 0.02) {
    const closeAtk = c.attacks.some((a) => a.kind === 'close');
    if (closeAtk && top.dist > 0) return { target: t, attack: null, plan: 'move' };
    const alt = scored.find((s) => s.pick.attack && s.pick.ev > 0.02);
    if (alt) return { target: alt.t, attack: alt.pick.attack, plan: 'attack' };
    if (top.dist > 1) return { target: t, attack: null, plan: 'move' };
    return null;
  }
  // Grab: beasts, brawlers and tanks with the knack, against someone they can reach
  if ((S.grabs || c.adv['Fast Grab'] || c.adv['Improved Grab'] || c.adv.Chokehold) && !c.holding && top.reachable && (c.d.abilities.Strength ?? 0) >= (t.d.abilities.Strength ?? 0) + 2 && !t.grabbedBy && !t.minion && rng.chance(c.style === 'beast' ? 0.45 : 0.3)) {
    return { target: t, attack: top.pick.attack, plan: 'grab' };
  }
  // Feint: skilled fighters against a defense they can't crack
  if ((c.style === 'duelist' || c.adv['Agile Feint']) && top.pick.attack?.roll && top.reachable && !t.feinted && mode === 'full') {
    const atk = top.pick.attack;
    const def = defenseOf(t, atk.kind === 'close' ? 'Parry' : 'Dodge');
    const now = hitOdds(atk.bonus, def).hit;
    const after = hitOdds(atk.bonus, Math.ceil(def / 2)).hit;
    const feintSkill = Math.max(c.skills.Deception, c.adv['Agile Feint'] ? c.skills.Acrobatics : -99);
    const pFeint = hitOdds(feintSkill, Math.max(t.skills.Insight, t.skills.Deception)).hit;
    if (after * pFeint > now * 2.1) return { target: t, attack: atk, plan: 'feint' };
  }
  return { target: t, attack: top.pick.attack, plan: 'attack' };
}

// ---- movement ------------------------------------------------------------------------------------------------

function moveTo(b, c, dest, why) {
  if (dest === c.pos) return;
  const from = c.pos;
  c.pos = dest;
  log(b, { kind: 'move', actor: c.id, text: `${c.name} ${c.flying ? 'flies' : c.speed >= 3 ? 'blurs' : 'moves'} ${why ? `${why} ` : ''}(zone ${from + 1} → ${dest + 1}).` });
}

function moveToward(b, c, t, rng, moves = 1) {
  void rng;
  const zones = moveZones(c) * moves;
  if (!zones) { log(b, { kind: 'skip', actor: c.id, text: `${c.name} can't move.` }); return; }
  if (t.pos === c.pos) return;
  const dir = t.pos > c.pos ? 1 : -1;
  const dist = Math.abs(t.pos - c.pos);
  const dest = c.pos + dir * Math.min(zones, dist);
  moveTo(b, c, dest, dest === t.pos ? `${moves > 1 ? 'all the way ' : ''}to ${t.name}` : `toward ${t.name}`);
}

// ---- attacks ---------------------------------------------------------------------------------------------

const VERBS = {
  brawler: ['swings at', 'hammers', 'slams', 'pounds on'], duelist: ['cuts at', 'strikes at', 'lunges at', 'snaps a strike at'],
  gunner: ['opens fire on', 'lines up', 'squeezes off a shot at', 'levels a weapon at'], blaster: ['unleashes', 'blasts', 'fires', 'lets fly'],
  mage: ['casts', 'weaves', 'hurls', 'invokes'], mentalist: ['reaches into the mind of', 'lashes out at', 'presses on', 'focuses on'],
  tank: ['charges', 'crashes into', 'smashes at', 'bears down on'], speedster: ['streaks past', 'blitzes', 'darts in on', 'strikes in a blur at'],
  support: ['targets', 'attacks', 'turns on', 'moves against'], beast: ['lunges at', 'tears at', 'snaps at', 'claws at'],
  minion: ['takes a shot at', 'goes after', 'rushes', 'swings at'], omni: ['reconfigures and strikes', 'shifts form and hits', 'unleashes', 'turns'],
};

function attackVerb(c, atk, t, rng) {
  const v = rng.pick(VERBS[c.style] || VERBS.brawler);
  if (c.style === 'blaster' || c.style === 'mage' || c.style === 'omni') return `${v} ${atk.name} at ${t.name}`;
  if (atk.unarmed) return `${v} ${t.name}`;
  return `${v} ${t.name} with ${atk.name}`;
}

function resolveAttack(b, R, c, atk, t, rng, { trade = 0, allOut = 0, defensive = 0, effort = null } = {}) {
  c.lastAttackId = atk.id;
  c.stats.attacks++;
  let rankShift = trade;
  const notes = [];
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
  if (atk.area) { areaAttack(b, R, c, atk, t, rng, rankShift, notes); return; }
  const dist = Math.abs(c.pos - t.pos);
  if (!atk.roll) {
    log(b, { kind: 'attack', actor: c.id, target: t.id, text: `${c.name} ${attackVerb(c, atk, t, rng)} (perception range, no attack roll)${notes.length ? ` — ${notes.join('; ')}` : ''}.` });
    applyEffect(b, R, c, atk, t, rng, { auto: true, crit: false, rankShift });
    return;
  }
  // The attack roll
  const which = atk.kind === 'close' ? 'Parry' : 'Dodge';
  const def = defenseOf(t, which);
  const dc = 10 + def;
  let mod = atk.bonus - trade + allOut - defensive - checkPenalty(c) - rangePenalty(atk, dist);
  const tc = activeConditions(t); const cc = activeConditions(c);
  if (tc.has('Prone')) mod += atk.kind === 'close' ? 5 : -5;
  if (cc.has('Prone') && atk.kind === 'close') mod -= 5;
  const roll = d20(rng);
  let total = roll + mod;
  let hit = roll === 20 || (roll !== 1 && total >= dc);
  let crit = roll === 20 || (hit && roll >= atk.crit);
  const dice = [{ label: 'Attack', roll, mod, total, dc }];
  let text = `${c.name} ${attackVerb(c, atk, t, rng)}: d20 ${roll} ${sign(mod)} = ${total} vs ${which} DC ${dc}`;
  if (t.feinted) { text += ' (feinted: defenses halved)'; t.feinted = false; }
  // Concealment and blindness
  let missChance = 0;
  if (t.concealment && !seesThrough(c, t)) missChance = t.concealment === 'total' ? 0.5 : 0.2;
  if (cc.has('Blinded')) missChance = Math.max(missChance, 0.5);
  if (hit && missChance && rng.chance(missChance)) { hit = false; crit = false; text += `, but ${c.name} can't see ${t.name} and the attack goes wide`; }
  // Hero point: improve a miss
  if (!hit && b.options.heroPoints && c.heroPoints > 0 && roll !== 1 && (c.style !== 'minion') && (t.staggered || c.staggered || rng.chance(0.5))) {
    c.heroPoints--;
    const r2 = d20(rng);
    const r2b = r2 <= 10 ? r2 + 10 : r2;
    total = r2b + mod;
    hit = r2 === 20 || total >= dc;
    crit = r2 === 20 || (hit && r2b >= atk.crit);
    dice.push({ label: 'Hero point re-roll', roll: r2b, mod, total, dc });
    text += `. Miss! ${c.name} spends a hero point to re-roll: ${r2}${r2 <= 10 ? ' (+10, below 11)' : ''} ${sign(mod)} = ${total}`;
  }
  if (tc.has('Defenseless') && hit) crit = true;
  if (!hit) {
    log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${text} — ${roll === 1 ? 'natural 1, a clean miss' : 'miss'}${notes.length ? ` (${notes.join('; ')})` : ''}.`, dice });
    if (c.holding === t.id) {}
    return;
  }
  c.stats.hits++;
  if (crit) c.stats.crits++;
  text += ` — ${crit ? 'CRITICAL HIT' : 'hit'}${notes.length ? ` (${notes.join('; ')})` : ''}.`;
  // Interpose: an ally with the advantage takes the hit
  const guard = alliesOf(b, t).find((a) => a.adv.Interpose && !a.interposed && a.pos === t.pos && !a.staggered && a.style !== 'minion');
  if (guard && (t.staggered || t.bruises >= 2 || t.pl < guard.pl)) {
    guard.interposed = true;
    log(b, { kind: 'hit', actor: c.id, target: t.id, text, dice });
    log(b, { kind: 'condition', actor: guard.id, target: t.id, text: `${guard.name} interposes and takes the hit meant for ${t.name}!`, important: true });
    applyEffect(b, R, c, atk, guard, rng, { crit, rankShift, multi: 0 });
    return;
  }
  let multi = 0;
  if (atk.multiattack) {
    const deg = 1 + Math.floor((total - dc) / 5);
    multi = deg >= 3 ? 5 : deg === 2 ? 2 : 0;
    if (multi) text += ` Multiattack: ${deg} degrees, +${multi} to the DC.`;
  }
  log(b, { kind: crit ? 'crit' : 'hit', actor: c.id, target: t.id, text, dice });
  const result = applyEffect(b, R, c, atk, t, rng, { crit, rankShift, multi });
  // Fast Grab: a hit with an unarmed attack can become a hold
  if (result?.landed && atk.unarmed && c.adv['Fast Grab'] && !c.holding && !t.out && !t.grabbedBy && rng.chance(0.6)) {
    log(b, { kind: 'note', actor: c.id, target: t.id, text: `${c.name} uses Fast Grab to turn the hit into a hold.` });
    grab(b, R, c, t, rng, { free: true });
  }
  // Takedown: a dropped minion lets the attacker swing at the next one
  if (result?.ko && t.minion && c.adv.Takedown && atk.kind === 'close' && !atk.area) {
    let chain = 0;
    let next = enemiesOf(b, c).find((e) => e.minion && e.pos === c.pos);
    while (next && chain < 5) {
      chain++;
      log(b, { kind: 'note', actor: c.id, target: next.id, text: `Takedown: ${c.name} keeps moving and swings at ${next.name}.` });
      const r = resolveSimpleAttack(b, R, c, atk, next, rng, mod);
      if (!r?.ko) break;
      next = enemiesOf(b, c).find((e) => e.minion && e.pos === c.pos);
    }
  }
}

function resolveSimpleAttack(b, R, c, atk, t, rng, mod) {
  const which = atk.kind === 'close' ? 'Parry' : 'Dodge';
  const dc = 10 + defenseOf(t, which);
  const roll = d20(rng);
  const total = roll + mod;
  const hit = roll === 20 || (roll !== 1 && total >= dc);
  const crit = roll === 20 || (hit && roll >= atk.crit);
  c.stats.attacks++;
  if (!hit) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${c.name} swings at ${t.name}: d20 ${roll} ${sign(mod)} = ${total} vs ${which} DC ${dc} — miss.`, dice: [{ label: 'Attack', roll, mod, total, dc }] }); return null; }
  c.stats.hits++;
  log(b, { kind: crit ? 'crit' : 'hit', actor: c.id, target: t.id, text: `${c.name} hits ${t.name}: d20 ${roll} ${sign(mod)} = ${total} vs ${which} DC ${dc} — ${crit ? 'critical hit' : 'hit'}.`, dice: [{ label: 'Attack', roll, mod, total, dc }] });
  return applyEffect(b, R, c, atk, t, rng, { crit });
}

function areaAttack(b, R, c, atk, t, rng, rankShift, notes) {
  const zone = t.pos;
  const inArea = alive(b).filter((x) => x.pos === zone && x !== c && (!atk.selective || x.team !== c.team));
  const victims = inArea.filter((x) => x.team !== c.team);
  const friendly = inArea.filter((x) => x.team === c.team);
  log(b, { kind: 'attack', actor: c.id, target: t.id, text: `${c.name} drops ${atk.name} (${atk.area} area) on zone ${zone + 1}: ${inArea.map((x) => x.name).join(', ') || 'nobody'} ${inArea.length === 1 ? 'is' : 'are'} caught in it${friendly.length && !atk.selective ? ` (${friendly.map((x) => x.name).join(', ')} too!)` : ''}${notes.length ? ` — ${notes.join('; ')}` : ''}.`, important: true });
  for (const v of [...victims, ...friendly]) {
    const dodge = defenseOf(v, 'Dodge') - checkPenalty(v) + (v.adv.Evasion >= 2 ? 5 : v.adv.Evasion ? 2 : 0);
    const dc = 10 + atk.rank + rankShift;
    const roll = d20(rng);
    const total = roll + dodge;
    const half = roll === 20 || total >= dc;
    const deg = half ? 1 + Math.floor((total - dc) / 5) : 0;
    const dodged = half && v.adv.Evasion && deg >= 2;
    log(b, { kind: half ? 'resist' : 'hit', actor: c.id, target: v.id, text: `${v.name} dives for cover: Dodge d20 ${roll} ${sign(dodge)} = ${total} vs DC ${dc} — ${dodged ? 'Evasion: slips clear entirely' : half ? 'half effect' : 'full effect'}.`, dice: [{ label: 'Dodge', roll, mod: dodge, total, dc }] });
    if (dodged) continue;
    const r = applyEffect(b, R, c, atk, v, rng, { auto: true, crit: false, rankShift: rankShift - (half ? Math.ceil((atk.rank + rankShift) / 2) : 0) });
    if (r?.landed && v.team !== c.team) c.stats.hits++;
  }
}

/** Resolve the effect of a hit (or an automatic effect). Returns { landed, ko, degrees }. */
function applyEffect(b, R, c, atk, t, rng, { crit = false, rankShift = 0, multi = 0 } = {}) {
  const rank = Math.max(0, atk.rank + rankShift);
  const why = isImmune(t, atk);
  if (why) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name} is ${why}: no effect.` }); return { landed: false }; }
  if (atk.effect === 'Damage' && !atk.penetrating && t.impervious && rank <= Math.floor(t.impervious / 2)) {
    log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name}'s Impervious ${t.impervious} shrugs off Damage ${rank} without a check.` });
    return { landed: false };
  }
  if (atk.effect === 'Nullify') return nullify(b, c, atk, t, rng, rank);
  const resistName = atk.resistance;
  const resist = resistOf(t, resistName);
  if (resist === null) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name} has no ${resistName} to affect: no effect.` }); return { landed: false }; }
  const dc = dcOf(atk, rank) + (crit ? 5 : 0) + multi;
  const roll = d20(rng);
  const total = roll + resist;
  let fails = total >= dc ? 0 : 1 + Math.floor((dc - total - 1) / 5);
  if (roll === 20) fails = Math.max(0, fails - 1);
  const dice = [{ label: `${resistName} check`, roll, mod: resist, total, dc }];
  const base = `${t.name} resists with ${resistName}: d20 ${roll} ${sign(resist)} = ${total} vs DC ${dc}${crit ? ' (+5, critical)' : ''}`;
  if (!fails) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${base} — ${roll === 20 ? 'natural 20, ' : ''}resisted.`, dice }); return { landed: false, degrees: 0 }; }
  c.stats.degrees += fails;
  t.stats.taken += fails;
  if (atk.effect === 'Damage' || atk.effect === 'Mental Blast') return damageResult(b, c, t, fails, base, dice);
  if (atk.effect === 'Weaken') {
    const trait = atk.weakens || 'Toughness';
    const lost = Math.min(fails, rank);
    t.weakened[trait] = (t.weakened[trait] || 0) + lost;
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${base} — ${fails} degree${fails > 1 ? 's' : ''}: ${t.name} loses ${lost} rank${lost > 1 ? 's' : ''} of ${trait} (now −${t.weakened[trait]}).`, dice });
    return { landed: true, degrees: fails };
  }
  return afflictionResult(b, c, atk, t, fails, dc, base, dice, rng);
}

function damageResult(b, c, t, fails, base, dice) {
  const minionDown = t.minion && b.options.minionRule;
  let text; let ko = false;
  if (minionDown) { t.out = true; t.outReason = 'minion'; ko = true; text = `${base} — failed: ${t.name} goes down (minions drop on any failed check).`; }
  else {
    const deg = Math.min(4, fails);
    t.bruises++;
    if (deg === 1) text = `${base} — 1 degree: bruised (−${t.bruises} to Toughness).`;
    else if (deg === 2) { t.dazed = true; text = `${base} — 2 degrees: dazed and bruised (−${t.bruises}).`; }
    else if (deg === 3) {
      if (t.staggered) { t.out = true; ko = true; text = `${base} — 3 degrees, and already staggered: ${t.name} is INCAPACITATED.`; }
      else { t.staggered = true; text = `${base} — 3 degrees: staggered and bruised (−${t.bruises}).`; }
    } else { t.out = true; ko = true; text = `${base} — ${fails} degrees: ${t.name} is INCAPACITATED.`; }
    // Hero point recover from a knockout? (not in the rules: incapacitated needs recovery time)
  }
  if (ko) { t.outReason = t.outReason || 'ko'; c.stats.kos++; releaseHolds(b, t); }
  log(b, { kind: ko ? 'ko' : 'condition', actor: c.id, target: t.id, text, dice, important: ko || fails >= 3 });
  return { landed: true, ko, degrees: fails };
}

function afflictionResult(b, c, atk, t, fails, dc, base, dice, rng) {
  const tiers = atk.tiers || [['Dazed'], ['Stunned'], ['Incapacitated']];
  const maxDeg = atk.maxDegree || tiers.length;
  let degree = Math.min(maxDeg, fails);
  const existing = t.conditions.find((x) => x.source === atk.id && x.from === c.id);
  if (atk.cumulative && existing) degree = Math.min(maxDeg, existing.degree + fails);
  else if (existing) degree = Math.max(existing.degree, degree);
  const names = tiers[degree - 1];
  if (atk.extraCondition && degree === 1 && tiers[1]) names.push(...tiers[1].filter((n) => !names.includes(n)));
  const cond = { name: names[0], names, degree, from: c.id, source: atk.id, label: atk.name, dc: dcOf(atk, atk.rank), resist: atk.resistance, cumulative: !!atk.cumulative, progressive: !!atk.progressive, tiers, maxDegree: maxDeg };
  t.conditions = t.conditions.filter((x) => x !== existing);
  for (const n of names.slice(1)) t.conditions.push({ ...cond, name: n });
  t.conditions.push(cond);
  let ko = false;
  if (names.includes('Incapacitated') || names.includes('Asleep') || names.includes('Paralyzed') && degree >= 3 && atk.effect !== 'Snare') {
    t.out = true; t.outReason = names.includes('Asleep') ? 'asleep' : names.includes('Paralyzed') ? 'paralyzed' : 'affliction'; ko = true; c.stats.kos++; releaseHolds(b, t);
  }
  if (names.includes('Controlled')) {
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${base} — ${fails} degree${fails > 1 ? 's' : ''}: ${t.name} is CONTROLLED by ${c.name}.`, dice, important: true });
    return { landed: true, degrees: fails };
  }
  const extra = names.includes('Prone') ? ' and knocked prone' : '';
  log(b, { kind: ko ? 'ko' : 'condition', actor: c.id, target: t.id, text: `${base} — ${fails} degree${fails > 1 ? 's' : ''}${atk.cumulative && existing ? ' (cumulative)' : ''}: ${t.name} is ${names.map((n) => n.toUpperCase()).join(' and ')}${extra}${ko ? ' and out of the fight' : ''}.`, dice, important: ko || degree >= 2 });
  void rng;
  return { landed: true, ko, degrees: fails };
}

function nullify(b, c, atk, t, rng, rank) {
  const prot = t.sustainedProtection;
  if (!prot) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name} has no sustained defense for ${atk.name} to counter: no effect.` }); return { landed: false }; }
  const r1 = d20(rng); const r2 = d20(rng);
  const mine = r1 + rank; const theirs = r2 + Math.max(prot, resistOf(t, 'Will') ?? 0);
  if (mine > theirs) {
    t.nullified = prot;
    log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${c.name}'s ${atk.name} (d20 ${r1} + ${rank} = ${mine}) overpowers ${t.name}'s defenses (d20 ${r2} + ${theirs - r2} = ${theirs}): ${prot} ranks of protection wink out until ${t.name} restores them.`, important: true });
    return { landed: true, degrees: 1 };
  }
  log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${c.name}'s ${atk.name} (d20 ${r1} + ${rank} = ${mine}) fails to crack ${t.name}'s defenses (${theirs}).` });
  return { landed: false };
}

// ---- maneuvers ------------------------------------------------------------------------------------------------

function feint(b, c, t, rng) {
  const useAcro = c.adv['Agile Feint'] && c.skills.Acrobatics > c.skills.Deception;
  const mine = useAcro ? c.skills.Acrobatics : c.skills.Deception;
  const theirs = Math.max(t.skills.Insight, t.skills.Deception);
  const r1 = d20(rng); const r2 = d20(rng);
  const ok = r1 + mine > r2 + theirs || r1 === 20;
  if (ok) t.feinted = true;
  log(b, { kind: ok ? 'condition' : 'miss', actor: c.id, target: t.id, text: `${c.name} feints ${useAcro ? 'with acrobatics' : ''}: ${useAcro ? 'Acrobatics' : 'Deception'} d20 ${r1} ${sign(mine)} = ${r1 + mine} vs ${t.name}'s Insight d20 ${r2} ${sign(theirs)} = ${r2 + theirs} — ${ok ? `${t.name} falls for it and is vulnerable to the next attack` : 'not fooled'}.`, dice: [{ label: 'Feint', roll: r1, mod: mine, total: r1 + mine, dc: r2 + theirs }] });
}

function grab(b, R, c, t, rng, { free = false } = {}) {
  const str = c.d.abilities.Strength ?? 0;
  if (!free) {
    const dc = 10 + defenseOf(t, 'Parry');
    const bonus = (c.attacks.find((a) => a.unarmed)?.bonus ?? c.d.abilities.Fighting ?? 0) - checkPenalty(c);
    const roll = d20(rng); const total = roll + bonus;
    if (!(roll === 20 || (roll !== 1 && total >= dc))) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${c.name} tries to grab ${t.name}: d20 ${roll} ${sign(bonus)} = ${total} vs Parry DC ${dc} — ${t.name} slips away.`, dice: [{ label: 'Grab', roll, mod: bonus, total, dc }] }); return; }
    log(b, { kind: 'hit', actor: c.id, target: t.id, text: `${c.name} grabs at ${t.name}: d20 ${roll} ${sign(bonus)} = ${total} vs Parry DC ${dc} — got a hold.`, dice: [{ label: 'Grab', roll, mod: bonus, total, dc }] });
  }
  const resist = Math.max(defenseOf(t, 'Dodge'), t.d.abilities.Strength ?? 0) - checkPenalty(t);
  const dc = 10 + str + (c.adv['Improved Hold'] ? 5 : 0);
  const roll = d20(rng); const total = roll + resist;
  let fails = total >= dc ? 0 : 1 + Math.floor((dc - total - 1) / 5);
  if (roll === 20) fails = Math.max(0, fails - 1);
  if (!fails) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name} resists the hold: d20 ${roll} ${sign(resist)} = ${total} vs DC ${dc} — breaks free.`, dice: [{ label: 'Resist grab', roll, mod: resist, total, dc }] }); return; }
  t.grabbedBy = c.id; c.holding = t.id;
  t.conditions = t.conditions.filter((x) => x.source !== 'grab');
  if (fails >= 2) t.conditions.push({ name: 'Bound', degree: 2, from: c.id, source: 'grab', label: 'held', tiers: [['Restrained'], ['Bound']] });
  log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${t.name} fails to resist (d20 ${roll} ${sign(resist)} = ${total} vs DC ${dc}, ${fails} degree${fails > 1 ? 's' : ''}): ${fails >= 2 ? 'BOUND — defenseless and immobile' : 'RESTRAINED — hindered and vulnerable'} in ${c.name}'s grip.`, dice: [{ label: 'Resist grab', roll, mod: resist, total, dc }], important: true });
}

function tryEscape(b, c, holder, rng) {
  const bound = activeConditions(c).has('Bound');
  if (!bound && rng.chance(0.5)) return false; // restrained fighters often just fight on
  const mine = Math.max(c.skills.Athletics, c.skills.Acrobatics, c.d.abilities.Strength ?? 0) - checkPenalty(c);
  const dc = 10 + (holder.d.abilities.Strength ?? 0) + (holder.adv['Improved Hold'] ? 5 : 0);
  const roll = d20(rng); const total = roll + mine;
  const ok = roll === 20 || total >= dc;
  if (ok) { c.grabbedBy = null; holder.holding = null; c.conditions = c.conditions.filter((x) => x.source !== 'grab'); }
  log(b, { kind: ok ? 'recover' : 'miss', actor: c.id, target: holder.id, text: `${c.name} struggles to escape ${holder.name}'s hold: d20 ${roll} ${sign(mine)} = ${total} vs DC ${dc} — ${ok ? 'breaks free!' : 'still held'}.`, dice: [{ label: 'Escape', roll, mod: mine, total, dc }] });
  return true;
}

function releaseHolds(b, t) {
  if (t.holding) { const v = byId(b, t.holding); if (v) { v.grabbedBy = null; v.conditions = v.conditions.filter((x) => x.source !== 'grab'); } t.holding = null; }
  if (t.grabbedBy) { const h = byId(b, t.grabbedBy); if (h) h.holding = null; t.grabbedBy = null; }
}

function heal(b, c, patient, rng) {
  const roll = d20(rng);
  const total = roll + c.healing.rank;
  const dc = 10;
  const deg = total >= dc ? 1 + Math.floor((total - dc) / 5) : 0;
  const fixed = [];
  for (let i = 0; i < deg; i++) {
    if (patient.staggered) { patient.staggered = false; fixed.push('staggered'); }
    else if (patient.dazed) { patient.dazed = false; fixed.push('dazed'); }
    else if (patient.bruises > 0) { patient.bruises--; fixed.push('a bruise'); }
    else break;
  }
  c.stats.healed += fixed.length;
  log(b, { kind: fixed.length ? 'heal' : 'miss', actor: c.id, target: patient.id, text: `${c.name} uses ${c.healing.name} on ${patient === c ? `${c.name === 'it' ? 'itself' : 'themself'}` : patient.name}: d20 ${roll} + ${c.healing.rank} = ${total} vs DC 10 — ${fixed.length ? `removes ${fixed.join(', ')}` : 'no effect'}.`, dice: [{ label: 'Healing', roll, mod: c.healing.rank, total, dc }], important: fixed.length > 1 });
}

function spendHeroPoint(b, c, use) {
  if (c.heroPoints <= 0) return false;
  c.heroPoints--;
  if (use === 'recover') {
    const fixed = [];
    if (c.staggered) { c.staggered = false; fixed.push('staggered'); }
    if (c.dazed) { c.dazed = false; fixed.push('dazed'); }
    const stun = c.conditions.find((x) => ['Stunned', 'Entranced'].includes(x.name));
    if (stun) { c.conditions = c.conditions.filter((x) => x.source !== stun.source); fixed.push(stun.name.toLowerCase()); }
    if (c.fatigue > 0 && !fixed.length) { c.fatigue--; fixed.push('fatigue'); }
    log(b, { kind: 'hero', actor: c.id, text: `${c.name} spends a hero point to recover${fixed.length ? ` from being ${fixed.join(' and ')}` : ''} (${c.heroPoints} left).`, important: true });
  }
  return true;
}

function regenerate(b, c) {
  if (!c.regenRank || (!c.bruises && !c.dazed && !c.staggered)) return;
  c.regen += c.regenRank;
  const fixed = [];
  while (c.regen >= 10) {
    c.regen -= 10;
    if (c.staggered) { c.staggered = false; fixed.push('staggered'); }
    else if (c.dazed) { c.dazed = false; fixed.push('dazed'); }
    else if (c.bruises) { c.bruises--; fixed.push('a bruise'); }
    else break;
  }
  if (fixed.length) log(b, { kind: 'heal', actor: c.id, text: `${c.name} regenerates: no longer ${fixed.join(', ')}.` });
}

function endOfTurn(b, c, rng) {
  c.interposed = false;
  if (c.out) return;
  if (c.dazed && !c.staggered) { c.dazed = false; }
  if (c.dazed && c.staggered) { c.dazed = false; } // staggered keeps the hindered part; dazed wears off
  // Sustained defenses come back as a free action
  if (c.nullified) { c.nullified = 0; log(b, { kind: 'recover', actor: c.id, text: `${c.name} restores its defenses.` }); }
  // Recovery checks against afflictions (DCA 95)
  const sources = [...new Set(c.conditions.filter((x) => x.source !== 'grab').map((x) => x.source))];
  for (const src of sources) {
    const group = c.conditions.filter((x) => x.source === src);
    const lead = group[0];
    const resist = resistOf(c, lead.resist || 'Fortitude');
    if (resist === null) { c.conditions = c.conditions.filter((x) => x.source !== src); continue; }
    const roll = d20(rng);
    const total = roll + resist;
    const ok = roll === 20 || total >= lead.dc;
    const dice = [{ label: `Recover (${lead.resist})`, roll, mod: resist, total, dc: lead.dc }];
    if (ok) {
      c.conditions = c.conditions.filter((x) => x.source !== src);
      if (c.out && ['affliction', 'asleep', 'paralyzed'].includes(c.outReason)) { c.out = false; c.outReason = null; }
      log(b, { kind: 'recover', actor: c.id, text: `${c.name} shakes off ${lead.label || 'the effect'}: ${lead.resist} d20 ${roll} ${sign(resist)} = ${total} vs DC ${lead.dc} — recovered.`, dice });
    } else if (lead.progressive && lead.degree < (lead.maxDegree || 3)) {
      const deg = lead.degree + 1;
      const names = lead.tiers[deg - 1];
      c.conditions = c.conditions.filter((x) => x.source !== src);
      for (const n of names) c.conditions.push({ ...lead, name: n, degree: deg, names });
      if (names.includes('Incapacitated') || names.includes('Asleep')) { c.out = true; c.outReason = 'affliction'; releaseHolds(b, c); }
      log(b, { kind: 'condition', actor: c.id, text: `${lead.label} worsens (progressive): d20 ${roll} ${sign(resist)} = ${total} vs DC ${lead.dc} failed — ${c.name} is now ${names.join(' and ').toUpperCase()}.`, dice, important: true });
    } else {
      log(b, { kind: 'miss', actor: c.id, text: `${c.name} fails to shake off ${lead.label || 'the effect'}: d20 ${roll} ${sign(resist)} = ${total} vs DC ${lead.dc}.`, dice });
    }
  }
  // Weakened traits recover a rank per round
  for (const k of Object.keys(c.weakened)) { c.weakened[k] = Math.max(0, c.weakened[k] - 1); if (!c.weakened[k]) delete c.weakened[k]; }
  if (c.fatigue >= 3) { c.out = true; c.outReason = 'exhausted'; log(b, { kind: 'ko', actor: c.id, text: `${c.name} collapses from exhaustion.`, important: true }); }
}

// ---- summaries ----------------------------------------------------------------------------------------------------

/** A quick, plain-text account of where everyone stands. */
export function statusLine(c) {
  if (c.fled) return 'Fled';
  if (c.out) return c.outReason === 'minion' ? 'Down' : c.outReason === 'asleep' ? 'Asleep' : c.outReason === 'exhausted' ? 'Collapsed' : 'Incapacitated';
  const bits = [];
  if (c.bruises) bits.push(`${c.bruises} bruise${c.bruises > 1 ? 's' : ''}`);
  const conds = conditionLabels(c).filter((x) => !['Incapacitated'].includes(x));
  if (conds.length) bits.push(conds.join(', '));
  return bits.length ? bits.join(' · ') : 'Unhurt';
}

export function battleText(b) {
  const out = [`${b.name || 'Battle'} (seed ${b.seed})`, ''];
  for (const team of [...new Set(b.combatants.map((c) => c.team))].sort()) {
    out.push(`Team ${team}: ${b.combatants.filter((c) => c.team === team).map((c) => `${c.name} (PL ${c.pl}, ${STYLES[c.style]?.label || c.style})`).join(', ')}`);
  }
  out.push('');
  for (const e of b.log) out.push(`${e.kind === 'round' ? '' : '  '}${e.text}`);
  if (b.status === 'over') {
    out.push('', 'Final state:');
    for (const c of b.combatants) out.push(`  ${c.name}: ${statusLine(c)} · ${c.stats.hits}/${c.stats.attacks} hits, ${c.stats.kos} KOs`);
  }
  return out.join('\n');
}

/** Run the same match-up many times (fresh seeds) and tally the results. */
export function simulateMany(b, R, n = 100, { seed = b.seed } = {}) {
  const wins = {};
  const rounds = [];
  const kos = {};
  const survived = {};
  const out = {};
  for (const c of b.combatants) { kos[c.id] = 0; survived[c.id] = 0; out[c.id] = 0; }
  for (let i = 0; i < n; i++) {
    const copy = createBattle({ seed: `${seed}-run-${i}`, name: b.name });
    copy.options = { ...b.options };
    for (const c of b.combatants) addCombatant(copy, makeCombatant(R, c.ch, { id: c.id, team: c.team, style: c.style, tactics: c.tactics, heroPoints: c.heroPoints, name: c.name }));
    runToEnd(copy, R);
    wins[copy.winner || 'draw'] = (wins[copy.winner || 'draw'] || 0) + 1;
    rounds.push(copy.round);
    for (const c of copy.combatants) { kos[c.id] += c.stats.kos; if (!c.out && !c.fled) survived[c.id]++; if (c.out) out[c.id]++; }
  }
  return { n, wins, avgRounds: rounds.reduce((s, r) => s + r, 0) / Math.max(1, rounds.length), kos, survived, out };
}

/** Strip a battle to what needs saving (characters and settings; derived numbers are rebuilt). */
export function serializeBattle(b) {
  return {
    ...b,
    combatants: b.combatants.map((c) => {
      const { d, attacks, adv, skills, immune, ...rest } = c;
      return rest;
    }),
  };
}

export function reviveBattle(R, data) {
  const b = { ...createBattle({ seed: data.seed, name: data.name }), ...data };
  b.options = { ...createBattle().options, ...(data.options || {}) };
  b.combatants = (data.combatants || []).map((c) => rebuildCombatant({ ...c, stats: c.stats || { attacks: 0, hits: 0, crits: 0, degrees: 0, kos: 0, healed: 0, taken: 0 }, conditions: c.conditions || [], weakened: c.weakened || {} }, R));
  return b;
}

