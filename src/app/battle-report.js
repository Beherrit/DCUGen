// The "Not simulated" line on a fighter's card: the build report (engine/battle/build-report.js) says which of the
// fighter's powers, modifiers, advantages and skills the Battle Room ignores in a fight, and why.

import { h } from './dom.js';
import { buildReport } from '../engine/battle.js';

/** A paragraph listing what the simulator ignores about this fighter, or null when it uses everything it has. */
export function notSimulatedLine(c) {
  const { ignored } = buildReport(c);
  if (!ignored.length) return null;
  return h('p', { class: 'bt-unsim' },
    h('b', null, 'Not simulated: '),
    ignored.map((x, i) => h('span', null, i ? ' ' : '', h('span', { class: 'bt-unsim-name' }, x.name), ` (${x.why})`)));
}
