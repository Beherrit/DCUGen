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
