// Fighting styles, targeting tactics, and a guess at how a character fights from its build.

import { deriveAll, advantageRank, allPowers } from '../derive.js';

export const STYLES = {
  brawler: { label: 'Brawler', blurb: 'Closes in and hits hard with fists, claws or sheer strength. All-out when the enemy is reeling.', close: 1.45, ranged: 0.7, target: 'closest' },
  duelist: { label: 'Skilled fighter', blurb: 'Lives on skill: picks the hurt target, feints high defenses, fights defensively when pressed, chains Takedowns through minions.', close: 1.3, ranged: 0.9, target: 'hurt' },
  gunner: { label: 'Gear fighter', blurb: 'Depends on equipment and devices. Keeps its distance, picks the best weapon for the target, and is in trouble if it gets grabbed.', close: 0.8, ranged: 1.35, target: 'weakest' },
  blaster: { label: 'Blaster', blurb: 'Ranged powers. Stays out of reach, trades accuracy for power against soft targets, and drops area effects on groups.', close: 0.6, ranged: 1.35, target: 'weakest' },
  mage: { label: 'Spellcaster', blurb: 'Chooses the effect that fits the target: afflictions against weak wills, damage against the fragile, dispels sustained defenses. Pushes with extra effort when losing.', close: 0.7, ranged: 1.2, target: 'weakest', variety: true },
  mentalist: { label: 'Mentalist', blurb: 'Perception-range mental attacks. Goes for the weakest Will first and turns controlled enemies on their friends.', close: 0.5, ranged: 1.1, target: 'lowWill' },
  tank: { label: 'Powerhouse', blurb: 'Takes hits and gives them back. Charges the biggest threat and leans on Power Attack and Impervious.', close: 1.35, ranged: 0.9, target: 'strongest' },
  speedster: { label: 'Speedster', blurb: 'Hit and run with Move-by Action: strikes and ends the turn out of reach, so slow fighters have to chase.', close: 1.3, ranged: 0.9, target: 'hurt', hitAndRun: true },
  support: { label: 'Support', blurb: 'Heals the worst-hurt ally first, interposes to take hits, and otherwise sets up the team with afflictions.', close: 0.8, ranged: 1.1, target: 'strongest' },
  beast: { label: 'Beast', blurb: 'Instinct: lunges at the closest prey, bites and grabs, and may break off when badly hurt.', close: 1.5, ranged: 0.6, target: 'closest', grabs: true, flees: true },
  minion: { label: 'Minion', blurb: 'Mobs the closest enemy, goes down on any failed Toughness check (DCA 194), and may run once the fight turns.', close: 1.1, ranged: 1.1, target: 'closest', flees: true },
  omni: { label: 'Omni-power', blurb: 'Variable or sprawling arrays: reconfigures every turn to whatever hurts this enemy most.', close: 1.0, ranged: 1.1, target: 'weakest', variety: true },
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
