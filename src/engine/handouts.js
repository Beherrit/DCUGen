// Handouts: props the GM puts on the table. Wanted posters and case files for anyone in the World,
// letters, ransom notes, telegrams, memos, phone screens of texts, and redacted reports. Each one is
// drafted from the World (a character's ties, complications and the moments recorded about them) or
// written by hand, dressed in a look, saved as a World page, printed, or sent as a key.
//
// A handout: { v, kind, look, title, subject, people: [ids], session, date, picture: { src, caption },
//              fields: { ...kind specific }, body, lines: [{ side, text, time }] }

import { makeRng, randomSeed } from './rng.js';
import { MOMENT_KINDS } from './world.js';

export const HANDOUT_KINDS = {
  wanted: { label: 'Wanted poster', glyph: '📜', blurb: 'Anyone in the World as a WANTED poster: portrait, aliases, crimes, last seen, reward.',
    looks: { frontier: 'Old West / post office', noir: 'Police bulletin, 1940s', modern: 'Agency most-wanted', bounty: 'Off-world bounty board' } },
  casefile: { label: 'Case file', glyph: '🗂', blurb: 'An agency dossier: mugshot, known facts, associates, threat assessment, stamps and redactions.',
    looks: { agency: 'Manila folder, CLASSIFIED', police: 'Incident report form', lab: 'Research facility record' } },
  letter: { label: 'Letter or note', glyph: '✉', blurb: 'A letter from one person to another: handwritten, typed, a telegram, a company memo, or a ransom note.',
    looks: { handwritten: 'Handwritten on stationery', typed: 'Typewritten', telegram: 'Telegram', memo: 'Company memo', ransom: 'Ransom note (cut-out letters)' } },
  texts: { label: 'Text messages', glyph: '📱', blurb: 'A phone screen: a thread of texts between two people, as evidence or a cliffhanger.',
    looks: { dark: 'Phone, dark', light: 'Phone, light', burner: 'Burner phone (old screen)' } },
  report: { label: 'Report', glyph: '🧪', blurb: 'A lab, police or medical report with fields and [[redacted]] passages.',
    looks: { lab: 'Laboratory report', police: 'Police report', medical: 'Medical chart', military: 'Military after-action report' } },
};

const upper = (s) => String(s || '').toUpperCase();
export const handoutId = () => `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newHandout(kind = 'wanted', { seed = randomSeed() } = {}) {
  const K = HANDOUT_KINDS[kind] || HANDOUT_KINDS.wanted;
  return { v: 1, seed, kind: K === HANDOUT_KINDS[kind] ? kind : 'wanted', look: Object.keys(K.looks)[0], title: '', subject: null, people: [], session: null, date: '', picture: null, fields: {}, body: '', lines: [] };
}

// ---- reading a World page ----------------------------------------------------------------------------------

const CRIMES = ['Armed robbery', 'Grand larceny', 'Assault on a peace officer', 'Destruction of city property', 'Reckless endangerment', 'Extortion', 'Kidnapping', 'Unlawful use of extranormal abilities', 'Escape from custody', 'Conspiracy', 'Arson', 'Criminal mischief on a metropolitan scale', 'Resisting arrest by six precincts', 'Theft of a vehicle (armoured)', 'Trespass in a restricted facility', 'Impersonating a hero', 'Menacing', 'Possession of a doomsday device'];
const THREAT = (pl) => (pl >= 14 ? 'OMEGA: do not engage without support' : pl >= 11 ? 'SEVERE: approach with extreme caution' : pl >= 8 ? 'HIGH: considered dangerous' : pl >= 5 ? 'MODERATE: armed and capable' : 'LOW: ordinary means suffice');

function factsOf(e, world) {
  const ch = e?.character;
  const id = ch?.identity || {};
  const pl = ch?.pl ?? (Number(e?.fields?.['Power level']) || null);
  const ties = e?.connections || [];
  const tieNames = (rels) => ties.filter((c) => rels.includes(c.rel)).map((c) => c.other.name);
  const places = ties.filter((c) => ['basedIn', 'livesIn', 'worksAt'].includes(c.rel)).map((c) => c.other.name);
  const moments = (world?.moments || []).filter((m) => m.a === e?.id || m.b === e?.id);
  return {
    name: e?.name || 'Unknown', realName: id.realName && id.realName !== e?.name ? id.realName : null, aliases: (e?.aliases || []).filter((a) => a !== id.realName), pl,
    occupation: id.occupation || e?.fields?.Occupation || '', base: id.base || e?.fields?.Base || '', age: id.age ?? e?.fields?.Age ?? null, gender: id.gender || '',
    villain: ch ? ch.alignment === 'villain' : (e?.tags || []).includes('villain'), archetype: ch?.archetype?.name || e?.fields?.Archetype || '', theme: ch?.theme?.name || '',
    powers: (ch?.powers || []).map((p) => p.name), complications: (ch?.complications || []).map((c) => `${c.type}: ${c.text}`),
    looks: ch?.appearance || {}, summary: e?.summary || '',
    allies: tieNames(['ally', 'friend', 'teammate', 'partner', 'member', 'contact']), enemies: tieNames(['enemy', 'nemesis', 'rival', 'fought']), places,
    moments: moments.map((m) => m.text + (m.note ? ` ${m.note}` : '')), status: e?.status || '',
  };
}

/** A WANTED poster for a World page (best for villains, works for anyone). */
export function draftWanted(world, e, { seed = randomSeed() } = {}) {
  const rng = makeRng(`wanted::${seed}::${e?.id}`);
  const f = factsOf(e, world);
  const crimes = [...new Set([...f.moments.filter((m) => /betray|fought|took control|stole|attack|kidnap|escaped|destroy/i.test(m)).slice(0, 2), ...Array.from({ length: 3 }, () => rng.pick(CRIMES))])].slice(0, 4);
  const reward = f.pl ? f.pl * f.pl * 1000 : 25000;
  const h = newHandout('wanted', { seed });
  h.subject = e?.id || null; h.people = e ? [e.id] : []; h.title = f.name;
  h.look = f.villain ? rng.pick(['noir', 'modern', 'frontier']) : 'modern';
  h.fields = {
    banner: f.villain ? 'WANTED' : 'MISSING',
    sub: f.villain ? rng.pick(['BY ORDER OF THE CITY', 'ARMED AND EXTREMELY DANGEROUS', 'FOR CRIMES AGAINST THE CITY', 'DEAD OR ALIVE']) : 'HAVE YOU SEEN THIS PERSON?',
    aliases: [f.realName ? `a.k.a. ${f.realName}` : null, ...f.aliases.map((a) => `a.k.a. ${a}`)].filter(Boolean).join(' · ') || 'True identity unknown',
    description: [f.gender, f.age ? `about ${f.age}` : null, f.looks.height, f.looks.hair ? `${f.looks.hair} hair` : null, f.looks.eyes ? `${f.looks.eyes} eyes` : null, f.looks.feature].filter(Boolean).join(', ') || 'No reliable description',
    crimes: crimes.join('\n'),
    lastSeen: f.places[0] ? `${f.places[0]}${f.moments.length ? `; ${f.moments[f.moments.length - 1]}` : ''}` : f.base || 'Whereabouts unknown',
    reward: `$${reward.toLocaleString()}`,
    powers: f.powers.slice(0, 4).join(', ') || 'None reported',
    threat: THREAT(f.pl || 6),
    issuedBy: rng.pick(['Metropolitan Police Department', 'Department of Extranormal Affairs', 'Office of the District Attorney', 'Federal Bureau of Investigation', 'The Mayor\'s Office']),
    contact: rng.pick(['Call 555-0199. Do not approach.', 'Report sightings to any precinct.', 'Tips line open day and night.', 'Reward paid on conviction.']),
  };
  h.body = f.summary ? f.summary.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ') : '';
  return h;
}

/** An agency case file for a World page. */
export function draftCasefile(world, e, { seed = randomSeed() } = {}) {
  const rng = makeRng(`case::${seed}::${e?.id}`);
  const f = factsOf(e, world);
  const h = newHandout('casefile', { seed });
  h.subject = e?.id || null; h.people = e ? [e.id] : []; h.title = f.name;
  h.look = 'agency';
  h.fields = {
    fileNo: `${rng.pick(['DEA', 'MPD', 'FBI', 'ARGUS', 'CADMUS'])}-${rng.int(1000, 9999)}-${rng.pick(['A', 'B', 'K', 'X'])}`,
    classification: rng.pick(['CLASSIFIED', 'TOP SECRET', 'EYES ONLY', 'RESTRICTED']),
    status: f.status || (f.villain ? 'AT LARGE' : 'ACTIVE'),
    identity: f.realName || 'UNKNOWN',
    occupation: f.occupation || 'Unknown', base: f.base || f.places[0] || 'Unknown', archetype: [f.archetype, f.theme].filter(Boolean).join(' · '),
    threat: THREAT(f.pl || 6), powerLevel: f.pl ? `PL ${f.pl}` : 'Unrated',
    powers: f.powers.join('\n') || 'None observed',
    associates: [...new Set(f.allies)].slice(0, 6).join(', ') || 'None known',
    adversaries: [...new Set(f.enemies)].slice(0, 6).join(', ') || 'None known',
    weaknesses: f.complications.join('\n') || 'None identified',
    agent: `${rng.pick(['Agent', 'Det.', 'Dr.', 'Lt.'])} ${rng.pick(['Vale', 'Okafor', 'Lindqvist', 'Castellano', 'Park', 'Harlow', 'Brandt', 'Mbeki'])}`,
  };
  const history = f.moments.length ? f.moments.map((m) => `- ${m}`).join('\n') : '';
  h.body = [f.summary, history ? `Recorded history:\n${history}` : '', `Assessment: [[${rng.pick(['Subject is more capable than the public record suggests.', 'Recommend surveillance of known associates.', 'Subject has at least one contact inside this agency.', 'Do not share this file with city police.'])}]]`].filter(Boolean).join('\n\n');
  return h;
}

// ---- letters and texts -------------------------------------------------------------------------------------------

const LETTER_BY_GROUP = {
  'Rivals & enemies': ['I know what you did. So does the city, soon.', 'Stay out of my district. This is the only warning you will get in writing.', 'You cost me everything. I intend to return the favour, with interest.'],
  People: ['We need to talk, somewhere without windows.', 'I did what I did because there was no other way. One day you will see that.', 'If you are reading this, I was right not to trust them. Burn this.'],
  'Loves & family': ['I keep the newspaper clipping in my coat. Come home.', 'I am not angry. I am just tired of reading about you before I hear from you.', 'Whatever happens next, you were the best thing in this city.'],
  Factions: ['The Court meets at midnight. Your seat is still empty.', 'Consider this your notice. Clear your locker.', 'We can offer you what they never could: a way out.'],
  Places: ['The old place is being watched. Use the other door.', 'I have moved. Do not look for me.', 'Meet me where it started. You know where.'],
  Things: ['It is not where you left it. It is somewhere safer.', 'Whatever you do, do not open it.', 'I have the item. Name your price.'],
  Fate: ['By the time you read this, you will have heard. Do not believe all of it.', 'I am alive. Tell no one.', 'If I do not come back, the key is under the third step.'],
};

/** A letter from one World page to another, in the voice of what last happened between them. */
export function draftLetter(world, from, to, { seed = randomSeed(), look = null } = {}) {
  const rng = makeRng(`letter::${seed}::${from?.id}::${to?.id}`);
  const moments = (world?.moments || []).filter((m) => (m.a === from?.id && m.b === to?.id) || (m.a === to?.id && m.b === from?.id));
  const last = moments[moments.length - 1];
  const group = last ? MOMENT_KINDS[last.kind]?.group : null;
  const pool = LETTER_BY_GROUP[group] || Object.values(LETTER_BY_GROUP).flat();
  const h = newHandout('letter', { seed });
  h.look = look || rng.pick(['handwritten', 'typed', 'handwritten', 'telegram']);
  h.subject = to?.id || null; h.people = [from?.id, to?.id].filter(Boolean);
  const salutation = to ? `${rng.pick(['Dear', 'To', ''])} ${to.name.split(' ')[0]},`.trim() : 'To whom it may concern,';
  const line = rng.pick(pool);
  const second = last ? `${rng.pick(['After what happened', 'Since', 'Ever since'])} (${last.text.toLowerCase()}), ${rng.pick(['nothing has been the same', 'I have not slept', 'they have been watching the house', 'the city has had a new name for me'])}.` : rng.pick(['The city is quieter without you, which is not a compliment.', 'I will not say more on paper.', 'Things are moving faster than either of us planned.']);
  h.title = `${from?.name || 'Unknown'} to ${to?.name || 'unknown'}`;
  h.fields = { from: from?.name || '', to: to?.name || '', place: '', signoff: rng.pick(['— ' + (from?.name || 'A friend'), 'Yours, as ever,', 'Until next time,', 'Burn after reading.', 'You know who.']) };
  h.body = h.look === 'telegram' ? upper(`${line} STOP ${second} STOP ${rng.pick(['COME AT ONCE', 'TELL NO ONE', 'WIRE REPLY', 'TRUST NOBODY'])} STOP`).replace(/[.,]/g, '')
    : h.look === 'ransom' ? upper(line) : `${salutation}\n\n${line}\n\n${second}\n\n${h.fields.signoff}`;
  if (h.look === 'ransom') h.fields.signoff = '';
  return h;
}

const TEXT_OPENERS = ['you up?', 'did you see the news', 'we have a problem', 'call me. not from your phone.', 'where are you', 'it happened again', 'they know'];
const TEXT_REPLIES = ['what did you do', 'not over text', 'I told you this would happen', 'how bad', 'give me 20 min', 'stop texting me', 'is anyone hurt'];
const TEXT_CLOSERS = ['meet me at the usual place', 'delete this thread', 'bring the thing', 'don\'t come alone', 'I\'m sorry', 'turn on channel 6', '…'];

/** A phone screen of texts between two people. */
export function draftTexts(world, a, b, { seed = randomSeed() } = {}) {
  const rng = makeRng(`texts::${seed}::${a?.id}::${b?.id}`);
  const moments = (world?.moments || []).filter((m) => (m.a === a?.id && m.b === b?.id) || (m.a === b?.id && m.b === a?.id));
  const last = moments[moments.length - 1];
  const h = newHandout('texts', { seed });
  h.look = rng.pick(['dark', 'light']);
  h.subject = a?.id || null; h.people = [a?.id, b?.id].filter(Boolean);
  h.title = `${a?.name || 'Unknown'} and ${b?.name || 'unknown'}`;
  h.fields = { me: a?.name || 'Me', them: b?.name || 'Unknown number', when: rng.pick(['Today', 'Yesterday', 'Tue 23:14', 'Sat 02:51']) };
  const t = (hour, minute) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  let hour = rng.int(21, 23); let minute = rng.int(0, 50);
  const tick = () => { minute += rng.int(1, 6); if (minute >= 60) { minute -= 60; hour = (hour + 1) % 24; } return t(hour, minute); };
  h.lines = [
    { side: 'them', text: rng.pick(TEXT_OPENERS), time: tick() },
    { side: 'me', text: rng.pick(TEXT_REPLIES), time: tick() },
    last ? { side: 'them', text: `${last.text.replace(a?.name || '', 'you').replace(b?.name || '', 'I')}. ${rng.pick(['that\'s what they\'re saying', 'it\'s everywhere', 'don\'t ask how I know'])}`, time: tick() } : { side: 'them', text: rng.pick(['it\'s on every channel', 'the whole block saw it', 'they have footage']), time: tick() },
    { side: 'me', text: rng.pick(TEXT_REPLIES), time: tick() },
    { side: 'them', text: rng.pick(TEXT_CLOSERS), time: tick() },
  ];
  return h;
}

// ---- reports --------------------------------------------------------------------------------------------------------

const REPORT_BODY = {
  lab: 'SUBJECT presented with [[anomalous cellular activity]] consistent with prior exposure. Samples taken at 04:10 showed [[a seventy percent increase in output]] over baseline.\n\nRecommend immediate [[containment protocol 4]] and notification of the Director.\n\nNote: the subject asked who was paying for this. [[Nobody answered.]]',
  police: 'Responding officers arrived at 23:52 to find the premises [[in a state no report form has a box for]]. Witnesses (3) describe a figure matching the subject leaving via [[the roof, upward]].\n\nProperty damage estimated at [[$2.1M]]. No fatalities. One officer treated for [[temporary loss of colour vision]].',
  medical: 'Patient admitted via emergency with [[injuries inconsistent with the stated fall]]. Imaging shows [[no fractures where fractures were expected]] and [[a healed break of unknown age]].\n\nPatient discharged against advice at 03:00, [[through a window]].',
  military: 'Unit engaged hostile at grid [[redacted]] at 0400. Hostile withstood [[all available ordnance]] before withdrawing [[of its own accord]].\n\nCasualties: none. Morale: [[see attached]]. Recommend [[we do not do that again]].',
};

export function draftReport(world, e, { seed = randomSeed(), look = 'lab' } = {}) {
  const rng = makeRng(`report::${seed}::${e?.id}`);
  const f = factsOf(e, world);
  const h = newHandout('report', { seed });
  h.look = REPORT_BODY[look] ? look : 'lab';
  h.subject = e?.id || null; h.people = e ? [e.id] : [];
  h.title = `${HANDOUT_KINDS.report.looks[h.look].replace(/ report$| chart$| record$/i, '')} report: ${f.name}`;
  h.fields = { refNo: `${rng.int(10, 99)}-${rng.int(1000, 9999)}`, subject: f.name + (f.realName ? ` (${f.realName})` : ''), author: `${rng.pick(['Dr.', 'Sgt.', 'Lt.', 'Prof.'])} ${rng.pick(['Vale', 'Okafor', 'Lindqvist', 'Castellano', 'Park', 'Harlow', 'Brandt', 'Mbeki'])}`, classification: rng.pick(['CONFIDENTIAL', 'RESTRICTED', 'INTERNAL', 'DO NOT COPY']), location: f.base || f.places[0] || 'Undisclosed' };
  h.body = REPORT_BODY[h.look] + (f.powers.length ? `\n\nObserved abilities: ${f.powers.slice(0, 3).join(', ')}.` : '');
  return h;
}

/** Any kind, from the World pages given. */
export function draftHandout(world, kind, { a = null, b = null, seed = randomSeed(), look = null } = {}) {
  switch (kind) {
    case 'wanted': return draftWanted(world, a, { seed });
    case 'casefile': return draftCasefile(world, a, { seed });
    case 'letter': return draftLetter(world, a, b, { seed, look });
    case 'texts': return draftTexts(world, a, b, { seed });
    case 'report': return draftReport(world, a, { seed, look: look || 'lab' });
    default: return newHandout(kind, { seed });
  }
}

// ---- helpers for rendering ---------------------------------------------------------------------------------------

/** Split "[[redacted]]" text into parts: { text, redacted }. */
export function redactParts(text) {
  const out = [];
  const re = /\[\[([\s\S]*?)\]\]/g;
  let i = 0; let m;
  while ((m = re.exec(String(text || '')))) { if (m.index > i) out.push({ text: text.slice(i, m.index), redacted: false }); out.push({ text: m[1], redacted: true }); i = m.index + m[0].length; }
  if (i < String(text || '').length) out.push({ text: String(text).slice(i), redacted: false });
  return out;
}

/** Ransom-note letters: each character gets a deterministic cut-out style. */
export function ransomLetters(text, seed = 1) {
  const rng = makeRng(`ransom::${seed}`);
  return [...String(text || '')].map((ch) => ({ ch, font: rng.int(0, 5), bg: rng.int(0, 5), rot: rng.int(-8, 8), scale: 0.85 + rng.next() * 0.4, space: ch === ' ' || ch === '\n' }));
}

export function handoutTitle(h) {
  const K = HANDOUT_KINDS[h.kind] || HANDOUT_KINDS.wanted;
  return `${K.label}: ${h.title || 'untitled'}`;
}

export function handoutSummary(h) {
  if (h.kind === 'wanted') return `${h.fields?.banner || 'WANTED'}: ${h.title}. ${h.fields?.reward ? `Reward ${h.fields.reward}.` : ''}`.trim();
  if (h.kind === 'texts') return h.lines?.map((l) => `${l.side === 'me' ? h.fields?.me : h.fields?.them}: ${l.text}`).slice(0, 2).join(' / ') || h.title;
  const plain = String(h.body || '').replace(/\[\[|\]\]/g, '');
  return plain.split(/\n+/).find((l) => l.trim() && !/^(dear|to|from)\b/i.test(l))?.slice(0, 140) || h.title;
}
