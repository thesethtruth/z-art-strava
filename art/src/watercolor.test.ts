import { expect, test } from "bun:test";
import { DEFAULTS, normalizeSettings } from "./settings";
import { DAILY, META } from "./activity-data";
import { makeLayout } from "./artwork";
import { seeded } from "./distributions";
import { blobRecipe, outlineProfile, rasterizeBlob, sessionBand } from "./watercolor";

const settings = normalizeSettings({ ...DEFAULTS, paintStyle: "watercolor", variant: "spring" });
const marks = makeLayout(settings).marks;

test("session signals are per-sport percentiles with broad coverage", () => {
  for (const day of DAILY) {
    for (const key of ["effort", "variability"] as const) {
      const value = day[key];
      if (value != null) { expect(value).toBeGreaterThan(0); expect(value).toBeLessThanOrEqual(1); }
    }
  }
  expect(DAILY.filter(d => d.effort != null).length / DAILY.length).toBeGreaterThan(0.95);
  expect(META.sessionSignals.coverage.effort).toBe(DAILY.filter(d => d.effort != null).length);
  const paris = DAILY.find(d => d.date === "2019-06-08")!;
  expect(paris.hours).toBeCloseTo(19.9483333333, 8);
});

test("irregular outlines keep the circle's area, so area still encodes hours", () => {
  for (const irregularity of [0, 0.1, 0.3, 0.6]) {
    for (const lobes of [2, 5, 8]) {
      const profile = outlineProfile({ ...settings, lobes }, irregularity, seeded(irregularity * 100 + lobes));
      let area = 0;
      for (let i = 0; i < profile.length - 1; i++) area += 0.5 * profile[i]! ** 2 * (Math.PI * 2 / (profile.length - 1));
      expect(area).toBeCloseTo(Math.PI, 6);
    }
  }
});

test("a rasterized wash covers the area of its circle", () => {
  // A uniform interior, so half of its alpha marks the anti-aliased edge.
  const calm = normalizeSettings({ ...settings, edgeRoughness: 0, wetness: 0, spotStrength: 0, mottling: 0, pooling: 0, edgeDarkening: 0, granulation: 0, irregularity: 0.2, elongation: 0.5 });
  const pixelsPerMm = 20;
  for (const hours of [0.5, 2, 6]) {
    const r = calm.blobRadius * Math.sqrt(hours);
    const recipe = blobRecipe({ date: `2020-01-0${Math.round(hours) + 1}`, sport: "Cycling", hours, activities: 1, effort: 0.5, variability: 0.1, climb: 0, x: 50, y: 50, r }, calm, { texture: "wash" });
    const sprite = rasterizeBlob(recipe, pixelsPerMm, pixelsPerMm, 0, 0, 2000, 2000)!;
    const center = sprite.data[(Math.floor(sprite.height / 2) * sprite.width + Math.floor(sprite.width / 2)) * 4 + 3]!;
    let painted = 0;
    for (let i = 3; i < sprite.data.length; i += 4) if (sprite.data[i]! >= center / 2) painted++;
    expect(Math.abs(painted / (Math.PI * r * r * pixelsPerMm ** 2) - 1)).toBeLessThan(0.015);
  }
});

test("recipes are deterministic, and funk only changes color", () => {
  const funky = normalizeSettings({ ...settings, funk: 0.9 });
  for (const mark of marks.slice(0, 200)) {
    const a = blobRecipe(mark, settings), b = blobRecipe(mark, settings), c = blobRecipe(mark, funky);
    expect(a).toEqual(b);
    expect(c.texture).toBe(a.texture);
    expect(Array.from(c.profile)).toEqual(Array.from(a.profile));
    expect([c.cos, c.sin, c.stretch, c.extent, c.pigments.length]).toEqual([a.cos, a.sin, a.stretch, a.extent, a.pigments.length]);
  }
  const plain = normalizeSettings({ ...settings, funk: 0 });
  expect(marks.reduce((n, mark) => n + blobRecipe(mark, plain).odd, 0)).toBe(0);
  expect(marks.reduce((n, mark) => n + blobRecipe(mark, funky).odd, 0)).toBeGreaterThan(marks.length * 0.5);
});

test("session bands are checked in order: hard, intervals, climbing, long, easy, steady", () => {
  const rules = DEFAULTS.textureRules;
  const day = { effort: 0.5, variability: 0.5, climb: 100, hours: 1 };
  expect(sessionBand({ ...day, effort: 0.9, variability: 0.99 }, rules)).toBe("hard");
  expect(sessionBand({ ...day, variability: 0.99, climb: 900 }, rules)).toBe("intervals");
  expect(sessionBand({ ...day, climb: 900, hours: 9 }, rules)).toBe("climbing");
  expect(sessionBand({ ...day, effort: 0.1, hours: 9 }, rules)).toBe("long");
  expect(sessionBand({ ...day, effort: 0.1 }, rules)).toBe("easy");
  expect(sessionBand(day, rules)).toBe("steady");
  expect(sessionBand({ ...day, effort: null }, rules)).toBe(null);
  expect(sessionBand({ ...day, effort: null, hours: 9 }, rules)).toBe("long");
});

test("at full data drive the session table alone picks textures", () => {
  const driven = normalizeSettings({ ...settings, dataDrive: 1 });
  for (const mark of marks) {
    const band = sessionBand(mark, driven.textureRules);
    if (!band) continue;
    const texture = blobRecipe(mark, driven).texture;
    expect(driven.textureRules[band].odds[texture]).toBeGreaterThan(0);
  }
  // A row at 100% for one texture makes it deterministic.
  const strict = normalizeSettings({ ...driven, textureRules: { ...driven.textureRules, hard: { threshold: 0.8, odds: { wash: 0, stripes: 0, dots: 0, bloom: 0, outline: 0, drybrush: 0, bleed: 100 } } } });
  const hard = marks.filter(m => sessionBand(m, strict.textureRules) === "hard");
  expect(hard.length).toBeGreaterThan(250);
  expect(hard.every(m => blobRecipe(m, strict).texture === "bleed")).toBe(true);
  // At zero drive the Texture mix decides, regardless of session.
  const chance = normalizeSettings({ ...settings, dataDrive: 0, textureMix: { wash: 0, stripes: 0, dots: 0, bloom: 0, outline: 1, drybrush: 0, bleed: 0 } });
  expect(marks.slice(0, 300).every(m => blobRecipe(m, chance).texture === "outline")).toBe(true);
});

test("stripes are rare by default", () => {
  const stripes = marks.filter(m => blobRecipe(m, settings).texture === "stripes").length;
  expect(stripes / marks.length).toBeLessThan(0.05);
});

test("larger blobs are more likely to carry several dark centers", () => {
  const centers = (filter: (m: typeof marks[number]) => boolean) => {
    const group = marks.filter(filter);
    return group.reduce((n, m) => n + blobRecipe(m, settings).pigments.filter(p => !p.escape).length, 0) / group.length;
  };
  expect(centers(m => m.hours > 4)).toBeGreaterThan(centers(m => m.hours < 1) + 0.8);
});
