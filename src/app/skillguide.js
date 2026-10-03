// Skills cheat sheet: what each skill covers, its uses, DCs and what opposes it (DCA chapter 4).

import { h, clear } from './dom.js';

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

/** Show a skill table value the right way: a DC, a modifier, a step, or text. */
export function formatSkillValue(useName, label, v) {
  if (typeof v !== 'number') return v;
  if (useName === 'Jumping') return v === 1 ? 'result' : `result ÷ ${v}`;
  if (useName === 'Improve Attitude' && /:/.test(label)) return `Step ${v}`;
  if (/degrees/i.test(label)) return `${v} degrees`;
  if (useName === 'Bluffing' || useName === 'Demoralizing' || useName === 'Related fields'
    || /^(Modifier|Observer bonus|Penalty|Distance|Moving faster|Hiding after|Self-treatment)/i.test(label)) return signed(v);
  return `DC ${v}`;
}

export function guideFor(R, name) {
  return (R.raw.skillGuide || []).find((g) => g.name === name) || null;
}

/** One skill's cheat-sheet body: what it covers, each use with its DCs. */
export function skillGuideBody(g, { compact = false } = {}) {
  if (!g) return null;
  return h('div', { class: `skill-guide ${compact ? 'compact' : ''}` },
    g.covers ? h('p', { class: 'sg-covers' }, g.covers) : null,
    h('div', { class: 'sg-meta' },
      h('span', { class: 'chip' }, g.ability),
      g.trained_only ? h('span', { class: 'chip' }, 'Trained only') : null,
      g.opposed_by ? h('span', { class: 'chip' }, `Opposed by ${g.opposed_by}`) : null),
    (g.uses || []).map((u) => h('div', { class: 'sg-use' },
      h('div', { class: 'sg-use-head' }, h('b', null, u.name), u.action ? h('span', { class: 'sg-action' }, `${u.action} action`) : null),
      u.text ? h('div', { class: 'sg-text' }, u.text) : null,
      (u.dcs || []).length ? h('table', { class: 'sg-dcs' }, h('tbody', null, u.dcs.map(([what, dc]) => h('tr', null, h('td', null, what), h('td', { class: 'num' }, formatSkillValue(u.name, what, dc)))))) : null)),
    g.examples ? h('p', { class: 'sg-examples' }, g.examples) : null,
    g.source ? h('div', { class: 'rule-src' }, g.source) : null);
}

/** The full cheat sheet: every skill as a card, with search. */
export function skillCheatSheet(R) {
  const guide = R.raw.skillGuide || [];
  const grid = h('div', { class: 'rule-grid' });
  const draw = (q) => {
    clear(grid);
    const term = q.toLowerCase();
    for (const g of guide) {
      const hay = `${g.name} ${g.covers} ${(g.uses || []).map((u) => `${u.name} ${u.text}`).join(' ')} ${g.examples || ''}`.toLowerCase();
      if (term && !hay.includes(term)) continue;
      grid.append(h('article', { class: 'panel rule-card' }, h('h3', { class: 'rule-title' }, g.name), skillGuideBody(g)));
    }
    if (!grid.children.length) grid.append(h('p', { style: { color: 'var(--ink-2)' } }, guide.length ? 'No skill matches.' : 'The skill guide is not in this build.'));
  };
  const search = h('input', { type: 'search', id: 'skill-guide-q', placeholder: 'Search skills (climb, lie, hack, first aid...)', 'aria-label': 'Search skills', onInput: (e) => draw(e.target.value) });
  draw('');
  return h('div', { style: { display: 'grid', gap: '12px' } },
    h('section', { class: 'panel' }, h('h2', null, 'Skills cheat sheet'),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Skill check = d20 + skill rank + ability. Routine checks (no pressure) count as rolling 10. Skills cost 1 point per 2 ranks.'),
      search),
    grid);
}
