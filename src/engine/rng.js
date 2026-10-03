// Seeded random numbers, so every character can be re-created from its seed.

function hashString(str) {
  // xmur3 string hash -> 32-bit seed
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

const SEED_WORDS = [
  'amber', 'atom', 'blaze', 'bolt', 'cosmic', 'crimson', 'dawn', 'echo', 'ember', 'falcon',
  'flux', 'frost', 'gamma', 'ghost', 'golden', 'granite', 'harbor', 'iron', 'jade', 'jet',
  'kinetic', 'lantern', 'lunar', 'meteor', 'midnight', 'nova', 'onyx', 'orbit', 'phantom', 'prism',
  'quantum', 'quasar', 'raven', 'rocket', 'ruby', 'shadow', 'silver', 'solar', 'spark', 'storm',
  'tempest', 'thunder', 'titan', 'ultra', 'vapor', 'vector', 'velvet', 'vortex', 'warden', 'zenith',
];

/** A short, readable seed such as "nova-falcon-417". */
export function randomSeed() {
  const pick = () => SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function makeRng(seed) {
  let a = hashString(String(seed));
  const next = () => {
    // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    /** Integer in [lo, hi] inclusive. */
    int(lo, hi) {
      if (hi < lo) [lo, hi] = [hi, lo];
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    chance(p) {
      return next() < p;
    },
    pick(list) {
      if (!list || list.length === 0) return undefined;
      return list[Math.floor(next() * list.length)];
    },
    /** Pick by weight; weightOf(item) defaults to item.weight ?? 1. */
    weighted(list, weightOf = (x) => x.weight ?? 1) {
      const items = list.filter((x) => weightOf(x) > 0);
      const total = items.reduce((s, x) => s + weightOf(x), 0);
      if (total <= 0) return undefined;
      let roll = next() * total;
      for (const x of items) {
        roll -= weightOf(x);
        if (roll < 0) return x;
      }
      return items[items.length - 1];
    },
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    sample(list, n) {
      return rng.shuffle(list).slice(0, Math.max(0, n));
    },
    /** Random integer near `center`, spread +/- `spread`, bell-shaped (sum of two dice). */
    around(center, spread) {
      if (spread <= 0) return center;
      const a1 = rng.int(-spread, spread);
      const a2 = rng.int(-spread, spread);
      return center + Math.round((a1 + a2) / 2);
    },
    /** Child generator with an independent stream, so rerolling one part doesn't shift the others. */
    fork(label) {
      return makeRng(`${seed}::${label}`);
    },
  };
  return rng;
}
