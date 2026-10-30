// A style's maneuvers on the sheet: the bought list with stat lines, and (editing) the picker to buy more.

import { h } from '../dom.js';
import { maneuverDef } from '../../engine/martial/lookup.js';
import { listedManeuver } from '../../engine/martial/template.js';
import { addManeuver, removeManeuver, setManeuverRank, maneuverLabel, firstRank } from '../../engine/martial/maneuvers.js';
import { maneuverLine, priceText } from '../../engine/martial/describe.js';

/** The bought maneuvers of one style. `change(fn)` edits a copy of the character; `stepper` is the sheet's +/- control. */
export function maneuverList(ch, R, style, { editing, change, stepper }) {
  if (!style.maneuvers.length) return h('p', { class: 'fs-none' }, 'No maneuvers yet.');
  return h('div', { class: 'fs-mans' }, style.maneuvers.map((m) => {
    const def = maneuverDef(R, m.name, m.detail);
    const ranked = !!def?.cost?.per_rank;
    return h('div', { class: 'fs-man' },
      h('div', { class: 'fs-man-head' },
        h('b', null, maneuverLabel(m)),
        h('span', { class: 'chip' }, def?.tier === 'basic' ? 'Basic' : 'Advanced'),
        ranked && m.rank != null ? h('span', { class: 'chip' }, `rank ${m.rank}`) : null,
        h('span', { class: 'fs-pts num' }, priceText(def, m.rank, m.price)),
        editing && ranked ? stepper(m.rank ?? 1, (d) => change((c) => { setManeuverRank(c, R, style.name, m.name, m.detail, (m.rank ?? 1) + d); }), { min: firstRank(def) ?? 1, label: `${m.name} rank` }) : null,
        editing ? h('button', { class: 'x no-print', type: 'button', 'aria-label': `Remove ${maneuverLabel(m)}`, onClick: () => change((c) => { removeManeuver(c, style.name, m.name, m.detail); }) }, '✕') : null),
      h('div', { class: 'fs-man-line' }, maneuverLine(def, m.rank) || def?.summary || ''),
      def?.summary && def.tier !== 'basic' ? h('div', { class: 'fs-man-sum' }, def.summary) : null);
  }));
}

function options(R, style, def) {
  const have = new Set(style.maneuvers.map((m) => maneuverLabel(m)));
  const fromStyle = (list, tier) => (list || []).map((it) => ({ it, tier, args: listedManeuver(R, it) })).filter((o) => o.args && !have.has(maneuverLabel(o.args)));
  const basic = fromStyle(def.basic_maneuvers, 'Basic');
  const advanced = fromStyle(def.advanced_maneuvers, 'Advanced');
  const listed = new Set([...basic, ...advanced].map((o) => o.args.name));
  const others = R.raw.maneuvers.filter((m) => !listed.has(m.name) && !have.has(m.name) && m.tier === 'advanced' && !m.style)
    .map((m) => ({ it: { name: m.name }, tier: 'Other', args: { name: m.name } }));
  return [['Basic maneuvers on the style\'s list', basic], ['Advanced maneuvers on the style\'s list', advanced], ['Other advanced maneuvers (not on the list)', others]];
}

/** Choose a maneuver and a rank; the price shows before you buy. */
export function maneuverAdder(ch, R, style, def, change) {
  const groups = options(R, style, def);
  const flat = groups.flatMap(([, list]) => list);
  if (!flat.length) return h('p', { class: 'fs-none no-print' }, 'Every maneuver on this style is bought.');
  const sel = h('select', { id: `fs-man-${style.name}`, 'aria-label': `Maneuver to add to ${style.name}` },
    groups.filter(([, l]) => l.length).map(([label, list]) => h('optgroup', { label },
      list.map((o) => h('option', { value: flat.indexOf(o) }, `${maneuverLabel(o.args)}${o.args.price != null ? ` (${o.args.price} pp)` : ''}`)))));
  const rank = h('input', { type: 'number', min: 1, max: 30, class: 'fs-rank', 'aria-label': 'Maneuver rank' });
  const price = h('span', { class: 'fs-price' });
  const pick = () => flat[Number(sel.value)];
  const refresh = () => {
    const o = pick(); const m = maneuverDef(R, o.args.name, o.args.detail);
    const ranked = !!m?.cost?.per_rank;
    rank.hidden = !ranked;
    if (ranked) rank.value = o.args.rank ?? firstRank(m) ?? 1;
    price.textContent = priceText(m, ranked ? Number(rank.value) : undefined, o.args.price);
    price.title = m?.cost?.text || '';
  };
  sel.addEventListener('change', refresh);
  rank.addEventListener('input', () => { const o = pick(); price.textContent = priceText(maneuverDef(R, o.args.name, o.args.detail), Number(rank.value), rank.value === String(o.args.rank) ? o.args.price : undefined); });
  refresh();
  const add = () => {
    const o = pick(); const m = maneuverDef(R, o.args.name, o.args.detail);
    const r = m?.cost?.per_rank ? Number(rank.value) : undefined;
    const price0 = r != null && r !== o.args.rank ? undefined : o.args.price;
    change((c) => { addManeuver(c, R, style.name, { ...o.args, rank: r, price: price0 }); });
  };
  return h('div', { class: 'add-row fs-add-man no-print' }, sel, rank, price, h('button', { class: 'btn', type: 'button', onClick: add }, 'Add maneuver'));
}
