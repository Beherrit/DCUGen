// Heroic Feat (Hero's Handbook p20): a hero point gives one rank of an advantage the fighter lacks until the end of its
// next turn (never a fortune advantage). The AI uses it in two places: Interpose, to save an ally who would otherwise
// be knocked out by the hit coming, and Power Attack or All-out Attack, to raise the limit on a finishing blow.

import { log, alliesOf } from './util.js';
import { defenseVs, resistOf } from './conditions.js';
import { squares, squaresInMove } from './geometry.js';
import { hitOdds, resistOdds, dcOf } from './odds.js';
import { hasPoint } from './fortune.js';

/** The round in which c's next turn ends: this one if it has yet to act, else the next. */
const lastRound = (b, c) => (b.order.indexOf(c.id) >= b.turn ? b.round : b.round + 1);

/** Spend the hero point and give c one rank of the advantage until the end of its next turn. */
export function grantFeat(b, c, advantage, why) {
  c.heroPoints--;
  c.adv[advantage] = (c.adv[advantage] || 0) + 1;
  (c.feats ||= []).push({ adv: advantage, until: lastRound(b, c) });
  log(b, { kind: 'hero', actor: c.id, text: `${c.name} spends a hero point on a Heroic Feat: ${advantage} until the end of their next turn, ${why} (${c.heroPoints} hero point${c.heroPoints === 1 ? '' : 's'} left).`, important: true });
}

/** At the end of c's turn: feats that have run their time lapse. */
export function expireFeats(b, c) {
  const over = (c.feats || []).filter((f) => f.until <= b.round); // a fighter saved before feats existed has none
  if (!over.length) return;
  for (const f of over) c.adv[f.adv] = Math.max(0, c.adv[f.adv] - 1);
  c.feats = c.feats.filter((f) => f.until > b.round);
}

/** The chance a hit with `atk` at `rank` lands (when `hit` is given) and then leaves t incapacitated: four degrees, or three if it is staggered already. */
function downChance(t, atk, rank, hit = 1) {
  const resist = resistOf(t, 'Toughness');
  if (resist === null) return 0;
  const odds = resistOdds(resist, dcOf(atk, rank));
  return hit * odds.slice(t.staggered ? 3 : 4).reduce((s, x) => s + x, 0);
}

const ELIGIBLE = (a) => !a.out && !a.fled && !a.minion && !a.staggered && !a.interposed && !a.adv.Interpose;
const FALL = 0.4;   // the victim goes down this often if it takes the hit
const SAVED = 0.15; // the guard goes down no more often than this, and no more than half as often as the victim

/**
 * An ally of t without Interpose who can borrow it for this hit: it is close enough to step in, has a hero point, and
 * would stand up to the hit far better than t, who would otherwise often be knocked out. Gives the feat and returns the ally, or null.
 */
export function featInterposer(b, c, atk, t, rank, crit) {
  if (atk.effect !== 'Damage' || atk.resistance !== 'Toughness') return null;
  const dcRank = rank + (crit ? 5 : 0);
  const victim = downChance(t, atk, dcRank);
  if (victim < FALL) return null;
  const guards = alliesOf(b, t)
    .filter((a) => ELIGIBLE(a) && hasPoint(b, a) && squares(a, t) <= Math.max(1, squaresInMove(b, a)))
    .map((a) => ({ a, odds: downChance(a, atk, dcRank) }))
    .filter((x) => x.odds <= SAVED && x.odds * 2 <= victim)
    .sort((x, y) => x.odds - y.odds || x.a.id.localeCompare(y.a.id));
  if (!guards.length) return null;
  const guard = guards[0].a;
  grantFeat(b, guard, 'Interpose', `to take the hit meant for ${t.name}`);
  return guard;
}

const GAIN = 0.1;  // the finishing blow must get this much likelier to be worth a hero point

/** Chances to put the target down with the attack at a given shift of bonus into rank, and with a plain bonus. */
function finishOdds(b, c, atk, t, { power = 0, bonus = 0 }) {
  const def = defenseVs(t, atk.kind === 'close' ? 'Parry' : 'Dodge', c);
  const hit = hitOdds(atk.bonus - power + bonus, def).hit;
  return downChance(t, atk, atk.rank + power, hit);
}

/**
 * A finishing blow: the target is nearly down (staggered, or two bruises) and a higher limit on Power Attack (+5
 * instead of +2) or All-out Attack (+4 instead of +2, fighters who go all out) would make putting it down clearly
 * likelier. Gives the feat; the usual trade-off choice then uses the new limit.
 */
export function finishingFeat(b, c, atk, t) {
  if (!hasPoint(b, c) || !atk.roll || atk.area || atk.effect !== 'Damage' || atk.resistance !== 'Toughness') return;
  if (!(t.staggered || t.bruises >= 2) || c.minion || c.staggered) return;
  const goesAllOut = ['brawler', 'tank', 'beast'].includes(c.style); // the styles that go all out on a hurt target (turn-attack.js)
  const base = Math.max(finishOdds(b, c, atk, t, {}), finishOdds(b, c, atk, t, { power: c.adv['Power Attack'] ? 5 : 2 }), goesAllOut ? finishOdds(b, c, atk, t, { bonus: c.adv['All-out Attack'] ? 4 : 2 }) : 0);
  const options = [];
  if (!c.adv['Power Attack']) options.push(['Power Attack', finishOdds(b, c, atk, t, { power: 5 }), 'to hit this finishing blow harder']);
  if (!c.adv['All-out Attack'] && goesAllOut) options.push(['All-out Attack', finishOdds(b, c, atk, t, { bonus: 4 }), 'to make sure the finishing blow lands']);
  const best = options.sort((x, y) => y[1] - x[1])[0];
  if (best && best[1] - base >= GAIN) grantFeat(b, c, best[0], best[2]);
}
