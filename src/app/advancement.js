// The Advancement panel on the case file: GM-awarded power points, what they were spent on, and the log.

import { h } from './dom.js';
import { checkLimits } from '../engine/limits.js';
import { advancementSummary, startAdvancement, awardPoints, recordChanges, revertChanges, removeEntry } from '../engine/advancement.js';

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
      change((c) => awardPoints(c, R, n, note.value.trim()));
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
      tile('Unspent', a.unspent, `${a.total} of ${a.budget} used`, over ? 'bad' : a.unspent > 0 ? 'good' : '')),
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
