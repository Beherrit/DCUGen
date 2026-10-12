// Every fight becomes a comic page: six panels picked from the Battle Room log (the opening blow,
// natural 20s, the big conditions, knockouts, the end), with the fighters' portraits, a narration box
// and a sound effect. Rendered as an SVG page that the app turns into a PNG to share.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text, width) {
  const out = []; let line = '';
  for (const w of String(text).split(/\s+/)) { if ((`${line} ${w}`).trim().length > width) { if (line) out.push(line); line = w; } else line = `${line} ${w}`.trim(); }
  if (line) out.push(line);
  return out;
}

/** Turn a log line into narration: drop the dice arithmetic, keep what happened. */
export function narrate(text) {
  return String(text || '')
    .replace(/:\s*d20 [^—–]*[—–]\s*/g, ': ')
    .replace(/\s*\((?:Power Attack|Defensive Attack|All-out Attack|Accurate Attack)[^)]*\)/g, '')
    .replace(/\s+—\s+/g, ' — ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const SFX = {
  ko: ['KRA-THOOM!', 'KA-BLAMM!', 'THOOOM!'],
  fire: ['FWOOSH!', 'FOOMP!'], cold: ['KRRSSHH!', 'FZZT!'], electric: ['ZZAKT!', 'KZZRAK!'], sonic: ['WHUMMM!', 'BWAAAM!'],
  mind: ['MMMNNN!', 'ZZZWEEE!'], area: ['KA-BOOOM!', 'BADOOM!'], crit: ['BLAM!', 'KRAK!'], flee: ['WHOOSH!', 'ZOOM!'],
  hit: ['POW!', 'WHAM!', 'THWACK!', 'KRUNCH!', 'SMAK!'], miss: ['WHIFF!', 'SWISH!'],
};
function sfxFor(e, i) {
  const t = String(e.text || '').toLowerCase();
  const pick = (k) => SFX[k][i % SFX[k].length];
  if (/incapacitated|knocked out|collapses/.test(t)) return pick('ko');
  if (e.kind === 'flee' || /runs for it|bolts/.test(t)) return pick('flee');
  if (/natural 20|critical/.test(t) || (Array.isArray(e.dice) && e.dice.some((d) => d.roll === 20))) return pick('crit');
  if (/area|burst|cone|line/.test(t)) return pick('area');
  if (/fire|flame|burn/.test(t)) return pick('fire');
  if (/ice|cold|frost/.test(t)) return pick('cold');
  if (/electric|lightning|shock|bolt/.test(t)) return pick('electric');
  if (/sonic|scream|sound/.test(t)) return pick('sonic');
  if (/will|mind|mental|psychic|controlled|entranced/.test(t)) return pick('mind');
  if (/miss/.test(t)) return pick('miss');
  return pick('hit');
}

function scoreOf(e) {
  const t = String(e.text || '');
  if (e.kind === 'end') return 100;
  if (/INCAPACITATED|collapses|knocked out/.test(t)) return 9;
  if (Array.isArray(e.dice) && e.dice.some((d) => d.roll === 20)) return 8;
  if (/critical/i.test(t)) return 8;
  if (/STAGGERED/.test(t)) return 7;
  if (/STUNNED|CONTROLLED|turns on|PARALYZED|TRANSFORMED/.test(t)) return 6;
  if (e.kind === 'flee') return 5;
  if (/caught in it|drops .* area/i.test(t)) return 5;
  if (/DAZED|bruise|−\d Toughness/.test(t)) return 3;
  if (e.kind === 'hit' || e.kind === 'attack') return 2;
  return e.important ? 2 : 0;
}

/**
 * Pick the six best moments of a battle, in order. Returns { title, subtitle, panels: [{ round, caption,
 * sfx, actor, target }] }. portraitOf(ch) may return an image URL (data: URLs only, so the page can be
 * turned into a PNG) or null.
 */
export function battleComic(battle, { portraitOf = () => null } = {}) {
  const who = (id) => {
    const c = battle.combatants.find((x) => x.id === id);
    if (!c) return null;
    let img = null;
    try { img = portraitOf(c.ch); } catch { img = null; }
    return { name: c.name, color: c.color || '#666', team: c.team, img: img && /^data:/.test(img) ? img : null };
  };
  const log = battle.log || [];
  const scored = log.map((e, i) => ({ e, i, s: scoreOf(e) })).filter((x) => x.s > 0);
  const opening = scored.find((x) => x.e.actor && (x.e.kind === 'hit' || x.e.kind === 'attack'));
  const end = scored.find((x) => x.e.kind === 'end');
  const chosen = new Map();
  if (opening) chosen.set(opening.i, opening);
  if (end) chosen.set(end.i, end);
  for (const x of [...scored].sort((a, b) => b.s - a.s || a.i - b.i)) {
    if (chosen.size >= 6) break;
    // one panel per moment: skip lines right next to one already chosen about the same pair
    if ([...chosen.values()].some((c) => Math.abs(c.i - x.i) <= 1 && c.e.target === x.e.target && c.e.actor === x.e.actor)) continue;
    chosen.set(x.i, x);
  }
  const panels = [...chosen.values()].sort((a, b) => a.i - b.i).map(({ e }, n) => {
    const actor = who(e.actor);
    const target = e.target && e.target !== e.actor ? who(e.target) : null;
    const winners = e.kind === 'end' ? battle.combatants.filter((c) => !c.out && !c.fled && c.team === battle.winner).map((c) => who(c.id)) : [];
    return {
      round: e.round,
      caption: e.kind === 'end' ? narrate(e.text) : `${n === 0 ? 'It begins! ' : ''}${narrate(e.text)}`,
      sfx: e.kind === 'end' ? (battle.winner ? 'VICTORY!' : 'STALEMATE!') : sfxFor(e, n),
      actor: e.kind === 'end' ? winners[0] || null : actor,
      target: e.kind === 'end' ? winners[1] || null : target,
    };
  });
  const teams = [...new Set(battle.combatants.map((c) => c.team))].sort();
  const sides = teams.map((t) => battle.combatants.filter((c) => c.team === t).map((c) => c.name.replace(/ #\d+$/, '')).filter((v, i, a) => a.indexOf(v) === i).join(' & ')).join(' vs. ');
  return { title: battle.name && battle.name !== 'Battle' ? battle.name : 'Showdown!', subtitle: sides, panels };
}

function figure(p, x, y, r, side) {
  if (!p) return '';
  const id = `c${Math.random().toString(36).slice(2, 8)}`;
  const initial = esc((p.name || '?').trim()[0]?.toUpperCase() || '?');
  return `<g transform="translate(${x} ${y})"><clipPath id="${id}"><circle r="${r}"/></clipPath>
<circle r="${r + 6}" fill="#111"/><circle r="${r}" fill="${esc(p.color)}"/>
${p.img ? `<image href="${esc(p.img)}" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" preserveAspectRatio="xMidYMin slice" clip-path="url(#${id})"/>` : `<text y="${r * 0.36}" text-anchor="middle" font-size="${r}" font-weight="900" font-family="Impact, 'Arial Black', sans-serif" fill="#fff">${initial}</text>`}
<text y="${r + 30}" text-anchor="${side === 'r' ? 'end' : 'start'}" x="${side === 'r' ? r : -r}" font-size="20" font-weight="800" font-family="Arial, Helvetica, sans-serif" fill="#111" stroke="#fff" stroke-width="5" paint-order="stroke">${esc(p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name)}</text></g>`;
}

function burst(cx, cy, r, points, fill) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) { const a = (Math.PI * i) / points; const rr = i % 2 ? r * 0.55 : r; pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`); }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="#111" stroke-width="5"/>`;
}

/** The comic page as an SVG (1000 × 1460). */
export function comicSvg(comic) {
  const W = 1000; const PW = 470; const PH = 400; const top = 150;
  const panels = comic.panels.slice(0, 6).map((p, i) => {
    const col = i % 2; const row = Math.floor(i / 2);
    const x = 20 + col * (PW + 20); const y = top + row * (PH + 20);
    const a = p.actor?.color || '#c8202f'; const b = p.target?.color || '#2f6fde';
    const cap = wrap(p.caption, 44).slice(0, 4);
    const sfxSize = p.sfx.length > 8 ? 40 : p.sfx.length > 5 ? 46 : 56;
    const rays = Array.from({ length: 14 }, (_, k) => { const ang = (k / 14) * Math.PI * 2; return `<path d="M${PW / 2} ${PH / 2 + 30} L${PW / 2 + Math.cos(ang) * 600} ${PH / 2 + 30 + Math.sin(ang) * 600} L${PW / 2 + Math.cos(ang + 0.18) * 600} ${PH / 2 + 30 + Math.sin(ang + 0.18) * 600} Z" fill="#fff" opacity="0.18"/>`; }).join('');
    return `<g transform="translate(${x} ${y})"><clipPath id="p${i}"><rect width="${PW}" height="${PH}"/></clipPath>
<g clip-path="url(#p${i})"><rect width="${PW}" height="${PH}" fill="${esc(a)}"/><path d="M${PW} 0 L${PW} ${PH} L${PW * 0.35} ${PH} Z" fill="${esc(b)}" opacity="0.85"/>${rays}
${figure(p.actor, 110, 250, 70, 'l')}${figure(p.target, PW - 110, 230, 62, 'r')}
<g transform="rotate(-8 ${PW / 2} 175)">${burst(PW / 2, 175, 92, 11, '#ffe14d')}<text x="${PW / 2}" y="${175 + sfxSize * 0.35}" text-anchor="middle" font-size="${sfxSize}" font-weight="900" font-family="Impact, 'Arial Black', sans-serif" fill="#e3242b" stroke="#111" stroke-width="3" paint-order="stroke">${esc(p.sfx)}</text></g>
<rect x="10" y="10" width="${PW - 20}" height="${22 + cap.length * 23}" fill="#fff6b0" stroke="#111" stroke-width="3"/>
${cap.map((l, j) => `<text x="22" y="${32 + j * 23}" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="#111">${esc(l)}</text>`).join('')}
${p.round ? `<text x="${PW - 14}" y="${PH - 12}" text-anchor="end" font-size="15" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#fff" stroke="#111" stroke-width="3" paint-order="stroke">ROUND ${p.round}</text>` : ''}</g>
<rect width="${PW}" height="${PH}" fill="none" stroke="#111" stroke-width="7"/></g>`;
  }).join('\n');
  const rows = Math.ceil(Math.min(6, comic.panels.length) / 2);
  const H = top + rows * (PH + 20) + 50;
  const title = esc(comic.title.toUpperCase());
  const titleSize = Math.max(40, Math.min(78, Math.floor(940 / (comic.title.length * 0.6))));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#f4ecd8"/>
<rect x="0" y="0" width="${W}" height="${top - 10}" fill="#111"/>
<text x="24" y="${30 + titleSize * 0.8}" font-size="${titleSize}"${comic.title.length * titleSize * 0.64 > 950 ? ' textLength="950" lengthAdjust="spacingAndGlyphs"' : ''} font-weight="900" font-family="Impact, 'Arial Black', sans-serif" fill="#ffe14d" letter-spacing="1">${title}</text>
<text x="26" y="${top - 26}" font-size="20" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#fff">${esc(comic.subtitle.length > 80 ? `${comic.subtitle.slice(0, 79)}…` : comic.subtitle)}</text>
${panels}
<text x="${W / 2}" y="${H - 18}" text-anchor="middle" font-size="16" font-family="Arial, Helvetica, sans-serif" fill="#555">Made in the DCUGen Battle Room</text>
</svg>`;
}
