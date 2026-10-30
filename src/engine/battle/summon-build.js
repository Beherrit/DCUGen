// Building the character a Summon or Duplication calls up (Hero's Handbook p118 and p94).
//
// Summon: "an independent character with (effect rank x 15) power points", so a power level equal to the rank. It is
// made with the character generator, from the kind of creature the power's own words name (zombies, drones, wolves...).
// Duplication: a copy of the summoner with the same traits except this power. With the rank at the summoner's points
// (not counting Duplication) divided by 15, rounded up, it is the full copy; with less it is scaled down to power level =
// rank. house rule: the book says "proportionately lower-ranked traits" and gives no formula, so abilities, defenses,
// power ranks and skill ranks are each multiplied by (rank x 15 / points) and rounded down.

import { generateCharacter } from '../generator.js';
import { costBreakdown } from '../costs.js';

/** Words in the power's name or detail that say what the minion is, to the generator archetype that fights most like it. */
const KINDS = [
  [/zombie|skeleton|mummy|corpse|dead|undead|ghoul|thrall|banshee|spirit|ghost|wraith|damned/i, 'm-zombie'],
  [/drone|robot|clockwork|brass|machine|nanite|swarm of robots|automat|grenadier|servitor/i, 'm-drone'],
  [/alien|hive|khirrix|brood|grub|spider|ant\b|insect|crow|bat|wolf|wolves|hound|pack|beast|horse|steed|warhorse|hut|straw|fungal|spore/i, 'm-alien'],
  [/ninja|assassin|shadow/i, 'm-ninja'],
  [/cultist|priest|acolyte|mage|witch/i, 'm-cultist'],
  [/soldier|warrior|knight|guard|trooper|legion|stone|paper|gardener|thorn/i, 'm-soldier'],
];

/** The minion archetype a Summon calls: by the words of its detail, else its name, else a plain henchman. */
export function minionArchetype(s) {
  for (const text of [s.detail, s.name]) {
    const hit = KINDS.find(([re]) => re.test(text || ''));
    if (hit) return hit[1];
  }
  return 'm-hench';
}

/** A name for the creature, from the power's detail ("Summons Khirrix Hive-Drones (PL 3) from her egg-sac" -> "Khirrix Hive-Drone"). */
export function minionName(s) {
  const m = /(?:summons?|calls up|releases|builds|launches)\s+([^(,;.]+)/i.exec(s.detail || '');
  let raw = (m ? m[1] : s.detail || s.name).replace(/\(?\bPL\s*\d+\)?/gi, ' ').replace(/\b(?:from|bursts?|shamble|fall|hatch|walks?|appear|rise|emerge|crawl|pour|spill|that|against)\b.*$/i, '').replace(/\s+or\s+.*$/i, '');
  raw = raw.replace(/^\s*(?:splits? off|sheds?|calls? up|builds?|releases?|launches?|summons?)\s+/i, '').replace(/^(?:an?|the|more)\s+(?:\w+\s+of\s+)?/i, '').replace(/^(?:\w+\s+of\s+)/i, '').trim();
  const words = raw.split(/\s+/).filter(Boolean).slice(-3);
  if (!words.length) return s.name;
  words[words.length - 1] = words[words.length - 1].replace(/^wolves$/i, 'wolf').replace(/(?<=[a-z])(?<!s)s$/i, '');
  return words.join(' ').replace(/^./, (x) => x.toUpperCase());
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const pointsOf = (ch, R) => {
  const stripped = { ...ch, powers: (ch.powers || []).filter((p) => p.effect !== 'Duplication') };
  return costBreakdown(stripped, R).total;
};

/** The rank at which a Duplication makes a full-power copy: the points not counting Duplication, over 15, rounded up. */
export function fullCopyRank(ch, R) {
  return Math.ceil(pointsOf(ch, R) / 15);
}

const scaleList = (map, ratio) => Object.fromEntries(Object.entries(map || {}).map(([k, v]) => [k, typeof v === 'number' && v > 0 ? Math.floor(v * ratio) : v]));
const dropSummons = (p) => p.effect !== 'Summon' && p.effect !== 'Duplication';

/** A duplicate of the summoner: the same traits except Duplication, scaled down when the rank is under the full-copy rank. */
export function duplicateOf(R, ch, rank, name) {
  const copy = clone(ch);
  copy.powers = (copy.powers || []).filter(dropSummons).map((p) => ({ ...p, alternates: (p.alternates || []).filter(dropSummons) }));
  copy.advantages = (copy.advantages || []).filter((a) => a.name !== 'Minion');
  delete copy.advancement;
  delete copy.rosterId; // the copy is not the roster character (World records and nemesis lessons look at the roster id)
  const full = fullCopyRank(ch, R);
  if (rank < full) {
    const ratio = (rank * 15) / pointsOf(ch, R);
    copy.abilities = scaleList(copy.abilities, ratio);
    copy.defenses = scaleList(copy.defenses, ratio);
    copy.powers = copy.powers.map((p) => ({ ...p, rank: Math.max(1, Math.floor(p.rank * ratio)) }));
    copy.skills = (copy.skills || []).map((s) => ({ ...s, ranks: Math.floor((s.ranks || 0) * ratio) }));
    copy.pl = Math.max(1, rank);
  }
  copy.minion = true;
  copy.identity = { ...copy.identity, codename: name, realName: `duplicate of ${ch.identity?.codename || ch.identity?.realName || 'the summoner'}` };
  return copy;
}

/** The character for the n-th minion of a Summon power: a minion unless the power is Heroic. */
export function minionOf(R, c, s, n, seed) {
  if (s.duplicate) return duplicateOf(R, c.ch, s.rank, `${c.name} (duplicate)`);
  const ch = generateCharacter(R, { archetype: minionArchetype(s), pl: Math.min(20, s.rank), seed: `${seed}-${c.id}-${s.name}-${n}`, alignment: 'villain', chaos: 0.2 });
  const label = minionName(s);
  ch.powers = (ch.powers || []).filter(dropSummons); // a summoned minion cannot have minions of its own (p118)
  ch.advantages = (ch.advantages || []).filter((a) => a.name !== 'Minion');
  ch.identity = { ...ch.identity, codename: label, realName: `summoned by ${c.name}` };
  if (s.heroic) ch.minion = false; else ch.minion = true;
  return ch;
}
