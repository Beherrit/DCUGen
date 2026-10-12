// The session recap: a comic-book cover and a few lines for the group chat, built from what happened
// at the table (the feed), the fights and moments recorded in the World, the spotlight and the
// complications that came up.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1).trimEnd()}…` : String(s));

/**
 * Pick the session's highlights. input: { campaign, issue, cast: [{ name, color }], entries (feed),
 * events: [{ name, summary }], spotlight: [{ name, score }], complications: [{ name, text }], since }.
 */
export function buildRecap({ campaign = 'Our Campaign', issue = 1, cast = [], entries = [], events = [], spotlight = [], complications = [], since = 0 }) {
  const t0 = since ? new Date(since).getTime() : 0;
  const recent = entries.filter((e) => !t0 || new Date(e.t || 0).getTime() >= t0);
  const highlights = [];
  const add = (score, text) => highlights.push({ score, text: clip(text.replace(/\s+/g, ' '), 140) });
  for (const e of recent) {
    const t = String(e.text || '');
    if (/incapacitated/i.test(t)) add(9, t);
    else if (e.dice?.roll === 20) add(7, t);
    else if (/staggered|knocked out|KO/i.test(t)) add(6, t);
    else if (/GM: .* hits/i.test(t)) add(4, t);
  }
  for (const ev of events) add(/battle/i.test(ev.name) ? 8 : 5, `${ev.name}${ev.summary ? `: ${ev.summary}` : ''}`);
  for (const c of complications) add(6, `${c.name}'s past catches up: ${c.text}`);
  highlights.sort((a, b) => b.score - a.score);
  const star = [...spotlight].sort((a, b) => b.score - a.score)[0];
  const names = cast.map((c) => c.name);
  const lead = events.find((e) => /battle/i.test(e.name));
  const headline = lead ? clip(lead.name.replace(/:.*/, '').toUpperCase(), 48)
    : highlights[0] ? clip(highlights[0].text.split(/[:.!]/)[0].toUpperCase(), 48)
      : names.length ? `${names.slice(0, 2).join(' & ').toUpperCase()} STRIKE BACK` : 'A NEW CHAPTER BEGINS';
  const blurbs = highlights.slice(0, 4).map((h) => h.text);
  const tagline = star && star.score > 0 ? `Starring ${star.name}, who stole the show!` : names.length ? `Starring ${names.join(', ')}` : '';
  const text = [
    `📰 ${campaign.toUpperCase()} #${issue}: ${headline}`,
    ...blurbs.map((b) => `• ${b}`),
    star && star.score > 0 ? `⭐ Spotlight: ${star.name}` : null,
    complications.length ? `🎭 Complications: ${complications.map((c) => c.name).join(', ')}` : null,
    names.length ? `With ${names.join(', ')}.` : null,
  ].filter(Boolean).join('\n');
  return { campaign, issue, headline, blurbs, tagline, cast, star: star?.score > 0 ? star.name : null, text, date: new Date().toISOString().slice(0, 10) };
}

function wrap(text, width) {
  const out = [];
  let line = '';
  for (const w of String(text).split(/\s+/)) {
    if ((line + ' ' + w).trim().length > width) { if (line) out.push(line); line = w; } else line = `${line} ${w}`.trim();
  }
  if (line) out.push(line);
  return out;
}

/** The recap as a comic cover (an SVG, 800 × 1200). */
export function recapSvg(r) {
  const colors = r.cast.map((c) => c.color).filter(Boolean);
  const a = colors[0] || '#c8202f'; const b = colors[1] || '#2f6fde'; const c3 = colors[2] || '#e0a030';
  const titleText = clip(r.campaign.toUpperCase(), 26);
  const title = esc(titleText);
  // Impact is about 0.55 em per capital: fit the title in the 590 px left of the issue box.
  const titleSize = Math.max(40, Math.min(92, Math.floor(590 / (titleText.length * 0.56))));
  const head = wrap(r.headline, 16).slice(0, 3);
  const headSize = head.some((l) => l.length > 13) ? 60 : 70;
  const bubbles = r.blurbs.slice(0, 3).map((t, i) => {
    const lines = wrap(t, 34).slice(0, 4);
    const y = 720 + i * 135;
    const x = i % 2 ? 360 : 40;
    return `<g transform="translate(${x} ${y})"><rect width="400" height="${30 + lines.length * 26}" rx="18" fill="#fff" stroke="#111" stroke-width="5"/>${lines.map((l, j) => `<text x="20" y="${36 + j * 26}" font-size="21" font-family="Arial, Helvetica, sans-serif" fill="#111">${esc(l)}</text>`).join('')}</g>`;
  }).join('');
  const rays = Array.from({ length: 18 }, (_, i) => { const ang = (i / 18) * Math.PI * 2; return `<path d="M400 520 L${400 + Math.cos(ang) * 900} ${520 + Math.sin(ang) * 900} L${400 + Math.cos(ang + 0.12) * 900} ${520 + Math.sin(ang + 0.12) * 900} Z" fill="${i % 2 ? a : b}" opacity="0.55"/>`; }).join('');
  const cast = r.cast.slice(0, 6).map((c, i) => `<g transform="translate(${70 + i * 115} 580)"><circle r="46" fill="${esc(c.color || '#888')}" stroke="#111" stroke-width="6"/><text y="14" text-anchor="middle" font-size="40" font-weight="900" font-family="Impact, 'Arial Black', sans-serif" fill="#fff">${esc((c.name || '?').trim()[0].toUpperCase())}</text><text y="78" text-anchor="middle" font-size="17" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#111" stroke="#fff" stroke-width="4" paint-order="stroke">${esc(clip(c.name, 14))}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
<rect width="800" height="1200" fill="${c3}"/>${rays}
<rect x="0" y="0" width="800" height="170" fill="#111"/>
<text x="30" y="${85 + titleSize * 0.36}"${titleText.length * titleSize * 0.66 > 590 ? ' textLength="590" lengthAdjust="spacingAndGlyphs"' : ''} font-size="${titleSize}" font-weight="900" font-family="Impact, 'Arial Black', sans-serif" fill="${a}" stroke="#fff" stroke-width="4" paint-order="stroke" letter-spacing="2">${title}</text>
<rect x="640" y="18" width="140" height="134" fill="#fff" stroke="#111" stroke-width="5"/>
<text x="710" y="62" text-anchor="middle" font-size="22" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#111">ISSUE</text>
<text x="710" y="126" text-anchor="middle" font-size="60" font-weight="900" font-family="Impact, 'Arial Black', sans-serif" fill="#111">#${esc(r.issue)}</text>
<text x="400" y="215" text-anchor="middle" font-size="26" font-weight="700" font-style="italic" font-family="Arial, Helvetica, sans-serif" fill="#111">PREVIOUSLY ON…</text>
${head.map((l, i) => `<text x="400" y="${300 + i * (headSize + 4)}" text-anchor="middle" font-size="${headSize}" font-weight="900" font-family="Impact, 'Arial Black', sans-serif" fill="#fff" stroke="#111" stroke-width="8" paint-order="stroke" transform="rotate(-4 400 ${300 + i * (headSize + 4)})">${esc(l)}</text>`).join('')}
${cast}
${bubbles}
<rect x="0" y="1130" width="800" height="70" fill="#111"/>
<text x="400" y="1174" text-anchor="middle" font-size="26" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#fff">${esc(clip(r.tagline || '', 60))}</text>
</svg>`;
}
