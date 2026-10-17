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
