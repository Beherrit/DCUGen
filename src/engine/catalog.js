// Catalog entries (creatures, minions, robots) -> engine characters.

import { ABILITIES } from './rules.js';
/** Build a character object from a catalog entry (see data/SCHEMA.md, "Catalog"). */
export function catalogToCharacter(entry, overrides = {}) {
  const abilities = {};
  for (const a of ABILITIES) abilities[a] = entry.abilities && a in entry.abilities ? entry.abilities[a] : 0;
  const ch = {
    pl: entry.pl,
    kind: entry.kind || 'creature',
    abilities,
    defenses: { Dodge: 0, Parry: 0, Fortitude: 0, Will: 0, ...(entry.defenses || {}) },
    skills: JSON.parse(JSON.stringify(entry.skills || [])),
    advantages: JSON.parse(JSON.stringify(entry.advantages || [])),
    powers: JSON.parse(JSON.stringify(entry.powers || [])).map((p) => ({ extras: [], flaws: [], alternates: [], ...p })),
    devices: JSON.parse(JSON.stringify(entry.devices || [])),
    equipment: JSON.parse(JSON.stringify(entry.equipment || [])),
    identity: { codename: entry.name, realName: entry.category || '' },
    catalogId: entry.id,
    minion: !!entry.minion,
    size: entry.size,
    summary: entry.summary,
    complications: [],
    ...overrides,
  };
  return ch;
}
