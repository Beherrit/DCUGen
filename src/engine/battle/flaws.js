// Flaws on an attack: read once from the power into a small object (atk.flaws, null when the power has none), so no
// code matches flaw names as text at the point of use. Hero's Handbook flaws (DCA 133-138) and the Martial Arts (3e)
// flaws (MA 94-98) that change a fight; the ones that are only about cost or roleplay are not read.
//
// A flaw is { name, option?, steps?, detail? } on the power: `steps` is its ranks, `option` a priced choice (Activation:
// move or standard, Side Effect: on failure or always), `detail` the player's own words (Limited: "only against
// machines", Check Required: the skill, Sense-Dependent: the sense, Resistible: the defense).

const ranks = (f) => Math.max(1, f.steps ?? f.ranks ?? 1);
const says = (f) => `${f.name || ''} ${f.option || ''} ${f.detail || ''}`;
const word = (f) => String(f.detail || '').trim();
const DEFENSE = /\b(Dodge|Parry|Fortitude|Toughness|Will)\b/i;
const SENSES = [['sight', /\b(sight|vision|visual|see|seeing|eyes?|gaze)\b/i], ['hearing', /\b(hearing|hear|auditory|sound|song|voice)\b/i], ['smell', /\b(smell|scent|odor|aroma)\b/i], ['touch', /\b(touch|tactile)\b/i], ['taste', /\btaste\b/i]];
const NUMBERS = { one: 1, single: 1, two: 2, three: 3, four: 4, five: 5 };

/** The sense a Sense-Dependent effect works through, from the flaw's detail or else the power's own words; null when none is named. */
function senseOf(f, p) {
  const text = word(f) || `${p?.detail || ''} ${p?.name || ''}`;
  return SENSES.find(([, re]) => re.test(text))?.[0] || null;
}

/** "one shot", "single use", "five uses", "2 charges": the number of uses an Unreliable effect has, or null for the d20 roll version. */
function usesOf(f) {
  const m = /\b(\d+|one|single|two|three|four|five)\b[^,;]*?\b(shot|dose|use|charge|burst|round)s?\b/i.exec(word(f));
  if (!m) return /\b(shot|dose|use|charge)s?\b/i.test(word(f)) ? 1 : null;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBERS[m[1].toLowerCase()];
}

const total = (out, key, n) => { out[key] = (out[key] || 0) + n; };
const SIMPLE = [
  [/^concentration/i, 'concentration'], [/^distracting/i, 'distracting'], [/^feedback/i, 'feedback'], [/^tiring/i, 'tiring'],
  [/^uncontrolled/i, 'uncontrolled'], [/^grab-based/i, 'grab'], [/^announcement/i, 'announcement'], [/^gallant/i, 'gallant'],
  [/^inexact/i, 'inexact'], [/^momentum-based/i, 'momentum'], [/^nonlethal/i, 'nonlethal'], [/^strained/i, 'strained'], [/^obvious/i, 'obvious'],
];
const RANKED = [
  [/^diminished range/i, 'diminished'], [/^fades/i, 'fades'], [/^inaccurate/i, 'inaccurate'], [/^increased action/i, 'increased'],
  [/^reduced range/i, 'reduced'], [/^bad bounce/i, 'badBounce'], [/^diluted/i, 'diluted'], [/^fast return/i, 'fastReturn'],
  [/^push over/i, 'pushOver'], [/^uncertain/i, 'uncertain'], [/^weak limbed/i, 'weakLimbed'],
];

/** Add one flaw to the object being built. */
function readOne(out, f, p) {
  const name = String(f.name || '');
  for (const [re, key] of SIMPLE) if (re.test(name)) { out[key] = true; return; }
  for (const [re, key] of RANKED) if (re.test(name)) { total(out, key, ranks(f)); return; }
  if (/^activation/i.test(name)) out.activation = Math.max(out.activation || 0, /standard/i.test(says(f)) ? 2 : 1);
  else if (/^check required/i.test(name)) out.check = { ranks: (out.check?.ranks || 0) + ranks(f), skill: word(f) || out.check?.skill || '' };
  else if (name === 'Limited') (out.limited ||= []).push({ text: word(f) });
  else if (/^resistible/i.test(name)) out.resistible = DEFENSE.exec(says(f))?.[1]?.replace(/^./, (x) => x.toUpperCase()) || null;
  else if (/^sense-dependent/i.test(name)) out.sense = { word: senseOf(f, p) };
  else if (/^side effect/i.test(name)) out.sideEffect = /always/i.test(says(f)) ? 'always' : 'failure';
  else if (/^unreliable/i.test(name)) out.unreliable = { uses: usesOf(f) };
  else if (/^chained/i.test(name)) out.chained = word(f);
  else if (/^calling/i.test(name)) out.calling = true;
  else if (/^dulled/i.test(name)) out.dulled = { ranks: ranks(f), complete: /-2/.test(says(f)), text: word(f) };
  else if (/^immobile/i.test(name)) out.immobile = /-2/.test(says(f)) ? 2 : 1;
  else if (/^prone$/i.test(name)) out.proneUse = /-2/.test(says(f)) ? 2 : 1;
  else if (/^source/i.test(name)) out.source = word(f);
}

/** The compact flaw object of a power, or null when it has none that matter in a fight. */
export function flawsOf(p) {
  const list = p?.flaws || [];
  if (!list.length) return null;
  const out = {};
  for (const f of list) readOne(out, f, p);
  return Object.keys(out).length ? out : null;
}

/** What the flaws change about the attack itself, once, when it is built: Inaccurate (-2 to the attack check per rank) and Diminished Range (the band multipliers shrink). */
export function shapeAttack(atk) {
  const f = atk.flaws;
  if (!f) return;
  atk.dim = Math.min(3, f.diminished || 0);
  if (f.inaccurate && atk.bonus != null) atk.bonus -= 2 * f.inaccurate;
}

/** The key a power's fight state is kept under (Activation, Fades and uses belong to the whole power). */
export const flawKey = (atk) => atk.power?.name || atk.name;

/** The fight state of the flaws, on the combatant: what is switched on, used, faded, done and braced. */
export function freshFlawState() {
  return { on: {}, uses: {}, faded: {}, done: {}, pushOver: null };
}
