# DCUGen rules data schema

All rules data lives in `data/*.json`. Every entry that comes from a book carries a
`"source"` such as `"DCA 104"` (DC Adventures Hero's Handbook, page 104), `"PP 37"` (Power
Profiles), `"MA 12"` (Martial Arts), `"GG 20"` (Gadget Guides), `"HV1 55"` (Heroes & Villains 1).

Names are the exact book names (Title Case), because power templates and tests reference them.

## effects.json — list of effects (DC Adventures Chapter 6, Powers)

```json
{
  "name": "Damage",
  "type": "Attack",              // Attack | Control | Defense | General | Movement | Sensory
  "action": "Standard",          // Standard | Move | Free | Reaction | None
  "range": "Close",              // Personal | Close | Ranged | Perception | Rank
  "duration": "Instant",         // Instant | Concentration | Sustained | Continuous | Permanent
  "resistance": "Toughness",     // string or null, e.g. "Fortitude or Will", "Dodge"
  "cost": 1,                     // base cost per rank (integer)
  "cost_options": null,          // when the cost per rank varies: {"label": cost, ...}
  "fixed_cost": null,            // effects bought as a flat package, e.g. Invisibility {"Normal vision": 4, "All visual senses": 8}
  "max_rank": null,              // integer when the book caps ranks (Insubstantial 4, Communication 5 ...)
  "attack": true,                // true if the effect normally needs an attack check
  "built_from": null,            // shorthand effects: e.g. Blast = "Damage + Increased Range (Ranged)"
  "source": "DCA 101",
  "summary": "One-line plain description."
}
```

## modifiers.json — {"extras": [...], "flaws": [...]}, and specific_modifiers.json — {"Effect": {"extras": [...], "flaws": [...]}}

```json
{
  "name": "Accurate",
  "kind": "extra",               // extra | flaw
  "cost_type": "flat_per_rank",  // per_rank: changes cost per rank (Area +1/rank)
                                 // flat: one-time flat points (Subtle 1-2, Activation -1/-2)
                                 // flat_per_rank: flat points bought repeatedly (Accurate, Penetrating, Reach)
                                 // special: Removable (handled by devices: -1 or -2 per 5 points)
  "value": 1,                    // magnitude per step (always positive; flaws are subtracted)
  "options": null,               // when the value depends on a choice: {"label": value}
  "max_steps": 1,                // how many times it can stack (null = unlimited)
  "requires": [],                // tags the power must have: attack, ranged, close, resisted, sustained, instant, lasting (sustained or continuous), personal, ranked; durations are read after Increased Duration and Sustained
  "source": "DCA 125",
  "summary": "+2 attack check bonus per rank."
}
```

Effect-specific modifiers take priority over general ones with the same name (Teleport's Accurate is +1 per rank).

## advantages.json — list

```json
{
  "name": "Close Attack",
  "type": "Combat",              // Combat | Fortune | General | Skill
  "ranked": true,
  "max_rank": null,              // integer cap, null for none, or "half_pl" (Luck)
  "param": null,                 // what the advantage must name: skill, attack, benefit, foe, environment...
  "requires": [],                // e.g. ["skill:Expertise (Magic)"]
  "source": "DCA 73",
  "summary": "+1 to close attack checks per rank."
}
```

## equipment.json — {"weapons": [...], "armor": [...], "gear": [...], "devices": [...]}

Costs are in equipment points (Equipment advantage: 5 points per rank). Devices come from Gadget Guides and
carry `cost_unit` ("ep" or "pp") and optional `cost_per_rank`.

## archetypes.json and themes.json

Archetypes describe how to build a kind of character: ability ranges (expressions like `"pl/2+1..pl-2"`),
offense modes and the attack/effect skew, Toughness and Fortitude offsets, toughness sources, power themes,
skills, advantages and equipment. `construct`/`automaton` follow the construct rules (DCA ch. 7); `hidden`
minion archetypes are used by the Workshop's minion squads.

Themes hold power templates:

```json
{
  "name": ["Flame Blast"], "role": "attack",   // attack | control | defense | movement | sense | utility | support
  "effect": "Damage", "range": "Ranged",
  "rank": "attack",              // attack | pl | toughness | "N" | "N..M" (expressions may use pl)
  "extras": [{"name": "Area", "option": "Burst"}], "flaws": [{"name": "Limited", "detail": "to vision"}],
  "detail": "Resisted by Fortitude; Dazed, Stunned, Incapacitated",
  "strengthBased": false, "weight": 3
}
```

## catalog/*.json — animals, monsters and minions

Stat blocks in the engine's character format: `abilities` (null = absent), purchased `defenses`, `skills`,
`advantages`, `powers`, `equipment`, plus `id`, `name`, `kind`, `category`, `pl`, `size`, `summary`, `tags`,
`minion`, `source` and `printed_total` for book entries. `node tools/validate-catalog.mjs` checks them.

## reference.json

Rules reference cards: actions, action types, maneuvers, checks, combat, difficulty table, damage results,
measurements table, hazards, recovery and range — paraphrased, with exact numbers and page references.

## Martial Arts (3e) data ("MA <page>" sources)

Checked by `node tools/validate-ma.mjs` and `tests/martial-arts-data.test.mjs`.

### stances.json

```json
{
  "name": "Blocking", "kind": "core",   // core | style (Rubber Band, TK, Pack, Firing (Vehicle))
  "dc": 13, "dc_per_rank": 0,           // (Named) is DC 10 + 1 per rank; Neutral is dc 0 (the book says N/A, no check)
  "benefits": "+2 to Parry.", "detriments": "-2 to attack.", "text": "book flavor line",
  "mods": [{ "stat": "Parry", "value": 2 }, { "stat": "attack", "value": -2 }],
  "flags": ["immobile"],                // immobile | hindered | vulnerable | dodgeForParry
  "special": null,                      // text for anything the mods cannot express
  "style": null, "source": "MA 129"
}
```

Mod stats: `attack`, `attack.close|ranged|disarm|grab|hand|foot`, `damage`, `damage.close|ranged|hand|foot`, `Parry`, `Dodge`,
`initiative`, `reach`, `strength`, `skill:<Name>` (bonus to checks), `skillRanks:<Name>`, `advantage:<Name>`, `power:<Name>`,
`check.disruptStance`, `check.fightingStyle`, `resist.*`, `knockbackRank`, `everything`. A mod may carry `set` (replace the
value), `mult` (multiply), `except` (applies to everything but this kind), `only` (applies to this kind of check), `when` (a
condition the engine must test) and `withAdvantage`/`advantage` (a larger value when the character has that advantage).
Stances the structured mods cannot fully express keep a `special` text: Finishing, Fluid, Guarded, Offensive, Prone, Weapon,
(Named), Rubber Band (and notes on Neutral and Firing (Vehicle)).

### maneuvers.json

Every basic and advanced combat maneuver, the chapter 4 power builds used as advanced maneuvers, and the style-specific maneuvers.

```json
{
  "name": "Soft Landing", "tier": "advanced",        // basic | advanced
  "mundane": false,                                   // true for basic maneuvers (cannot be nullified)
  "group": "combat maneuver (chapter 6)",
  "type": "Defense", "action": "None", "range": "Personal", "duration": "Permanent", "resistance": null,   // advanced table columns
  "damage": "Str+2", "crit": "19-20", "attack_mod": "-2", "defense_mod": "-2 P&D",                         // basic table columns
  "aliases": ["Shattering Kiai"], "summary": "...", "flavor": "...",
  "build": "Enhanced Defensive Roll, ...",            // the book's power build text
  "components": [[{ "text": "...", "name": "Strength-Based Damage", "rank": 2, "kind": "effect|extra|flaw|advantage|other", "effect": "Damage" }]],
                                                      // one inner list per alternate effect (';' in the build); resolved against effects, modifiers and advantages
  "cost": { "text": "1 point per 2 ranks", "flat": 0, "per_rank": 1, "ranks_per": 2, "per_unit": "Damage", "min_rank": 1, "varies": false },
  "alternates": [], "notes": "...", "suggestions": "...", "style": "Pao Quan", "source": "MA 150"
}
```

Cost at a rank is `flat + ceil(rank * per_rank / ranks_per)` (see `maneuverCost` in tools/validate-ma.mjs).

### styles.json (new fields; the earlier ones are kept)

`style_extras`, `style_flaws` ({ name, rank?, detail?, cost }), `weapon_elements` (names; the style's own type is free),
`weapon_elements_note`, `skill_list` ({ name, ranks }; 1 point per 2 ranks), `advantage_list` ({ name, rank?, detail?, external? }; 1 point per rank),
`basic_maneuvers` and `advanced_maneuvers` ({ name, rank?, detail?, cost, varies?, plus?, alternative? }), `stances_as_printed`
(when the book writes "Power Stance" or "Throw"), `as_printed` on an item whose book name was a typo, and `cost_check`:
`{ header, printed_subtotals, computed_subtotals, printed_total, computed_total, status, note?, free_spend? }`. `status` is `ok`,
`book-discrepancy` (the book disagrees with itself; `note` says how) or `open-ended` (the two General template styles).
`free_spend` records points the book lets the player spend as they like (for example "Spend 5 points on other advantages").

### modifiers.json and specific_modifiers.json

The chapter 4 extras and flaws join `extras` and `flaws` (source "MA"). New keys `style_extras` and `style_flaws` hold the
fighting style extras and flaws (flat costs: Aggressive, Attack Focus, ... Demanding, Impractical, Weapon Dependent ...).
`specific_modifiers.json` gains `Extra Attacks` (Mobility, Quick Combo, Quickened Charge; Activation (Move Action), Chain, Declining,
Dispersed, Limited) and `Communal`. `effects.json` gains `Communal` and `Extra Attacks`.

### skills.json, skill_guide.json

`Expertise` in skills.json gains `specialties` (Geomancy, Martial Arts, Martial Showman, Specific Fighting Style). Uses added in
skill_guide.json carry a `source`: the Close Combat and Ranged Combat Fighting Style uses (Assume, Disrupt and Identify Stance,
Improvise Combo, Martial Stunt, Overcome, Power Check Replacement), Insight (Combat Readiness, Read Opponent), Sleight of Hand
(Quicker than the Eye) and the four Expertise specialties with DC examples.

### equipment.json (new keys)

`weapon_qualities` ({ name, cost, summary, text }), `ma_weapons` (melee, projectile, thrown and improvised weapons: name, category,
effect, crit, cost, description?, toughness/weight for improvised), `ma_armor`, `trick_arrows` ({ name, effect, cost_text }),
`mystic_items`. Weapon costs are equipment points; "Bow + 1" and "1/rank" are kept as text.

### headquarters.json (new keys)

`expanded_sizes` ({ name, cost, spaces, examples }), `revised_power_needs` ({ name, cost, cost_alt, spaces }) and six new entries in
`features` (with `prerequisites` and `space`).

### reference.json (new keys)

`stance_rules` (the stance rules as a structured block), `optional_rules` (Hit Location with its tables, Hit Location Damage Results,
Vehicle Hit Location, Disabling Critical Hits, Off-Hand Attacks with its penalty table, Unarmed Defense against Close Combat Weapons,
Vehicle Jumping, Creative Vehicle Combat), `new_actions` and `pursuit_maneuvers` ({ pursuer, target, either }).

## Character fields the Battle Room reads

`descriptors` (optional list of words on the character itself, such as `["magic", "divine"]`): the character's power source. Every
power attack of the character carries these descriptors in the Battle Room, so an Immunity to magic stops all of a magician's spells.
Characters without it work as before; the engine also reads `theme.id` (magic, psychic, tech, cosmic, death and radiation themes
tag every power) and the powers' own `descriptors`. There is no Forge field for it yet.
