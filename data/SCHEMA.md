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
  "requires": [],                // tags the power must have: attack, ranged, close, resisted, sustained, instant, personal, ranked
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
