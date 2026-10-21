import { hexToRgb, oklchHex, rgbToOklab } from "./color-science";
import type { Triple } from "./color-science";
import { gaussian, hashString, poissonSample, sample, seeded } from "./distributions";
import type { Random } from "./distributions";
import { fbm, grainSampler } from "./noise";
import { SPORTS, TEXTURES } from "./settings";
import type { SessionBand, Settings, Sport, Texture } from "./settings";
import type { Daily } from "./activity-data";

// Watercolor marks. Every blob is a recipe in page millimeters: an irregular,
// area-preserving outline plus a pigment density field. Pigments mix by
// Beer–Lambert absorbance: density 1 of a sport's absorbance reproduces that
// sport's color over white, thinner washes become tints, pooled pigment deepens
// toward a saturated shade. Glazes multiply, exactly like transparent layers.
const PROFILE = 128;
const TAU = Math.PI * 2;

type Pigment = { x: number; y: number; radius: number; strength: number; sharp: number; warp: number; absorb: Triple; escape: boolean };
export type BlobRecipe = {
  x: number; y: number; r: number; texture: Texture; aggression: number; odd: number;
  cos: number; sin: number; stretch: number; profile: Float32Array; extent: number;
  edgeDisp: number; edgeFreq: number; edgeOctaves: number; soft: number;
  base: Triple; load: number; mottle: number; mottleScale: number;
  poolX: number; poolY: number; rim: number; rimWidth: number; rim2: number; rim2Depth: number;
  granulation: number; warpFreq: number; pigments: Pigment[]; seedX: number; seedY: number;
  stripes?: { cos: number; sin: number; period: number; phase: number; duty: number; warp: number; taper: number; minor: number; strength: number; absorb: Triple; seam: number; seamOffset: number; seamWidth: number; seamAbsorb: Triple };
  dots?: { cell: number; min: number; max: number; density: number; strength: number; spill: number; absorb: Triple; oddAbsorb: Triple; oddShare: number; lift: number; seed: number };
  blooms?: { x: number; y: number; radius: number; strength: number; rough: number; ring: number }[];
  dry?: { cos: number; sin: number; scale: number; stretch: number; strength: number };
  feather?: number;
};

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const decode = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

export function absorbance(hex: string): Triple {
  return hexToRgb(hex).map(v => -Math.log(Math.max(0.004, decode(v)))) as Triple;
}
function lch(hex: string): Triple {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  return [L, Math.hypot(a, b), Math.atan2(b, a) * 180 / Math.PI];
}

// Lightness and saturation wander around the sport's color. An odd color
// either borrows another sport's hue (keeps the print's palette coherent) or
// turns the hue: neighbors at low funk, complements and triads near the top.
export function colorVariant(hex: string, settings: Settings, random: Random, aggression: number, odd: boolean, others: string[] = []) {
  let [L, C, H] = lch(hex);
  if (odd) {
    if (others.length && random() < 0.45) {
      const [oL, oC, oH] = lch(others[Math.floor(random() * others.length)]!);
      H = oH + gaussian(random) * 8; L = lerp(L, oL, 0.6); C = Math.max(C * 0.8, oC);
    } else {
      const wild = random() < settings.funk;
      const turns = [180, 120, -120, 150, -150] as const;
      H += wild ? turns[Math.floor(random() * turns.length)]! + gaussian(random) * 12 : (random() < 0.5 ? -1 : 1) * (25 + random() * 35);
      C = Math.max(C, 0.07) * (0.9 + 0.4 * random());
    }
  }
  const spread = 0.7 + 0.6 * aggression;
  L += gaussian(random) * settings.lightnessJitter * 0.07 * spread;
  C *= Math.exp(gaussian(random) * settings.saturationJitter * 0.3 * spread);
  H += gaussian(random) * (3 + 7 * aggression) * (0.4 + settings.funk);
  return oklchHex(Math.max(0.22, Math.min(0.96, L)), Math.max(0, Math.min(0.37, C)), H);
}

// Data steers each blob; Data drive 0 leaves it to chance, 1 lets the session decide.
export function blobSignals(entry: Pick<Daily, "effort" | "variability" | "climb" | "hours" | "activities">, drive: number, random: Random) {
  const steer = (value: number | null | undefined, chance: number) => value == null ? chance : lerp(chance, value, drive);
  const aggression = steer(entry.effort, random());
  const variability = steer(entry.variability, random());
  const climb = steer(entry.climb == null ? null : Math.min(1, entry.climb / 350), random() * 0.6);
  const busy = Math.min(1, (entry.activities - 1) * 0.5 + entry.hours / 5);
  return { aggression, variability, climb, busy };
}

// The first matching row wins. Days without an effort value fall back to chance
// unless their duration, climbing, or variability already places them.
type BandInput = Pick<Daily, "effort" | "variability" | "climb" | "hours">;
export function sessionBand(entry: BandInput, rules: Settings["textureRules"]): SessionBand | null {
  if (entry.effort != null && entry.effort >= rules.hard.threshold) return "hard";
  if (entry.variability != null && entry.variability >= rules.intervals.threshold) return "intervals";
  if (entry.climb != null && entry.climb >= rules.climbing.threshold) return "climbing";
  if (entry.hours >= rules.long.threshold) return "long";
  if (entry.effort == null) return null;
  return entry.effort <= rules.easy.threshold ? "easy" : "steady";
}

function weighted(weights: Record<Texture, number>, random: Random): Texture | null {
  const total = TEXTURES.reduce((a, [t]) => a + weights[t], 0);
  if (total <= 0) return null;
  let pick = random() * total;
  for (const [texture] of TEXTURES) { pick -= weights[texture]; if (pick < 0) return texture; }
  return null;
}

// With probability Data drive the session's row of odds picks the texture,
// otherwise the Texture mix does. At 1 the table alone decides.
export function chooseTexture(settings: Settings, entry: BandInput, random: Random): Texture {
  const band = sessionBand(entry, settings.textureRules);
  const ruled = random() < settings.dataDrive;
  const pick = random();
  const once = () => pick;
  const odds = band && ruled ? settings.textureRules[band].odds : settings.textureMix;
  return weighted(odds, once) ?? weighted(settings.textureMix, once) ?? "wash";
}

// Fourier wobble normalized to the circle's area, so painted area still encodes hours.
export function outlineProfile(settings: Settings, irregularity: number, random: Random) {
  const harmonics: [number, number, number][] = [];
  let total = 0;
  for (let k = 2; k <= settings.lobes + 2; k++) {
    const amplitude = (0.35 + 0.65 * random()) / (1 + Math.abs(k - settings.lobes));
    harmonics.push([k, amplitude, random() * TAU]); total += amplitude;
  }
  harmonics.push([1, 0.25 * total, random() * TAU]); total *= 1.25;
  const profile = new Float32Array(PROFILE + 1);
  let squares = 0;
  for (let i = 0; i < PROFILE; i++) {
    const phi = i / PROFILE * TAU;
    let value = 1;
    for (const [k, amplitude, phase] of harmonics) value += irregularity * amplitude / total * Math.cos(k * phi + phase);
    profile[i] = Math.max(0.35, value);
    squares += profile[i]! * profile[i]!;
  }
  const scale = Math.sqrt(PROFILE / squares);
  for (let i = 0; i < PROFILE; i++) profile[i]! *= scale;
  profile[PROFILE] = profile[0]!;
  return profile;
}

type BlobInput = Pick<Daily, "date" | "sport" | "hours" | "activities" | "effort" | "variability" | "climb"> & { x: number; y: number; r: number };
export function blobRecipe(mark: BlobInput, settings: Settings, overrides: { texture?: Texture; funk?: number } = {}): BlobRecipe {
  // Independent streams: moving one slider (say Funk) never reshuffles shapes or textures.
  const key = hashString(`${mark.date}|${mark.sport}`, settings.paintSeed);
  const stream = (salt: number) => seeded(key ^ Math.imul(salt + 1, 0x9e3779b1));
  const signals = blobSignals(mark, settings.dataDrive, stream(1));
  const a = signals.aggression;
  const texture = overrides.texture ?? chooseTexture(settings, mark, stream(2));
  const funk = overrides.funk ?? settings.funk;
  const tuned = funk === settings.funk ? settings : { ...settings, funk };
  const others = SPORTS.filter(sport => sport !== mark.sport).map(sport => settings.colors[sport as Sport]);
  let colors = 0, oddCount = 0;
  const variant = (boost: number | null) => {
    const random = stream(1000 + colors++);
    const odd = boost !== null && random() < funk * (0.55 + 0.3 * a) + boost * funk;
    if (odd) oddCount++;
    return absorbance(colorVariant(settings.colors[mark.sport], tuned, random, a, odd, others));
  };

  const r = mark.r;
  const shape = stream(3);
  const irregularity = sample(settings.shapeDistribution, settings.irregularity, settings.shapeVariance, shape);
  // Heavy tails may stretch far, but never into a needle.
  const aspect = 1 + Math.min(3.5, sample(settings.shapeDistribution, settings.elongation, settings.shapeVariance, shape));
  const angle = settings.orientation * Math.PI / 180 + (shape() - 0.5) * Math.PI * settings.orientationJitter;
  const profile = outlineProfile(settings, Math.min(0.6, irregularity), shape);
  let maxProfile = 0;
  for (const value of profile) maxProfile = Math.max(maxProfile, value);
  const stretch = Math.sqrt(aspect);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const major = r * stretch, minor = r / stretch;
  // Points inside the ellipse, in page millimeters relative to the center.
  const inside = (random: Random, radial: number) => {
    const t = random() * TAU, d = Math.sqrt(random()) * radial;
    const u = Math.cos(t) * d * major, v = Math.sin(t) * d * minor;
    return { x: u * cos - v * sin, y: u * sin + v * cos };
  };

  const wash = stream(4);
  const edgeDisp = settings.edgeRoughness * (0.35 + 1.3 * a) * (0.6 + 0.8 * wash()) * Math.min(1, 0.4 + r / 6);
  const soft = 0.05 + settings.wetness * (0.12 + 0.55 * wash()) * (texture === "bleed" ? 2.2 : 1);
  const loadScale = { outline: 0.32, bleed: 0.42, stripes: 0.55, dots: 0.85, bloom: 0.95, wash: 1, drybrush: 1 }[texture];
  const poolAngle = Math.PI / 2 + gaussian(wash) * 0.9;
  const pool = settings.pooling * (0.2 + 0.8 * wash());
  const recipe: BlobRecipe = {
    x: mark.x, y: mark.y, r, texture, aggression: a, odd: 0,
    cos, sin, stretch, profile, extent: 0,
    edgeDisp, edgeFreq: 1 / (1.4 + 1.6 * wash()), edgeOctaves: 2 + Math.round(2.4 * a * a), soft,
    base: variant(null), load: (0.48 + 0.27 * wash()) * loadScale,
    mottle: settings.mottling * (0.4 + 0.8 * wash()), mottleScale: Math.max(2, Math.min(14, r * (0.45 + 0.45 * wash()))),
    poolX: Math.cos(poolAngle) * pool, poolY: Math.sin(poolAngle) * pool,
    rim: settings.edgeDarkening * (0.25 + 0.75 * wash()) * (texture === "outline" ? 2.6 : 1),
    rimWidth: (0.3 + 0.7 * wash()) * (texture === "outline" ? 0.6 : 1) * (1 + settings.wetness),
    rim2: texture === "outline" && wash() < 0.35 ? settings.edgeDarkening * (0.4 + 0.6 * wash()) : 0,
    rim2Depth: 0.8 + 0.8 * wash(),
    granulation: settings.granulation * (0.5 + wash()) * (texture === "drybrush" ? 1.8 : 1) * (1 + 0.6 * signals.climb * settings.dataDrive),
    warpFreq: 1 / Math.max(0.8, r * (0.25 + 0.2 * wash())), pigments: [],
    seedX: wash() * 1000, seedY: wash() * 1000,
  };

  // Dark centers: one or more seeded pools of pigment. Larger blobs (more hours)
  // and harder sessions are more likely to carry several.
  if (settings.spotStrength > 0) {
    const count = Math.min(7, 1 + poissonSample(settings.spotRate * mark.hours ** 0.75 * (0.7 + 0.7 * a), stream(5)));
    for (let i = 0; i < count; i++) {
      const random = stream(100 + i);
      const glaze = random() < 0.25 * (1 - a);
      recipe.pigments.push({
        ...inside(random, 0.72),
        radius: r * (0.22 + 0.5 * random()) / count ** 0.25,
        strength: settings.spotStrength * (0.35 + 0.65 * random()) * (0.6 + 0.8 * a),
        sharp: glaze ? 4 + 3 * random() : Math.max(1, Math.min(5, 2.4 - 1.1 * a + gaussian(random) * 0.5)),
        warp: 0.08 + 0.85 * a * (0.5 + random()),
        absorb: variant(0), escape: false,
      });
    }
  }
  if (texture === "bleed") {
    // An intense core near one side, feathering past the dried edge of a pale halo.
    const random = stream(6);
    const t = random() * TAU, d = 0.35 + 0.4 * random();
    const u = Math.cos(t) * d * major, v = Math.sin(t) * d * minor;
    recipe.pigments.unshift({
      x: u * cos - v * sin, y: u * sin + v * cos, radius: r * (0.4 + 0.25 * random()),
      strength: 0.6 + 1.1 * Math.max(0.4, settings.spotStrength) * (0.7 + 0.6 * a), sharp: 1.1 + 0.4 * random(),
      warp: 0.25 + 0.6 * a, absorb: variant(0.4), escape: true,
    });
    recipe.feather = 0.6 + 1.6 * (0.3 + settings.wetness) * (0.6 + 0.8 * random()) * Math.min(1.5, r / 4);
  }
  if (texture === "stripes") {
    const random = stream(7);
    const along = random() < 0.8 ? 0 : Math.PI / 2;
    const span = 2 * (along ? minor : major) * maxProfile;
    const bandWidth = (2.2 + 2.4 * random()) * (1.3 - 0.6 * signals.variability);
    const bands = Math.max(2, Math.min(3 + Math.round(7 * signals.variability), Math.round(span / bandWidth)));
    recipe.stripes = {
      cos: Math.cos(angle + along), sin: Math.sin(angle + along), period: span / bands,
      phase: random(), duty: 0.35 + 0.25 * random(), warp: 0.04 + 0.16 * a * (0.5 + random()), taper: random() < 0.5 ? -1 : 1,
      minor: along ? major : minor, strength: (0.55 + 0.6 * random()) * (0.7 + 0.6 * signals.variability), absorb: variant(0),
      seam: random() < 0.55 ? 0.7 + 0.7 * random() : 0, seamOffset: (random() - 0.5) * 0.6, seamWidth: 0.12 + 0.12 * random(), seamAbsorb: variant(0.35),
    };
  }
  if (texture === "dots") {
    const random = stream(8);
    const cell = Math.max(0.7, Math.min(2.2, r * (0.18 + 0.15 * random())));
    recipe.dots = {
      cell, min: 0.06 + 0.08 * random(), max: 0.22 + 0.16 * random(), density: 0.25 + 0.4 * random(),
      strength: (0.35 + 0.5 * random()) * (0.7 + 0.6 * a), spill: r * (0.08 + 0.2 * random()),
      absorb: variant(null), oddAbsorb: variant(0.5), oddShare: 0.15 + 0.5 * funk, lift: 0.15 + 0.45 * (1 - a) * random(),
      seed: Math.floor(random() * 0x7fffffff),
    };
  }
  if (texture === "bloom") {
    const random = stream(9);
    recipe.blooms = Array.from({ length: random() < 0.3 + 0.3 * signals.busy ? 2 : 1 }, () => ({
      ...inside(random, 0.55), radius: r * (0.3 + 0.28 * random()), strength: 0.55 + 0.45 * random(), rough: 0.12 + 0.25 * random() + 0.2 * a,
      ring: 0.4 + 0.45 * random(),
    })).map(bloom => ({ ...bloom, ring: bloom.ring / bloom.radius }));
  }
  if (texture === "drybrush") {
    const random = stream(10);
    const direction = angle + Math.PI / 2 + gaussian(random) * 0.3;
    recipe.dry = { cos: Math.cos(direction), sin: Math.sin(direction), scale: 1 + 1.2 * random(), stretch: 3 + 3 * random(), strength: 0.35 + 0.35 * random() };
  }
  recipe.odd = oddCount;
  const body = major * maxProfile + 1.6 * edgeDisp + 3 * soft + (recipe.dots ? recipe.dots.spill + recipe.dots.cell : 0) + 0.3;
  const core = recipe.pigments.find(p => p.escape);
  recipe.extent = core ? Math.max(body, Math.min(Math.hypot(core.x, core.y) + 3.2 * core.radius, body + 5 * recipe.feather!)) : body;
  return recipe;
}

// Integer hash for the speckle lattice: three uniform values per cell.
function cellHash(x: number, y: number, seed: number, out: Float64Array) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed | 0;
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    out[i] = (h >>> 0) / 4294967296;
    h = h + 0x9e3779b9 | 0;
  }
}

const ENCODE = new Float32Array(4097);
for (let i = 0; i <= 4096; i++) { const v = i / 4096; ENCODE[i] = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; }

export type Sprite = { left: number; top: number; width: number; height: number; data: Uint8ClampedArray };

// Rasterize one blob into non-premultiplied RGBA, already clipped to the canvas.
// The transmittance T = exp(−A) is stored as color-to-alpha against white:
// multiplying the sprite onto paper reproduces paper × T exactly.
// Everything the pixel loop touches is hoisted into locals or typed arrays first;
// property lookups on recipe objects inside the loop cost several times the math.
export function rasterizeBlob(b: BlobRecipe, sx: number, sy: number, ox: number, oy: number, canvasWidth: number, canvasHeight: number, loadScale = 1): Sprite | null {
  const left = Math.max(0, Math.floor((b.x - b.extent) * sx + ox));
  const top = Math.max(0, Math.floor((b.y - b.extent) * sy + oy));
  const right = Math.min(canvasWidth, Math.ceil((b.x + b.extent) * sx + ox));
  const bottom = Math.min(canvasHeight, Math.ceil((b.y + b.extent) * sy + oy));
  const width = right - left, height = bottom - top;
  if (width <= 0 || height <= 0) return null;
  const data = new Uint8ClampedArray(width * height * 4);
  const pixel = 1 / Math.min(sx, sy);
  const grain = grainSampler(pixel);
  const { x: bx, y: by, cos, sin, stretch, profile, r, seedX, seedY, base, stripes, dots, blooms, dry, pigments } = b;
  const ext2 = b.extent * b.extent;
  const edgeDisp = b.edgeDisp, edgeFreq = b.edgeFreq, edgeOctaves = b.edgeOctaves, edgeSpacing = pixel * edgeFreq;
  const mottle = b.mottle * 1.7, mottleFreq = 1 / b.mottleScale, mottleSpacing = pixel * mottleFreq;
  const warpFreq = b.warpFreq, warpSpacing = pixel * warpFreq;
  const washLoad = b.load, poolX = b.poolX / r, poolY = b.poolY / r;
  const rim = b.rim, rimWidth = b.rimWidth, rim2 = b.rim2, rim2Depth = b.rim2Depth;
  const granulation = b.granulation;
  const base0 = base[0], base1 = base[1], base2 = base[2];
  const aa = b.soft + pixel * 0.75;
  const edgeReach = edgeDisp * 1.3 + aa;
  const feather = b.feather ?? 1;
  // x, y, 1/radius, strength, sharpness, warp, absorbance ×3, escape.
  const packed = new Float64Array(pigments.flatMap(p => [p.x, p.y, 1 / p.radius, p.strength, p.sharp, p.warp, ...p.absorb, p.escape ? 1 : 0]));
  const pigmentCount = packed.length;
  const hasEscape = pigments.some(p => p.escape);
  // x, y, 1/radius, strength, roughness, noise frequency, 1/ring width.
  const bloomData = new Float64Array((blooms ?? []).flatMap(bl => [bl.x, bl.y, 1 / bl.radius, bl.strength, bl.rough, 2.2 / bl.radius, 1 / bl.ring]));
  const bloomCount = bloomData.length;
  const hasDry = dry !== undefined;
  const dryCos = dry?.cos ?? 0, drySin = dry?.sin ?? 0, dryStrength = dry?.strength ?? 0;
  const dryAlong = 1 / ((dry?.scale ?? 1) * (dry?.stretch ?? 1)), dryAcross = 1 / (dry?.scale ?? 1);
  const hasStripes = stripes !== undefined;
  const stCos = stripes?.cos ?? 0, stSin = stripes?.sin ?? 0, stFreq = 1 / (stripes?.period ?? 1), stPhase = stripes?.phase ?? 0;
  const stLow = 1 - (stripes?.duty ?? 0) - 0.2, stWarp = (stripes?.warp ?? 0) * 2, stMinor = 1 / (stripes?.minor ?? 1);
  const stTaper = stripes?.taper ?? 1, stStrength = stripes?.strength ?? 0, stAbsorb = stripes?.absorb ?? base;
  const seam = stripes?.seam ?? 0, seamOffset = stripes?.seamOffset ?? 0, seamWidth = 1 / (stripes?.seamWidth ?? 1), seamAbsorb = stripes?.seamAbsorb ?? base;
  const hasDots = dots !== undefined;
  const dotCell = dots?.cell ?? 1, dotInv = 1 / dotCell, dotMin = dots?.min ?? 0, dotRange = (dots?.max ?? 0) - dotMin;
  const dotDensity = dots?.density ?? 0, dotStrength = dots?.strength ?? 0, dotSpill = dots?.spill ?? 0, dotSeed = dots?.seed ?? 0;
  const dotOddShare = dots?.oddShare ?? 0, dotAbsorb = dots?.absorb ?? base, dotOdd = dots?.oddAbsorb ?? base, dotLift = dots?.lift ?? 0;
  const dotEdge = dotCell / (pixel * 0.75 + 0.09), dotReach = dotSpill + dotCell + edgeReach;
  const cell = new Float64Array(4);
  const load = loadScale;
  for (let j = 0; j < height; j++) {
    const Y = (top + j + 0.5 - oy) / sy;
    const ly = Y - by;
    for (let i = 0; i < width; i++) {
      const X = (left + i + 0.5 - ox) / sx;
      const lx = X - bx;
      if (lx * lx + ly * ly > ext2) continue;
      const u = (lx * cos + ly * sin) / stretch;
      const v = (-lx * sin + ly * cos) * stretch;
      const rho = Math.sqrt(u * u + v * v);
      let at = (Math.atan2(v, u) / TAU + 1) * PROFILE;
      at -= Math.floor(at / PROFILE) * PROFILE;
      const k = at | 0, f = at - k;
      const near = rho - r * (profile[k]! + (profile[k + 1]! - profile[k]!) * f);
      // Outside the reach of the ragged edge only escaping pigment or spatter remains.
      if (near > edgeReach && !hasEscape && !(hasDots && near < dotReach)) continue;
      const edge = edgeDisp > 0 && near > -edgeReach && near < edgeReach
        ? edgeDisp * 1.8 * fbm(lx * edgeFreq + seedX, ly * edgeFreq + seedY, edgeOctaves, edgeSpacing) : 0;
      const dist = near - edge;
      let cover = clamp01(0.5 - dist / aa);
      const warp = cover > 0 || hasEscape ? fbm(lx * warpFreq + seedY, ly * warpFreq - seedX, 2, warpSpacing) : 0;
      const g = grain(X, Y);
      let A0 = 0, A1 = 0, A2 = 0, streaks = 0;
      if (hasDry && cover > 0) {
        const along = lx * dryCos + ly * drySin, across = -lx * drySin + ly * dryCos;
        const streak = fbm(along * dryAlong + seedX, across * dryAcross + seedY, 3, pixel * dryAcross);
        cover *= 0.45 + 0.55 * smooth(-0.6, -0.2, g * 0.5 + streak * 1.4 + 0.2);
        streaks = smooth(-0.3, 0.4, streak);
      }
      if (cover > 0) {
        let D = washLoad;
        if (mottle > 0) D *= 1 + mottle * fbm(lx * mottleFreq + seedX * 0.7, ly * mottleFreq + seedY * 0.3, 2, mottleSpacing);
        D *= 1 + lx * poolX + ly * poolY;
        const depth = dist < 0 ? -dist : 0;
        if (rim > 0) D += rim * Math.exp(-depth / rimWidth);
        if (rim2 > 0) { const q = (depth - rim2Depth) / rimWidth; D += rim2 * Math.exp(-q * q); }
        if (hasDry) D *= (1 - dryStrength) + dryStrength * 1.6 * streaks;
        for (let q = 0; q < bloomCount; q += 7) {
          // Backrun: a paler pool inside a darker cauliflower edge.
          const dx = lx - bloomData[q]!, dy = ly - bloomData[q + 1]!;
          const near = Math.sqrt(dx * dx + dy * dy) * bloomData[q + 2]!;
          if (near > 1.9) continue;
          const bf = bloomData[q + 5]! * 0.8;
          const d = near * (1 + bloomData[q + 4]! * 1.6 * fbm(lx * bf + seedX, ly * bf + seedY, 3, pixel * bf));
          if (d < 1.6) {
            const strength = bloomData[q + 3]!;
            D *= 1 - strength * 0.55 * smooth(1.05, 0.75, d);
            const e = (d - 1) * bloomData[q + 6]!;
            D += strength * 0.5 * (e < 0 ? Math.exp(-e * e) : Math.exp(-e * 1.6));
          }
        }
        if (D < 0) D = 0;
        A0 = D * base0; A1 = D * base1; A2 = D * base2;
        if (hasStripes) {
          const along = lx * stCos + ly * stSin, across = (-lx * stSin + ly * stCos) * stMinor;
          const wave = 0.5 + 0.5 * Math.cos(TAU * (along * stFreq + stPhase + stWarp * warp));
          const band = smooth(stLow - 0.1, stLow + 0.5, wave);
          const w = stStrength * band * (0.3 + 0.7 * smooth(-1.1, 0.9, across * stTaper));
          A0 += w * stAbsorb[0]; A1 += w * stAbsorb[1]; A2 += w * stAbsorb[2];
          if (seam > 0) {
            const q = (across - seamOffset + 0.25 * warp) * seamWidth;
            const s = seam * Math.exp(-q * q) * (0.55 + 0.45 * band);
            A0 += s * seamAbsorb[0]; A1 += s * seamAbsorb[1]; A2 += s * seamAbsorb[2];
          }
        }
        for (let q = 0; q < pigmentCount; q += 10) {
          if (packed[q + 9]) continue;
          const dx = lx - packed[q]!, dy = ly - packed[q + 1]!;
          const d = Math.sqrt(dx * dx + dy * dy) * packed[q + 2]! * (1 + packed[q + 5]! * warp * 1.6);
          if (d > 3.2) continue;
          const w = packed[q + 3]! * Math.exp(-Math.pow(d, packed[q + 4]!));
          A0 += w * packed[q + 6]!; A1 += w * packed[q + 7]!; A2 += w * packed[q + 8]!;
        }
        A0 *= cover; A1 *= cover; A2 *= cover;
      }
      if (hasEscape) {
        // Wet-in-wet: the core runs past the edge in tendrils of uneven reach.
        for (let q = 0; q < pigmentCount; q += 10) {
          if (!packed[q + 9]) continue;
          const dx = lx - packed[q]!, dy = ly - packed[q + 1]!;
          const radial = Math.sqrt(dx * dx + dy * dy) + 1e-9;
          if (radial * packed[q + 2]! > 3.2) continue;
          const d = radial * packed[q + 2]! * Math.max(0.5, 1 + packed[q + 5]! * warp * 1.6);
          let mask = cover;
          if (dist > 0) {
            const reach = 0.45 + 1.1 * clamp01(0.5 + 1.2 * fbm(dx / radial * 2.4 + seedX, dy / radial * 2.4 + seedY + radial * 0.08, 2));
            const outside = Math.exp(-dist / (feather * reach));
            if (outside > mask) mask = outside;
          }
          const w = packed[q + 3]! * Math.exp(-Math.pow(d, packed[q + 4]!)) * mask;
          A0 += w * packed[q + 6]!; A1 += w * packed[q + 7]!; A2 += w * packed[q + 8]!;
        }
      }
      if (hasDots && dist < dotSpill + dotCell) {
        const gx = lx * dotInv, gy = ly * dotInv;
        const cx = Math.floor(gx), cy = Math.floor(gy);
        cellHash(cx, cy, dotSeed, cell);
        if (cell[0]! < dotDensity) {
          const radius = dotMin + dotRange * cell[3]!;
          const px = cx + radius + (1 - 2 * radius) * cell[1]!, py = cy + radius + (1 - 2 * radius) * cell[2]!;
          const dx = gx - px, dy = gy - py;
          const spot = clamp01((radius - Math.sqrt(dx * dx + dy * dy)) * dotEdge + 0.5);
          // Most specks stay on the wash; a few land just outside like spatter.
          const mask = dist <= 0 ? Math.max(cover, 0.6) : cell[3]! < 0.35 && dist < dotSpill ? 1 : cover;
          if (spot > 0 && mask > 0 && cell[2]! < dotLift && dist <= 0) {
            // A lifted drop: pigment pushed to a slightly darker fringe.
            const lift = 1 - 0.65 * spot * cover;
            A0 *= lift; A1 *= lift; A2 *= lift;
          } else if (spot > 0 && mask > 0) {
            const w = dotStrength * spot * mask;
            const absorb = cell[1]! < dotOddShare ? dotOdd : dotAbsorb;
            A0 += w * absorb[0]; A1 += w * absorb[1]; A2 += w * absorb[2];
          }
        }
      }
      if (A0 + A1 + A2 < 1e-4) continue;
      // Pigment settles into the paper's tooth.
      const settle = Math.max(0.05, 1 + granulation * g) * load;
      const t0 = ENCODE[(Math.exp(-A0 * settle) * 4096) | 0]!;
      const t1 = ENCODE[(Math.exp(-A1 * settle) * 4096) | 0]!;
      const t2 = ENCODE[(Math.exp(-A2 * settle) * 4096) | 0]!;
      const low = t0 < t1 ? (t0 < t2 ? t0 : t2) : (t1 < t2 ? t1 : t2);
      const alpha = 1 - low;
      if (alpha < 0.002) continue;
      const o = (j * width + i) * 4;
      data[o] = (t0 - low) / alpha * 255 + 0.5;
      data[o + 1] = (t1 - low) / alpha * 255 + 0.5;
      data[o + 2] = (t2 - low) / alpha * 255 + 0.5;
      data[o + 3] = alpha * 255 + 0.5;
    }
  }
  return { left, top, width, height, data };
}

// A calm, deterministic wash for the legend: the sport's own color, no funk.
export function swatchRecipe(sport: Sport, x: number, y: number, r: number, settings: Settings) {
  return blobRecipe({ date: "legend", sport, hours: 1, activities: 1, effort: 0.35, variability: 0.2, climb: null, x, y, r },
    { ...settings, dataDrive: 1, spotRate: 0, irregularity: Math.min(settings.irregularity, 0.08), elongation: 0, edgeRoughness: settings.edgeRoughness * 0.5 },
    { texture: "wash", funk: 0 });
}
