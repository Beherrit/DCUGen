// The "What happened" log: turn blocks of log rows, the Every action / Key moments filter, the one-fighter picker and
// the rolls toggle. The Battle Room and the saved-fight viewer both draw the log with this, so they read the same.
// It works on plain data: a log (entries with round, kind, actor, target, text, dice) and the fighters ({ id, name, team }).

import { h, clear } from './dom.js';
import { sortChars } from './sorting.js';

const TEAM_COLORS = { A: '#1f4fbf', B: '#c8202f', C: '#1a7f4b', D: '#a8670b', E: '#7a3fb8', F: '#0e7a86', G: '#b23a6e', H: '#556270' };
export const teamColor = (t) => TEAM_COLORS[t] || '#666';

export const KIND_CLASS = { round: 'round', init: 'init', hit: 'hit', crit: 'crit', miss: 'miss', resist: 'resist', condition: 'cond', ko: 'ko', heal: 'heal', hero: 'hero', move: 'move', flee: 'ko', end: 'end', skip: 'skip', attack: 'attack', recover: 'heal', note: 'note' };

export const diceText = (d) => `${d.label}: d20 ${d.roll}${d.mod != null ? ` ${d.mod >= 0 ? '+' : '−'} ${Math.abs(d.mod)}` : ''}${d.total != null ? ` = ${d.total}` : ''}${d.dc != null ? ` vs ${d.dc}` : ''}`;

function logEntry(e, showDice) {
  return h('div', { class: `bt-log-row ${KIND_CLASS[e.kind] || ''} ${e.important ? 'key' : ''}` },
    h('span', { class: 'bt-log-text' }, e.text,
      showDice && e.dice?.length && e.kind !== 'init' && !/d20 \d/.test(e.text || '') ? h('small', { class: 'bt-log-roll' }, e.dice.map(diceText).join(' · ')) : null),
    e.dice?.length ? h('span', { class: 'bt-log-dice', title: e.dice.map(diceText).join('\n') }, e.dice.slice(0, 4).map((d) => h('b', { class: `num ${d.roll === 20 ? 'nat20' : d.roll === 1 ? 'nat1' : ''}` }, d.roll))) : null);
}

/**
 * The log as turns: each fighter's turn is a block with who acted and everything that happened in it (moves,
 * attacks, rolls, what the target rolled, conditions), so you can read the fight action by action.
 */
export function logTurns(list) {
  const blocks = [];
  let cur = null;
  for (const e of list) {
    if (e.kind === 'round' || e.kind === 'end' || e.kind === 'init' && !e.actor) { blocks.push({ kind: e.kind, entries: [e] }); cur = null; continue; }
    if (!cur || (e.actor && e.actor !== cur.actor) || e.round !== cur.round) {
      cur = { kind: 'turn', actor: e.actor || null, round: e.round, entries: [] };
      blocks.push(cur);
    }
    cur.entries.push(e);
  }
  return blocks;
}

/** The entries to show: all of them or the key moments, and optionally only those that involve one fighter. */
export function visibleLog(log, fighters, { filter = 'all', who = null } = {}) {
  const person = who ? fighters.find((c) => c.id === who) : null;
  return log.filter((e) => (filter === 'all' || e.important || ['round', 'ko', 'end', 'crit', 'hero'].includes(e.kind))
    && (!person || e.kind === 'round' || e.actor === who || e.target === who || (e.text || '').includes(person.name || '\u0000')));
}

/**
 * Draw the log into host. s is { log, fighters, status ('setup' | 'running' | 'over'), filter, logWho, showDice };
 * teamColor(team) gives the stripe colour. Scrolls to the newest line.
 */
export function renderLogInto(host, s, teamColor) {
  clear(host);
  const who = s.logWho && s.fighters.some((c) => c.id === s.logWho) ? s.logWho : null;
  const list = visibleLog(s.log, s.fighters, { filter: s.filter, who });
  if (!list.length) { host.append(h('p', { class: 'hint', style: { margin: 0 } }, s.status === 'setup' ? 'Start the fight and every action shows here, turn by turn: who moved, who they attacked, every roll and what it did.' : 'Nothing for this filter yet.')); return; }
  const blocks = logTurns(list);
  blocks.forEach((b, i) => {
    if (b.kind !== 'turn') { for (const e of b.entries) host.append(logEntry(e, s.showDice)); return; }
    const actor = b.actor ? s.fighters.find((c) => c.id === b.actor) : null;
    const last = i === blocks.length - 1;
    host.append(h('div', { class: `bt-turn ${last && s.status === 'running' ? 'latest' : ''}`, style: actor ? { '--t': teamColor(actor.team) } : null },
      actor ? h('div', { class: 'bt-turn-head' }, h('span', { class: 'bt-log-team', style: { background: teamColor(actor.team) } }, actor.team), h('b', null, actor.name), h('span', { class: 'hint' }, `round ${b.round}`)) : null,
      b.entries.map((e) => logEntry(e, s.showDice))));
  });
  host.scrollTop = host.scrollHeight;
}

/**
 * The three controls above the log. s holds filter, logWho and showDice (they are changed in place).
 * onLog() redraws just the log; onFilter() redraws the page around it.
 */
export function logControls(s, fighters, { onLog, onFilter }) {
  const filter = h('div', { class: 'seg', role: 'group', 'aria-label': 'Log filter', style: { width: '200px' } },
    [['all', 'Every action'], ['key', 'Key moments']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(s.filter === v), onClick: () => { s.filter = v; onFilter(); } }, t)));
  const whoSel = h('select', { id: 'bt-log-who', 'aria-label': 'Show one fighter', onChange: (e) => { s.logWho = e.target.value || null; onLog(); } },
    h('option', { value: '' }, 'Everyone'), sortChars(fighters, 'name').map((c) => h('option', { value: c.id, selected: c.id === s.logWho }, `${c.name} (${c.team})`)));
  const diceToggle = h('label', { class: 'bt-copies', title: 'Show every roll written out: d20, bonus, total and the DC' }, h('input', { type: 'checkbox', id: 'bt-log-dice', checked: s.showDice !== false, onChange: (e) => { s.showDice = e.target.checked; onLog(); } }), ' Rolls');
  return { filter, whoSel, diceToggle };
}
