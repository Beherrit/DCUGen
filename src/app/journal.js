// The campaign journal on the Bio page: sessions played, who was met, what the points bought,
// and what happened between adventures.

import { h, toast, copyText } from './dom.js';
import { addJournalEntry, updateJournalEntry, removeJournalEntry, journalEntries, journalPoints, unlinkedSpends, linkPoints, journalText, JOURNAL_RELATIONS } from '../engine/journal.js';
import { rollDowntimeEvent } from '../engine/lifepath.js';
import { randomSeed } from '../engine/rng.js';

const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
let editing = null; // id of the entry being edited, or 'new'

/**
 * change(fn) clones the character, applies fn and saves. onOpenPerson(p) opens a person as a character.
 */
export function journalSection(ch, R, { change, onOpenPerson } = {}) {
  const entries = journalEntries(ch);
  const known = [...(ch.bio?.people || []), ...(ch.bio?.family?.parents || []), ...(ch.bio?.family?.siblings || [])];
  const spends = unlinkedSpends(ch);

  const form = (entry) => {
    const isNew = !entry;
    const e = entry || { session: (ch.journal?.entries?.length || 0) + 1, date: new Date().toISOString().slice(0, 10), title: '', text: '', people: [], downtime: '' };
    const session = h('input', { type: 'number', min: 0, value: e.session, id: 'jr-session', 'aria-label': 'Session number', style: { maxWidth: '80px' } });
    const date = h('input', { type: 'date', value: e.date || '', id: 'jr-date', 'aria-label': 'Date', style: { maxWidth: '160px' } });
    const title = h('input', { type: 'text', value: e.title || '', id: 'jr-title', placeholder: 'Title (e.g. "The Royal Flush Gang")', 'aria-label': 'Title' });
    const text = h('textarea', { id: 'jr-text', placeholder: 'What happened: the job, the fight, the fallout, what they learned…', 'aria-label': 'What happened', style: { minHeight: '90px' } }, e.text || '');
    const points = isNew ? h('input', { type: 'number', min: 0, max: 20, value: 0, id: 'jr-points', 'aria-label': 'Points earned', style: { maxWidth: '80px' } }) : null;
    const downtime = h('textarea', { id: 'jr-downtime', placeholder: 'Between adventures (optional): training, travel, a funeral, a wedding…', 'aria-label': 'Between adventures', style: { minHeight: '50px' } }, e.downtime || '');
    const peopleRows = h('div', { class: 'jr-people' });
    const people = (e.people || []).map((p) => ({ ...p }));
    const drawPeople = () => {
      peopleRows.replaceChildren();
      people.forEach((p, i) => {
        const existing = known.find((k) => String(k.name).toLowerCase() === String(p.name || '').toLowerCase());
        peopleRows.append(h('div', { class: 'jr-person' },
          h('input', { type: 'text', list: 'jr-known', value: p.name || '', placeholder: 'Name', 'aria-label': 'Person', onInput: (ev) => { p.name = ev.target.value; }, onChange: () => drawPeople() }),
          h('select', { 'aria-label': 'Relationship', onChange: (ev) => { p.relation = ev.target.value; } },
            h('option', { value: '', selected: !p.relation }, existing ? `Keep: ${existing.relation || existing.role || 'as is'}` : 'Relationship…'),
            JOURNAL_RELATIONS.map((r) => h('option', { value: r, selected: p.relation === r }, r))),
          h('input', { type: 'text', value: p.who || '', placeholder: existing ? 'What happened with them' : 'Who they are', 'aria-label': 'Who they are', onInput: (ev) => { p.who = ev.target.value; } }),
          h('input', { type: 'text', value: p.status || '', placeholder: 'Status now (e.g. "now an enemy", "died in issue #12")', 'aria-label': 'Status', onInput: (ev) => { p.status = ev.target.value; } }),
          h('span', { class: `jr-tag ${existing ? '' : 'new'}` }, existing ? 'known' : 'new'),
          h('button', { class: 'x', type: 'button', 'aria-label': 'Remove person', onClick: () => { people.splice(i, 1); drawPeople(); } }, '✕')));
      });
      peopleRows.append(h('button', { class: 'btn sm', type: 'button', onClick: () => { people.push({ name: '', relation: '', who: '', status: '' }); drawPeople(); } }, '+ Someone they met or dealt with'));
    };
    drawPeople();
    const dtRoll = h('button', { class: 'btn sm', type: 'button', title: 'Roll what happened between adventures from the life-event tables', onClick: () => {
      try {
        const r = rollDowntimeEvent(R, ch, { seed: randomSeed() });
        downtime.value = r.text;
        for (const p of r.people || []) if (!people.some((x) => x.name === p.name)) { people.push({ name: p.name, relation: p.relation, who: p.who, status: p.status }); }
        drawPeople();
        toast(r.people?.length ? `Downtime rolled: ${r.people.map((p) => p.name).join(', ')} added to the people list` : 'Downtime rolled');
      } catch (err) { toast(err.message); }
    } }, '🎲 Roll a downtime event');
    const save = () => {
      const data = { session: session.value, date: date.value, title: title.value, text: text.value, people, downtime: downtime.value, pointsEarned: points ? Number(points.value) || 0 : 0 };
      if (!data.title.trim() && !data.text.trim()) { title.setCustomValidity('Give the session a title or some text'); title.reportValidity(); return; }
      editing = null;
      change?.((c) => { if (isNew) addJournalEntry(c, R, data); else updateJournalEntry(c, R, entry.id, data); });
      toast(isNew ? 'Session added to the journal and the timeline' : 'Session updated');
    };
    return h('div', { class: 'jr-form' },
      h('datalist', { id: 'jr-known' }, known.map((k) => h('option', { value: k.name }, k.relation || k.role || ''))),
      h('div', { class: 'jr-row' }, h('label', { class: 'field' }, h('span', null, 'Session'), session), h('label', { class: 'field' }, h('span', null, 'Date'), date), h('label', { class: 'field', style: { flex: 1 } }, h('span', null, 'Title'), title)),
      h('label', { class: 'field' }, h('span', null, 'What happened'), text),
      h('div', { class: 'label' }, 'People in this session'),
      peopleRows,
      h('label', { class: 'field' }, h('span', null, 'Between adventures ', dtRoll), downtime),
      h('div', { class: 'jr-row', style: { alignItems: 'end' } },
        points ? h('label', { class: 'field' }, h('span', null, 'Points earned (GM award)'), points) : null,
        h('span', { style: { flex: 1 } }),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => { editing = null; change?.(() => {}); } }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'button', onClick: save }, isNew ? 'Add to the journal' : 'Save changes')));
  };

  const card = (e) => {
    if (editing === e.id) return form(e);
    const pts = journalPoints(ch, e.id);
    const earned = pts.filter((x) => x.type === 'award').reduce((s, x) => s + (x.points || 0), 0);
    const spent = pts.filter((x) => x.type !== 'award');
    return h('article', { class: 'jr-entry' },
      h('div', { class: 'jr-head' },
        h('span', { class: 'jr-session num' }, `S${e.session ?? '?'}`),
        h('div', { class: 'jr-titles' }, h('b', null, e.title || 'Untitled session'), h('span', { class: 'jr-date num' }, e.date || '')),
        earned ? h('span', { class: 'chip jr-earned' }, `+${earned} pp`) : null,
        change ? h('span', { class: 'btn-row no-print' },
          h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { editing = e.id; change(() => {}); } }, 'Edit'),
          h('button', { class: 'btn sm ghost danger', type: 'button', onClick: () => { if (confirm(`Remove session ${e.session} from the journal? Its timeline entry and the people it added go with it.`)) change((c) => removeJournalEntry(c, e.id)); } }, '✕')) : null),
      e.text ? h('p', { class: 'jr-text' }, e.text) : null,
      e.people?.length ? h('div', { class: 'jr-chips' }, e.people.map((p) => {
        const k = known.find((x) => String(x.name).toLowerCase() === p.name.toLowerCase());
        return h('button', { type: 'button', class: 'chip jr-chip', title: [p.who, p.status].filter(Boolean).join(' · ') || p.name, onClick: () => (k && onOpenPerson ? onOpenPerson(k, k.role ? (k.relation ? 'sibling' : 'parent') : 'person') : null) },
          p.name, p.relation || k?.relation ? h('small', null, ` · ${p.relation || k.relation}`) : null, p.status ? h('small', { class: 'jr-status' }, ` · ${p.status}`) : null);
      })) : null,
      spent.length ? h('ul', { class: 'jr-spent' }, spent.map((x) => h('li', null, h('b', null, `${x.points > 0 ? `−${x.points}` : `+${-x.points}`} pp`), ' ', (x.changes || []).join('; ') || x.note || ''))) : null,
      e.downtime ? h('p', { class: 'jr-downtime' }, h('b', null, 'Between adventures: '), e.downtime) : null);
  };

  const linkRow = spends.length && entries.length && change ? (() => {
    const sel = h('select', { 'aria-label': 'Spending to link' }, spends.map((x) => h('option', { value: x.id }, `${x.date || ''} ${x.points > 0 ? `−${x.points}` : `+${-x.points}`} pp: ${(x.changes || []).join('; ').slice(0, 70) || x.note}`)));
    const to = h('select', { 'aria-label': 'Session' }, entries.map((e) => h('option', { value: e.id }, `Session ${e.session}${e.title ? `: ${e.title}` : ''}`)));
    return h('div', { class: 'jr-link no-print' }, h('span', { class: 'label' }, 'Points spent, not yet tied to a session'), h('div', { class: 'add-row' }, sel, to, h('button', { class: 'btn sm', type: 'button', onClick: () => change((c) => linkPoints(c, sel.value, to.value)) }, 'Link')));
  })() : null;

  return h('section', { class: 'sec journal' },
    h('h3', null, 'Campaign journal', h('span', { class: 'pts' }, entries.length ? `${entries.length} session${entries.length === 1 ? '' : 's'}` : 'what happened in play')),
    h('p', { class: 'hint', style: { margin: '0 0 8px' } }, 'Each session joins the life timeline as "In play". People you name are added to their life, or have their status updated. Points the GM awards for a session are tied to it, and so is whatever they bought.'),
    change && editing !== 'new' ? h('div', { class: 'btn-row no-print', style: { marginBottom: '8px' } },
      h('button', { class: 'btn primary', type: 'button', id: 'jr-new', onClick: () => { editing = 'new'; change(() => {}); } }, '+ New session'),
      entries.length ? h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(journalText(ch))) ? 'Journal copied' : 'Copy failed') }, 'Copy journal') : null) : null,
    editing === 'new' ? form(null) : null,
    linkRow,
    entries.length ? h('div', { class: 'jr-list' }, entries.map(card)) : (editing !== 'new' ? h('p', { class: 'hint', style: { margin: 0 } }, 'No sessions yet. After a game, add what happened: it becomes part of their story.') : null));
}
