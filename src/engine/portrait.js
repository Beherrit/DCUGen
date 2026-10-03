// Character portraits: a prompt built from the sheet and the bio, rendered by a free, open-source
// text-to-image service (Pollinations.ai: no account, no key). The prompt and a seed are kept on
// the character, so the same portrait comes back and a re-roll only changes the seed.

import { avatarSvg } from './avatar.js';

export const PORTRAIT_SERVICE = { name: 'Pollinations.ai', url: 'https://pollinations.ai', free: true, openSource: true, limit: 'about one image every 15 seconds without an account' };
export const PORTRAIT_SERVICES = {
  horde: { name: 'AI Horde', url: 'https://aihorde.net', register: 'https://aihorde.net/register', free: true, openSource: true, blurb: 'Free, open source, run by volunteers\' GPUs. Real Stable Diffusion models: semi-realistic, anime, painted. Works without an account (slower queue); a free key from aihorde.net/register moves you up the line.' },
  pollinations: { name: 'Pollinations.ai', url: 'https://pollinations.ai', free: true, openSource: true, blurb: 'Free, no account, one picture every 15 seconds. Flux model, comic style. Some browsers and networks block it.' },
};
export const PORTRAIT_SOURCES = { ai: 'AI painting (free service, needs internet)', builtin: 'Built-in comic art (offline, instant)', upload: 'My own picture (uploaded)' };
/** Art styles: the words added to the prompt, and which AI Horde models paint them best (first that is online wins). */
export const PORTRAIT_STYLES = {
  comic: { label: 'Comic book', opener: 'comic book', suffix: 'detailed comic book art, bold inks, rich flat colors, dynamic shading', horde: ['Deliberate', 'Dreamshaper', 'AlbedoBase XL (SDXL)', 'stable_diffusion'] },
  semi: { label: 'Semi-realistic', opener: 'semi-realistic', suffix: 'semi-realistic digital painting, detailed face, cinematic lighting, sharp focus, concept art', horde: ['Deliberate', 'Dreamshaper', 'Realistic Vision', 'ICBINP - I Can\'t Believe It\'s Not Photography', 'AlbedoBase XL (SDXL)', 'stable_diffusion'] },
  anime: { label: 'Anime', opener: 'anime', suffix: 'anime style illustration, clean lineart, cel shading, detailed expressive eyes, vibrant colors', horde: ['Anything Diffusion', 'Anything v5', 'Counterfeit', 'AbyssOrangeMix', 'Animagine XL', 'stable_diffusion'] },
  painted: { label: 'Painted', opener: 'painted', suffix: 'oil painting portrait, painterly brushwork, dramatic chiaroscuro, museum quality', horde: ['Deliberate', 'Dreamshaper', 'AlbedoBase XL (SDXL)', 'stable_diffusion'] },
};
export const PORTRAIT_NEGATIVE = 'text, watermark, logo, signature, blurry, lowres, deformed, extra limbs, extra fingers, bad anatomy, bad hands, cropped head, duplicate';
const defaults = { style: 'comic', service: 'horde' };
/** The app sets these from the user's preferences; characters without their own choice follow them. */
export function setPortraitDefaults(d = {}) { Object.assign(defaults, d); }
export function portraitDefaults() { return { ...defaults }; }
const BASE = 'https://image.pollinations.ai/prompt/';

const lower = (s) => String(s || '').trim().toLowerCase();
const firstSentence = (s) => { const m = String(s || '').match(/^.*?[.!?](?=\s|$)/); return (m ? m[0] : String(s || '')).trim(); };

/** The prompt for a character's portrait, from identity, appearance, powers, side and bio. */
export function portraitPrompt(ch, { style = null } = {}) {
  const S = PORTRAIT_STYLES[style || ch.portrait?.style || defaults.style] || PORTRAIT_STYLES.comic;
  const id = ch.identity || {};
  const ap = ch.appearance || {};
  const name = id.codename || id.realName || 'a hero';
  const side = ch.alignment === 'villain' ? 'supervillain' : ch.minion ? 'henchman' : 'superhero';
  const kind = String(ch.kind || '').toLowerCase();
  const creature = ['creature', 'animal', 'monster'].includes(kind);
  const construct = ch.construct || kind === 'construct' || ch.abilities?.Stamina === null;
  const bits = [];
  if (creature) {
    bits.push(`${name}, a ${lower(ch.theme?.name || ch.summary || 'monster')}`);
    if (ch.summary) bits.push(firstSentence(ch.summary));
    if (ch.size && !/medium/i.test(ch.size)) bits.push(`${lower(ch.size)} size`);
  } else {
    bits.push(`${S.opener} ${side} portrait of ${name}`);
    const who = [id.gender ? lower(id.gender) : null, id.age ? `age ${id.age}` : null, construct ? 'android' : null].filter(Boolean).join(', ');
    if (who) bits.push(who);
    const looks = [ap.height && !/average/i.test(ap.height) ? `${lower(ap.height)} build` : null, ap.eyes ? `${lower(ap.eyes)} eyes` : null, ap.hair && !/none/i.test(ap.hair) ? `${lower(ap.hair)} hair` : null, ap.skin ? `${lower(ap.skin)} skin` : null, ap.feature && !/none/i.test(ap.feature) ? lower(ap.feature) : null].filter(Boolean);
    if (looks.length) bits.push(looks.join(', '));
    if (ap.costume) bits.push(`costume: ${lower(ap.costume)}`);
    if (ch.theme?.name) bits.push(`${lower(ch.theme.name)} powers${ch.theme.secondary?.name ? ` and ${lower(ch.theme.secondary.name)}` : ''}`);
    if (ch.archetype?.name && !/custom/i.test(ch.archetype.name)) bits.push(lower(ch.archetype.name));
    if (id.occupation) bits.push(`${lower(id.occupation)} by day`);
    const traits = [...(ch.personality?.positive || []), ...(ch.personality?.negative || [])].slice(0, 2).map(lower);
    if (traits.length) bits.push(`${traits.join(' and ')} expression`);
    const origin = ch.origin?.label ? `${lower(ch.origin.label)} origin` : null;
    if (origin) bits.push(origin);
    const story = firstSentence(ch.bio?.summary);
    if (story && story.length < 160) bits.push(story);
  }
  bits.push(ch.alignment === 'villain' ? 'dramatic low-key lighting, menacing' : 'dramatic lighting, heroic');
  bits.push(`upper body, looking at viewer, ${S.suffix}, plain background, no text, no logo`);
  return bits.join('; ');
}

/** The image URL for a prompt and seed. */
export function portraitUrl(prompt, { seed = 1, width = 512, height = 640, model = 'flux' } = {}) {
  const q = new URLSearchParams({ width: String(width), height: String(height), seed: String(seed), nologo: 'true', model });
  return `${BASE}${encodeURIComponent(prompt)}?${q}`;
}

/** The portrait settings on a character, filled in with defaults. */
export function portraitOf(ch) {
  const p = ch.portrait || {};
  const style = PORTRAIT_STYLES[p.style] ? p.style : defaults.style;
  const service = PORTRAIT_SERVICES[defaults.service] ? defaults.service : 'horde';
  const prompt = p.prompt || portraitPrompt(ch, { style });
  const seed = p.seed ?? 1;
  const source = p.source === 'upload' && p.image ? 'upload' : p.source === 'builtin' ? 'builtin' : 'ai';
  // live: the AI picture loaded straight from the service in this browser (it could not be copied
  // into the character, so the sheet shows it from the service's address, which the browser caches)
  return { prompt, custom: !!p.prompt, seed, source, url: portraitUrl(prompt, { seed }), avatar: avatarSvg(ch, { seed }).dataUrl, image: p.image || null, hidden: !!p.hidden, live: source === 'ai' && !!p.live, style, service, models: PORTRAIT_STYLES[style].horde };
}

export function setPortrait(ch, { seed, prompt, hidden, source, image, aiSaved, live, style } = {}) {
  const next = { ...(ch.portrait || {}) };
  if (style !== undefined) { if (style && PORTRAIT_STYLES[style] && style !== (next.style || defaults.style)) { next.style = style; delete next.live; } else if (!style) delete next.style; }
  if (aiSaved !== undefined) next.aiSaved = !!aiSaved;
  if (seed !== undefined && seed !== next.seed) { next.seed = seed; delete next.live; }
  if (prompt !== undefined) { const before = next.prompt; if (prompt && prompt !== portraitPrompt({ ...ch, portrait: next })) next.prompt = prompt; else delete next.prompt; if (before !== next.prompt) delete next.live; }
  if (hidden !== undefined) next.hidden = !!hidden;
  if (image !== undefined) { if (image) { next.image = image; next.source = 'upload'; delete next.live; } else { delete next.image; delete next.aiSaved; if (next.source === 'upload') delete next.source; } }
  if (live !== undefined) { if (live) next.live = true; else delete next.live; }
  if (source !== undefined) { if (source === 'builtin') next.source = 'builtin'; else if (source === 'upload' && next.image) next.source = 'upload'; else delete next.source; }
  ch.portrait = next;
  return ch;
}

/** Wipe the portrait entirely (hidden, no uploaded picture, default prompt). */
export function clearPortrait(ch) {
  ch.portrait = { hidden: true };
  return ch;
}

export function newPortraitSeed() {
  return Math.floor(Math.random() * 1e9);
}
