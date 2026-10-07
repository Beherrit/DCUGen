// Share codes: a character compressed into a short text string ("DCU1." + base64url).
// The code also works inside a link: DCUGen.html#c=DCU1....

const PREFIX = 'DCU1.';

function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const s = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

export async function inflateRaw(bytes) {
  return pipe(bytes, new DecompressionStream('deflate-raw'));
}

/** Strip bulky or local-only fields before sharing. */
function slim(ch) {
  const { rosterId, savedAt, ...rest } = ch;
  return rest;
}

export async function encodeCharacter(ch) {
  const json = new TextEncoder().encode(JSON.stringify(slim(ch)));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  return PREFIX + toBase64Url(packed);
}

/** Accepts a share code, a link containing one, or raw JSON. */
export async function decodeCharacter(input) {
  const text = String(input || '').trim();
  if (text.startsWith('{')) return JSON.parse(text);
  const m = /DCU1\.([A-Za-z0-9_-]+)/.exec(text);
  if (!m) throw new Error('That is not a DCUGen share code. Codes start with "DCU1."');
  const bytes = await inflateRaw(fromBase64Url(m[1]));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function shareLink(code) {
  const base = location.href.split('#')[0];
  return `${base}#c=${code}`;
}

// ---- a whole world in one key -----------------------------------------------------------------------------
// "DCUW1." + base64url(deflate(JSON { world, characters })). Portrait paintings are left out (they are
// big and the receiver's app repaints them); everything else travels: pages, ties, moments, the roster.

const WORLD_PREFIX = 'DCUW1.';
export function isWorldKey(text) { return /DCUW1\.[A-Za-z0-9_-]{8,}/.test(String(text || '')); }

function slimForWorld(ch) {
  const { savedAt, lobbyShared, ...rest } = ch;
  if (rest.portrait?.image && rest.portrait.aiSaved) { const { image, aiSaved, ...p } = rest.portrait; rest.portrait = p; }
  return rest;
}

export async function encodeWorld(world, characters, { name = '' } = {}) {
  const payload = { app: 'DCUGen', kind: 'world', v: 1, name: name || world?.name || 'World', madeAt: new Date().toISOString(), world, characters: (characters || []).map(slimForWorld) };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  return WORLD_PREFIX + toBase64Url(packed);
}

export async function decodeWorld(input) {
  const text = String(input || '').trim();
  const m = /DCUW1\.([A-Za-z0-9_-]+)/.exec(text);
  if (!m) throw new Error('That is not a world key. World keys start with "DCUW1."');
  const bytes = await inflateRaw(fromBase64Url(m[1]));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (data.kind !== 'world' || !data.world) throw new Error('That key does not hold a world.');
  return data;
}

/** Rough size for the user: "38 KB". */
export function keySize(key) { const n = key.length; return n < 1024 ? `${n} chars` : `${Math.round(n / 1024)} KB`; }

// ---- one front page as a key ------------------------------------------------------------------------------
// "DCUN1." + base64url(deflate(JSON paper)). Pictures ride along (they are small), so a player gets the page as printed.

const PAPER_PREFIX = 'DCUN1.';
export function isPaperKey(text) { return /DCUN1\.[A-Za-z0-9_-]{8,}/.test(String(text || '')); }

export async function encodePaper(paper, { pictures = true } = {}) {
  const p = pictures ? paper : { ...paper, stories: (paper.stories || []).map((s) => (s.image?.src ? { ...s, image: { ...s.image, src: null } } : s)) };
  const json = new TextEncoder().encode(JSON.stringify({ app: 'DCUGen', kind: 'paper', v: 1, paper: p }));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  return PAPER_PREFIX + toBase64Url(packed);
}

export async function decodePaper(input) {
  const m = /DCUN1\.([A-Za-z0-9_-]+)/.exec(String(input || '').trim());
  if (!m) throw new Error('That is not a front-page key. They start with "DCUN1."');
  const data = JSON.parse(new TextDecoder().decode(await inflateRaw(fromBase64Url(m[1]))));
  if (data.kind !== 'paper' || !data.paper) throw new Error('That key does not hold a front page.');
  return data.paper;
}

export function paperLink(key) { return `${location.href.split('#')[0]}#n=${key}`; }

// ---- one handout as a key -------------------------------------------------------------------------------
const HANDOUT_PREFIX = 'DCUH1.';
export function isHandoutKey(text) { return /DCUH1\.[A-Za-z0-9_-]{8,}/.test(String(text || '')); }

export async function encodeHandout(handout) {
  const json = new TextEncoder().encode(JSON.stringify({ app: 'DCUGen', kind: 'handout', v: 1, handout }));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  return HANDOUT_PREFIX + toBase64Url(packed);
}

export async function decodeHandout(input) {
  const m = /DCUH1\.([A-Za-z0-9_-]+)/.exec(String(input || '').trim());
  if (!m) throw new Error('That is not a handout key. They start with "DCUH1."');
  const data = JSON.parse(new TextDecoder().decode(await inflateRaw(fromBase64Url(m[1]))));
  if (data.kind !== 'handout' || !data.handout) throw new Error('That key does not hold a handout.');
  return data.handout;
}

export function handoutLink(key) { return `${location.href.split('#')[0]}#h=${key}`; }
