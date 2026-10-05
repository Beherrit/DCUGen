// Front pages: a newspaper from the campaign world. The GM writes (or drafts from the timeline) a
// masthead and a handful of stories with pictures, picks a layout, and saves the issue as a page in
// the World, where it sits on the campaign timeline and travels with the vault and world keys.
//
// A paper: { masthead, slogan, city, date, edition, price, volume, layout, photoStyle, ink,
//            ears: { left, right }, stories: [{ id, slot, kicker, headline, deck, byline, dateline,
//            body, image: { src, caption, credit } | null, about: [entity ids] }],
//            ads: [{ id, style, tag, title, text }] }

import { makeRng, randomSeed } from './rng.js';
import { campaignTimeline, MOMENT_KINDS, paperMarkdown } from './world.js';

export { paperMarkdown };

export const PAPER_LAYOUTS = {
  broadsheet: { label: 'Broadsheet', blurb: 'The big-city daily: serif masthead, six columns of ink, one lead photo. The paper of record.' },
  tabloid: { label: 'Tabloid', blurb: 'One screaming headline over one huge photo, a red ribbon and lurid kickers. Sold at every newsstand.' },
  extra: { label: 'EXTRA!', blurb: 'Stop the presses: a giant headline, heavy black rules and a newsboy on every corner.' },
  gazette: { label: 'Vintage Gazette', blurb: 'Yellowed paper, a blackletter masthead and printer\'s ornaments: the pulp age.' },
  comic: { label: 'Comic Panel', blurb: 'Ben-Day dots, thick ink outlines, burst stickers and tilted clippings: the front page as a comic cover.' },
  zine: { label: 'Underground', blurb: 'Photocopied, typewritten and stapled: the resistance rag, the conspiracy newsletter.' },
};
export const PHOTO_STYLES = { newsprint: 'Newsprint (black & white halftone)', comic: 'Comic (bold colour, Ben-Day dots)', plain: 'As it is' };
export const STORY_SLOTS = { lead: 'Lead story', second: 'Second story', brief: 'Brief', sidebar: 'Sidebar box' };
export const PAPER_INKS = ['#141414', '#1d3a6e', '#8e1b1b', '#1f5c3a', '#4a2a7a', '#6b4a12'];

const MASTHEADS = ['Planet', 'Gazette', 'Bugle', 'Herald', 'Tribune', 'Star', 'Chronicle', 'Dispatch', 'Sentinel', 'Ledger', 'Times', 'Globe', 'Clarion', 'Register', 'Observer', 'Courier'];
const SLOGANS = ['All the news that fits', 'Truth, justice, and a fair price', 'The city\'s paper since 1911', 'First with the facts', 'Fearless. Fair. Daily.', 'If it happened, it\'s here', 'Nothing but the truth, and some adverts', 'Read by heroes, feared by villains', 'Your city. Your paper.', 'Ink never sleeps'];
const WEATHER = ['Sunny, high of 74. Low chance of meteors.', 'Overcast with a chance of rain by evening.', 'Clear skies; unexplained aurora possible after dark.', 'Fog over the harbour until noon.', 'Heat advisory. Stay hydrated, stay indoors.', 'Snow flurries. Roads icy on the bridges.', 'Thunderstorms tonight. Keep off the rooftops.', 'Mild and breezy. Kite weather.'];
const INSIDE = ['Sports: the Knights clinch it, page 12', 'Opinion: do we need a metahuman registry? page 8', 'Classifieds: lab assistant wanted, must tolerate explosions', 'Arts: the museum reopens after the heist, page 10', 'Weather, comics, puzzles: pages 14-16', 'Business: Vance Industries shares climb, page 6', 'Obituaries, page 9', 'Letters: readers on the rooftop vigilantes, page 8'];
const REPORTERS = ['Staff Reporter', 'City Desk', 'Crime Desk', 'Our Correspondent', 'Wire Services', 'Night Editor', 'Special to the paper'];
const FIRST = ['Lois', 'Ben', 'Vicki', 'Jack', 'Iris', 'Cat', 'Perry', 'Linda', 'Clark', 'Jimmy', 'Tawny', 'Marcus', 'Dana', 'Eddie', 'Nadia', 'Rafael', 'June', 'Theo'];
const LAST = ['Rourke', 'Okafor', 'Vale', 'Castellano', 'Lindqvist', 'Park', 'Bennett', 'Delacroix', 'Mbeki', 'Harlow', 'Novak', 'Sato', 'Fairweather', 'Quintero', 'Brandt', 'Ashby'];

const FILLERS = [
  { kicker: 'CITY HALL', headline: 'COUNCIL SPLITS ON METAHUMAN REGISTRY VOTE', deck: 'Mayor promises "a decision by Friday" as protesters fill the steps', body: 'A late-night session of the city council ended without a vote on the proposed registry of powered individuals, after four hours of testimony from police, civil-liberties groups and one masked witness who declined to give a name.\n\n"We are not here to unmask anyone," the mayor told reporters afterwards. "We are here to make sure the next time a building comes down, someone answers the phone."\n\nThe measure returns to the floor next week.' },
  { kicker: 'HARBOUR', headline: 'MYSTERY LIGHTS OVER THE BAY FOR THIRD NIGHT RUNNING', deck: 'Coast guard says "no vessels, no aircraft, no explanation"', body: 'Residents of the waterfront reported a column of green light above the shipping lanes shortly after midnight, the third such sighting this week. The coast guard dispatched two cutters and found nothing but calm water.\n\nA spokesperson for the observatory said the lights were "almost certainly not astronomical", which did little to settle nerves along the piers.' },
  { kicker: 'BUSINESS', headline: 'VANCE INDUSTRIES SHARES SOAR ON "CLEAN FUSION" CLAIM', deck: 'Rivals call the announcement "science fiction"', body: 'Shares in Vance Industries rose eleven percent after the company said a prototype reactor in its research campus had run for a week on "a fuel we are not yet ready to name".\n\nAnalysts were divided. "Either this is the biggest story of the decade," one said, "or someone is about to be very embarrassed."' },
  { kicker: 'CRIME', headline: 'ARMOURED CAR CREW STILL AT LARGE AFTER DOWNTOWN CHASE', deck: 'Police: the getaway driver "was not driving in any normal sense"', body: 'Three men in identical masks escaped with an undisclosed sum after a chase through the financial district that ended with the armoured car on its roof and the thieves gone.\n\nWitnesses described the getaway vehicle leaving the road at the river and "simply continuing". Police have asked anyone with footage to come forward.' },
  { kicker: 'SCIENCE', headline: 'UNIVERSITY LAB SEALED AFTER "CONTAINMENT EVENT"', deck: 'No injuries reported; campus closed until further notice', body: 'The physics building was evacuated on Tuesday afternoon after what the university called a "containment event" in a basement laboratory. Emergency crews in sealed suits remained on site overnight.\n\nA graduate student who asked not to be named said the lab had been "running something it should not have been running".' },
  { kicker: 'COURTS', headline: 'JURY SELECTION BEGINS IN THE WAREHOUSE DISTRICT TRIAL', deck: 'Defence to argue "mind control" for the first time in state history', body: 'Lawyers for the accused told the court they would argue their client was "not the author of his own actions" on the night of the warehouse fire, in what legal observers say is the first mind-control defence to reach a jury in this state.\n\nThe prosecution called the defence "a comic book".' },
  { kicker: 'SPORTS', headline: 'KNIGHTS CLINCH THE PENNANT IN EXTRA INNINGS', deck: 'Stadium crowd of 48,000 stays past midnight', body: 'The home side took the pennant in the eleventh inning after a game delayed twice by a power cut that the stadium blamed on "external factors".\n\nThe winning run was scored by a rookie who, the manager said, "runs like something is chasing him".' },
  { kicker: 'WEATHER', headline: 'FREAK HAILSTORM STRIPS LEAVES FROM CITY PARK', deck: 'Meteorologists baffled by a storm "the size of one block"', body: 'A hailstorm confined to the four blocks around the park left cars dented and trees bare in under ten minutes on Sunday, while the rest of the city sat under clear skies.\n\n"I have never seen weather with edges," the city meteorologist said.' },
  { kicker: 'SOCIETY', headline: 'MUSEUM GALA RAISES RECORD SUM, LOSES ONE DIAMOND', deck: 'Curators insist the stone was "misplaced, not stolen"', body: 'The annual benefit gala raised more than two million for the museum\'s new wing, though the evening ended with the discovery that the centrepiece of the gem exhibit was no longer in its case.\n\nThe museum\'s director said an inventory was under way and asked guests to "check their pockets, in the friendliest possible sense".' },
  { kicker: 'TRANSIT', headline: 'SUBWAY LINE REOPENS AFTER TUNNEL "INCIDENT"', deck: 'Transit authority will not say what was found in the tunnel', body: 'The downtown line reopened this morning after a three-day closure that the transit authority described only as "an incident in the tunnel between the two stations".\n\nWorkers at the scene were seen carrying out something under a tarpaulin. The authority thanked riders for their patience.' },
  { kicker: 'LETTERS', headline: 'READERS DIVIDED ON THE ROOFTOP VIGILANTES', deck: '"Heroes", "menaces", and one proposal for a parade', body: 'Our mailbag this week overflowed with opinions on the costumed figures seen on the city\'s rooftops. A retired police sergeant called them "the best thing to happen to this city since streetlights"; a downtown landlord enclosed an invoice for a skylight.\n\nOne reader suggested a parade. The letters page is on page 8.' },
  { kicker: 'HEALTH', headline: 'CLINIC REPORTS "UNUSUAL RECOVERIES" IN BURN WARD', deck: 'Doctors decline to speculate', body: 'Staff at the city hospital say six patients in the burn unit have healed "far faster than medicine would predict" in the past month, all after visits from a volunteer who signed in only as "a friend".\n\nThe hospital has asked the volunteer to come forward. "We would like to say thank you," a spokesperson said. "And also to ask some questions."' },
];

const STORY_OPENERS = [
  '{city} — {text}, according to witnesses and police on the scene.',
  '{city} — The city woke to the news that {textLower}.',
  '{city} — It was confirmed late last night that {textLower}.',
  '{city} — {text}. Nobody downtown is talking about anything else.',
];
const STORY_MIDDLES = [
  '"{quote}," said one bystander, who asked not to be named. "Then it was over."',
  'Police cordoned off three blocks and declined to say more. "We will have a statement when we have facts," a spokesperson said.',
  'Sources close to the matter described the mood as "tense" and the damage as "considerable, but mostly to reputations".',
  'Officials urged calm. A spokesperson for the mayor\'s office said the situation was "under review", a phrase this paper has now printed forty-one times this year.',
  'Neighbours reported shouting, then a silence "like the air had been taken out of the street".',
  'Footage circulating online shows little more than a blur and a great deal of dust.',
];
const STORY_CLOSERS = [
  'This paper will carry more as the story develops.',
  'Anyone with information is asked to contact the city desk.',
  'A full account appears on page 3.',
  'The last word, for now, belongs to a vendor on the corner: "Same thing next week, probably."',
  'Reached for comment, those involved said nothing, loudly.',
];
const QUOTES = ['I saw the whole thing from the fire escape', 'It happened so fast', 'I thought it was a movie shoot', 'You could feel it in your teeth', 'The sky went a colour I don\'t have a word for', 'Somebody shouted a name and everyone ran'];

const KICKER_BY_GROUP = { People: 'CITY', Fate: 'BREAKING', Factions: 'POWER PLAYS', Places: 'ON THE MOVE', Things: 'LOST & FOUND', Loves: 'SOCIETY', Change: 'CITY' };

export const paperId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function blankStory(slot = 'brief') {
  return { id: paperId(), slot, kicker: '', headline: '', deck: '', byline: '', dateline: '', body: '', image: null, about: [] };
}

/** A fresh issue with sensible defaults; name it after the world's main city when there is one. */
export function newPaper(world, { seed = randomSeed() } = {}) {
  const rng = makeRng(`paper::${seed}`);
  const city = mainCity(world) || 'the City';
  const name = city === 'the City' ? `The Daily ${rng.pick(MASTHEADS)}` : `The ${city} ${rng.pick(MASTHEADS)}`;
  const d = new Date();
  return {
    v: 1, seed, masthead: name, slogan: rng.pick(SLOGANS), city, date: d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    edition: 'Morning edition', price: '50¢', volume: `Vol. ${roman(rng.int(40, 130))} · No. ${rng.int(100, 999)}`,
    layout: 'broadsheet', photoStyle: 'newsprint', ink: PAPER_INKS[0],
    ears: { left: `Weather: ${rng.pick(WEATHER)}`, right: `Inside: ${rng.pick(INSIDE)}` },
    stories: [blankStory('lead')],
    ads: [],
  };
}

function roman(n) { const m = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s; }

/** The city most characters are based in. */
export function mainCity(world) {
  const count = new Map();
  for (const e of world?.entities?.values?.() || []) if (e.type === 'location' && e.fields?.Kind === 'City') count.set(e.name, (count.get(e.name) || 0) + e.degree);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

const upperFirst = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());
const lowerFirst = (s) => String(s || '').replace(/^./, (c) => c.toLowerCase());
const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/** A story from one campaign-timeline item (a session, a battle, an event or a recorded moment). */
export function storyFromTimeline(it, world, { rng = makeRng(`story::${it.id}`), city = 'the City', slot = 'brief' } = {}) {
  const names = [];
  let text; let note = ''; let kicker = 'CITY'; let about = [];
  if (it.kind === 'change') {
    const m = it.m; const k = MOMENT_KINDS[m.kind];
    text = m.text; note = m.note || ''; kicker = KICKER_BY_GROUP[k?.group] || 'CITY';
    about = [m.a, m.b].filter(Boolean);
    for (const id of about) { const e = world.entities.get(id); if (e) names.push(e.name); }
  } else {
    const ev = it.ev;
    text = ev.name; note = ev.summary || '';
    kicker = it.kind === 'battle' ? 'BATTLE' : it.kind === 'session' ? 'THE WEEK' : (ev.fields?.Kind || 'EVENT').toUpperCase();
    about = [ev.id, ...ev.connections.filter((c) => c.other.type === 'person').slice(0, 4).map((c) => c.other.id)];
    for (const c of ev.connections) if (c.other.type === 'person') names.push(c.other.name);
  }
  const headline = headlineFrom(text, it.kind, rng);
  const deck = note ? firstSentence(note) : names.length ? `${names.slice(0, 3).join(', ')} at the centre of it` : rng.pick(['Witnesses tell of a night the city will not forget', 'Officials urge calm; nobody is calm', 'Full story inside']);
  const vars = { city: city.toUpperCase(), text: upperFirst(text), textLower: lowerFirst(text), quote: rng.pick(QUOTES) };
  const body = [fill(rng.pick(STORY_OPENERS), vars), note && note !== deck ? note : fill(rng.pick(STORY_MIDDLES), vars), fill(rng.pick(STORY_MIDDLES), vars), fill(rng.pick(STORY_CLOSERS), vars)].filter(Boolean).join('\n\n');
  return { ...blankStory(slot), kicker, headline, deck, byline: `By ${rng.pick(FIRST)} ${rng.pick(LAST)}`, dateline: '', body, about: [...new Set(about)], from: it.id };
}

function firstSentence(s) { return String(s).split(/(?<=[.!?])\s+/)[0].slice(0, 140); }

/** A headline from a sentence: shout it, trim the fat. */
export function headlineFrom(text, kind = 'change', rng = makeRng(text)) {
  let t = String(text || '').replace(/[.!]+$/, '').trim();
  if (kind === 'battle') t = rng.pick([`${t}: BLOW BY BLOW`, `CHAOS AS ${t}`, `${t}`]);
  else if (kind === 'session') t = rng.pick([`${t}`, `${t}: WHAT WE KNOW`, `INSIDE: ${t}`]);
  else t = rng.pick([`${t}`, `${t}, SOURCES SAY`, `${t}: CITY REELS`, `SHOCK AS ${t}`]);
  return t.toUpperCase();
}

/** A filler story that uses the world's own names where it can. */
export function fillerStory(world, rng = makeRng(randomSeed()), slot = 'brief') {
  const f = rng.pick(FILLERS);
  const factions = [...(world?.entities?.values?.() || [])].filter((e) => e.type === 'faction').map((e) => e.name);
  const vance = factions.length && rng.chance(0.5) ? rng.pick(factions) : 'Vance Industries';
  const sub = (s) => String(s).replace(/Vance Industries/g, vance);
  return { ...blankStory(slot), kicker: f.kicker, headline: sub(f.headline), deck: sub(f.deck), byline: rng.chance(0.5) ? `By ${rng.pick(FIRST)} ${rng.pick(LAST)}` : rng.pick(REPORTERS), body: sub(f.body) };
}

/**
 * Draft a whole front page from the campaign: the latest timeline items become the lead and second
 * stories, briefs and a sidebar; filler stories top it up. Deterministic for a seed.
 */
export function draftPaper(world, { seed = randomSeed(), session = null, count = 5, base = null } = {}) {
  const rng = makeRng(`draft::${seed}`);
  const paper = base ? { ...base, seed } : newPaper(world, { seed });
  const city = paper.city && paper.city !== 'the City' ? paper.city : mainCity(world) || 'the City';
  let items = campaignTimeline(world);
  if (session != null) items = items.filter((it) => it.session === session);
  items = items.slice(-count).reverse();
  const slots = ['lead', 'second', 'brief', 'brief', 'sidebar', 'brief', 'brief'];
  const stories = items.map((it, i) => storyFromTimeline(it, world, { rng, city, slot: slots[i] || 'brief' }));
  const used = new Set(stories.map((s) => s.headline));
  let guard = 0;
  while (stories.length < Math.max(4, Math.min(count, 5)) && guard++ < 20) {
    const f = fillerStory(world, rng, slots[stories.length] || 'brief');
    if (used.has(f.headline)) continue;
    used.add(f.headline); stories.push(f);
  }
  const d = base?.date || paper.date;
  const ads = base?.ads?.length ? base.ads : rollAds(world, rng, 3);
  return { ...paper, city, date: d, stories, ads, edition: session != null ? `Session ${session} edition` : paper.edition };
}

/** One line for the page's summary and the timeline. */
export function paperSummary(paper) {
  const lead = (paper.stories || []).find((s) => s.slot === 'lead') || (paper.stories || [])[0];
  return lead?.headline ? `${lead.headline}${lead.deck ? ` — ${lead.deck}` : ''}` : `${paper.masthead}, ${paper.date}`;
}

/** The issue's name as a World page: masthead and edition. */
export function paperName(paper) {
  return `${paper.masthead || 'The Paper'} · ${paper.edition || paper.date || 'edition'}`;
}

/** Strip pictures for a lighter copy (world keys keep them unless asked). */
export function paperWithoutPictures(paper) {
  return { ...paper, stories: (paper.stories || []).map((s) => (s.image?.src ? { ...s, image: { ...s.image, src: null } } : s)) };
}

// ---- adverts ------------------------------------------------------------------------------------------------
// Little boxed adverts fill out a front page the way they fill a real one: the GM writes their own or
// rolls some from the world's factions and places.

const ADS = [
  { title: '{faction}', text: 'Building tomorrow, today. Now hiring: physicists, pilots, people who do not ask questions.', tag: 'ADVERTISEMENT' },
  { title: 'BIG BITE BURGERS', text: 'Open all night. Open during the thing last Tuesday. Open now.', tag: 'ADVERTISEMENT' },
  { title: 'SKYLIGHT REPAIR', text: 'Same-day glazing. We know why you are calling. No judgement.', tag: 'CLASSIFIED' },
  { title: 'LEARN SELF-DEFENCE', text: 'Six weeks, no powers required. Sensei Ruiz, above the laundromat on 9th.', tag: 'CLASSIFIED' },
  { title: 'LOST: ONE CAT', text: 'Answers to Mister Whiskers. Last seen floating. Reward.', tag: 'CLASSIFIED' },
  { title: '{place} TOURS', text: 'See the crater! See the vault! See the place where it happened! Children half price.', tag: 'ADVERTISEMENT' },
  { title: 'DR. HALVORSEN, PSYCHIATRIST', text: 'Specialist in recovered memory, lost time and "it was not me". Discretion guaranteed.', tag: 'ADVERTISEMENT' },
  { title: 'ARMOURED GLASS', text: 'Storefronts. Penthouses. Aquariums. Rated to rank 8. Ask about rank 10.', tag: 'ADVERTISEMENT' },
  { title: 'ROOM TO LET', text: 'Top floor, rooftop access, no questions about the hours you keep. Cash.', tag: 'CLASSIFIED' },
  { title: 'TONIGHT AT THE ORPHEUM', text: 'One night only: THE AMAZING ZARDO. Doors 8. Disappearances 9.', tag: 'ADVERTISEMENT' },
  { title: 'CITY PAWN & LOAN', text: 'We buy gold, gadgets, glowing things. Serious offers for anything from off-world.', tag: 'ADVERTISEMENT' },
  { title: 'VOTE {faction}', text: 'A safer city. A stronger city. A city with fewer craters. Paid for by friends of {faction}.', tag: 'POLITICAL ADVERTISEMENT' },
  { title: 'WANTED: HENCHMEN', text: 'Full-time. Uniform provided. Dental. Must be comfortable with heights and lasers.', tag: 'CLASSIFIED' },
  { title: 'MIDNIGHT DINER', text: 'The coffee is hot and the counter has seen things. Corner of 5th and {place}.', tag: 'ADVERTISEMENT' },
];

export const AD_STYLES = { box: 'Boxed advert', banner: 'Banner across the bottom', classified: 'Classified (small print)' };

export function blankAd(style = 'box') { return { id: paperId(), style, tag: 'ADVERTISEMENT', title: '', text: '' }; }

export function rollAd(world, rng = makeRng(randomSeed()), style = 'box') {
  const ents = [...(world?.entities?.values?.() || [])];
  const factions = ents.filter((e) => e.type === 'faction').map((e) => e.name);
  const places = ents.filter((e) => e.type === 'location').map((e) => e.name);
  const ad = rng.pick(ADS);
  const vars = { faction: factions.length ? rng.pick(factions).toUpperCase() : 'VANCE INDUSTRIES', place: places.length ? rng.pick(places).toUpperCase() : 'DOWNTOWN' };
  return { ...blankAd(ad.tag === 'CLASSIFIED' ? 'classified' : style), tag: ad.tag, title: fill(ad.title, vars), text: fill(ad.text, vars) };
}

export function rollAds(world, rng = makeRng(randomSeed()), n = 3) {
  const out = []; const seen = new Set(); let guard = 0;
  while (out.length < n && guard++ < 30) { const a = rollAd(world, rng); if (seen.has(a.title)) continue; seen.add(a.title); out.push(a); }
  if (out.length) out[out.length - 1].style = out.length > 2 ? 'banner' : out[out.length - 1].style;
  return out;
}
