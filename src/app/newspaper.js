// The newsstand: front pages of the campaign's newspapers. Write one by hand, draft one from the
// timeline, dress it with pictures and adverts, pick a layout, then save it to the World, print it,
// or hand it to the players as a key or link.

import { h, clear, toast, copyText, download, openDialog } from './dom.js';
import { state } from './store.js';
import { readPictureFile, requestPainting, prefs as painterPrefs } from './portrait.js';
import { PORTRAIT_STYLES, portraitUrl, portraitOf } from '../engine/portrait.js';
import { PAPER_LAYOUTS, PHOTO_STYLES, STORY_SLOTS, PAPER_INKS, AD_STYLES, newPaper, draftPaper, blankStory, fillerStory, storyFromTimeline, rollAd, blankAd, paperSummary, paperName, paperMarkdown } from '../engine/newspaper.js';
import { createEntity, addLink, campaignTimeline } from '../engine/world.js';
import { encodePaper, decodePaper, paperLink, keySize } from './share.js';
import { makeRng, randomSeed } from '../engine/rng.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const PAPER_W = 980;

// ---- the printed page -------------------------------------------------------------------------------------

function paragraphs(text) { return String(text || '').split(/\n{2,}|\n/).map((t) => t.trim()).filter(Boolean); }

function storyEl(s, { world, go, interactive, lead }) {
  const paras = paragraphs(s.body);
  const about = interactive && world ? (s.about || []).map((id) => world.entities.get(id)).filter(Boolean) : [];
  return h('article', { class: `np-story np-${s.slot || 'brief'} ${s.image?.src ? 'has-photo' : ''}` },
    s.kicker ? h('div', { class: 'np-kicker' }, s.kicker) : null,
    h(lead ? 'h2' : 'h3', { class: 'np-headline' }, s.headline || 'Untitled'),
    s.deck ? h('p', { class: 'np-deck' }, s.deck) : null,
    s.byline || s.dateline ? h('div', { class: 'np-byline' }, s.byline ? h('span', null, s.byline) : null, s.dateline ? h('span', { class: 'np-dateline' }, s.dateline) : null) : null,
    s.image?.src ? h('figure', { class: 'np-photo' }, h('div', { class: 'np-photo-frame' }, h('img', { src: s.image.src, alt: s.image.caption || s.headline || '' })),
      s.image.caption || s.image.credit ? h('figcaption', null, s.image.caption || '', s.image.credit ? h('span', { class: 'np-credit' }, ` ${s.image.credit}`) : null) : null) : null,
    paras.length ? h('div', { class: 'np-text' }, paras.map((t, i) => h('p', { class: i === 0 ? 'first' : '' }, t))) : null,
    about.length ? h('div', { class: 'np-about no-print' }, 'In the World: ', about.map((e) => h('button', { type: 'button', class: 'np-about-link', onClick: () => go?.(e.id) }, e.name))) : null);
}

function adEl(a) {
  return h('div', { class: `np-ad np-ad-${a.style || 'box'}` }, a.tag ? h('div', { class: 'np-ad-tag' }, a.tag) : null, a.title ? h('div', { class: 'np-ad-title' }, a.title) : null, a.text ? h('div', { class: 'np-ad-text' }, a.text) : null);
}

/** The front page as DOM. interactive adds "In the World" links under stories (hidden in print). */
export function renderPaper(paper, { world = null, go = null, interactive = false } = {}) {
  const p = paper;
  const stories = p.stories || [];
  const lead = stories.find((s) => s.slot === 'lead') || stories[0] || null;
  const rest = stories.filter((s) => s !== lead);
  const seconds = rest.filter((s) => s.slot === 'second' || (s.slot === 'lead'));
  const sidebars = rest.filter((s) => s.slot === 'sidebar');
  const briefs = rest.filter((s) => s.slot === 'brief' || !STORY_SLOTS[s.slot]);
  const ads = p.ads || [];
  const boxAds = ads.filter((a) => a.style === 'box');
  const banners = ads.filter((a) => a.style === 'banner');
  const classifieds = ads.filter((a) => a.style === 'classified');
  const opts = { world, go, interactive };
  const layout = PAPER_LAYOUTS[p.layout] ? p.layout : 'broadsheet';
  const el = h('div', { class: `np np-${layout} np-photo-${PHOTO_STYLES[p.photoStyle] ? p.photoStyle : 'newsprint'}`, style: { '--np-ink': p.ink || PAPER_INKS[0] } },
    h('header', { class: 'np-head' },
      h('div', { class: 'np-ears' },
        h('div', { class: 'np-ear' }, p.ears?.left || ''),
        h('div', { class: 'np-title' },
          h('div', { class: 'np-city' }, [p.city, p.edition].filter(Boolean).join(' · ')),
          h('h1', { class: 'np-masthead' }, p.masthead || 'The Paper'),
          p.slogan ? h('div', { class: 'np-slogan' }, p.slogan) : null),
        h('div', { class: 'np-ear right' }, p.ears?.right || '')),
      h('div', { class: 'np-bar' }, h('span', null, p.volume || ''), h('span', null, p.date || ''), h('span', null, p.price || ''))),
    layout === 'extra' ? h('div', { class: 'np-banner' }, 'EXTRA! ', h('span', null, 'EXTRA!')) : null,
    layout === 'tabloid' ? h('div', { class: 'np-ribbon' }, 'EXCLUSIVE') : null,
    layout === 'comic' ? h('div', { class: 'np-burst', style: { clipPath: burst(16) } }, h('span', null, 'EXTRA!')) : null,
    h('div', { class: 'np-body' },
      lead ? storyEl(lead, { ...opts, lead: true }) : h('div', { class: 'np-story np-lead np-empty' }, h('h2', { class: 'np-headline' }, 'NOTHING HAPPENED TODAY'), h('p', { class: 'np-deck' }, 'Add a story, or draft the page from the campaign.')),
      h('div', { class: 'np-col' }, seconds.map((s) => storyEl(s, opts)), sidebars.map((s) => storyEl(s, opts)), boxAds.slice(0, 2).map(adEl)),
      briefs.length || boxAds.length > 2 ? h('div', { class: 'np-briefs' }, briefs.map((s) => storyEl(s, opts)), boxAds.slice(2).map(adEl)) : null),
    banners.length || classifieds.length ? h('footer', { class: 'np-foot' },
      banners.map(adEl),
      classifieds.length ? h('div', { class: 'np-classifieds' }, h('div', { class: 'np-ad-tag' }, 'CLASSIFIEDS'), classifieds.map((a) => h('span', { class: 'np-classified' }, h('b', null, a.title ? `${a.title}. ` : ''), a.text))) : null) : null,
    h('div', { class: 'np-colophon' }, `${p.masthead || 'The Paper'} · ${p.city || ''} · continued inside`));
  fitMasthead(el);
  return el;
}

/** Shrink the masthead until the paper's name sits on one line (down to a floor), once the page is in the document. */
function fitMasthead(el, tries = 0) {
  const m = el.querySelector('.np-masthead');
  if (!m) return;
  if (!el.isConnected) { if (tries < 30) requestAnimationFrame(() => fitMasthead(el, tries + 1)); return; }
  m.style.fontSize = '';
  const start = parseFloat(getComputedStyle(m).fontSize) || 54;
  let size = start;
  const set = () => { m.style.fontSize = `${size}px`; };
  const lineHeight = () => parseFloat(getComputedStyle(m).lineHeight) || size;
  const fits = (lines) => m.scrollWidth <= m.clientWidth + 1 && m.offsetHeight <= lineHeight() * (lines + 0.6);
  // One line, shrinking a little; a long name gets two lines at a size that still shouts.
  while (size > start * 0.66 && !fits(1)) { size *= 0.95; set(); }
  if (!fits(1)) { size = start; set(); while (size > start * 0.5 && !fits(2)) { size *= 0.95; set(); } }
}

function burst(n) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? 36 : 50; const a = (Math.PI * i) / n; pts.push(`${(50 + r * Math.cos(a)).toFixed(1)}% ${(50 + r * Math.sin(a)).toFixed(1)}%`); }
  return `polygon(${pts.join(', ')})`;
}

/** Scale a full-width page down to fit its box (thumbnails and the editor preview); the box takes the scaled height. */
function fitInto(box, inner, { maxRatio = null } = {}) {
  const fit = () => {
    const s = box.clientWidth / PAPER_W; if (!s) return;
    inner.style.transform = `scale(${s})`;
    const hgt = inner.offsetHeight * s;
    box.style.height = `${maxRatio ? Math.min(hgt, box.clientWidth * maxRatio) : hgt}px`;
  };
  requestAnimationFrame(fit);
  if (typeof ResizeObserver !== 'undefined') { new ResizeObserver(fit).observe(box); new ResizeObserver(fit).observe(inner); }
  return fit;
}

/** A scaled-down page for cards. */
export function paperThumb(paper, onClick) {
  const inner = renderPaper(paper);
  const box = h('div', { class: 'np-thumb', role: onClick ? 'button' : null, tabindex: onClick ? 0 : null, onClick, onKeydown: onClick ? (e) => { if (e.key === 'Enter') onClick(); } : null }, inner);
  fitInto(box, inner, { maxRatio: 1.15 });
  return box;
}

/** Print just the page. */
export function printPaper(paper) {
  const host = h('div', { class: 'np-print-host' }, renderPaper(paper));
  document.body.append(host);
  document.body.classList.add('np-printing');
  let done = false;
  const finish = () => { if (done) return; done = true; host.remove(); document.body.classList.remove('np-printing'); };
  window.addEventListener('afterprint', finish, { once: true });
  setTimeout(() => { window.print(); setTimeout(finish, 500); }, 60);
}

// ---- saving into the World ---------------------------------------------------------------------------

/** Save (or update) an issue as a World page. Returns the entity id. */
export function savePaper(ctx, paper, id = null) {
  const { saved } = ctx;
  const name = paperName(paper);
  const summary = paperSummary(paper);
  const fields = { Masthead: paper.masthead, Edition: paper.edition, Date: paper.date, City: paper.city, Layout: PAPER_LAYOUTS[paper.layout]?.label || paper.layout };
  if (paper.session != null && paper.session !== '') fields.Session = paper.session;
  let e;
  if (id && saved.entities[id]) {
    e = saved.entities[id];
    Object.assign(e, { name, summary, fields, paper: clone(paper), updated: new Date().toISOString() });
  } else {
    e = createEntity(saved, { type: 'paper', name, summary, fields, tags: ['newspaper'] });
    e.paper = clone(paper);
  }
  e.date = paper.date || '';
  e.session = paper.session != null && paper.session !== '' ? Number(paper.session) : null;
  // The people and places in the stories are tied to the issue.
  saved.links = (saved.links || []).filter((l) => !(l.from === e.id && l.rel === 'involves'));
  const about = new Set((paper.stories || []).flatMap((s) => s.about || []));
  for (const to of about) addLink(saved, { from: e.id, to, rel: 'involves' });
  ctx.save();
  return e.id;
}

/** A page from a key someone sent: saved as a new issue. */
export function importPaper(ctx, paper) {
  const id = savePaper(ctx, { ...paper, session: paper.session ?? null }, null);
  toast(`${paper.masthead || 'Front page'} added to the newsstand`);
  ctx.go(id);
  return id;
}

export function startPaper(ctx, { draft = false, session = null, base = null } = {}) {
  ctx.ui.draft = draft ? draftPaper(ctx.world, { seed: randomSeed(), session, base }) : (base || newPaper(ctx.world));
  ctx.ui.draftId = null;
  ctx.ui.draftOpen = {};
  ctx.go('paper-edit');
}

export function editPaper(ctx, e) {
  ctx.ui.draft = clone(e.paper);
  ctx.ui.draftId = e.id;
  ctx.ui.draftOpen = {};
  ctx.go('paper-edit');
}

// ---- the newsstand -----------------------------------------------------------------------------------------

export function newsstandPage(ctx) {
  const { world, go } = ctx;
  const papers = [...world.entities.values()].filter((e) => e.type === 'paper' && e.paper).sort((a, b) => (b.session ?? -1) - (a.session ?? -1) || String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || '')));
  const tl = campaignTimeline(world);
  const sessions = [...new Set(tl.map((it) => it.session).filter((s) => s != null))].sort((a, b) => b - a);
  const keyIn = h('input', { type: 'text', placeholder: 'Paste a front-page key (DCUN1…) or link', 'aria-label': 'Front-page key' });
  const openKey = async () => { const v = keyIn.value.trim(); if (!v) return; try { importPaper(ctx, await decodePaper(v)); } catch (e) { toast(e.message); } };
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero small np-hero' },
      h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Newsstand'), h('h1', null, 'Front pages'), h('p', { class: 'wd-tagline' }, 'The papers of your world. Write a front page by hand or draft one from the campaign timeline, dress it with photos and adverts, pick a look (broadsheet, tabloid, EXTRA!, vintage, comic, underground), then save it to the World, print it, or send it to your players as a key or link.')),
      h('div', { class: 'btn-row', style: { flexDirection: 'column', alignItems: 'stretch' } },
        h('button', { class: 'btn primary', type: 'button', onClick: () => startPaper(ctx, { draft: true }) }, '⚡ Draft from the campaign'),
        h('button', { class: 'btn', type: 'button', onClick: () => startPaper(ctx) }, '✎ Blank front page'),
        sessions.length ? h('select', { 'aria-label': 'Draft the paper for a session', onChange: (e) => { if (e.target.value) startPaper(ctx, { draft: true, session: Number(e.target.value) }); } }, h('option', { value: '' }, 'Draft for a session…'), sessions.map((s) => h('option', { value: s }, `Session ${s}`))) : null)),
    papers.length ? h('div', { class: 'np-stand' }, papers.map((e) => h('div', { class: 'np-card' },
      paperThumb(e.paper, () => go(e.id)),
      h('div', { class: 'np-card-text' },
        h('b', null, e.paper.masthead), h('span', null, [e.paper.edition, e.paper.date].filter(Boolean).join(' · ')),
        h('small', null, paperSummary(e.paper)),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', type: 'button', onClick: () => go(e.id) }, 'Open'), h('button', { class: 'btn sm ghost', type: 'button', onClick: () => editPaper(ctx, e) }, 'Edit'), h('button', { class: 'btn sm ghost', type: 'button', onClick: () => printPaper(e.paper) }, 'Print')))))) :
      h('div', { class: 'empty' }, h('h2', null, 'No papers yet'), h('p', null, 'Draft one from the campaign (sessions, battles and what happened become the headlines) or start from a blank page.')),
    h('section', { class: 'panel', style: { marginTop: '8px' } }, h('h2', null, '🔑 Open a front-page key'), h('p', { style: { margin: 0 } }, 'A GM or player sent you a key or link to a front page? Paste it here (or into the Forge\'s "Open a key" box) and it joins your newsstand.'), h('div', { class: 'seed-row' }, keyIn, h('button', { class: 'btn', type: 'button', onClick: openKey }, 'Open'))));
}

// ---- one saved issue ---------------------------------------------------------------------------------------

export function paperPage(ctx, e) {
  const { go, saved } = ctx;
  const paper = e.paper || newPaper(ctx.world);
  const share = async (what) => {
    try {
      const key = await encodePaper(paper);
      const ok = await copyText(what === 'link' ? paperLink(key) : key);
      toast(ok ? `${what === 'link' ? 'Link' : 'Key'} copied (${keySize(key)}). Anyone with DCUGen opens it from the Forge's "Open a key" box.` : 'Copy failed');
    } catch (err) { toast(`Sharing needs a modern browser: ${err.message}`); }
  };
  const actions = h('div', { class: 'toolbar wd-actions no-print' },
    ctx.ui.history.length ? h('button', { class: 'btn', type: 'button', onClick: ctx.back }, '← Back') : null,
    h('button', { class: 'btn primary', type: 'button', onClick: () => editPaper(ctx, e) }, '✎ Edit this page'),
    h('button', { class: 'btn', type: 'button', title: 'A new issue with the same masthead and look, fresh stories drafted from the campaign', onClick: () => startPaper(ctx, { draft: true, base: { ...clone(paper), stories: [], ads: [] } }) }, '⚡ Next edition'),
    h('button', { class: 'btn', type: 'button', onClick: () => printPaper(paper) }, '🖨 Print / PDF'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', title: 'Copy a key that holds this front page, pictures included', onClick: () => share('key') }, '🔑 Copy key'),
    h('button', { class: 'btn', type: 'button', onClick: () => share('link') }, '🔗 Copy link'),
    h('button', { class: 'btn ghost', type: 'button', onClick: async () => toast((await copyText(paperMarkdown(paper))) ? 'Copied as Markdown' : 'Copy failed') }, 'Copy as Markdown'),
    h('button', { class: 'btn ghost', type: 'button', onClick: () => { download(`${(paper.masthead || 'front-page').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(paper.edition || 'edition').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, JSON.stringify({ app: 'DCUGen', kind: 'paper', v: 1, paper }, null, 2), 'application/json'); toast('Front page saved as a file'); } }, 'Save file'),
    h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => {
      const ok = await openDialog({ title: `Remove ${paper.masthead}?`, body: h('p', { style: { margin: 0 } }, 'This issue is deleted from the World.'), buttons: [{ label: 'Keep', value: false }, { label: 'Remove', value: true, danger: true }] });
      if (ok) { delete saved.entities[e.id]; saved.links = (saved.links || []).filter((l) => l.from !== e.id && l.to !== e.id); ctx.save(); go('newsstand'); }
    } }, 'Remove'));
  const about = e.connections?.filter((c) => c.rel === 'involves').map((c) => c.other) || [];
  return h('div', { class: 'wd-page np-view' },
    h('header', { class: 'wd-hero small', style: { '--c': ENTITY_COLOR } }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, `Newspaper${e.session != null ? ` · Session ${e.session}` : ''}`), h('h1', null, paper.masthead), h('p', { class: 'wd-tagline' }, [paper.edition, paper.date, paper.city].filter(Boolean).join(' · ')))),
    actions,
    h('div', { class: 'np-sheet' }, renderPaper(paper, { world: ctx.world, go, interactive: true })),
    about.length ? h('section', { class: 'sec' }, h('h3', null, 'In this issue'), h('div', { class: 'wd-chips' }, about.map((o) => h('button', { type: 'button', class: 'wd-chip', style: { '--c': o.color || '#888' }, onClick: () => go(o.id) }, o.name)))) : null);
}
const ENTITY_COLOR = '#3b4252';

// ---- the editor --------------------------------------------------------------------------------------------

export function editorPage(ctx) {
  const { world, go } = ctx;
  if (!ctx.ui.draft) ctx.ui.draft = newPaper(world);
  const d = ctx.ui.draft;
  d.stories = d.stories || []; d.ads = d.ads || []; d.ears = d.ears || { left: '', right: '' };
  const preview = h('div', { class: 'np-preview' });
  let raf = 0;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const inner = renderPaper(d, { world, go, interactive: false }); clear(preview).append(inner); fitInto(preview, inner); }); };
  const form = h('div', { class: 'np-form' });
  const rebuildForm = () => { clear(form).append(mastheadSection(), storiesSection(), adsSection()); redraw(); };

  const field = (label, input, extra = null) => h('label', { class: 'field' }, h('span', null, label), input, extra);
  const text = (obj, key, { placeholder = '', label = '', area = false, rows = 3 } = {}) => {
    const el = area ? h('textarea', { placeholder, 'aria-label': label || placeholder, rows, onInput: (ev) => { obj[key] = ev.target.value; redraw(); } }, obj[key] || '')
      : h('input', { type: 'text', value: obj[key] || '', placeholder, 'aria-label': label || placeholder, onInput: (ev) => { obj[key] = ev.target.value; redraw(); } });
    return el;
  };

  function mastheadSection() {
    const layouts = h('div', { class: 'np-layouts', role: 'radiogroup', 'aria-label': 'Layout' }, Object.entries(PAPER_LAYOUTS).map(([id, L]) =>
      h('button', { type: 'button', class: `np-layout-pick np-lp-${id} ${d.layout === id ? 'active' : ''}`, role: 'radio', 'aria-checked': String(d.layout === id), title: L.blurb, onClick: () => { d.layout = id; layouts.querySelectorAll('.np-layout-pick').forEach((b) => { const on = b.classList.contains(`np-lp-${id}`); b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); }); redraw(); } },
        h('span', { class: 'np-lp-sample' }, h('i'), h('i'), h('i')), h('b', null, L.label))));
    const inks = h('div', { class: 'np-inks', role: 'radiogroup', 'aria-label': 'Ink colour' }, PAPER_INKS.map((c) => h('button', { type: 'button', class: `np-ink ${d.ink === c ? 'active' : ''}`, style: { background: c }, 'aria-label': `Ink ${c}`, onClick: (e2) => { d.ink = c; inks.querySelectorAll('.np-ink').forEach((b) => b.classList.toggle('active', b === e2.currentTarget)); redraw(); } })));
    const photo = h('select', { 'aria-label': 'Photo style', onChange: (e2) => { d.photoStyle = e2.target.value; redraw(); } }, Object.entries(PHOTO_STYLES).map(([k, v]) => h('option', { value: k, selected: d.photoStyle === k }, v)));
    const session = h('input', { type: 'number', min: 0, step: 1, value: d.session ?? '', placeholder: 'none', 'aria-label': 'Session', onInput: (e2) => { d.session = e2.target.value === '' ? null : Number(e2.target.value); } });
    return h('section', { class: 'sec np-sec' },
      h('h3', null, 'Masthead', h('span', { class: 'pts' }, 'the paper itself')),
      h('div', { class: 'jr-row' }, field('Paper name', text(d, 'masthead', { placeholder: 'The Daily Planet' })), field('Slogan', text(d, 'slogan', { placeholder: 'All the news that fits' }))),
      h('div', { class: 'jr-row' }, field('City', text(d, 'city', { placeholder: 'Metropolis' })), field('Date', text(d, 'date', { placeholder: 'Tuesday, June 3' })), field('Edition', text(d, 'edition', { placeholder: 'Late edition' }))),
      h('div', { class: 'jr-row' }, field('Volume', text(d, 'volume', { placeholder: 'Vol. LXXX · No. 118' })), field('Price', text(d, 'price', { placeholder: '50¢' })), field('Session (for the timeline)', session)),
      h('div', { class: 'jr-row' }, field('Left ear (top corner)', text(d.ears, 'left', { placeholder: 'Weather: sunny, chance of meteors' })), field('Right ear', text(d.ears, 'right', { placeholder: 'Inside: sports, page 12' }))),
      h('div', { class: 'label' }, 'Look'), layouts,
      h('div', { class: 'jr-row', style: { alignItems: 'end' } }, field('Photos', photo), h('div', { class: 'field' }, h('span', null, 'Ink'), inks)));
  }

  function storiesSection() {
    const list = h('div', { class: 'np-story-list' }, d.stories.map((s, i) => storyCard(s, i)));
    const addMenu = h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm', type: 'button', onClick: () => { d.stories.push(blankStory(d.stories.length ? 'brief' : 'lead')); ctx.ui.draftOpen[d.stories.at(-1).id] = true; rebuildForm(); } }, '+ Story'),
      h('button', { class: 'btn sm', type: 'button', title: 'An evergreen story from the city desk, using your world\'s names', onClick: () => { d.stories.push(fillerStory(world, makeRng(randomSeed()), d.stories.length ? 'brief' : 'lead')); rebuildForm(); } }, '🎲 Filler story'),
      h('button', { class: 'btn sm', type: 'button', title: 'Turn a session, battle or recorded moment into a story', onClick: fromTimeline }, '🕰 From the timeline…'),
      h('button', { class: 'btn sm ghost', type: 'button', title: 'Replace every story with a fresh draft from the campaign', onClick: async () => { const ok = d.stories.some((s) => s.headline) ? await openDialog({ title: 'Redraft the stories?', body: h('p', { style: { margin: 0 } }, 'The stories you have are replaced with a new draft from the timeline. The masthead and look stay.'), buttons: [{ label: 'Keep mine', value: false }, { label: 'Redraft', value: true, primary: true }] }) : true; if (!ok) return; const fresh = draftPaper(world, { seed: randomSeed(), session: d.session ?? null, base: { ...d, ads: d.ads } }); d.stories = fresh.stories; rebuildForm(); } }, '⚡ Redraft all'));
    return h('section', { class: 'sec np-sec' }, h('h3', null, 'Stories', h('span', { class: 'pts' }, `${d.stories.length}`)), list, addMenu);
  }

  async function fromTimeline() {
    const items = campaignTimeline(world).slice().reverse();
    if (!items.length) { toast('Nothing on the timeline yet: add a journal session, record a battle, or record what happened.'); return; }
    const sel = h('select', { size: Math.min(10, items.length), style: { width: '100%' } }, items.map((it, i) => h('option', { value: i }, `${it.session != null ? `S${it.session} · ` : ''}${it.kind === 'change' ? 'What happened' : it.kind === 'battle' ? 'Battle' : it.kind === 'session' ? 'Session' : 'Event'}: ${it.name}`)));
    sel.selectedIndex = 0;
    const ok = await openDialog({ title: 'A story from the timeline', body: [sel, h('p', { class: 'hint', style: { margin: '6px 0 0' } }, 'The headline, deck and copy are drafted for you; edit anything afterwards.')], buttons: [{ label: 'Cancel', value: false }, { label: 'Write it', value: true, primary: true }] });
    if (!ok) return;
    const it = items[Number(sel.value)];
    const s = storyFromTimeline(it, world, { rng: makeRng(randomSeed()), city: d.city || 'the City', slot: d.stories.length ? 'brief' : 'lead' });
    d.stories.push(s); ctx.ui.draftOpen[s.id] = true; rebuildForm();
  }

  function storyCard(s, i) {
    const open = ctx.ui.draftOpen[s.id] ?? (i === 0 || !s.headline);
    const slot = h('select', { 'aria-label': 'Slot', onChange: (e2) => { s.slot = e2.target.value; redraw(); } }, Object.entries(STORY_SLOTS).map(([k, v]) => h('option', { value: k, selected: s.slot === k }, v)));
    const head = h('div', { class: 'np-story-head' },
      h('button', { type: 'button', class: 'np-story-toggle', 'aria-expanded': String(open), onClick: () => { ctx.ui.draftOpen[s.id] = !open; rebuildForm(); } }, h('span', { class: 'wd-caret' }, open ? '▾' : '▸'), h('b', null, s.headline || 'Untitled story'), h('small', null, STORY_SLOTS[s.slot] || 'Brief')),
      h('span', { class: 'spacer' }),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Move up', title: 'Move up', disabled: i === 0, onClick: () => { [d.stories[i - 1], d.stories[i]] = [d.stories[i], d.stories[i - 1]]; rebuildForm(); } }, '↑'),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Move down', title: 'Move down', disabled: i === d.stories.length - 1, onClick: () => { [d.stories[i + 1], d.stories[i]] = [d.stories[i], d.stories[i + 1]]; rebuildForm(); } }, '↓'),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Remove story', title: 'Remove', onClick: () => { d.stories.splice(i, 1); rebuildForm(); } }, '✕'));
    if (!open) return h('div', { class: 'np-story-card' }, head);
    return h('div', { class: 'np-story-card open' }, head,
      h('div', { class: 'jr-row' }, field('Slot', slot), field('Kicker', text(s, 'kicker', { placeholder: 'EXCLUSIVE · CRIME · CITY HALL' })), field('Byline', text(s, 'byline', { placeholder: 'By Lois Lane' }))),
      field('Headline', text(s, 'headline', { placeholder: 'HERO SAVES CITY FROM GIANT ROBOT' })),
      field('Deck (the line under the headline)', text(s, 'deck', { placeholder: 'Mayor: "We owe them everything"' })),
      field('Story', text(s, 'body', { placeholder: 'The copy. Blank lines make paragraphs.', area: true, rows: 6 })),
      pictureTools(s), aboutTools(s));
  }

  function pictureTools(s) {
    const box = h('div', { class: 'np-pic-tools' });
    const status = h('small', { class: 'np-pic-status' });
    const set = (src) => { s.image = { ...(s.image || { caption: '', credit: '' }), src }; redraw(); drawPic(); };
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: async (e2) => { const f = e2.target.files?.[0]; if (!f) return; try { set(await readPictureFile(f, { width: 720, height: 480 })); } catch (err) { toast(err.message); } } });
    const fromRoster = async () => {
      const list = state.roster.filter((c) => c.identity?.codename || c.identity?.realName);
      if (!list.length) { toast('No one on the roster yet.'); return; }
      const sel = h('select', { style: { width: '100%' } }, list.map((c, i) => h('option', { value: i }, `${c.identity?.codename || c.identity?.realName}${c.identity?.realName && c.identity?.codename ? ` (${c.identity.realName})` : ''}`)));
      const ok = await openDialog({ title: 'A picture from the roster', body: [sel, h('p', { class: 'hint', style: { margin: '6px 0 0' } }, 'Their portrait as the press photo: the uploaded picture, the saved AI painting, or the built-in comic art.')], buttons: [{ label: 'Cancel', value: false }, { label: 'Use it', value: true, primary: true }] });
      if (!ok) return;
      const ch = list[Number(sel.value)];
      const por = portraitOf(ch);
      const src = por.hidden ? null : (por.source === 'upload' && por.image) || por.avatar;
      if (!src) { toast('That character has no portrait to use.'); return; }
      set(src);
      if (!s.image.caption) { s.image.caption = ch.identity?.codename || ch.identity?.realName || ''; redraw(); drawPic(); }
    };
    let cancelled = false;
    const paint = async () => {
      const style = PORTRAIT_STYLES[painterPrefs.style] || PORTRAIT_STYLES.comic;
      const base = `${s.headline || 'breaking news'}${s.deck ? `. ${s.deck}` : ''}`;
      const ta = h('textarea', { rows: 4, style: { width: '100%' } }, `newspaper press photograph for a front page: ${base}. ${d.city || 'a big city'}, dramatic moment, wide shot, ${style.suffix}`);
      const ok = await openDialog({ title: 'Paint a picture', body: [h('label', { class: 'field' }, h('span', null, 'Prompt'), ta), h('p', { class: 'hint', style: { margin: 0 } }, `Painted by ${painterPrefs.service === 'horde' ? 'AI Horde' : 'Pollinations.ai'} (free, needs internet; the painter and style are set in any character's portrait settings). It lands here when it is done.`)], buttons: [{ label: 'Cancel', value: false }, { label: 'Paint', value: true, primary: true }] });
      if (!ok) return;
      cancelled = false;
      const prompt = ta.value.trim();
      const seed = Math.floor(Math.random() * 1e9);
      const job = painterPrefs.service === 'horde' ? { service: 'horde', prompt, seed, models: style.horde } : { service: 'pollinations', url: portraitUrl(prompt, { seed, width: 768, height: 512 }) };
      status.textContent = 'Queued for painting…';
      const r = await requestPainting(job, { onWait: (ms) => { status.textContent = ms > 800 ? `Painting in ${Math.ceil(ms / 1000)}s…` : 'Painting…'; }, onStatus: (t) => { status.textContent = t; }, cancelled: () => cancelled });
      if (r.ok && r.image) { set(r.image); status.textContent = 'Painted.'; if (!s.image.credit) { s.image.credit = 'Staff photo'; redraw(); drawPic(); } }
      else if (r.ok && r.live && job.url) { set(job.url); status.textContent = 'Painted (shown from the service).'; }
      else status.textContent = `Could not paint: ${r.why || 'unknown'}`;
    };
    const drawPic = () => {
      clear(box).append(
        h('div', { class: 'np-pic-row' },
          s.image?.src ? h('img', { class: 'np-pic-preview', src: s.image.src, alt: '' }) : h('div', { class: 'np-pic-preview empty' }, 'No picture'),
          h('div', { class: 'np-pic-btns' },
            h('button', { class: 'btn sm', type: 'button', onClick: () => file.click() }, '⇪ Upload'),
            h('button', { class: 'btn sm', type: 'button', title: 'A character\'s portrait as the press photo', onClick: fromRoster }, '🧑 From the roster'),
            h('button', { class: 'btn sm', type: 'button', title: 'Paint one with the free AI painter', onClick: paint }, '🎨 Paint it'),
            s.image?.src ? h('button', { class: 'btn sm ghost danger', type: 'button', onClick: () => { s.image = null; redraw(); drawPic(); } }, 'Remove') : null,
            status, file)),
        s.image?.src ? h('div', { class: 'jr-row' }, field('Caption', text(s.image, 'caption', { placeholder: 'What the picture shows' })), field('Credit', text(s.image, 'credit', { placeholder: 'Staff photo · Photo: J. Olsen' }))) : null);
    };
    drawPic();
    return h('div', { class: 'field' }, h('span', null, 'Picture'), box);
  }

  function aboutTools(s) {
    const chips = h('div', { class: 'wd-chips' });
    const draw = () => {
      clear(chips);
      for (const id of s.about || []) { const e = world.entities.get(id); if (!e) continue; chips.append(h('span', { class: 'wd-chip', style: { '--c': e.color || '#888' } }, e.name, h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${e.name}`, onClick: () => { s.about = s.about.filter((x) => x !== id); draw(); } }, '✕'))); }
    };
    draw();
    const names = [...world.entities.values()].filter((e) => e.type !== 'paper');
    const input = h('input', { type: 'text', list: 'np-about-list', placeholder: 'Who or what is this about? (a page in the World)', 'aria-label': 'About' });
    const add = () => { const n = input.value.trim().toLowerCase(); const e = names.find((x) => x.name.toLowerCase() === n); if (!e) { toast('Pick a page from the list'); return; } s.about = [...new Set([...(s.about || []), e.id])]; input.value = ''; draw(); };
    input.addEventListener('change', add);
    input.addEventListener('keydown', (e2) => { if (e2.key === 'Enter') { e2.preventDefault(); add(); } });
    return h('div', { class: 'field' }, h('span', null, 'In the World'), chips, h('div', { class: 'seed-row' }, input, h('datalist', { id: 'np-about-list' }, names.map((e) => h('option', { value: e.name }))), h('button', { class: 'btn sm', type: 'button', onClick: add }, 'Tie')));
  }

  function adsSection() {
    const list = h('div', { class: 'np-ad-list' }, d.ads.map((a, i) => h('div', { class: 'np-ad-card' },
      h('div', { class: 'jr-row' },
        field('Style', h('select', { 'aria-label': 'Advert style', onChange: (e2) => { a.style = e2.target.value; redraw(); } }, Object.entries(AD_STYLES).map(([k, v]) => h('option', { value: k, selected: a.style === k }, v)))),
        field('Label', text(a, 'tag', { placeholder: 'ADVERTISEMENT' })),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Remove advert', style: { alignSelf: 'end', marginBottom: '8px' }, onClick: () => { d.ads.splice(i, 1); rebuildForm(); } }, '✕')),
      field('Title', text(a, 'title', { placeholder: 'BIG BITE BURGERS' })),
      field('Text', text(a, 'text', { placeholder: 'Open all night. Open during the thing last Tuesday.', area: true, rows: 2 })))));
    return h('section', { class: 'sec np-sec' }, h('h3', null, 'Adverts', h('span', { class: 'pts' }, `${d.ads.length}`)), list,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm', type: 'button', onClick: () => { d.ads.push(blankAd()); rebuildForm(); } }, '+ Advert'),
        h('button', { class: 'btn sm', type: 'button', title: 'An advert from the city\'s businesses, using your world\'s names', onClick: () => { d.ads.push(rollAd(world, makeRng(randomSeed()))); rebuildForm(); } }, '🎲 Roll an advert')));
  }

  const saveIt = () => {
    if (!d.stories.some((s) => s.headline?.trim())) { toast('Give at least one story a headline'); return; }
    const id = savePaper(ctx, d, ctx.ui.draftId);
    ctx.ui.draft = null; ctx.ui.draftId = null;
    toast('Front page saved to the World');
    go(id, { replace: true });
  };
  const cancel = async () => {
    const ok = await openDialog({ title: 'Leave the editor?', body: h('p', { style: { margin: 0 } }, 'Changes since the last save are lost.'), buttons: [{ label: 'Stay', value: false }, { label: 'Leave', value: true, danger: true }] });
    if (ok) { ctx.ui.draft = null; go(ctx.ui.draftId || 'newsstand', { replace: true }); }
  };
  rebuildForm();
  return h('div', { class: 'wd-page np-editor' },
    h('header', { class: 'wd-hero small' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, ctx.ui.draftId ? 'Editing' : 'New front page'), h('h1', null, d.masthead || 'Front page'), h('p', { class: 'wd-tagline' }, 'Type on the left, the page sets itself on the right. Pictures: upload, a roster portrait, or a free AI painting.')),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onClick: saveIt }, '💾 Save to the World'), h('button', { class: 'btn', type: 'button', onClick: () => printPaper(d) }, '🖨 Print'), h('button', { class: 'btn ghost', type: 'button', onClick: cancel }, 'Cancel'))),
    h('div', { class: 'np-editor-grid' }, form, h('div', { class: 'np-preview-col' }, preview)),
    h('div', { class: 'np-savebar no-print' }, h('button', { class: 'btn primary', type: 'button', onClick: saveIt }, '💾 Save to the World'), h('button', { class: 'btn ghost', type: 'button', onClick: cancel }, 'Cancel')));
}
