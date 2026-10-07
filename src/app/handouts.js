// Handouts on the table: wanted posters, case files, letters, texts and reports. Draft one from the
// World, dress it, save it as a page, print it, or send it as a key.

import { h, clear, toast, copyText, download, openDialog } from './dom.js';
import { readPictureFile, requestPainting, prefs as painterPrefs } from './portrait.js';
import { PORTRAIT_STYLES, portraitUrl, portraitOf } from '../engine/portrait.js';
import { HANDOUT_KINDS, newHandout, draftHandout, redactParts, ransomLetters, handoutTitle, handoutSummary, handoutId } from '../engine/handouts.js';
import { createEntity, addLink, handoutMarkdown } from '../engine/world.js';
import { encodeHandout, decodeHandout, handoutLink, keySize } from './share.js';
import { randomSeed } from '../engine/rng.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const paras = (t) => String(t || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);

/** The picture for a handout: the one set on it, else its subject's portrait. */
function pictureFor(hd, world) {
  if (hd.picture?.src) return hd.picture.src;
  const e = hd.subject && world?.entities?.get(hd.subject);
  const ch = e?.character;
  if (!ch) return null;
  const p = portraitOf(ch);
  if (p.hidden) return null;
  return (p.source === 'upload' && p.image) || p.avatar;
}

function redacted(text, reveal) {
  return redactParts(text).map((part) => (part.redacted ? h('span', { class: `ho-redact ${reveal ? 'reveal' : ''}`, title: reveal ? '' : 'Redacted' }, part.text) : part.text));
}

const lines = (t) => String(t || '').split(/\n/).map((x) => x.trim()).filter(Boolean);

// ---- renderers ------------------------------------------------------------------------------------------------

function wantedEl(hd, pic) {
  const f = hd.fields || {};
  return h('div', { class: 'ho-sheet' },
    h('div', { class: 'ho-banner' }, f.banner || 'WANTED'),
    f.sub ? h('div', { class: 'ho-sub' }, f.sub) : null,
    h('div', { class: 'ho-photo' }, pic ? h('img', { src: pic, alt: hd.title || '' }) : h('div', { class: 'ho-nophoto' }, 'NO PHOTOGRAPH ON FILE')),
    h('h2', { class: 'ho-name' }, hd.title || 'UNKNOWN'),
    f.aliases ? h('div', { class: 'ho-aliases' }, f.aliases) : null,
    h('div', { class: 'ho-facts' },
      f.description ? [h('b', null, 'Description'), h('span', null, f.description)] : null,
      f.crimes ? [h('b', null, 'Wanted for'), h('ul', null, lines(f.crimes).map((c) => h('li', null, c)))] : null,
      f.lastSeen ? [h('b', null, 'Last seen'), h('span', null, f.lastSeen)] : null,
      f.powers ? [h('b', null, 'Known abilities'), h('span', null, f.powers)] : null,
      f.threat ? [h('b', null, 'Threat'), h('span', null, f.threat)] : null),
    hd.body ? h('p', { class: 'ho-body' }, hd.body) : null,
    f.reward ? h('div', { class: 'ho-reward' }, h('span', null, 'REWARD'), h('b', null, f.reward)) : null,
    h('div', { class: 'ho-issued' }, [f.issuedBy, f.contact].filter(Boolean).join(' · ')));
}

function casefileEl(hd, pic, reveal) {
  const f = hd.fields || {};
  const row = (k, v, { list = false } = {}) => (v ? h('div', { class: 'ho-row' }, h('b', null, k), list ? h('ul', null, lines(v).map((x) => h('li', null, x))) : h('span', null, v)) : null);
  return h('div', { class: 'ho-folder' },
    h('div', { class: 'ho-tab' }, f.fileNo || 'FILE'),
    h('div', { class: 'ho-clip' }),
    h('div', { class: 'ho-stamp' }, f.classification || 'CLASSIFIED'),
    h('div', { class: 'ho-sheet' },
      h('div', { class: 'ho-head' }, h('div', null, h('div', { class: 'ho-eyebrow' }, 'Subject file'), h('h2', { class: 'ho-name' }, hd.title || 'UNKNOWN'), f.identity ? h('div', { class: 'ho-aliases' }, `Identity: ${f.identity}`) : null), h('div', { class: 'ho-mug' }, pic ? h('img', { src: pic, alt: '' }) : h('div', { class: 'ho-nophoto' }, 'NO IMAGE'), h('div', { class: 'ho-mug-lines' }))),
      h('div', { class: 'ho-grid' }, row('Status', f.status), row('Power level', f.powerLevel), row('Occupation', f.occupation), row('Base', f.base), row('Profile', f.archetype), row('Threat', f.threat)),
      row('Known abilities', f.powers, { list: true }), row('Known associates', f.associates), row('Adversaries', f.adversaries), row('Weaknesses and leverage', f.weaknesses, { list: true }),
      hd.body ? h('div', { class: 'ho-body' }, paras(hd.body).map((p) => h('p', null, redacted(p, reveal)))) : null,
      h('div', { class: 'ho-foot' }, `Compiled by ${f.agent || 'the agency'} · ${hd.date || ''}`)));
}

function letterEl(hd, pic, reveal) {
  const f = hd.fields || {};
  if (hd.look === 'ransom') {
    // Lines of words of cut-out letters: words stay whole, lines stay lines.
    const letters = ransomLetters(hd.body, hd.seed || 1);
    const linesOut = []; let words = []; let word = [];
    const flushWord = () => { if (word.length) words.push(h('span', { class: 'ho-word' }, word)); word = []; };
    const flushLine = () => { flushWord(); linesOut.push(h('div', { class: 'ho-ransom-line' }, words)); words = []; };
    for (const L of letters) { if (L.ch === '\n') flushLine(); else if (L.space) flushWord(); else word.push(h('span', { class: `ho-cut f${L.font} b${L.bg}`, style: { transform: `rotate(${L.rot}deg) scale(${L.scale})` } }, L.ch)); }
    flushLine();
    return h('div', { class: 'ho-sheet' }, h('div', { class: 'ho-ransom' }, linesOut),
      pic ? h('div', { class: 'ho-polaroid' }, h('img', { src: pic, alt: '' })) : null);
  }
  if (hd.look === 'telegram') {
    return h('div', { class: 'ho-sheet' },
      h('div', { class: 'ho-tg-head' }, h('b', null, 'CITY TELEGRAPH CO.'), h('span', null, 'TELEGRAM')),
      h('div', { class: 'ho-tg-meta' }, h('span', null, `TO: ${f.to || ''}`), h('span', null, `FROM: ${f.from || ''}`), h('span', null, hd.date || '')),
      h('div', { class: 'ho-tg-body' }, hd.body),
      h('div', { class: 'ho-tg-foot' }, 'CHARGES PREPAID · RECEIVED AT THE DOWNTOWN OFFICE'));
  }
  if (hd.look === 'memo') {
    return h('div', { class: 'ho-sheet' },
      h('div', { class: 'ho-memo-head' }, 'MEMORANDUM'),
      h('div', { class: 'ho-memo-meta' }, h('b', null, 'To:'), h('span', null, f.to || ''), h('b', null, 'From:'), h('span', null, f.from || ''), h('b', null, 'Date:'), h('span', null, hd.date || ''), h('b', null, 'Re:'), h('span', null, hd.title || '')),
      h('div', { class: 'ho-body' }, paras(hd.body).map((p) => h('p', null, redacted(p, reveal)))),
      pic ? h('div', { class: 'ho-attach' }, h('img', { src: pic, alt: '' }), h('span', null, 'Attachment')) : null);
  }
  return h('div', { class: 'ho-sheet' },
    f.place || hd.date ? h('div', { class: 'ho-letter-top' }, [f.place, hd.date].filter(Boolean).join(', ')) : null,
    h('div', { class: 'ho-body' }, paras(hd.body).map((p) => h('p', null, redacted(p, reveal)))),
    pic ? h('div', { class: 'ho-polaroid' }, h('img', { src: pic, alt: '' })) : null);
}

function textsEl(hd) {
  const f = hd.fields || {};
  return h('div', { class: 'ho-phone' },
    h('div', { class: 'ho-phone-status' }, h('span', null, f.when || ''), h('span', null, '●●●  ▮')),
    h('div', { class: 'ho-phone-contact' }, h('span', { class: 'ho-avatar' }, (f.them || '?').slice(0, 1)), h('b', null, f.them || 'Unknown number')),
    h('div', { class: 'ho-thread' }, (hd.lines || []).map((l) => h('div', { class: `ho-bubble ${l.side === 'me' ? 'me' : 'them'}` }, h('span', null, l.text), l.time ? h('small', null, l.time) : null))),
    h('div', { class: 'ho-phone-input' }, h('span', null, 'Message'), h('b', null, '↑')));
}

function reportEl(hd, pic, reveal) {
  const f = hd.fields || {};
  return h('div', { class: 'ho-sheet' },
    h('div', { class: 'ho-report-head' }, h('div', null, h('div', { class: 'ho-eyebrow' }, HANDOUT_KINDS.report.looks[hd.look] || 'Report'), h('h2', { class: 'ho-name' }, hd.title || 'Report')), h('div', { class: 'ho-class' }, f.classification || 'CONFIDENTIAL')),
    h('div', { class: 'ho-grid' }, f.refNo ? h('div', { class: 'ho-row' }, h('b', null, 'Ref.'), h('span', null, f.refNo)) : null, f.subject ? h('div', { class: 'ho-row' }, h('b', null, 'Subject'), h('span', null, f.subject)) : null, f.author ? h('div', { class: 'ho-row' }, h('b', null, 'Author'), h('span', null, f.author)) : null, f.location ? h('div', { class: 'ho-row' }, h('b', null, 'Location'), h('span', null, f.location)) : null, hd.date ? h('div', { class: 'ho-row' }, h('b', null, 'Date'), h('span', null, hd.date)) : null),
    pic ? h('div', { class: 'ho-exhibit' }, h('img', { src: pic, alt: '' }), h('span', null, hd.picture?.caption || 'Exhibit A')) : null,
    h('div', { class: 'ho-body' }, paras(hd.body).map((p) => h('p', null, redacted(p, reveal)))),
    h('div', { class: 'ho-foot' }, 'Page 1 of 1 · Unauthorised disclosure is an offence'));
}

/** The handout as DOM. reveal shows what the black bars hide (the GM's view). */
export function renderHandout(hd, { world = null, reveal = false } = {}) {
  const pic = pictureFor(hd, world);
  const kind = HANDOUT_KINDS[hd.kind] ? hd.kind : 'wanted';
  const inner = kind === 'wanted' ? wantedEl(hd, pic) : kind === 'casefile' ? casefileEl(hd, pic, reveal) : kind === 'letter' ? letterEl(hd, pic, reveal) : kind === 'texts' ? textsEl(hd) : reportEl(hd, pic, reveal);
  return h('div', { class: `ho ho-${kind} ho-look-${hd.look || 'default'}` }, inner);
}

export function printHandout(hd, world) {
  const host = h('div', { class: 'ho-print-host' }, renderHandout(hd, { world }));
  document.body.append(host);
  document.body.classList.add('np-printing');
  let done = false;
  const finish = () => { if (done) return; done = true; host.remove(); document.body.classList.remove('np-printing'); };
  window.addEventListener('afterprint', finish, { once: true });
  setTimeout(() => { window.print(); setTimeout(finish, 500); }, 60);
}

// ---- saving ---------------------------------------------------------------------------------------------------

export function saveHandout(ctx, hd, id = null) {
  const { saved } = ctx;
  const name = handoutTitle(hd);
  const summary = handoutSummary(hd);
  const fields = { Kind: HANDOUT_KINDS[hd.kind]?.label || hd.kind, Look: HANDOUT_KINDS[hd.kind]?.looks?.[hd.look] || hd.look };
  if (hd.date) fields.Date = hd.date;
  if (hd.session != null && hd.session !== '') fields.Session = hd.session;
  let e;
  if (id && saved.entities[id]) { e = saved.entities[id]; Object.assign(e, { name, summary, fields, handout: clone(hd), updated: new Date().toISOString() }); }
  else { e = createEntity(saved, { type: 'handout', name, summary, fields, tags: ['handout', hd.kind] }); e.handout = clone(hd); }
  e.date = hd.date || '';
  e.session = hd.session != null && hd.session !== '' ? Number(hd.session) : null;
  saved.links = (saved.links || []).filter((l) => !(l.from === e.id && l.rel === 'involves'));
  for (const to of new Set([hd.subject, ...(hd.people || [])].filter(Boolean))) addLink(saved, { from: e.id, to, rel: 'involves' });
  ctx.save();
  return e.id;
}

export function importHandout(ctx, hd) {
  const id = saveHandout(ctx, hd, null);
  toast(`${handoutTitle(hd)} added to your handouts`);
  ctx.go(id);
  return id;
}

export function startHandout(ctx, hd) {
  ctx.ui.hdraft = hd; ctx.ui.hdraftId = null; ctx.go('handout-edit');
}
export function editHandout(ctx, e) { ctx.ui.hdraft = clone(e.handout); ctx.ui.hdraftId = e.id; ctx.go('handout-edit'); }

/** Pick a kind and who it is about, then draft or start blank. */
export async function newHandoutDialog(ctx, { kind = 'wanted', a = null } = {}) {
  const { world } = ctx;
  const pages = [...world.entities.values()].filter((e) => !['paper', 'handout'].includes(e.type)).sort((x, y) => (y.character ? 1 : 0) - (x.character ? 1 : 0) || x.name.localeCompare(y.name));
  const kindSel = h('select', { 'aria-label': 'Kind' }, Object.entries(HANDOUT_KINDS).map(([k, K]) => h('option', { value: k, selected: k === kind }, `${K.glyph} ${K.label}`)));
  const lookSel = h('select', { 'aria-label': 'Look' });
  const aSel = h('select', { 'aria-label': 'About' }, h('option', { value: '' }, '(no one in particular)'), pages.map((e) => h('option', { value: e.id, selected: a === e.id }, `${e.name}${e.character ? ` · PL ${e.character.pl}${e.character.alignment === 'villain' ? ' villain' : ''}` : ''}`)));
  const bSel = h('select', { 'aria-label': 'To' }, h('option', { value: '' }, '(someone)'), pages.filter((e) => e.type === 'person').map((e) => h('option', { value: e.id }, e.name)));
  const blurb = h('p', { class: 'hint', style: { margin: 0 } });
  const bRow = h('label', { class: 'field' }, h('span', null, 'To / with'), bSel);
  const refresh = () => {
    const K = HANDOUT_KINDS[kindSel.value];
    clear(lookSel).append(...Object.entries(K.looks).map(([k, v]) => h('option', { value: k }, v)));
    blurb.textContent = K.blurb;
    bRow.hidden = !['letter', 'texts'].includes(kindSel.value);
    aSel.previousSibling.textContent = kindSel.value === 'letter' ? 'From' : kindSel.value === 'texts' ? 'Phone of' : 'About';
  };
  kindSel.addEventListener('change', refresh);
  const body = [h('label', { class: 'field' }, h('span', null, 'Kind'), kindSel), blurb, h('label', { class: 'field' }, h('span', null, 'About'), aSel), bRow, h('label', { class: 'field' }, h('span', null, 'Look'), lookSel)];
  refresh();
  const ok = await openDialog({ title: 'New handout', body, buttons: [{ label: 'Cancel', value: false }, { label: 'Start blank', value: 'blank' }, { label: 'Draft it', value: 'draft', primary: true }] });
  if (!ok) return;
  const A = aSel.value ? world.entities.get(aSel.value) : null;
  const B = bSel.value ? world.entities.get(bSel.value) : null;
  let hd;
  if (ok === 'draft') hd = draftHandout(world, kindSel.value, { a: A, b: B, seed: randomSeed(), look: lookSel.value });
  else { hd = newHandout(kindSel.value); hd.subject = A?.id || null; hd.people = [A?.id, B?.id].filter(Boolean); hd.title = A ? (kindSel.value === 'letter' ? `${A.name} to ${B?.name || ''}` : A.name) : ''; }
  if (ok === 'draft' && ['wanted', 'casefile', 'report'].includes(kindSel.value) && lookSel.value && HANDOUT_KINDS[kindSel.value].looks[lookSel.value]) hd.look = lookSel.value;
  if (ok === 'blank') hd.look = lookSel.value;
  startHandout(ctx, hd);
}

// ---- pages -------------------------------------------------------------------------------------------------------

export function handoutsPage(ctx) {
  const { world, go } = ctx;
  const list = [...world.entities.values()].filter((e) => e.type === 'handout' && e.handout).sort((a, b) => String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || '')));
  const keyIn = h('input', { type: 'text', placeholder: 'Paste a handout key (DCUH1…) or link', 'aria-label': 'Handout key' });
  const openKey = async () => { const v = keyIn.value.trim(); if (!v) return; try { importHandout(ctx, await decodeHandout(v)); } catch (e) { toast(e.message); } };
  const quick = (k) => h('button', { type: 'button', class: 'wd-quick', title: HANDOUT_KINDS[k].blurb, onClick: () => newHandoutDialog(ctx, { kind: k }) }, h('span', { class: 'wd-quick-glyph' }, HANDOUT_KINDS[k].glyph), h('b', null, HANDOUT_KINDS[k].label), h('small', null, HANDOUT_KINDS[k].blurb));
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero small ho-hero' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Handouts'), h('h1', null, 'Props for the table'), h('p', { class: 'wd-tagline' }, 'Wanted posters, case files, letters, ransom notes, telegrams, memos, phone screens and redacted reports. Drafted from the World (a page\'s ties, complications and what happened to them) or written by hand; saved as pages, printed, or sent as a key.')),
      h('button', { class: 'btn primary', type: 'button', onClick: () => newHandoutDialog(ctx) }, '+ New handout')),
    h('div', { class: 'wd-quicks' }, Object.keys(HANDOUT_KINDS).map(quick)),
    list.length ? h('div', { class: 'ho-stand' }, list.map((e) => h('div', { class: 'ho-card' },
      h('div', { class: 'ho-thumb', role: 'button', tabindex: 0, onClick: () => go(e.id), onKeydown: (ev) => { if (ev.key === 'Enter') go(e.id); } }, renderHandout(e.handout, { world })),
      h('div', { class: 'np-card-text' }, h('b', null, e.handout.title || HANDOUT_KINDS[e.handout.kind]?.label), h('span', null, [HANDOUT_KINDS[e.handout.kind]?.label, e.handout.date, e.session != null ? `Session ${e.session}` : null].filter(Boolean).join(' · ')), h('small', null, handoutSummary(e.handout)),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', type: 'button', onClick: () => go(e.id) }, 'Open'), h('button', { class: 'btn sm ghost', type: 'button', onClick: () => editHandout(ctx, e) }, 'Edit'), h('button', { class: 'btn sm ghost', type: 'button', onClick: () => printHandout(e.handout, world) }, 'Print')))))) :
      h('div', { class: 'empty' }, h('h2', null, 'Nothing on the table yet'), h('p', null, 'Pick a kind above. A wanted poster for your villain takes one click.')),
    h('section', { class: 'panel', style: { marginTop: '8px' } }, h('h2', null, '🔑 Open a handout key'), h('div', { class: 'seed-row' }, keyIn, h('button', { class: 'btn', type: 'button', onClick: openKey }, 'Open'))));
}

export function handoutPage(ctx, e) {
  const { go, saved, world } = ctx;
  const hd = e.handout;
  const share = async (what) => {
    try { const key = await encodeHandout({ ...hd, picture: hd.picture?.src ? hd.picture : null }); const ok = await copyText(what === 'link' ? handoutLink(key) : key); toast(ok ? `${what === 'link' ? 'Link' : 'Key'} copied (${keySize(key)}). It opens from the Forge's "Open a key" box.` : 'Copy failed'); } catch (err) { toast(`Sharing needs a modern browser: ${err.message}`); }
  };
  const hasRedactions = /\[\[/.test(hd.body || '');
  const sheet = h('div', { class: 'ho-sheet-host' });
  const draw = () => clear(sheet).append(renderHandout(hd, { world, reveal: !!ctx.ui.reveal }));
  draw();
  const actions = h('div', { class: 'toolbar wd-actions no-print' },
    ctx.ui.history.length ? h('button', { class: 'btn', type: 'button', onClick: ctx.back }, '← Back') : null,
    h('button', { class: 'btn primary', type: 'button', onClick: () => editHandout(ctx, e) }, '✎ Edit'),
    hasRedactions ? h('button', { class: 'btn', type: 'button', 'aria-pressed': String(!!ctx.ui.reveal), title: 'Show what the black bars hide (the GM\'s view)', onClick: () => { ctx.ui.reveal = !ctx.ui.reveal; ctx.renderWorld(); } }, ctx.ui.reveal ? '🙈 Hide redactions' : '👁 Reveal redactions') : null,
    h('button', { class: 'btn', type: 'button', onClick: () => printHandout(hd, world) }, '🖨 Print / PDF'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', onClick: () => share('key') }, '🔑 Copy key'),
    h('button', { class: 'btn', type: 'button', onClick: () => share('link') }, '🔗 Copy link'),
    h('button', { class: 'btn ghost', type: 'button', onClick: async () => toast((await copyText(handoutMarkdown(hd))) ? 'Copied as Markdown' : 'Copy failed') }, 'Copy as Markdown'),
    h('button', { class: 'btn ghost', type: 'button', onClick: () => { download(`${(hd.title || hd.kind).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${hd.kind}.json`, JSON.stringify({ app: 'DCUGen', kind: 'handout', v: 1, handout: hd }, null, 2), 'application/json'); toast('Handout saved as a file'); } }, 'Save file'),
    h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => {
      const ok = await openDialog({ title: `Remove this ${HANDOUT_KINDS[hd.kind]?.label.toLowerCase() || 'handout'}?`, body: h('p', { style: { margin: 0 } }, 'It is deleted from the World.'), buttons: [{ label: 'Keep', value: false }, { label: 'Remove', value: true, danger: true }] });
      if (ok) { delete saved.entities[e.id]; saved.links = (saved.links || []).filter((l) => l.from !== e.id && l.to !== e.id); ctx.save(); go('handouts'); }
    } }, 'Remove'));
  const about = e.connections?.filter((c) => c.rel === 'involves').map((c) => c.other) || [];
  return h('div', { class: 'wd-page ho-view' },
    h('header', { class: 'wd-hero small ho-hero' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, `${HANDOUT_KINDS[hd.kind]?.label || 'Handout'}${e.session != null ? ` · Session ${e.session}` : ''}`), h('h1', null, hd.title || 'Untitled'), h('p', { class: 'wd-tagline' }, [HANDOUT_KINDS[hd.kind]?.looks?.[hd.look], hd.date].filter(Boolean).join(' · ')))),
    actions, sheet,
    about.length ? h('section', { class: 'sec' }, h('h3', null, 'Who it is about'), h('div', { class: 'wd-chips' }, about.map((o) => h('button', { type: 'button', class: 'wd-chip', style: { '--c': o.color || '#888' }, onClick: () => go(o.id) }, o.name)))) : null);
}

// ---- the editor --------------------------------------------------------------------------------------------------

const FIELD_LABELS = {
  wanted: [['banner', 'Banner (WANTED / MISSING)'], ['sub', 'Line under the banner'], ['aliases', 'Aliases'], ['description', 'Description'], ['crimes', 'Wanted for (one per line)', true], ['lastSeen', 'Last seen'], ['powers', 'Known abilities'], ['threat', 'Threat'], ['reward', 'Reward'], ['issuedBy', 'Issued by'], ['contact', 'Contact line']],
  casefile: [['fileNo', 'File number'], ['classification', 'Stamp'], ['status', 'Status'], ['identity', 'Identity'], ['occupation', 'Occupation'], ['base', 'Base'], ['archetype', 'Profile'], ['powerLevel', 'Power level'], ['threat', 'Threat'], ['powers', 'Known abilities (one per line)', true], ['associates', 'Known associates'], ['adversaries', 'Adversaries'], ['weaknesses', 'Weaknesses and leverage (one per line)', true], ['agent', 'Compiled by']],
  letter: [['from', 'From'], ['to', 'To'], ['place', 'Written at'], ['signoff', 'Sign-off']],
  texts: [['me', 'This phone belongs to'], ['them', 'The other person'], ['when', 'When (the status bar)']],
  report: [['refNo', 'Reference'], ['classification', 'Classification'], ['subject', 'Subject'], ['author', 'Author'], ['location', 'Location']],
};
const BODY_LABEL = { wanted: 'A line about them (optional)', casefile: 'Notes ([[double brackets]] redact)', letter: 'The letter', texts: null, report: 'The report ([[double brackets]] redact)' };

export function handoutEditorPage(ctx) {
  const { world, go } = ctx;
  if (!ctx.ui.hdraft) ctx.ui.hdraft = newHandout('wanted');
  const d = ctx.ui.hdraft;
  d.fields = d.fields || {}; d.lines = d.lines || []; d.people = d.people || [];
  const K = HANDOUT_KINDS[d.kind] || HANDOUT_KINDS.wanted;
  const preview = h('div', { class: 'ho-preview' });
  let raf = 0;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { clear(preview).append(renderHandout(d, { world, reveal: !!ctx.ui.reveal })); }); };
  const form = h('div', { class: 'np-form' });
  const field = (label, input) => h('label', { class: 'field' }, h('span', null, label), input);
  const text = (obj, key, { placeholder = '', label = '', area = false, rows = 3 } = {}) => (area
    ? h('textarea', { placeholder, 'aria-label': label || placeholder, rows, onInput: (ev) => { obj[key] = ev.target.value; redraw(); } }, obj[key] || '')
    : h('input', { type: 'text', value: obj[key] || '', placeholder, 'aria-label': label || placeholder, onInput: (ev) => { obj[key] = ev.target.value; redraw(); } }));

  const pages = [...world.entities.values()].filter((e) => !['paper', 'handout'].includes(e.type));
  const subjectSel = h('select', { 'aria-label': 'Subject', onChange: (ev) => { d.subject = ev.target.value || null; if (d.subject && !d.people.includes(d.subject)) d.people.push(d.subject); redraw(); } }, h('option', { value: '' }, '(no one)'), pages.map((e) => h('option', { value: e.id, selected: d.subject === e.id }, e.name)));
  const lookSel = h('select', { 'aria-label': 'Look', onChange: (ev) => { d.look = ev.target.value; redraw(); } }, Object.entries(K.looks).map(([k, v]) => h('option', { value: k, selected: d.look === k }, v)));
  const session = h('input', { type: 'number', min: 0, step: 1, value: d.session ?? '', placeholder: 'none', 'aria-label': 'Session', onInput: (ev) => { d.session = ev.target.value === '' ? null : Number(ev.target.value); } });

  function pictureTools() {
    const box = h('div', { class: 'np-pic-tools' });
    const status = h('small', { class: 'np-pic-status' });
    const set = (src) => { d.picture = { ...(d.picture || { caption: '' }), src }; redraw(); drawPic(); };
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: async (ev) => { const f = ev.target.files?.[0]; if (!f) return; try { set(await readPictureFile(f, { width: 480, height: 600 })); } catch (err) { toast(err.message); } } });
    let cancelled = false;
    const paint = async () => {
      const style = PORTRAIT_STYLES[painterPrefs.style] || PORTRAIT_STYLES.comic;
      const subj = d.subject && world.entities.get(d.subject);
      const ta = h('textarea', { rows: 4, style: { width: '100%' } }, `${d.kind === 'wanted' || d.kind === 'casefile' ? 'mugshot photograph, head and shoulders, plain background' : 'evidence photograph'}: ${subj?.name || d.title || 'a mysterious figure'}${subj?.summary ? `. ${subj.summary.split(/(?<=[.!?])\s/)[0]}` : ''}, ${style.suffix}`);
      const ok = await openDialog({ title: 'Paint a picture', body: [h('label', { class: 'field' }, h('span', null, 'Prompt'), ta)], buttons: [{ label: 'Cancel', value: false }, { label: 'Paint', value: true, primary: true }] });
      if (!ok) return;
      cancelled = false;
      const prompt = ta.value.trim(); const seed = Math.floor(Math.random() * 1e9);
      const job = painterPrefs.service === 'horde' ? { service: 'horde', prompt, seed, models: style.horde } : { service: 'pollinations', url: portraitUrl(prompt, { seed }) };
      status.textContent = 'Queued for painting…';
      const r = await requestPainting(job, { onWait: (ms) => { status.textContent = ms > 800 ? `Painting in ${Math.ceil(ms / 1000)}s…` : 'Painting…'; }, onStatus: (t) => { status.textContent = t; }, cancelled: () => cancelled });
      if (r.ok && r.image) { set(r.image); status.textContent = 'Painted.'; } else if (r.ok && r.live && job.url) { set(job.url); status.textContent = 'Painted (shown from the service).'; } else status.textContent = `Could not paint: ${r.why || 'unknown'}`;
    };
    const drawPic = () => {
      const auto = !d.picture?.src && pictureFor(d, world);
      clear(box).append(
        h('div', { class: 'np-pic-row' },
          d.picture?.src || auto ? h('img', { class: 'np-pic-preview', src: d.picture?.src || auto, alt: '' }) : h('div', { class: 'np-pic-preview empty' }, 'No picture'),
          h('div', { class: 'np-pic-btns' },
            auto ? h('small', { class: 'np-pic-status' }, 'Using the subject\'s portrait. Upload or paint to replace it.') : null,
            h('button', { class: 'btn sm', type: 'button', onClick: () => file.click() }, '⇪ Upload'),
            h('button', { class: 'btn sm', type: 'button', onClick: paint }, '🎨 Paint it'),
            d.picture?.src ? h('button', { class: 'btn sm ghost danger', type: 'button', onClick: () => { d.picture = null; redraw(); drawPic(); } }, 'Remove') : null,
            status, file)),
        d.picture?.src && d.kind === 'report' ? field('Caption', text(d.picture, 'caption', { placeholder: 'Exhibit A' })) : null);
    };
    drawPic();
    return h('div', { class: 'field' }, h('span', null, 'Picture'), box);
  }

  function linesEditor() {
    const list = h('div', { class: 'ho-lines' });
    const draw = () => {
      clear(list).append(d.lines.map((l, i) => h('div', { class: 'ho-line-row' },
        h('button', { type: 'button', class: `btn sm ${l.side === 'me' ? 'primary' : ''}`, title: 'Who sent it', onClick: () => { l.side = l.side === 'me' ? 'them' : 'me'; redraw(); draw(); } }, l.side === 'me' ? d.fields.me || 'Me' : d.fields.them || 'Them'),
        h('input', { type: 'text', value: l.text, 'aria-label': 'Message', style: { flex: 1 }, onInput: (ev) => { l.text = ev.target.value; redraw(); } }),
        h('input', { type: 'text', value: l.time || '', placeholder: '23:14', 'aria-label': 'Time', style: { width: '70px' }, onInput: (ev) => { l.time = ev.target.value; redraw(); } }),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Remove message', onClick: () => { d.lines.splice(i, 1); redraw(); draw(); } }, '✕'))),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', type: 'button', onClick: () => { d.lines.push({ side: d.lines.at(-1)?.side === 'me' ? 'them' : 'me', text: '', time: '' }); redraw(); draw(); } }, '+ Message')));
    };
    draw();
    return h('div', { class: 'field' }, h('span', null, 'Messages'), list);
  }

  const kindFields = (FIELD_LABELS[d.kind] || []).map(([k, label, multi]) => field(label, text(d.fields, k, { placeholder: '', label, area: !!multi, rows: 3 })));
  form.append(
    h('section', { class: 'sec np-sec' }, h('h3', null, K.label, h('span', { class: 'pts' }, 'look and who')),
      h('div', { class: 'jr-row' }, field('Title / name', text(d, 'title', { placeholder: 'Name on the poster' })), field('Look', lookSel)),
      h('div', { class: 'jr-row' }, field(d.kind === 'letter' ? 'From (page)' : 'About (page)', subjectSel), field('Date', text(d, 'date', { placeholder: 'June 3' })), field('Session', session)),
      d.kind !== 'texts' ? pictureTools() : null),
    h('section', { class: 'sec np-sec' }, h('h3', null, 'Details'), kindFields,
      d.kind === 'texts' ? linesEditor() : null,
      BODY_LABEL[d.kind] ? field(BODY_LABEL[d.kind], text(d, 'body', { placeholder: '', label: 'Body', area: true, rows: d.kind === 'letter' ? 10 : 6 })) : null,
      ['casefile', 'report', 'letter'].includes(d.kind) && d.look !== 'ransom' ? h('p', { class: 'hint', style: { margin: 0 } }, 'Wrap a passage in [[double brackets]] to redact it. The GM can reveal the black bars on the saved page; the printed copy keeps them.') : null,
      d.kind === 'letter' && d.look === 'ransom' ? h('p', { class: 'hint', style: { margin: 0 } }, 'Every letter is cut from a different magazine. Keep it short and shouty.') : null,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn sm ghost', type: 'button', title: 'Draft the text again from the World', onClick: () => { const A = d.subject ? world.entities.get(d.subject) : null; const B = d.people.map((id) => world.entities.get(id)).find((e) => e && e.id !== d.subject) || null; const fresh = draftHandout(world, d.kind, { a: A, b: B, seed: randomSeed(), look: d.look }); Object.assign(d, { fields: fresh.fields, body: fresh.body, lines: fresh.lines, title: d.title || fresh.title }); ctx.renderWorld(); } }, '⚡ Redraft the words'))));
  redraw();
  const saveIt = () => { if (!d.title?.trim() && !d.body?.trim() && !d.lines.length) { toast('Give it a title or some text'); return; } const id = saveHandout(ctx, d, ctx.ui.hdraftId); ctx.ui.hdraft = null; ctx.ui.hdraftId = null; toast('Handout saved to the World'); go(id, { replace: true }); };
  const cancel = async () => { const ok = await openDialog({ title: 'Leave the editor?', body: h('p', { style: { margin: 0 } }, 'Changes since the last save are lost.'), buttons: [{ label: 'Stay', value: false }, { label: 'Leave', value: true, danger: true }] }); if (ok) { ctx.ui.hdraft = null; go(ctx.ui.hdraftId || 'handouts', { replace: true }); } };
  return h('div', { class: 'wd-page np-editor' },
    h('header', { class: 'wd-hero small ho-hero' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, ctx.ui.hdraftId ? 'Editing' : 'New handout'), h('h1', null, d.title || K.label), h('p', { class: 'wd-tagline' }, K.blurb)),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onClick: saveIt }, '💾 Save to the World'), h('button', { class: 'btn', type: 'button', onClick: () => printHandout(d, world) }, '🖨 Print'), h('button', { class: 'btn ghost', type: 'button', onClick: cancel }, 'Cancel'))),
    h('div', { class: 'np-editor-grid' }, form, h('div', { class: 'np-preview-col' }, preview)),
    h('div', { class: 'np-savebar no-print' }, h('button', { class: 'btn primary', type: 'button', onClick: saveIt }, '💾 Save to the World'), h('button', { class: 'btn ghost', type: 'button', onClick: cancel }, 'Cancel')));
}

export { handoutId };
