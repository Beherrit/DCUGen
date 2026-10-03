# DCUGen Hero Forge

A character generator and GM toolkit for the **DC Adventures RPG** (Mutants & Masterminds 3e rules).

**Open [`DCUGen.html`](DCUGen.html) in any modern browser.** It is one self-contained file: send it to your
players and they can use it too. No install, works offline (fonts fall back to system fonts without internet).

## What's inside

- **Forge** – roll a complete, legal character in one click. Pick power level, archetype (20 including androids
  and combat robots), power theme (29), hero or villain, gender and how wild the dice should be, or hit
  *Surprise me*. Every character obeys every power level limit and spends exactly 15 points per PL. Seeds make
  rolls repeatable. *New name* keeps the build; *New build* keeps the name and story. *Roll a team* makes a squad.
- **Edit** – change any trait with +/−. Costs and PL limits update live, and problems are listed.
- **Power Lab** – build custom powers from all 61 DC Adventures effects with their extras and flaws, with the point
  math shown step by step. Random powers only use modifiers that fit the effect.
- **Workshop**
  - *Gear loadouts* for an equipment-point budget, in styles from street tough to sci-fi.
  - *Gadgets and magic items*: named devices with real powers, priced with the Removable rule, legal at your PL.
  - *Minion squads*: thugs, soldiers, ninjas, cultists, agents, henchmen, alien troopers, robot drones and zombies,
    with what it costs a villain to field them (Minion advantage or Summon).
  - *Robots*: androids and combat robots built as constructs (no Stamina, immune to Fortitude effects).
  - *Animals and creatures*: the DC Adventures animals plus 142 stat blocks of everyday animals, wild beasts,
    monsters and people, with templates (young, alpha, dire, giant, mutant, cybernetic, undead, spectral).
  - *Monster maker*: new monsters built to any PL.
- **Roster** – save characters, teams and creatures in the browser; search, duplicate, delete.
- **Export** – your Excel character sheet filled in (plus a *Full Stat Block* tab), a whole roster or team to one
  workbook, JSON files, book-style text and print/PDF. **Share** codes import on any copy of the app.
- **GM Tools** – dice with the book's coloured degrees-of-success chart, initiative with conditions, a combat
  calculator (hit and outcome odds, or roll it), the book's Damage Resistance Matrix, a GM screen with live hero point / Toughness /
  condition trackers, GM notes, and encounter, hideout and vehicle generators.
- **Rules** – searchable reference cards: actions, maneuvers, checks, combat, hazards, conditions, the DC,
  degrees and measurement tables, and every effect, extra, flaw, advantage and skill, with page numbers.

## Rules sources

Rules data lives in `data/` with page references (see `data/SCHEMA.md`): DC Adventures Hero's Handbook (effects,
modifiers, advantages, skills, equipment, constructs, animals, reference), Power Profiles (power themes), Martial
Arts (166 fighting styles), Gadget Guides (devices) and Heroes & Villains Vol. 1 (stat blocks used as tests).

## Development

Needs Node 18 or newer, nothing else.

```bash
npm test          # rules engine, generators, exports
npm run build     # rebuilds DCUGen.html
npm run dev       # http://localhost:5178/src/app/index.html (live) and http://localhost:5178/ (built)
npm run validate  # check every catalog creature against the PL limits
```

- `src/engine/` – the rules engine: costs, PL limits, derived traits, character generator, workshop generators,
  power math, stat blocks and the .xlsx writer.
- `src/app/` – the web app.
- `tests/` – the engine reproduces the printed point costs of published Heroes & Villains characters, and
  thousands of random characters, items and creatures are checked against the rules.
