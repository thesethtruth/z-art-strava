import { expect, test } from "bun:test";
import { applyPalette, DEFAULTS, SPORTS } from "./artwork";
import { contrastRatio, fitChroma, hexToRgb, oklchHex, oklchToLinearRgb, rgbToOklab } from "./color-science";
import { MOODS, randomPalette } from "./random-palette";

const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

test("OKLab conversion agrees with reference primaries and gamut fitting preserves hue/lightness", () => {
  expect(rgbToOklab([0, 0, 0])).toEqual([0, 0, 0]);
  const white = rgbToOklab([1, 1, 1]);
  expect(white[0]).toBeCloseTo(1, 6); expect(white[1]).toBeCloseTo(0, 6); expect(white[2]).toBeCloseTo(0, 6);
  const red = rgbToOklab([1, 0, 0]);
  expect(red[0]).toBeCloseTo(0.627955, 5); expect(red[1]).toBeCloseTo(0.224863, 5); expect(red[2]).toBeCloseTo(0.125846, 5);
  for (let hue = 0; hue < 360; hue += 15) {
    const chroma = fitChroma(0.65, 0.4, hue);
    expect(chroma).toBeLessThan(0.4);
    for (const channel of oklchToLinearRgb(0.65, chroma, hue)) { expect(channel).toBeGreaterThanOrEqual(-1e-7); expect(channel).toBeLessThanOrEqual(1 + 1e-7); }
    const [l, a, b] = rgbToOklab(hexToRgb(oklchHex(0.65, 0.4, hue)));
    expect(l).toBeCloseTo(0.65, 2);
    expect(Math.abs(Math.atan2(Math.sin(Math.atan2(b, a) - hue * Math.PI / 180), Math.cos(Math.atan2(b, a) - hue * Math.PI / 180)))).toBeLessThan(0.03);
  }
});

test("generated palettes are reproducible, separated on paper, and keep legend contrast", () => {
  const averageChroma = { muted: 0, neon: 0, "high-contrast": 0 };
  for (const mood of MOODS) for (let seed = 1; seed <= 60; seed++) {
    const preset = randomPalette(mood, 0.7, seeded(seed));
    expect(preset).toEqual(randomPalette(mood, 0.7, seeded(seed)));
    expect(preset.mood).toBe(mood);
    expect(preset.quality.separation).toBeGreaterThan(0.045);
    expect(preset.quality.paperContrast).toBeGreaterThan(1.4);
    expect(contrastRatio(hexToRgb(preset.ink), hexToRgb(preset.background))).toBeGreaterThan(4.5);
    expect(rgbToOklab(hexToRgb(preset.background))[0]).toBeGreaterThan(0.96);
    const lightnesses = [];
    for (const color of Object.values(preset.colors)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      const [l, a, b] = rgbToOklab(hexToRgb(color));
      averageChroma[mood] += Math.hypot(a, b) / (60 * SPORTS.length);
      lightnesses.push(l);
    }
    if (mood === "high-contrast") expect(Math.max(...lightnesses) - Math.min(...lightnesses)).toBeGreaterThan(0.23);
    const applied = applyPalette(DEFAULTS, preset);
    expect(applied.baseRadius).toBe(DEFAULTS.baseRadius);
    expect(applied.blend).toBe(DEFAULTS.blend);
    expect(applied.opacity).toBe(DEFAULTS.opacity);
  }
  expect(averageChroma.neon).toBeGreaterThan(averageChroma.muted * 1.7);
});

test("random mood chooses from all three profiles; low-opacity generation remains bounded", () => {
  const moods = new Set(Array.from({ length: 60 }, (_, i) => randomPalette("auto", 0.7, seeded(i * 196613)).mood));
  expect(moods.size).toBe(3);
  for (const mood of MOODS) expect(randomPalette(mood, 0.1, seeded(42)).quality.separation).toBeGreaterThan(0);
});
