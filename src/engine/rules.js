// Rules lookups built from the JSON data (see data/SCHEMA.md).

export const ABILITIES = ['Strength', 'Stamina', 'Agility', 'Dexterity', 'Fighting', 'Intellect', 'Awareness', 'Presence'];
export const ABBR = {
  Strength: 'STR', Stamina: 'STA', Agility: 'AGL', Dexterity: 'DEX',
  Fighting: 'FGT', Intellect: 'INT', Awareness: 'AWE', Presence: 'PRE',
};
export const BUYABLE_DEFENSES = ['Dodge', 'Parry', 'Fortitude', 'Will'];
export const DEFENSE_ABILITY = { Dodge: 'Agility', Parry: 'Fighting', Fortitude: 'Stamina', Toughness: 'Stamina', Will: 'Awareness' };
export const RANGE_STEPS = { Close: 0, Ranged: 1, Perception: 2 };

export const PP_PER_PL = 15;
export const EP_PER_EQUIPMENT_RANK = 5;

export function indexRules(raw) {
  const byName = (list) => new Map((list || []).map((x) => [x.name.toLowerCase(), x]));
  const effects = byName(raw.effects);
  const extras = byName(raw.modifiers?.extras);
  const flaws = byName(raw.modifiers?.flaws);
  const specific = new Map(); // effect name -> {extras: Map, flaws: Map}
  for (const [effectName, mods] of Object.entries(raw.specificModifiers || {})) {
    specific.set(effectName.toLowerCase(), { extras: byName(mods.extras), flaws: byName(mods.flaws) });
  }
  const advantages = byName(raw.advantages);
  const skills = byName(raw.skills);

  const R = {
    raw,
    effects, extras, flaws, advantages, skills,
    effect(name) {
      const e = effects.get(String(name).toLowerCase());
      if (!e) throw new Error(`Unknown effect "${name}"`);
      return e;
    },
    hasEffect: (name) => effects.has(String(name).toLowerCase()),
    /** Find a modifier; effect-specific modifiers take priority over general ones. */
    modifier(kind, name, effectName) {
      const key = String(name).toLowerCase();
      const spec = effectName && specific.get(String(effectName).toLowerCase());
      const found = spec?.[kind === 'extra' ? 'extras' : 'flaws'].get(key)
        ?? (kind === 'extra' ? extras : flaws).get(key);
      if (!found) throw new Error(`Unknown ${kind} "${name}"${effectName ? ` for ${effectName}` : ''}`);
      return found;
    },
    hasModifier(kind, name, effectName) {
      try { R.modifier(kind, name, effectName); return true; } catch { return false; }
    },
    advantage(name) {
      return advantages.get(String(name).toLowerCase());
    },
    skill(name) {
      return skills.get(String(name).toLowerCase());
    },
    skillAbility(name) {
      return R.skill(name)?.ability;
    },
  };
  return R;
}

/** What kind of trait an Enhanced Trait power improves. */
export function traitKind(trait, R) {
  if (ABILITIES.includes(trait)) return 'ability';
  if (BUYABLE_DEFENSES.includes(trait)) return 'defense';
  if (R?.skill(String(trait).replace(/\s*\(.*\)$/, ''))) return 'skill';
  return 'advantage';
}
