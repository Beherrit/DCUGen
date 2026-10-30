// Limited (DCA 135) and Dulled (MA 96): a power that works only in certain situations or on certain things. The book
// leaves the limit to the player's words, so the engine recognises a table of phrases it knows the facts for and keeps
// every other limit working (the Battle Room's coverage list says so). A recognised limit that is not met blocks the use.
//
// house rule: the book says a Limited effect "loses about half its usefulness" without saying how a fight plays it. Here
// it works fully when the limit is met and not at all when it is not.

import { squares } from './geometry.js';
import { activeConditions } from './conditions.js';
import { canonical, fighterDescriptors } from './descriptors.js';

const states = (t, ...names) => names.some((n) => activeConditions(t).has(n));
const hurt = (x) => x.bruises > 0 || x.staggered;
const AGAINST = /\b(against|vs\.?|versus|only on|only vs)\b/i;

// re: the words; test(ctx): is the limit met right now. ctx is { b, c, t } (c uses the power on t).
const TABLE = [
  { re: /\b(machines?|robots?|constructs?|mechanical|androids?|vehicles?|cyborgs?)\b/i, test: ({ t }) => t.d.abilities.Stamina == null, say: 'machines' },
  { re: /\b(living|flesh|organic|biological)\b/i, test: ({ t }) => t.d.abilities.Stamina != null, say: 'living things' },
  { re: /\b(undead|vampires?|ghosts?|zombies?|skeletons?|wraiths?|liches|spirits?)\b/i, test: ({ t }) => /ghost|vampire|zombie|skeleton|wraith|lich|undead|mummy|ghoul|spirit/i.test(`${t.name} ${t.ch?.category || ''} ${t.ch?.kind || ''}`), say: 'the undead' },
  { re: /\bwhile (?:you are |he is |she is |it is )?(?:flying|airborne|in flight)\b|\bin flight\b/i, test: ({ c }) => !!c.flying, say: 'while flying' },
  { re: /\b(flying|airborne|fliers?|flyers?)\b/i, test: ({ t }) => !!t.flying, say: 'flying targets', needs: AGAINST },
  { re: /\b(grounded|on the ground|earthbound|non-?flying)\b/i, test: ({ t }) => !t.flying, say: 'grounded targets' },
  { re: /\b(wounded|injured|hurt|bloodied)\b/i, test: ({ t }) => hurt(t), say: 'wounded targets', needs: AGAINST },
  { re: /\b(wounded|injured|hurt|bloodied)\b/i, test: ({ c }) => hurt(c), say: 'while hurt', needs: /\b(when|while) (?:you are |he is |she is |it is )?/i },
  { re: /\b(prone|knocked down|fallen)\b/i, test: ({ t }) => states(t, 'Prone'), say: 'prone targets' },
  { re: /\b(defenseless|helpless|unaware|asleep|sleepers?|sleeping|paralyzed|stunned)\b/i, test: ({ t }) => states(t, 'Defenseless', 'Unaware', 'Asleep', 'Stunned', 'Paralyzed'), say: 'helpless targets' },
  { re: /\b(minions?|mooks?|henchm[ae]n|rank and file)\b/i, test: ({ t }) => !!t.minion, say: 'minions' },
  { re: /\b(melee|adjacent|point[- ]blank|up close|touching)\b/i, test: ({ c, t }) => squares(c, t) <= 1, say: 'in melee' },
  { re: /\b(from a distance|at range|not adjacent|beyond reach)\b/i, test: ({ c, t }) => squares(c, t) > 1, say: 'at range' },
];

const cache = new Map();
/** The table entry a limit's words match, or null when the engine does not know the fact it needs. */
function entryFor(text) {
  if (cache.has(text)) return cache.get(text);
  let hit = TABLE.find((e) => e.re.test(text) && (!e.needs || e.needs.test(text))) || null;
  const named = canonical(text);
  // "only against fire": the target is of that descriptor (its attacks, or its body, are made of it)
  if (!hit && named.length && AGAINST.test(text)) hit = { test: ({ t }) => named.some((d) => fighterDescriptors(t).includes(d)), say: `${named.join(' or ')} users` };
  cache.set(text, hit);
  return hit;
}

/** Does the engine know this limit? */
export const knownLimit = (text) => !!entryFor(String(text || ''));

/** The first recognised limit that is not met, as { text, say }, or null when the power may be used. Unknown limits never block. */
export function limitBlock(limits, ctx) {
  for (const l of limits || []) {
    const e = entryFor(String(l.text || ''));
    if (e && !e.test(ctx)) return { text: l.text, say: e.say };
  }
  return null;
}

/** Is a Dulled condition in force (the target or situation it names)? Unknown conditions never apply. */
export function dulledNow(dulled, ctx) {
  if (!dulled?.text) return false;
  const text = AGAINST.test(dulled.text) ? dulled.text : `against ${dulled.text}`;
  const e = entryFor(text);
  return !!e && e.test(ctx);
}
