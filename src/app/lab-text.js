// Power Lab: the plain-text stat block line for a power and its array.

import { describeEffect } from '../engine/render.js';
import { powerCost, primaryOwnCost } from '../engine/costs.js';

/** One line per effect: name, what it does, and the points it costs. */
export function statLine(arr, R) {
  try {
    const lines = [`${arr.name}: ${describeEffect(arr, R)} • ${powerCost({ ...arr, alternates: [] }, R)} points`];
    for (const a of arr.alternates) lines.push(`${arr.dynamic ? 'DAE' : 'AE'}: ${a.name}: ${describeEffect(a, R)} • ${arr.dynamic ? 2 : 1} point${arr.dynamic ? 's' : ''}`);
    if (arr.dynamic) lines.push(`(Dynamic: a ${primaryOwnCost(arr, R)}-point pool shared by the whole array)`);
    return lines.join('\n');
  } catch (e) {
    return e.message;
  }
}
