// Tiny arithmetic for data files: "pl/2+1", "pl-2", "4", ranges "2..pl/2+3".
// Supports integers, pl, + - * / and parentheses. Results are floored.

function parse(src, pl) {
  const s = String(src).replace(/\s+/g, '').toLowerCase();
  let i = 0;
  const peek = () => s[i];
  const num = () => {
    if (s.startsWith('pl', i)) { i += 2; return pl; }
    if (peek() === '(') { i++; const v = sum(); i++; return v; }
    if (peek() === '-') { i++; return -num(); }
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error(`Bad expression "${src}"`);
    i += m[0].length;
    return Number(m[0]);
  };
  const prod = () => {
    let v = num();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const r = num();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const sum = () => {
    let v = prod();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = prod();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const v = sum();
  if (i !== s.length) throw new Error(`Bad expression "${src}"`);
  return Math.floor(v);
}

export function evalExpr(expr, pl) {
  return parse(expr, pl);
}

/** [lo, hi] for "a..b", or [v, v] for a single value. */
export function rangeOf(spec, pl) {
  const [a, b] = String(spec).split('..');
  const lo = parse(a, pl);
  const hi = b === undefined ? lo : parse(b, pl);
  return lo <= hi ? [lo, hi] : [hi, lo];
}

export function rollSpec(spec, pl, rng) {
  const [lo, hi] = rangeOf(spec, pl);
  return rng.int(lo, hi);
}
