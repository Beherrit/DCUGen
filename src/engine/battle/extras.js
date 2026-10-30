// Extras on an attack: read once from the power into a small object (atk.ex, null when the power has none that matter in
// a fight), the way flaws.js reads flaws, so no code matches extra names as text at the point of use. Hero's Handbook
// extras (DCA 125-133) and the Martial Arts (3e) extras (MA 91-94) that change a fight. Accurate, Area, Extended Range,
// Impervious, Multiattack, Penetrating, Reach, Selective and Variable Descriptor are read where they were built before.
//
// An extra is { name, option?, steps? } on the power: `steps` is its ranks, `option` a priced choice (Partial Resistance:
// +1 or +2).

const steps = (m) => Math.max(1, m.steps ?? 1);

const FLAGS = [
  ['Attack', 'attackForm'], ['Contagious', 'contagious'], ['Incurable', 'incurable'], ['Innate', 'innate'],
  ['Secondary Effect', 'secondary'], ['Sleep', 'sleep'], ['Recoverable', 'recoverable'],
];
const RANKED = [
  ['Homing', 'homing'], ['Indirect', 'indirect'], ['Ricochet', 'ricochet'], ['Split', 'split'], ['Triggered', 'triggered'],
  ['Increased Duration', 'duration'], ['Potent', 'potent'], ['Proficient', 'proficient'], ['Stacking', 'stacking'],
  ['Pinball', 'pinball'], ['Diminishing Counter', 'diminishing'], ['Improved Counter', 'improvedCounter'],
  ['Overwhelming Counter', 'overwhelming'],
];

/** The compact extras object of a power, or null when it has none that matter in a fight. */
export function extrasOf(p) {
  const list = p?.extras || [];
  if (!list.length) return null;
  const out = {};
  for (const m of list) {
    const flag = FLAGS.find(([n]) => n === m.name);
    if (flag) { out[flag[1]] = true; continue; }
    const ranked = RANKED.find(([n]) => n === m.name);
    if (ranked) { out[ranked[1]] = (out[ranked[1]] || 0) + steps(m); continue; }
    if (m.name === 'Partial Resistance') out.partialRes = /2/.test(`${m.option || ''}`) ? 2 : 1;
  }
  return Object.keys(out).length ? out : null;
}

/** How long an Increased Duration effect lasts: one rank is concentration, two sustained, three continuous. */
export const durationOf = (ex) => (!ex?.duration ? null : ['concentration', 'sustained', 'continuous'][Math.min(3, ex.duration) - 1]);
