import { seeded } from "./distributions";

// Classic 2D gradient noise with a fixed, seeded permutation. Each blob shifts its
// coordinates by its own offsets, so one table gives every blob its own field.
const PERM = new Uint8Array(512);
const GRAD_X = new Float32Array(16);
const GRAD_Y = new Float32Array(16);
{
  const random = seeded(0x5eed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [p[i], p[j]] = [p[j]!, p[i]!]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]!;
  for (let i = 0; i < 16; i++) { GRAD_X[i] = Math.cos(i * Math.PI / 8); GRAD_Y[i] = Math.sin(i * Math.PI / 8); }
}

// Roughly in [-1, 1]; zero at every lattice point.
export function noise2(x: number, y: number) {
  const xf = Math.floor(x), yf = Math.floor(y);
  const xi = xf & 255, yi = yf & 255;
  const fx = x - xf, fy = y - yf;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = PERM[xi]!, b = PERM[xi + 1]!;
  const g00 = PERM[a + yi]! & 15, g01 = PERM[a + yi + 1]! & 15;
  const g10 = PERM[b + yi]! & 15, g11 = PERM[b + yi + 1]! & 15;
  const n00 = GRAD_X[g00]! * fx + GRAD_Y[g00]! * fy;
  const n10 = GRAD_X[g10]! * (fx - 1) + GRAD_Y[g10]! * fy;
  const n01 = GRAD_X[g01]! * fx + GRAD_Y[g01]! * (fy - 1);
  const n11 = GRAD_X[g11]! * (fx - 1) + GRAD_Y[g11]! * (fy - 1);
  const nx0 = n00 + u * (n10 - n00), nx1 = n01 + u * (n11 - n01);
  return 1.41 * (nx0 + v * (nx1 - nx0));
}

// Fractal noise. `spacing` is the distance between output pixels in noise units;
// octaves finer than two pixels fade out, so a screen preview does not alias into
// static while the 300 dpi print keeps all of the detail.
export function fbm(x: number, y: number, octaves: number, spacing = 0) {
  let sum = 0, amplitude = 0.5, frequency = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const step = spacing * frequency;
    const fade = step < 0.25 ? 1 : step > 0.5 ? 0 : (0.5 - step) * 4;
    if (fade > 0) sum += amplitude * fade * noise2(x * frequency + o * 17.3, y * frequency - o * 9.1);
    norm += amplitude;
    amplitude *= 0.5; frequency *= 2.03;
  }
  return sum / norm;
}

// Paper grain: one tileable field shared by the page, in millimeters, so
// granulation in overlapping blobs settles into the same paper texture.
export const GRAIN_TILE_MM = 48;
const GRAIN_SAMPLES = 768;
let grainFine: Float32Array | undefined;
let grainCoarse: Float32Array | undefined;
let grainTooth: Float32Array | undefined;

function periodicNoise(x: number, y: number, period: number) {
  const xf = Math.floor(x), yf = Math.floor(y);
  const x0 = ((xf % period) + period) % period, y0 = ((yf % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const fx = x - xf, fy = y - yf;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const g = (ix: number, iy: number) => PERM[(PERM[ix & 255]! + (iy & 255)) & 511]! & 15;
  const g00 = g(x0, y0), g10 = g(x1, y0), g01 = g(x0, y1), g11 = g(x1, y1);
  const n00 = GRAD_X[g00]! * fx + GRAD_Y[g00]! * fy;
  const n10 = GRAD_X[g10]! * (fx - 1) + GRAD_Y[g10]! * fy;
  const n01 = GRAD_X[g01]! * fx + GRAD_Y[g01]! * (fy - 1);
  const n11 = GRAD_X[g11]! * (fx - 1) + GRAD_Y[g11]! * (fy - 1);
  const nx0 = n00 + u * (n10 - n00), nx1 = n01 + u * (n11 - n01);
  return 1.41 * (nx0 + v * (nx1 - nx0));
}

function buildGrain() {
  // Cells across the tile: ~6 mm mottling, 2 mm tooth, 0.75 mm and 0.3 mm fibers.
  const octaves = [[8, 0.3], [24, 0.36], [64, 0.22], [160, 0.12]] as const;
  const fine = new Float32Array(GRAIN_SAMPLES * GRAIN_SAMPLES);
  const coarse = new Float32Array(GRAIN_SAMPLES * GRAIN_SAMPLES);
  const tooth = new Float32Array(GRAIN_SAMPLES * GRAIN_SAMPLES);
  for (let j = 0; j < GRAIN_SAMPLES; j++) for (let i = 0; i < GRAIN_SAMPLES; i++) {
    let low = 0, high = 0;
    octaves.forEach(([cells, amplitude], o) => {
      const value = amplitude * periodicNoise(i / GRAIN_SAMPLES * cells + o * 31, j / GRAIN_SAMPLES * cells - o * 57, cells);
      if (o < 2) low += value; else high += value;
    });
    fine[j * GRAIN_SAMPLES + i] = low + high;
    coarse[j * GRAIN_SAMPLES + i] = low;
    tooth[j * GRAIN_SAMPLES + i] = high;
  }
  // Unit-ish spread: most values fall within [-1, 1].
  for (const field of [fine, coarse, tooth]) {
    let sq = 0;
    for (const value of field) sq += value * value;
    const scale = 0.42 / Math.sqrt(sq / field.length);
    for (let i = 0; i < field.length; i++) field[i] = Math.max(-1.6, Math.min(1.6, field[i]! * scale));
  }
  grainFine = fine; grainCoarse = coarse; grainTooth = tooth;
}

// Bilinear lookup at page millimeters. Coarse pixels use the field without its
// sub-millimeter fibers, which would otherwise alias on screen.
// `tooth` keeps only the sub-millimeter fibers: paper texture without cloudiness.
export function grainSampler(pixelMm: number, tooth = false) {
  if (!grainFine) buildGrain();
  const field = tooth ? grainTooth! : pixelMm > 0.22 ? grainCoarse! : grainFine!;
  const scale = GRAIN_SAMPLES / GRAIN_TILE_MM;
  return (x: number, y: number) => {
    const gx = x * scale, gy = y * scale;
    const fx = Math.floor(gx), fy = Math.floor(gy);
    const tx = gx - fx, ty = gy - fy;
    const x0 = ((fx % GRAIN_SAMPLES) + GRAIN_SAMPLES) % GRAIN_SAMPLES, y0 = ((fy % GRAIN_SAMPLES) + GRAIN_SAMPLES) % GRAIN_SAMPLES;
    const x1 = x0 + 1 === GRAIN_SAMPLES ? 0 : x0 + 1, y1 = y0 + 1 === GRAIN_SAMPLES ? 0 : y0 + 1;
    const a = field[y0 * GRAIN_SAMPLES + x0]!, b = field[y0 * GRAIN_SAMPLES + x1]!;
    const c = field[y1 * GRAIN_SAMPLES + x0]!, d = field[y1 * GRAIN_SAMPLES + x1]!;
    return a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty;
  };
}
