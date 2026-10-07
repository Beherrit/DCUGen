# DCUGen Hero Forge

A character generator and GM toolkit for the **DC Adventures RPG** (Mutants & Masterminds 3e rules).

**Open [`DCUGen.html`](DCUGen.html) in any modern browser.** It is one self-contained file: send it to your
players and they can use it too. No install, works offline (fonts fall back to system fonts without internet).

**Or install the desktop app:** [Windows installer](https://github.com/Beherrit/DCUGen/releases/latest/download/DCUGen-Setup.exe) ·
[Windows portable](https://github.com/Beherrit/DCUGen/releases/latest/download/DCUGen-Portable.exe) ·
[macOS](https://github.com/Beherrit/DCUGen/releases/latest/download/DCUGen.dmg) ·
[Linux](https://github.com/Beherrit/DCUGen/releases/latest/download/DCUGen.AppImage) ·
[all releases](https://github.com/Beherrit/DCUGen/releases). GitHub builds a new release from every push to `main`, and
installed apps update themselves. Your data lives in a folder on your own disk, and you can host a table for your players.

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
- **Bestiary** – 429 stat blocks, all legal for their PL: fantasy (dragons, giants, fey, elementals, dungeon
  aberrations), horror and undead, world myth and cryptids, aliens and cosmic entities, robots, mechs, clockwork and
  golems, kaiju, everyday animals and people. Each has tactics, habitat and a weakness; open it as a full sheet, apply
  a template, save it, or throw a random encounter into initiative.
- **Vehicles & HQs** (in Gear & Vehicles) – 107 vehicles (modern, military, sci-fi starships, fantasy galleons and sky-ships, steampunk) and
  51 headquarters, all priced with the DC Adventures equipment rules (DCA 155-163), plus the vehicle, spaceship and
  headquarters rules. Hand any of them to the open character; the Equipment advantage updates itself.
- **Bio** – every rolled character gets a full life story: family and siblings, a life timeline, the people in their
  life (mentors, rivals, enemies, exes), personality, secrets, regrets, hopes, GM hooks, and complications you can add
  to the sheet. Re-roll any part. The tables are original, inspired by the structure of Central Casting: Heroes Now!
- **Character keys** – every rolled character has a short key (Share / Key) that rebuilds it exactly, bio and all,
  in anyone's copy of the app: paste it into "Open a key" on the Forge. Every name in a bio is clickable and opens
  that person (parent, sibling, rival, mentor...) as a full character with their own bio, stats that fit who they
  are, and a link back. A character that has been edited or played since it was rolled (or rolled with an older
  version of the tables) gets a longer key that carries its seed plus everything that changed, journal included; only
  characters with no seed at all (built by hand, imported from a sheet, catalog creatures) use the full share code.
- **Gear & Vehicles** – 712 items across 18 genres (modern, military, espionage, fantasy, magic items, sci-fi, space,
  steampunk, wild west, pulp, cyberpunk, post-apocalyptic, occult, superhero gadgets...), a custom item maker, 169
  vehicles including 80 starships, headquarters, a builder for your own vehicles and bases, and space-game rules:
  travel times, sensors, ship combat, hazards and a random planet generator.
- **Battle Room** – a fight simulator on the DC Adventures combat rules. Throw in anyone (the open character, roster
  cards, any Bestiary creature, a whole Workshop minion squad), pick sides, and watch it play out turn by turn with a
  full log of every attack roll, resistance check, condition, hero point and extra effort. Pause, step, run a round, or
  run to the end; replay the same seed or rematch with new dice; run the match-up 100 times for the odds. Every fighter
  fights in a style that fits its build: brawlers close in and go all-out, skilled fighters feint and chain Takedowns,
  gear fighters and blasters keep their range and trade accuracy for effect, spellcasters rotate effects to the weak
  defense, mentalists turn controlled enemies on their friends, beasts lunge and grab, minions mob and break.
  Afflictions with all three degrees and recovery checks, area effects with Dodge for half, Multiattack, Impervious vs
  Penetrating, Immunity, Concealment, Healing, Regeneration, grabs, Interpose, Evasion and more.
- **Campaign journal** – on the Bio page: sessions played, what happened, who was met (added to "People in their life"
  or with their status updated), points earned and what they bought, and a rolled "between adventures" event from the
  life tables. Sessions join the life timeline as "In play" and go into every export.
- **World** – a wiki of the whole campaign, Obsidian-style. Every saved character is a page; every parent, sibling,
  mentor, rival, enemy, ally and ex named in their life is a page too (and opens as a full character); teams, cities and
  homelands are pages; journal sessions and recorded battles are events. Links are typed and run both ways (mentor /
  student, parent / child, member of / member, based in / base of...). Add factions, locations, items and events by
  hand, link anything to anything, draw the relationship graph, read the campaign timeline, and export the whole
  thing as a Markdown vault with [[wikilinks]] or a JSON vault that also carries the roster.
  **What happened** records history in one line ("these two became enemies", "she joined the Court", "he died",
  "they moved to Ravensport": 60-odd kinds across people, loves, factions, places, fates and things). Each one starts
  the new tie at that session, ends the tie it replaces (kept on the pages as "formerly"), marks a fate on the page,
  lands on both timelines and the campaign timeline, and can be undone. The graph has an "as of session" slider to
  wind the world back. Factions live on the character too (Bio > Factions: role, kind, since) and travel with the
  sheet and the exports. **Share the whole world as one key** (Vault page or the 🔑 button): pages, ties, moments
  and the roster in a `DCUW1.` string that players paste into the Forge's "Open a key" box and choose merge or
  replace.
- **Newsstand** (in the World) – front pages of your world's newspapers. Draft one from the campaign (the latest
  sessions, battles and recorded moments become the headlines, with reporter copy, bylines and a weather ear) or
  write one by hand; add pictures (upload, a roster portrait, or a free AI painting with a newsprint or comic
  treatment), adverts and classifieds (rolled from your factions and places, or your own), and pick a look:
  broadsheet, tabloid, EXTRA!, vintage gazette, comic panel, underground zine. Save it to the World (it sits on the
  campaign timeline, tied to the people in its stories), print it, or send it as a key or link that opens on any copy.
- **Handouts** (in the World) – props for the table, drafted from the World or written by hand: WANTED posters
  (portrait, aliases, crimes from what happened, last seen, a reward from their PL; Old West, noir bulletin, agency
  most-wanted, off-world bounty board), agency case files (mugshot, threat assessment, associates, stamps and
  [[redacted]] passages the GM can reveal), letters (handwritten, typed, telegram, memo, ransom note cut from
  magazines), phone screens of texts, and lab, police, medical or military reports. Saved as pages tied to the people
  in them, printed, or sent as a key or link.
- **Evidence board** (in the World) – the campaign as a detective's corkboard: pin people as Polaroids, factions
  and places as index cards, front pages as clippings and handouts as documents; the ties between them appear as
  red string, sticky notes hold the theories, and you can run your own string between anything. Drag everything;
  the layout lives in the vault and prints as a handout.
- **Life stories by hand** – every part of the Bio (story, family, people, timeline, sections, personality, inner
  life, GM hooks) can be edited, or written from a blank page ("Write your own" / "start blank").
- **Portraits** – every character gets a portrait on the case file, the Bio page and the World: built-in comic art
  drawn by the app (offline, instant) or an AI painting from a free, open-source service (one at a time, with the
  built-in art standing in while it paints), or a picture you upload. New portrait, edit or copy the prompt, delete.
  The portrait goes into the Excel character sheet's PORTRAIT box.
  AI paintings come from AI Horde by default (free, open source, volunteer GPUs; anonymous works, a free key from
  aihorde.net/register skips the queue) in four styles: comic book, semi-realistic, anime, painted. Pollinations.ai
  remains as the other painter.
- **Enemies** – "Add an enemy" on the Bio page rolls a full villain (nuisance, threat or nemesis) with a reason and a
  status, puts them in the character's life with a key so they open as a character, and on the sheet as a complication.
- **The Table** – a shared feed of dice. Every sheet has a "Roll" menu (initiative, attacks, resistance checks,
  skills, abilities) and the results land on the Table with the dice shown; a quick roller and chat live there too.
  With the desktop app, host a table and hand out a lobby key: players join from their own app, get your world and
  roster, claim their own characters, and roll for them where everyone can see.
- **Backup** – "Back up everything" (Roster tab) saves roster, world, battle, notes, screen and settings to one file;
  "Restore" merges or replaces. The desktop app also mirrors everything to a folder on disk, with daily backups.
- **Advancement** – track the power points the GM awards (DCA 190): earned, spent and unspent, with a history log
  that records exactly what each point bought, tied to the journal session it came from.
- **Roster** – save characters, teams and creatures in the browser; search, duplicate, delete.
  Folders (nested with "/", colours, counts), drag a card onto a folder or use "Move to…", select several and move,
  export, delete or throw them in the Battle Room together; sort by name, PL, side, archetype or folder; cards or a
  compact list. The folder travels with the character in every export and key.

- **Export** – your Excel character sheet filled in (plus a *Full Stat Block* tab), a whole roster or team to one
  workbook, JSON files, book-style text and print/PDF. **Import** brings characters back from DCUGen Excel sheets, .json
  files, share codes or links (Forge > Import, or drag files onto the page).
- **GM Tools** – dice with the book's coloured degrees-of-success chart, initiative with conditions, a combat
  calculator (hit and outcome odds, or roll it), the book's Damage Resistance Matrix, a GM screen with live hero point / Toughness /
  condition trackers, GM notes, and encounter, hideout and vehicle generators.
- **Rules** – searchable reference cards: actions, maneuvers, checks, combat, hazards, conditions, the DC,
  degrees and measurement tables, and every effect, extra, flaw, advantage and skill, with page numbers.

## Desktop app

`desktop/` wraps the same single file in an Electron app: your data in a folder on disk that survives updates, daily
backups, and the lobby server for hosting a table. Run it with `npm run desktop` from the repository root (any shell), or build installers with
`npm run desktop:dist`. See [desktop/README.md](desktop/README.md).

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
  power math, stat blocks, the .xlsx writer, the battle simulator (`battle.js`), the campaign journal (`journal.js`)
  and the world wiki model (`world.js`).
- `src/app/` – the web app.
- `desktop/` – the Electron app (main process, preload bridge, dependency-free WebSocket lobby relay).
- `tests/` – the engine reproduces the printed point costs of published Heroes & Villains characters, and
  thousands of random characters, items and creatures are checked against the rules.
