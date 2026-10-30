// A fighter's descriptors and immunities on its Battle Room card, in plain words (engine/battle/descriptors.js and
// immunity.js): what its attacks are made of (fire, magic, physical...) and what it ignores, so a player can see
// why a Fire Blast does nothing to someone before the log says so.

import { h } from './dom.js';
import { describeImmunities, fighterDescriptors, attackDescriptorWords } from '../engine/battle.js';

/** The hover text of the attack line: every attack with its descriptors. */
export function attackTitle(c) {
  return c.attacks.map((a) => `${a.name}: ${attackDescriptorWords(a) || 'no descriptors'}${a.variable ? ' (Variable Descriptor)' : ''}`).join('\n');
}

/** "Descriptors: fire, energy" and "Immune to: fire damage, critical hits" as small tags; null when there is nothing to say. */
export function descriptorTags(c) {
  const descs = fighterDescriptors(c);
  const immune = describeImmunities(c);
  if (!descs.length && !immune.length) return null;
  return h('div', { class: 'bt-tags' },
    descs.length ? h('span', { class: 'bt-tag', title: attackTitle(c) }, h('b', null, 'Descriptors: '), descs.slice(0, 8).join(', ')) : null,
    immune.length ? h('span', { class: 'bt-tag imm', title: 'Immunity (Hero\'s Handbook p102)' }, h('b', null, 'Immune to: '), immune.join('; ')) : null);
}

/** The Insubstantial form in force, as a condition chip text (or null). */
export function insubChip(c) {
  return c.insub ? `Insubstantial: ${c.insub.kind}` : null;
}
