// The Advancement panel on the case file: GM-awarded power points, what they were spent on, and the log.

import { h } from './dom.js';
import { checkLimits } from '../engine/limits.js';
import { advancementSummary, startAdvancement, recordChanges, revertChanges, removeEntry, setSavingGoal } from '../engine/advancement.js';
import { costBreakdown } from '../engine/costs.js';
import { awardEveryForm, hasForms } from '../engine/forms.js';

const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
const TYPE_LABEL = { award: 'Earned', spend: 'Spent', refund: 'Refund', pl: 'Power level' };

/**
 * change(fn) clones the character, applies fn and saves it (same helper the sheet uses).
 * onSpend() switches the sheet to edit mode.
 */
export function advancementSection(ch, R, { change, onSpend, editing }) {
  const a = advancementSummary(ch, R);
  if (!a.on) {
    return h('section', { class: 'sec adv-track' },
      h('h3', null, 'Advancement'),
      h('p', { class: 'hint', style: { margin: '0 0 8px' } },
        'Track the power points your GM awards (usually 1 per adventure, 2 for a tough one) and what you spend them on. Your current build becomes the starting point.'),
      h('button', { class: 'btn', type: 'button', id: 'adv-start', onClick: () => change((c) => startAdvancement(c, R)) }, 'Start tracking earned points'));
  }

  const pts = h('input', { type: 'number', id: 'adv-award-pts', min: -20, max: 50, value: 1, 'aria-label': 'Points awarded', style: { maxWidth: '76px' } });
  const note = h('input', { type: 'text', id: 'adv-award-note', placeholder: 'Why (e.g. "Session 4: stopped the Clockwork Gang")', 'aria-label': 'Award note' });
  const award = h('div', { class: 'add-row no-print' }, pts, note,
    h('button', { class: 'btn primary', type: 'button', onClick: () => {
      const n = Math.trunc(Number(pts.value));
      if (!n) { pts.setCustomValidity('Enter a number of points'); pts.reportValidity(); return; }
      change((c) => awardEveryForm(c, R, n, note.value.trim()));
    } }, 'Add earned points'));

  const p = a.pending;
  const over = a.unspent < 0;
  const pendingBox = p.changes.length ? (() => {
    const why = h('input', { type: 'text', id: 'adv-spend-note', placeholder: 'Note (optional)', 'aria-label': 'Spending note' });
    const sessions = [...(ch.journal?.entries || [])].sort((x, y) => (y.session || 0) - (x.session || 0));
    const forSession = sessions.length ? h('select', { id: 'adv-spend-session', 'aria-label': 'Tie to a session' }, h('option', { value: '' }, 'Not tied to a session'), sessions.map((e) => h('option', { value: e.id }, `Session ${e.session}${e.title ? `: ${e.title}` : ''}`))) : null;
    return h('div', { class: `adv-pending ${over ? 'over' : ''}` },
      h('div', { class: 'adv-pending-head' }, h('b', null, 'Not yet in the log'), h('span', { class: 'num' }, `${sign(p.points)} pp`)),
      h('ul', null, p.changes.map((c) => h('li', null, c.text, c.points ? h('span', { class: 'num adv-pts' }, ` ${sign(c.points)}`) : null))),
      ...checkLimits(ch, R).filter((i) => i.severity === 'error' && i.rule !== 'budget').map((i) => h('p', { class: 'adv-warn' }, `Breaks a PL limit: ${i.message}`)),
      over ? h('p', { class: 'adv-warn' }, `That's ${-a.unspent} more than you have. Remove something, or ask the GM for more points.`) : null,
      editing ? h('p', { class: 'hint', style: { margin: '4px 0 0' } }, 'This goes into the log when you press "Done editing".') : h('div', { class: 'add-row no-print' }, why, forSession,
        h('button', { class: 'btn primary', type: 'button', disabled: over, onClick: () => change((c) => recordChanges(c, R, why.value.trim(), { journalId: forSession?.value || null })) }, 'Record in log'),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => change((c) => revertChanges(c)) }, 'Undo these changes')));
  })() : null;

  const log = [...(ch.advancement.log || [])].reverse();
  return h('section', { class: 'sec adv-track' },
    h('h3', null, 'Advancement', h('span', { class: 'pts' }, 'DCA 190')),
    h('div', { class: 'adv-tiles' },
      tile('Starting', a.startPoints, `PL ${a.startPl}`),
      tile('Earned', a.earned, 'from the GM', 'earned'),
      tile('Spent', a.spent, 'since starting', 'spent'),
      tile('Saved', a.unspent, over ? `${-a.unspent} over: ${a.total} of ${a.budget}` : `${a.total} of ${a.budget} used`, over ? 'bad' : a.unspent > 0 ? 'good' : '')),
    goalEditor(ch, R, a, change),
    h('p', { class: 'adv-guide' },
      a.suggestedPl > ch.pl
        ? `GM guideline: with ${a.earned} points earned, the series could be PL ${a.suggestedPl}. Raising PL is the GM's call and only raises the limits; it doesn't add points.`
        : `GM guideline: the series PL usually goes up by 1 for every 15 points earned (${a.toNextPl} more to go). Saved points can wait for that.`),
    award,
    h('div', { class: 'btn-row no-print', style: { marginTop: '8px' } },
      !editing ? h('button', { class: 'btn', type: 'button', disabled: a.unspent <= 0 && !p.changes.length, onClick: onSpend }, a.unspent > 0 ? `Spend ${a.unspent} point${a.unspent === 1 ? '' : 's'}` : 'Spend points') : null),
    pendingBox,
    h('div', { class: 'label', style: { margin: '12px 0 6px' } }, `History (${log.length})`),
    log.length ? h('ol', { class: 'adv-log' }, log.map((e) => h('li', { class: `adv-entry ${e.type}` },
      h('div', { class: 'adv-entry-head' },
        h('span', { class: 'adv-type-chip' }, TYPE_LABEL[e.type] || e.type),
        h('span', { class: 'adv-pts num' }, e.type === 'pl' ? '' : `${e.type === 'award' ? sign(e.points) : e.points > 0 ? `−${e.points}` : `+${-e.points}`} pp`),
        h('span', { class: 'adv-note' }, e.note || '', e.journalId && ch.journal?.entries?.some((j) => j.id === e.journalId) && !/^Session/.test(e.note || '') ? h('small', { style: { color: 'var(--ink-3)' } }, ` · session ${ch.journal.entries.find((j) => j.id === e.journalId)?.session}`) : null),
        h('span', { class: 'adv-date num' }, e.date || ''),
        e.type === 'award' ? h('button', { class: 'x no-print', type: 'button', 'aria-label': 'Remove this award', title: 'Remove this award (a mistake)', onClick: () => change((c) => removeEntry(c, e.id)) }, '✕') : null),
      (e.changes || []).length ? h('ul', { class: 'adv-changes' }, e.changes.map((t) => h('li', null, t))) : null)))
      : h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing yet. Add the points your GM awards, then press Spend.'));
}

function tile(label, value, sub, tone = '') {
  return h('div', { class: `adv-tile ${tone}` }, h('b', { class: 'num' }, value), h('span', { class: 'adv-tile-label' }, label), h('span', { class: 'adv-tile-sub' }, sub));
}

/** Saving up: what the saved points are for, with progress. */
function goalEditor(ch, R, a, change) {
  const note = h('input', { type: 'text', id: 'adv-goal-note', value: a.goal?.note || '', placeholder: 'Saving up for… (e.g. Flight 10, Regeneration 5)', 'aria-label': 'Saving up for' });
  const target = h('input', { type: 'number', id: 'adv-goal-target', min: 0, max: 200, value: a.goal?.target || '', placeholder: 'pp', 'aria-label': 'Points needed', style: { maxWidth: '76px' } });
  const save = () => change((c) => setSavingGoal(c, R, { note: note.value, target: target.value }));
  return h('div', { class: 'adv-goal' },
    a.goal ? goalBar(a) : null,
    h('div', { class: 'add-row no-print' }, note, target,
      h('button', { class: 'btn', type: 'button', onClick: save }, a.goal ? 'Update goal' : 'Set a goal'),
      a.goal ? h('button', { class: 'btn ghost', type: 'button', onClick: () => change((c) => setSavingGoal(c, R, null)) }, 'Clear') : null));
}

function goalBar(a) {
  const have = Math.max(0, a.unspent);
  const t = a.goal.target || 0;
  const pct = t ? Math.min(100, Math.round((have / t) * 100)) : 0;
  return h('div', { class: 'goal' },
    h('div', { class: 'goal-text' }, '🎯 Saving for ', h('b', null, a.goal.note), t ? h('span', { class: 'num' }, ` · ${have}/${t} pp${have >= t ? ' · ready to buy!' : ''}`) : null),
    t ? h('div', { class: 'meter', role: 'img', 'aria-label': `${have} of ${t} points saved` }, h('i', { class: have >= t ? 'done' : '', style: { width: `${pct}%` } })) : null);
}

/**
 * The power points bar at the top of the sheet: what the character is built on, what's spent, what's
 * saved, and the two things players do with points: get them from the GM, and spend (or keep) them.
 */
export function pointsBar(ch, R, { change, onSpend, editing }) {
  let cost;
  try { cost = costBreakdown(ch, R); } catch { return null; }
  const a = ch.advancement ? advancementSummary(ch, R) : null;
  const saved = cost.budget - cost.total;
  const pts = h('input', { type: 'number', id: 'pb-award-pts', min: 1, max: 100, value: 1, 'aria-label': 'Points from the GM', style: { width: '64px' } });
  const note = h('input', { type: 'text', id: 'pb-award-note', placeholder: 'Why? (optional)', 'aria-label': 'Why the points were awarded' });
  const awardRow = h('div', { class: 'pb-award no-print', hidden: true }, h('label', null, '🎁 The GM gave me', pts, 'points'), note,
    h('button', { class: 'btn primary sm', type: 'button', id: 'pb-award-add', onClick: () => {
      const n = Math.trunc(Number(pts.value));
      if (!n) return;
      change((c) => awardEveryForm(c, R, n, note.value.trim() || 'Points from the GM'));
    } }, 'Add'),
    h('small', { class: 'hint' }, hasForms(ch) ? 'Every form gets them. ' : '', 'Spend them now, or keep them: unspent points stay saved.'));
  const figures = a
    ? [fig('Built on', a.startPoints, `PL ${a.startPl} start`), fig('Earned', `+${a.earned}`, 'from the GM'), fig('Spent', cost.total, `of ${cost.budget}`), fig('Saved', saved, saved < 0 ? 'over budget' : saved ? 'to spend or keep' : 'all spent', saved < 0 ? 'bad' : saved > 0 ? 'good' : '')]
    : [fig('Power level', ch.pl, `${ch.pl} × 15`), fig('Points', cost.budget, 'to build with'), fig('Spent', cost.total, ''), fig(saved >= 0 ? 'Left' : 'Over', Math.abs(saved), saved > 0 ? 'unspent' : saved < 0 ? 'over budget' : 'all spent', saved < 0 ? 'bad' : '')];
  return h('section', { class: 'pts-bar no-print-controls', id: 'pts-bar' },
    h('div', { class: 'pb-figs' }, figures),
    h('div', { class: 'pb-actions no-print' },
      h('button', { class: 'btn sm', type: 'button', id: 'pb-award', onClick: () => { awardRow.hidden = !awardRow.hidden; if (!awardRow.hidden) pts.focus(); } }, '🎁 Points from the GM'),
      saved > 0 && !editing ? h('button', { class: 'btn sm primary', type: 'button', id: 'pb-spend', onClick: () => { if (!ch.advancement) change((c) => startAdvancement(c, R)); onSpend?.(); } }, `Spend ${saved} saved point${saved === 1 ? '' : 's'}`) : null,
      a ? h('button', { class: 'btn sm ghost', type: 'button', onClick: () => document.querySelector('.adv-track')?.scrollIntoView({ behavior: 'smooth' }) }, 'Log & goal ↓') : null),
    a?.goal ? goalBar(a) : null,
    awardRow);
}

function fig(label, value, sub, tone = '') {
  return h('div', { class: `pb-fig ${tone}` }, h('span', { class: 'pb-label' }, label), h('b', { class: 'num' }, value), sub ? h('small', null, sub) : null);
}
