// Built-in portraits: a comic-style bust drawn as SVG from the character's looks, costume, theme and
// side. Deterministic for a seed, needs no network, and prints. Used as the fallback when the AI
// portrait can't load, or on its own.

import { makeRng } from './rng.js';

const SKIN = [
  [/synthetic|chrome|steel|plating|metal|silver/i, '#b8c0cc'], [/green/i, '#7fb069'], [/blue/i, '#7aa7d9'], [/gray|grey|stone|ash/i, '#9aa0a6'],
  [/scale|scaly/i, '#6d9c6f'], [/pale|porcelain|fair|light/i, '#f3d9c6'], [/olive|tan|bronze|golden|sun/i, '#d8a877'], [/dark|deep|ebony|black/i, '#5c3a21'],
  [/brown|warm/i, '#a9714b'], [/red|crimson/i, '#d97b6c'], [/purple|violet/i, '#9b7bd1'], [/white|bone|alabaster/i, '#efe9e4'],
];
const HAIR = [
  [/none|bald/i, null], [/black|raven|jet/i, '#1a1a1f'], [/brown|chestnut|auburn/i, '#5a3a22'], [/blond|blonde|golden|yellow/i, '#e8c86a'],
  [/red|ginger|copper/i, '#c8502a'], [/white|silver|platinum/i, '#e9ecef'], [/gray|grey/i, '#9aa0a6'], [/blue/i, '#3b6fd6'], [/green/i, '#3f9c5a'],
  [/pink/i, '#e879b8'], [/purple|violet/i, '#8a5cd6'], [/orange/i, '#f08a3c'],
];
const EYES = [[/blue|optic/i, '#3b82f6'], [/green/i, '#2f9e63'], [/brown|hazel/i, '#7a4a21'], [/gray|grey/i, '#8b949e'], [/amber|gold|yellow/i, '#e0a030'], [/violet|purple/i, '#8a5cd6'], [/red|glowing/i, '#e53935'], [/black/i, '#111']];
function seedHash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0; return h; }
const pick = (table, text, fallback) => { for (const [re, v] of table) if (re.test(text || '')) return v; return fallback; };
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
}

const EMBLEMS = {
  fire: 'M0,-22 C8,-12 12,-4 6,8 C10,2 12,-2 14,-8 C20,4 14,20 0,22 C-14,20 -20,4 -12,-10 C-10,-2 -6,2 -4,0 C-10,-10 -6,-18 0,-22 Z',
  ice: 'M0,-22 L0,22 M-19,-11 L19,11 M-19,11 L19,-11 M0,-22 L-6,-15 M0,-22 L6,-15 M0,22 L-6,15 M0,22 L6,15',
  electric: 'M6,-24 L-12,4 L-1,4 L-6,24 L12,-6 L1,-6 Z',
  star: 'M0,-22 L6,-7 L22,-7 L9,3 L14,19 L0,10 L-14,19 L-9,3 L-22,-7 L-6,-7 Z',
  circle: 'M0,-18 A18,18 0 1,0 0.1,-18 Z',
  diamond: 'M0,-22 L18,0 L0,22 L-18,0 Z',
  crescent: 'M8,-20 A20,20 0 1,0 8,20 A14,14 0 1,1 8,-20 Z',
  triangle: 'M0,-20 L20,16 L-20,16 Z',
  eye: 'M-22,0 Q0,-18 22,0 Q0,18 -22,0 Z M0,-8 A8,8 0 1,0 0.1,-8 Z',
  skull: 'M0,-20 A16,16 0 0,1 16,-4 L14,10 L8,10 L8,18 L-8,18 L-8,10 L-14,10 L-16,-4 A16,16 0 0,1 0,-20 Z M-8,-4 A4,4 0 1,0 -7.9,-4 Z M8,-4 A4,4 0 1,0 8.1,-4 Z',
};
const THEME_EMBLEM = { fire: 'fire', ice: 'ice', electric: 'electric', light: 'star', cosmic: 'star', shadow: 'crescent', death: 'skull', psychic: 'eye', magic: 'eye', earth: 'triangle', air: 'circle', water: 'circle', sonic: 'circle', gravity: 'circle', magnetism: 'diamond', strength: 'diamond', speed: 'electric', plant: 'triangle', animal: 'triangle', size: 'diamond', stretch: 'circle', shapeshift: 'crescent', tech: 'diamond', arsenal: 'diamond', martial: 'circle', radiation: 'star', chaos: 'star', time: 'circle', space: 'star' };

/**
 * An SVG bust for a character. Returns { svg, dataUrl }.
 */
export function avatarSvg(ch, { seed = 1, width = 400, height = 500 } = {}) {
  const rng = makeRng(`avatar::${seed}::${ch.identity?.codename || ''}`);
  const id = ch.identity || {};
  const ap = ch.appearance || {};
  const villain = ch.alignment === 'villain';
  const kind = String(ch.kind || '').toLowerCase();
  const creature = ['creature', 'animal', 'monster'].includes(kind);
  const construct = !!ch.construct || kind === 'construct' || ch.abilities?.Stamina === null;
  const theme = ch.theme?.color || (villain ? '#5b2a86' : '#1f4fbf');
  const second = ch.theme?.secondary?.color || shade(theme, villain ? -70 : 70);
  const skin = construct ? '#b8c0cc' : pick(SKIN, ap.skin, creature ? shade(theme, -20) : '#d8a877');
  const hairColor = construct ? null : pick(HAIR, ap.hair, '#3a2a1a');
  const eye = pick(EYES, ap.eyes, '#3b82f6');
  const feature = `${ap.feature || ''} ${ap.costume || ''}`;
  const costume = String(ap.costume || '');
  const female = id.gender === 'Female';
  const headW = (female ? 62 : 68) + rng.int(-4, 4);
  const headH = (female ? 82 : 86) + rng.int(-4, 4);
  const jaw = rng.int(0, 2); // 0 round, 1 square, 2 pointed
  const cx = 200; const cy = 220;
  const hairStyle = hairColor ? (/long|flow/i.test(ap.hair) || (female && rng.chance(0.55)) ? 'long' : rng.chance(0.2) ? 'mohawk' : rng.chance(0.5) ? 'short' : 'swept') : 'none';
  const mask = /mask|domino/i.test(feature) || ['crimefighter', 'infiltrator', 'martialartist', 'weaponmaster'].includes(ch.archetype?.id) && rng.chance(0.7);
  const cowl = /stealth|gothic|hood/i.test(costume) || (villain && rng.chance(0.25));
  const helmet = construct || ['battlesuit', 'robot', 'android'].includes(ch.archetype?.id) || /armored|high-tech|futuristic/i.test(costume) && rng.chance(0.5);
  const cape = /cape/i.test(feature) || /classic hero/i.test(costume) && rng.chance(0.4);
  const horns = /horn/i.test(feature); const thirdEye = /third eye/i.test(feature); const glow = /glowing/i.test(feature) || /glowing|optic/i.test(ap.eyes || '');
  const scar = /scar/i.test(feature); const wings = /wing/i.test(feature);
  const positive = (ch.personality?.positive || []).length;
  const smile = villain ? -1 : positive ? 1 : 0;
  const emblem = EMBLEMS[THEME_EMBLEM[ch.theme?.id] || 'star'];
  const ink = '#141821';
  const uid = `a${Math.abs(seedHash(`${seed}${id.codename || ''}`)).toString(36)}`;
  const bg1 = shade(theme, villain ? -90 : -40); const bg2 = shade(theme, villain ? -130 : 10);

  const parts = [];
  // background: gradient, halftone, speed lines
  parts.push(`<defs><linearGradient id="bg-${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg2}"/><stop offset="1" stop-color="${bg1}"/></linearGradient>
<pattern id="dots-${uid}" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="rgba(0,0,0,.28)"/></pattern>
<linearGradient id="suit-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme}"/><stop offset="1" stop-color="${shade(theme, -50)}"/></linearGradient>
<filter id="glow-${uid}"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`);
  parts.push(`<rect width="${width}" height="${height}" fill="url(#bg-${uid})"/><rect width="${width}" height="${height}" fill="url(#dots-${uid})"/>`);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + rng.next(); parts.push(`<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * 600}" y2="${cy + Math.sin(a) * 600}" stroke="rgba(255,255,255,${villain ? 0.05 : 0.1})" stroke-width="${rng.int(2, 7)}"/>`); }
  // cape and wings behind
  if (wings) parts.push(`<path d="M${cx - 60},${cy + 120} Q${cx - 230},${cy - 60} ${cx - 150},${cy - 140} Q${cx - 120},${cy - 20} ${cx - 60},${cy + 60} Z M${cx + 60},${cy + 120} Q${cx + 230},${cy - 60} ${cx + 150},${cy - 140} Q${cx + 120},${cy - 20} ${cx + 60},${cy + 60} Z" fill="${shade(second, -30)}" stroke="${ink}" stroke-width="4"/>`);
  if (cape) parts.push(`<path d="M${cx - 118},${cy + 125} Q${cx - 150},${cy + 260} ${cx - 165},${height + 10} L${cx + 165},${height + 10} Q${cx + 150},${cy + 260} ${cx + 118},${cy + 125} Q${cx},${cy + 100} ${cx - 118},${cy + 125} Z" fill="${shade(second, -20)}" stroke="${ink}" stroke-width="4"/>`);
  // torso / shoulders
  parts.push(`<path d="M${cx - 150},${height + 10} L${cx - 135},${cy + 150} Q${cx - 110},${cy + 95} ${cx - 45},${cy + 85} L${cx + 45},${cy + 85} Q${cx + 110},${cy + 95} ${cx + 135},${cy + 150} L${cx + 150},${height + 10} Z" fill="url(#suit-${uid})" stroke="${ink}" stroke-width="5"/>`);
  parts.push(`<path d="M${cx - 60},${cy + 90} L${cx},${cy + 170} L${cx + 60},${cy + 90}" fill="none" stroke="${second}" stroke-width="10" stroke-linejoin="round"/>`);
  if (helmet || /armored/i.test(costume)) parts.push(`<path d="M${cx - 135},${cy + 150} Q${cx - 100},${cy + 120} ${cx - 70},${cy + 150} M${cx + 135},${cy + 150} Q${cx + 100},${cy + 120} ${cx + 70},${cy + 150}" fill="none" stroke="${ink}" stroke-width="4"/>`);
  // emblem
  parts.push(`<g transform="translate(${cx},${cy + 215}) scale(1.6)"><circle r="30" fill="${second}" stroke="${ink}" stroke-width="3"/><path d="${emblem}" fill="${theme}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"${emblem.startsWith('M0,-22 L0,22') ? ' fill="none"' : ''}/></g>`);
  // neck
  parts.push(`<rect x="${cx - 24}" y="${cy + 40}" width="48" height="60" rx="14" fill="${shade(skin, -25)}" stroke="${ink}" stroke-width="4"/>`);
  // long hair behind the head
  if (hairStyle === 'long') parts.push(`<path d="M${cx - headW - 4},${cy - 40} Q${cx - headW - 16},${cy + 70} ${cx - headW + 4},${cy + 125} L${cx - 40},${cy + 125} L${cx - 40},${cy + 70} L${cx + 40},${cy + 70} L${cx + 40},${cy + 125} L${cx + headW - 4},${cy + 125} Q${cx + headW + 16},${cy + 70} ${cx + headW + 4},${cy - 40} Q${cx},${cy - headH - 14} ${cx - headW - 4},${cy - 40} Z" fill="${hairColor}" stroke="${ink}" stroke-width="4"/>`);
  // head
  const headPath = jaw === 1
    ? `M${cx - headW},${cy - 30} Q${cx - headW},${cy - headH} ${cx},${cy - headH} Q${cx + headW},${cy - headH} ${cx + headW},${cy - 30} L${cx + headW - 8},${cy + 40} Q${cx + headW - 20},${cy + headH - 10} ${cx},${cy + headH - 4} Q${cx - headW + 20},${cy + headH - 10} ${cx - headW + 8},${cy + 40} Z`
    : jaw === 2
      ? `M${cx - headW},${cy - 30} Q${cx - headW},${cy - headH} ${cx},${cy - headH} Q${cx + headW},${cy - headH} ${cx + headW},${cy - 30} Q${cx + headW - 6},${cy + 50} ${cx},${cy + headH} Q${cx - headW + 6},${cy + 50} ${cx - headW},${cy - 30} Z`
      : `M${cx},${cy - headH} A${headW},${headH} 0 1,1 ${cx - 0.1},${cy - headH} Z`;
  parts.push(`<ellipse cx="${cx - headW + 2}" cy="${cy + 4}" rx="12" ry="18" fill="${skin}" stroke="${ink}" stroke-width="4"/><ellipse cx="${cx + headW - 2}" cy="${cy + 4}" rx="12" ry="18" fill="${skin}" stroke="${ink}" stroke-width="4"/>`);
  parts.push(`<path d="${headPath}" fill="${skin}" stroke="${ink}" stroke-width="5"/>`);
  if (construct) parts.push(`<path d="M${cx - 30},${cy - headH + 20} L${cx - 30},${cy + 50} M${cx + 30},${cy - headH + 20} L${cx + 30},${cy + 50} M${cx - headW + 10},${cy + 10} L${cx + headW - 10},${cy + 10}" stroke="${shade(skin, -60)}" stroke-width="3"/>`);
  if (scar) parts.push(`<path d="M${cx + 20},${cy - 40} L${cx + 34},${cy + 2}" stroke="${shade(skin, -70)}" stroke-width="4" stroke-linecap="round"/>`);
  // eyes
  const ey = cy - 8; const ex = 28;
  const eyeShape = (x) => `<path d="M${x - 18},${ey} Q${x},${ey - 14} ${x + 18},${ey} Q${x},${ey + 12} ${x - 18},${ey} Z" fill="#fff" stroke="${ink}" stroke-width="3"/><circle cx="${x}" cy="${ey}" r="7" fill="${eye}"${glow ? ' filter="url(#glow-${uid})"' : ''}/><circle cx="${x}" cy="${ey}" r="3" fill="${ink}"/><circle cx="${x + 3}" cy="${ey - 3}" r="2" fill="#fff"/>`;
  if (helmet && construct) parts.push(`<rect x="${cx - 50}" y="${ey - 12}" width="100" height="24" rx="8" fill="${shade(theme, -60)}" stroke="${ink}" stroke-width="3"/><rect x="${cx - 44}" y="${ey - 6}" width="88" height="12" rx="6" fill="${eye}" filter="url(#glow-${uid})"/>`);
  else parts.push(eyeShape(cx - ex), eyeShape(cx + ex));
  if (thirdEye) parts.push(`<path d="M${cx - 12},${cy - 48} Q${cx},${cy - 60} ${cx + 12},${cy - 48} Q${cx},${cy - 38} ${cx - 12},${cy - 48} Z" fill="#fff" stroke="${ink}" stroke-width="3"/><circle cx="${cx}" cy="${cy - 48}" r="4" fill="${eye}"/>`);
  // brows
  const browTilt = villain ? 8 : smile > 0 ? -2 : 2;
  parts.push(`<path d="M${cx - ex - 18},${ey - 20 + (villain ? -2 : 0)} L${cx - ex + 16},${ey - 20 + browTilt}" stroke="${hairColor || ink}" stroke-width="6" stroke-linecap="round"/><path d="M${cx + ex + 18},${ey - 20 + (villain ? -2 : 0)} L${cx + ex - 16},${ey - 20 + browTilt}" stroke="${hairColor || ink}" stroke-width="6" stroke-linecap="round"/>`);
  // mask / cowl
  if (mask && !helmet) parts.push(`<path d="M${cx - headW + 6},${ey - 10} Q${cx - ex},${ey - 34} ${cx},${ey - 14} Q${cx + ex},${ey - 34} ${cx + headW - 6},${ey - 10} Q${cx + ex + 10},${ey + 22} ${cx},${ey + 14} Q${cx - ex - 10},${ey + 22} ${cx - headW + 6},${ey - 10} Z" fill="${second}" stroke="${ink}" stroke-width="4"/>`, eyeShape(cx - ex), eyeShape(cx + ex));
  if (cowl && !helmet) parts.push(`<path d="M${cx - headW - 6},${cy + 30} L${cx - headW - 6},${cy - 30} Q${cx},${cy - headH - 20} ${cx + headW + 6},${cy - 30} L${cx + headW + 6},${cy + 30} Q${cx + headW - 30},${cy - 30} ${cx},${cy - 24} Q${cx - headW + 30},${cy - 30} ${cx - headW - 6},${cy + 30} Z" fill="${shade(theme, -40)}" stroke="${ink}" stroke-width="4"/>`);
  // nose and mouth
  parts.push(`<path d="M${cx},${cy + 2} L${cx - 6},${cy + 26} L${cx + 6},${cy + 26}" fill="none" stroke="${shade(skin, -70)}" stroke-width="3" stroke-linejoin="round"/>`);
  const mouthY = cy + 48;
  parts.push(smile > 0 ? `<path d="M${cx - 20},${mouthY} Q${cx},${mouthY + 18} ${cx + 20},${mouthY}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`
    : smile < 0 ? `<path d="M${cx - 18},${mouthY + 8} Q${cx + 4},${mouthY - 10} ${cx + 22},${mouthY + 4}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`
      : `<path d="M${cx - 18},${mouthY + 4} L${cx + 18},${mouthY + 4}" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`);
  // hair on top
  if (helmet && !construct) parts.push(`<path d="M${cx - headW - 8},${cy - 10} Q${cx - headW - 8},${cy - headH - 14} ${cx},${cy - headH - 14} Q${cx + headW + 8},${cy - headH - 14} ${cx + headW + 8},${cy - 10} L${cx + headW + 8},${cy + 10} L${cx + headW - 10},${cy + 10} L${cx + headW - 10},${cy - 30} Q${cx},${cy - headH + 4} ${cx - headW + 10},${cy - 30} L${cx - headW + 10},${cy + 10} L${cx - headW - 8},${cy + 10} Z" fill="${shade(theme, -30)}" stroke="${ink}" stroke-width="4"/>`);
  else if (construct) parts.push(`<path d="M${cx - headW},${cy - 30} Q${cx - headW},${cy - headH - 6} ${cx},${cy - headH - 6} Q${cx + headW},${cy - headH - 6} ${cx + headW},${cy - 30} Q${cx},${cy - headH + 30} ${cx - headW},${cy - 30} Z" fill="${shade(skin, -40)}" stroke="${ink}" stroke-width="4"/>`);
  else if (hairStyle === 'short' || hairStyle === 'long') parts.push(`<path d="M${cx - headW - 4},${cy - 20} Q${cx - headW - 4},${cy - headH - 12} ${cx},${cy - headH - 12} Q${cx + headW + 4},${cy - headH - 12} ${cx + headW + 4},${cy - 20} Q${cx + headW - 20},${cy - headH + 20} ${cx + 10},${cy - headH + 24} Q${cx - 30},${cy - headH + 10} ${cx - headW - 4},${cy - 20} Z" fill="${hairColor}" stroke="${ink}" stroke-width="4"/>`);
  else if (hairStyle === 'swept') parts.push(`<path d="M${cx - headW - 6},${cy - 10} Q${cx - headW},${cy - headH - 16} ${cx + 20},${cy - headH - 10} Q${cx + headW + 20},${cy - headH} ${cx + headW + 2},${cy - 36} Q${cx + 30},${cy - headH + 14} ${cx - 20},${cy - headH + 30} Q${cx - headW + 10},${cy - headH + 24} ${cx - headW - 6},${cy - 10} Z" fill="${hairColor}" stroke="${ink}" stroke-width="4"/>`);
  else if (hairStyle === 'mohawk') parts.push(`<path d="M${cx - 16},${cy - headH + 6} L${cx - 10},${cy - headH - 50} L${cx + 10},${cy - headH - 50} L${cx + 16},${cy - headH + 6} Z" fill="${hairColor}" stroke="${ink}" stroke-width="4"/>`);
  if (horns) parts.push(`<path d="M${cx - headW + 14},${cy - headH + 10} Q${cx - headW - 20},${cy - headH - 30} ${cx - headW + 4},${cy - headH - 50} Q${cx - headW + 24},${cy - headH - 20} ${cx - headW + 30},${cy - headH + 2} Z M${cx + headW - 14},${cy - headH + 10} Q${cx + headW + 20},${cy - headH - 30} ${cx + headW - 4},${cy - headH - 50} Q${cx + headW - 24},${cy - headH - 20} ${cx + headW - 30},${cy - headH + 2} Z" fill="${shade(skin, -60)}" stroke="${ink}" stroke-width="4"/>`);
  // name plate
  const name = esc((id.codename || id.realName || '').toUpperCase().slice(0, 22));
  if (name) parts.push(`<rect x="0" y="${height - 46}" width="${width}" height="46" fill="rgba(0,0,0,.55)"/><text x="${width / 2}" y="${height - 15}" text-anchor="middle" font-family="Impact, 'Arial Narrow', sans-serif" font-size="30" letter-spacing="2" fill="#fff">${name}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${parts.join('')}</svg>`;
  return { svg, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
}
