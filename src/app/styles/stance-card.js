// The play view's stance picker: the stances the character knows with their DC, benefits and detriments.
// Choosing one rolls the Assume Stance check (Close Combat: Fighting Style against the DC); the stance's numbers
// then show on the defenses, attacks and initiative. Martial Arts 3e, pp 128-131.

import { h, toast } from '../dom.js';
import { stanceChoices, assumeStance, currentStance, stanceAction } from '../../engine/martial/stance.js';
import { stanceNotes } from '../../engine/martial/stance-mods.js';
import { knowsStances } from '../../engine/martial/lookup.js';

const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * ctx: { roll(label, mod, extra) rolls a check and returns its feed entry, setPlay(fn) changes the play state }
 * d is the character's numbers before any stance. Returns null for a character with no stances.
 */
export function stanceCard(ch, R, d, s, ctx) {
  if (!knowsStances(ch)) return null;
  const choices = stanceChoices(ch, R, d);
  const now = currentStance(s);
  const cur = choices.find((c) => c.name === now)?.def;
  const action = stanceAction(s);

  const pick = (c) => {
    if (c.name === 'Neutral') { ctx.setPlay((st) => { delete st.stance; }); toast('Back to the Neutral stance (no check needed).'); return; }
    const e = ctx.roll(`Assume ${c.name} stance (Close Combat: ${c.style})`, c.bonus, { dc: c.dc, note: action === 'free' ? 'free action from Neutral' : 'move action' });
    const r = assumeStance(s, c, e.dice?.total ?? -99);
    ctx.setPlay((st) => { if (r.stance === 'Neutral') delete st.stance; else st.stance = r.stance; });
    toast(`${e.text} → ${r.text}`);
  };

  const btn = (c) => h('button', { type: 'button', class: 'fs-stance-btn', 'aria-pressed': String(c.name === now), 'data-stance': c.name, onClick: () => pick(c) },
    h('b', null, c.name),
    h('span', { class: 'num' }, c.name === 'Neutral' ? 'no check' : `DC ${c.dc} · ${sign(c.bonus)}`),
    c.def ? h('small', null, [c.def.benefits, c.def.detriments].filter((x) => x && !/^none\.?$/i.test(x)).join(' ') || 'No bonuses or penalties.') : null);

  const notes = stanceNotes(cur);
  return h('section', { class: 'play-card fs-stance', id: 'play-stance' },
    h('h3', null, 'Stance', h('span', { class: 'chip', id: 'play-stance-now' }, now)),
    h('p', { class: 'hint', style: { margin: '0 0 6px' } }, `Changing stance is a Close Combat: Fighting Style check, ${action === 'free' ? 'a free action from Neutral' : 'a move action'}. Fail and you drop to Neutral. Being prone, stunned, vulnerable, defenseless, immobile, paralyzed, asleep or incapacitated ends your stance.`),
    h('div', { class: 'fs-stance-pick' }, choices.map(btn)),
    notes.length ? h('ul', { class: 'play-cond-notes' }, notes.map((n) => h('li', null, n))) : null);
}
