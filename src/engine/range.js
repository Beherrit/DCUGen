// Range and distance: how far a power reaches, how far you move, lift and throw, and a calculator.
//
//   Ranged attacks (DCA 172-173): short up to rank x 25 ft (no penalty), medium rank x 50 ft (-2),
//     long rank x 100 ft (-5); beyond long range you can't attack. Extended Range doubles them per rank.
//   Close: targets you can touch. Perception: anything you can accurately perceive, no attack roll.
//   Area (DCA 126): a shape instead of an attack roll; each +1 Area beyond the first doubles its size.
//   Measurements: every rank doubles (distance rank 0 = 30 ft). Distance rank = speed rank + time rank;
//     throwing distance rank = Strength rank - the object's mass rank; you lift the mass of your Strength rank.

const FT_PER_MILE = 5280;
// Base area sizes for one rank of Area (standard M&M 3e values; check DCA 126).
export const AREA_BASE = {
  Burst: { ft: 30, text: (f) => `${fmtFt(f)} radius burst` },
  Cloud: { ft: 15, text: (f) => `${fmtFt(f)} radius cloud that lingers a round` },
  Cone: { ft: 60, text: (f) => `${fmtFt(f)} long cone` },
  Cylinder: { ft: 30, text: (f) => `${fmtFt(f)} radius, ${fmtFt(f)} tall cylinder` },
  Line: { ft: 30, text: (f) => `${fmtFt(f)} long, ${fmtFt(Math.max(5, f / 6))} wide line` },
  Shapeable: { ft: 30, text: (f) => `shapeable area of about ${Math.round((f / 30) ** 3 * 30)} 5-ft cubes` },
  Perception: { ft: null, text: () => 'everyone in an area you can perceive' },
};

/** "250 ft", "1.5 miles", "4,000 miles". */
export function fmtFt(ft) {
  if (ft == null || !isFinite(ft)) return '—';
  if (ft < FT_PER_MILE) return `${Math.round(ft).toLocaleString('en-US')} ft`;
  const mi = ft / FT_PER_MILE;
  return `${mi < 10 ? Math.round(mi * 10) / 10 : Math.round(mi).toLocaleString('en-US')} mile${mi === 1 ? '' : 's'}`;
}

/** Distance of a distance rank in feet (rank 0 = 30 ft, each rank doubles). */
export const rankFt = (rank) => 30 * 2 ** rank;

/** The smallest distance rank that covers a distance in feet. */
export function ftToRank(ft) {
  if (!(ft > 0)) return -Infinity;
  return Math.ceil(Math.log2(ft / 30) - 1e-9) + 0;
}

/** The measurements table row for a rank, or a computed one past its ends. */
export function measure(rank, R) {
  const row = (R?.raw?.reference?.measurements || []).find((m) => m.rank === rank);
  return row || { rank, distance: fmtFt(rankFt(rank)) };
}

const steps = (p, name) => (p.extras || []).filter((m) => m.name === name).reduce((s, m) => s + (m.steps ?? 1), 0);

/** The three range bands of a ranged effect: [{ band, ft, penalty }]. */
export function rangeBands(rank, extended = 0) {
  const m = 2 ** extended;
  return [{ band: 'short', ft: 25 * rank * m, penalty: 0 }, { band: 'medium', ft: 50 * rank * m, penalty: -2 }, { band: 'long', ft: 100 * rank * m, penalty: -5 }];
}

/** Which band a distance falls in: { band, penalty } or { band: 'out' }. */
export function bandFor(ft, rank, extended = 0) {
  for (const b of rangeBands(rank, extended)) if (ft <= b.ft) return b;
  return { band: 'out', ft: null, penalty: null };
}

const MOVE = { Flight: 0, Speed: 0, Swimming: 0, 'Wall-Crawling': 0, Leaping: -2, Burrowing: -5, Teleport: 0 };

/**
 * How far a power reaches, as short text plus the numbers:
 * { kind, text, bands?, area?, move? }
 */
export function rangeInfo(p, R) {
  let eff;
  try { eff = R.effect(p.effect); } catch { return null; }
  const range = p.range || eff.range;
  const rank = p.rank || 0;
  const area = (p.extras || []).find((m) => m.name === 'Area');
  if (p.effect in MOVE) {
    const r = rank + MOVE[p.effect];
    const d = measure(r, R).distance;
    const verb = p.effect === 'Teleport' ? 'teleport' : p.effect === 'Leaping' ? 'jump' : 'move';
    return { kind: 'Movement', text: `${verb} ${d} per ${p.effect === 'Leaping' ? 'leap' : 'move action'} (distance rank ${r})`, move: { rank: r, distance: d } };
  }
  if (area) {
    const shape = area.option || 'Burst';
    const base = AREA_BASE[shape] || AREA_BASE.Burst;
    const ft = base.ft == null ? null : base.ft * 2 ** Math.max(0, (area.steps ?? 1) - 1);
    const where = range === 'Ranged' ? `placed up to ${fmtFt(25 * rank * 2 ** steps(p, 'Extended Range'))} away` : range === 'Perception' ? 'anywhere you can perceive' : 'centred on you';
    return { kind: 'Area', text: `${base.text(ft)}, ${where}; targets in it make a Dodge check (DC 10 + rank) for half`, area: { shape, ft } };
  }
  if (range === 'Ranged') {
    const ext = steps(p, 'Extended Range');
    const b = rangeBands(rank, ext);
    return { kind: 'Ranged', text: `short ${fmtFt(b[0].ft)} · medium ${fmtFt(b[1].ft)} (−2) · long ${fmtFt(b[2].ft)} (−5)${ext ? ` · Extended Range ${ext}` : ''}`, bands: b, extended: ext };
  }
  if (range === 'Perception') return { kind: 'Perception', text: 'anything you can accurately perceive (no attack roll)' };
  if (range === 'Close') return { kind: 'Close', text: 'targets you can touch' };
  if (range === 'Personal') return { kind: 'Personal', text: 'you only' };
  if (range === 'Rank') return { kind: 'Rank', text: `up to ${measure(rank, R).distance} (distance rank ${rank})` };
  return { kind: range, text: String(range).toLowerCase() };
}

/** Lifting and throwing for a Strength rank. */
export function strengthReach(str, R) {
  if (str == null) return null;
  const lift = measure(str, R).mass || null;
  // A person is about mass rank 2 (200 lbs.); a car about 6 (1.5 tons).
  const throwOf = (massRank) => measure(str - massRank, R).distance;
  return { lift, throwPerson: str - 2 >= -5 ? throwOf(2) : null, throwCar: str - 6 >= -5 ? throwOf(6) : null, throwOf };
}

/** Time to cover a distance at a speed rank: { rank, time } (time rank = distance rank - speed rank). */
export function travelTime(ft, speedRank, R) {
  const t = ftToRank(ft) - speedRank;
  return { rank: t, time: measure(t, R).time || `time rank ${t}` };
}
