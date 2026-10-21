import { expect, test } from "bun:test";
import { DEFAULTS, normalizeSettings, settingsForExport } from "./settings";

test("settings files explicitly export the mode and every parameter for both layouts", () => {
  for (const variant of ["weekday", "spring"] as const) {
    const original = normalizeSettings({
      ...DEFAULTS, variant, springStrength: 0.31, collisionStrength: 0.55, clusterOverlap: 0.4,
      outerRadius: 19, dominance: 0.9, damping: 0.65, clusterSeed: 917,
      anchorCircles: false, spreadFraction: 0.35, stackMixed: true, stackOverlap: 0.45,
      baseRadius: 3.5, blobRadius: 2.1, opacity: 0.55, blend: "multiply", gridHeight: 600,
    });
    const file = settingsForExport(original);
    expect(file.schemaVersion).toBe(2);
    expect(file.mode).toBe(variant);
    expect(file.spring).toEqual({
      springStrength: 0.31, collisionStrength: 0.55, clusterOverlap: 0.4,
      outerRadius: 19, dominance: 0.9, damping: 0.65, clusterSeed: 917,
    });
    expect(file.weekday).toEqual({ baseRadius: 3.5, anchorCircles: false, spreadFraction: 0.35, stackMixed: true, stackOverlap: 0.45 });
    expect(file.colors).toEqual(original.colors);
    expect(normalizeSettings(JSON.parse(JSON.stringify(file)))).toEqual(original);
    expect(original.variant).toBe(variant);
  }
});

test("old flat settings files still load and nested imports use the same validation", () => {
  expect(normalizeSettings(JSON.parse(JSON.stringify(DEFAULTS)))).toEqual(DEFAULTS);
  const file = settingsForExport({ ...DEFAULTS, variant: "spring" });
  const invalid = normalizeSettings({
    ...file, spring: { ...file.spring, springStrength: 100, damping: "invalid", background: "#000000" },
    weekday: { anchorCircles: "yes", stackMixed: true },
  });
  expect(invalid.variant).toBe("spring");
  expect(invalid.springStrength).toBe(0.8);
  expect(invalid.damping).toBe(DEFAULTS.damping);
  expect(invalid.anchorCircles).toBe(DEFAULTS.anchorCircles);
  expect(invalid.stackMixed).toBe(true);
  expect(invalid.background).toBe(DEFAULTS.background);
});

test("watercolor settings validate, clamp, and round-trip through settings files", () => {
  const original = normalizeSettings({
    ...DEFAULTS, paintStyle: "watercolor", paintBlend: "soft-light", paintSeed: 12.6, shapeDistribution: "weibull",
    irregularity: 0.25, funk: 0.7, orientation: 45, textureMix: { ...DEFAULTS.textureMix, stripes: 2.5, bleed: 0 },
    textureRules: { ...DEFAULTS.textureRules, climbing: { threshold: 600, odds: { ...DEFAULTS.textureRules.climbing.odds, stripes: 35 } } },
  });
  expect(original.paintSeed).toBe(13);
  expect(normalizeSettings(JSON.parse(JSON.stringify(settingsForExport(original))))).toEqual(original);
  const invalid = normalizeSettings({
    paintStyle: "oil", paintBlend: "difference", shapeDistribution: "cauchy", funk: 4, irregularity: -1,
    textureMix: { wash: 9, stripes: "many", dots: -2 },
    textureRules: { hard: { threshold: 0.1, odds: { bleed: 400, dots: "lots" } }, long: "always", easy: { threshold: 0.9 } },
  });
  expect(invalid.paintStyle).toBe("flat");
  expect(invalid.paintBlend).toBe("multiply");
  expect(invalid.shapeDistribution).toBe(DEFAULTS.shapeDistribution);
  expect(invalid.funk).toBe(1);
  expect(invalid.irregularity).toBe(0);
  expect(invalid.textureMix).toEqual({ ...DEFAULTS.textureMix, wash: 3, dots: 0 });
  expect(invalid.textureRules.hard).toEqual({ threshold: 0.5, odds: { ...DEFAULTS.textureRules.hard.odds, bleed: 100 } });
  expect(invalid.textureRules.long).toEqual(DEFAULTS.textureRules.long);
  expect(invalid.textureRules.easy.threshold).toBe(0.5);
  // Files from before the paint controls keep their flat circles.
  expect(normalizeSettings({ colors: DEFAULTS.colors }).paintStyle).toBe("flat");
});
