// What a held stance does to the numbers on the play screen: Dodge and Parry, attack bonuses and damage ranks,
// initiative and skill bonuses. A stance's `mods` (data/stances.json) are applied when they hold without
// a condition; mods that depend on the situation (`when`, `only`: a feint, a named power, the chosen weapon) are
// listed as notes instead. Benefits stay inside the power level limits (a stance cannot lift a total past the cap).

const FOOT = /kick|foot|knee|leg|stomp/i;
const HAND = /unarmed|punch|jab|fist|palm|hook|uppercut|chop|elbow|haymaker|strike|hand/i;
const GRAB = /grab|hold|throw|lock|slam/i;
const DISARM = /disarm/i;

/** What kind of attack a line is, as the stance mods ask about it. */
export function attackTags(a) {
  const name = a.name || '';
  return { close: a.kind === 'close', ranged: a.kind === 'ranged', foot: FOOT.test(name), hand: HAND.test(name) && !FOOT.test(name), grab: GRAB.test(name), disarm: DISARM.test(name) };
}

function modApplies(mod, tags, prefix) {
  const [stat, part] = mod.stat.split('.');
  if (stat !== prefix || mod.when || mod.except === 'chosenWeapon') return false; // the Weapon stance's penalty to "all other" weapons waits for the weapon to be named (the Battle Room does that)
  if (part && !tags[part]) return false;
  return !(mod.except && tags[mod.except]);
}

/** Sum of the stance's attack (or damage) mods that hold for an attack line. */
export function attackMod(def, a, prefix = 'attack') {
  if (!def) return 0;
  const tags = attackTags(a);
  return def.mods.filter((m) => modApplies(m, tags, prefix)).reduce((t, m) => t + (m.set ? 0 : m.value), 0);
}

/** A defense after the stance: added mods, a "set" (Crane's Dodge +0), and Avoiding's Dodge in place of Parry. */
function defenseAfter(def, name, value, dodge) {
  let v = value;
  for (const m of def.mods) {
    if (m.stat !== name || m.when) continue;
    if (m.only && m.only !== 'active') continue; // Dodge +2 "only resistance" does not change the active defense
    v = m.set ? m.value : v + m.value;
  }
  if (name === 'Parry' && (def.flags || []).includes('dodgeForParry')) v = Math.max(v, dodge);
  return v;
}

/** Skill bonuses a stance changes without a condition: { 'Acrobatics': -8 }. */
export function skillMods(def) {
  const out = {};
  for (const m of def?.mods || []) {
    const [kind, name] = m.stat.split(':');
    if ((kind === 'skill' || kind === 'skillRanks') && name && !m.only && !m.when) out[name] = (out[name] || 0) + m.value;
  }
  return out;
}

/** Mods the numbers do not show: conditional ones, plus what the stance's own text says. */
export function stanceNotes(def) {
  if (!def || !def.mods) return [];
  const notes = [];
  for (const m of def.mods) if (m.when || m.only) notes.push(`${m.stat.replace(/^\w+:/, '')} ${m.value > 0 ? '+' : ''}${m.value}${m.only ? ` (${m.only.replace(/([A-Z])/g, ' $1').toLowerCase()} only)` : ''}${m.when ? ` (when ${m.when.replace(/([A-Z])/g, ' $1').toLowerCase()})` : ''}`);
  if ((def.flags || []).length) notes.push(`${def.flags.filter((f) => f !== 'dodgeForParry').join(', ')} while in this stance`.trim());
  if (def.special && def.dc) notes.push(def.special);
  return notes.filter((n) => n && !/^ while/.test(n));
}

/**
 * The derived numbers (deriveAll's result) as they stand in a stance. Returns a new object of the same shape; the
 * original is untouched. `pl` is the character's power level, for the cap on stacked benefits.
 */
export function inStance(d, def, pl) {
  if (!def || !def.mods?.length) return d;
  const cap = 2 * pl;
  const tough = d.defenses.Toughness;
  const dodge = Math.min(defenseAfter(def, 'Dodge', d.defenses.Dodge, d.defenses.Dodge), Math.max(d.defenses.Dodge, cap - tough));
  const parryRaw = defenseAfter(def, 'Parry', d.defenses.Parry, dodge);
  const parry = Math.min(parryRaw, Math.max(d.defenses.Parry, cap - tough));
  const sk = skillMods(def);
  return {
    ...d,
    defenses: { ...d.defenses, Dodge: dodge, Parry: parry },
    initiative: d.initiative + def.mods.filter((m) => m.stat === 'initiative' && !m.when).reduce((t, m) => t + m.value, 0),
    attacks: d.attacks.map((a) => {
      const dmg = attackMod(def, a, 'damage');
      const bonus = a.roll ? Math.min(a.bonus + attackMod(def, a, 'attack'), Math.max(a.bonus, cap - (a.rank + dmg))) : a.bonus;
      const rank = a.rank + dmg;
      return dmg || bonus !== a.bonus ? { ...a, bonus, rank, stance: true } : a;
    }),
    skills: d.skills.map((k) => (sk[k.name] ? { ...k, bonus: k.bonus + sk[k.name], stance: true } : k)),
  };
}

/**
 * A stance's Dodge and Parry changes split by where they count, for the Battle Room, which keeps the active defense and the
 * resistance check apart: { Dodge: { all, active, resist, set }, Parry: { ... } }. `all` counts for both, `active` only for the
 * defense against an attack (High), `resist` only for resistance checks (Reactive), `set` replaces the value (Crane's Dodge +0).
 */
export function defenseSplit(def) {
  const out = { Dodge: { all: 0, active: 0, resist: 0 }, Parry: { all: 0, active: 0, resist: 0 } };
  for (const m of def?.mods || []) {
    const row = out[m.stat];
    if (!row || m.when) continue;
    if (m.set) row.set = m.value;
    else if (m.only === 'active') row.active += m.value;
    else if (m.only === 'resistance') row.resist += m.value;
    else if (!m.only) row.all += m.value;
  }
  return out;
}

/** The unconditional mods of a stance with a given stat name (or prefix, ending in a colon), for the Battle Room's own effects. */
export function modsOf(def, stat) {
  return (def?.mods || []).filter((m) => !m.when && (stat.endsWith(':') ? m.stat.startsWith(stat) : m.stat === stat));
}
