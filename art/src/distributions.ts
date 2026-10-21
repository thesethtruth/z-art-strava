// Seeded randomness and moment-matched samplers for the watercolor blobs.
// Every distribution takes the same mean and coefficient of variation, so the
// Variance slider means the same thing whichever family is selected; only the
// shape of the spread (symmetric, skewed, heavy-tailed, discrete) changes.
export type Random = () => number;

// mulberry32: small, fast, and reproducible across browsers and Bun.
export function seeded(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string, seed = 0) {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

export const DISTRIBUTIONS = [
  ["normal", "Normal"], ["uniform", "Uniform"], ["lognormal", "Log-normal"], ["gamma", "Gamma"],
  ["weibull", "Weibull"], ["poisson", "Poisson"], ["exponential", "Exponential"],
] as const;
export type Distribution = (typeof DISTRIBUTIONS)[number][0];

export function gaussian(random: Random) {
  const u = 1 - random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

// Lanczos approximation (g = 7), accurate to ~1e-13 for positive arguments.
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lnGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lnGamma(1 - z);
  z -= 1;
  let x = LANCZOS[0]!;
  for (let i = 1; i < 9; i++) x += LANCZOS[i]! / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

const weibullShapes = new Map<number, number>();
// CV(k) of a Weibull distribution decreases monotonically with its shape k.
export function weibullShape(cv: number) {
  const key = Math.round(cv * 1e4);
  const cached = weibullShapes.get(key);
  if (cached) return cached;
  const cvOf = (k: number) => Math.sqrt(Math.max(0, Math.exp(lnGamma(1 + 2 / k) - 2 * lnGamma(1 + 1 / k)) - 1));
  let lo = 0.12, hi = 80;
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi);
    if (cvOf(mid) > cv) lo = mid; else hi = mid;
  }
  weibullShapes.set(key, lo);
  return lo;
}

// Marsaglia–Tsang; shapes below one use the standard power boost.
export function gammaSample(shape: number, random: Random): number {
  if (shape < 1) return gammaSample(shape + 1, random) * random() ** (1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = gaussian(random); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = random();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function poissonSample(lambda: number, random: Random) {
  if (lambda <= 0) return 0;
  if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gaussian(random)));
  const limit = Math.exp(-lambda);
  let k = 0, p = random();
  while (p > limit) { k++; p *= random(); }
  return k;
}

// Non-negative sample with the requested mean and coefficient of variation.
// Normal and uniform are truncated at zero; Poisson is scaled so its steps
// keep the moments: (mean / λ) · Poisson(λ) with λ = 1 / cv².
export function sample(distribution: Distribution, mean: number, cv: number, random: Random): number {
  if (mean <= 0) return 0;
  if (cv <= 1e-6) return mean;
  const sd = mean * cv;
  switch (distribution) {
    case "normal": return Math.max(0, mean + sd * gaussian(random));
    case "uniform": return Math.max(0, mean + sd * Math.sqrt(3) * (2 * random() - 1));
    case "lognormal": {
      const s2 = Math.log(1 + cv * cv);
      return Math.exp(Math.log(mean) - s2 / 2 + Math.sqrt(s2) * gaussian(random));
    }
    case "gamma": return gammaSample(1 / (cv * cv), random) * mean * cv * cv;
    case "weibull": {
      const k = weibullShape(cv);
      return mean / Math.exp(lnGamma(1 + 1 / k)) * (-Math.log(1 - random())) ** (1 / k);
    }
    case "poisson": {
      const lambda = 1 / (cv * cv);
      return mean / lambda * poissonSample(lambda, random);
    }
    case "exponential": return Math.max(0, mean - sd - sd * Math.log(1 - random()));
  }
}
