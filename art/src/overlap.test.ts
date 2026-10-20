import { expect, test } from "bun:test";
import type { Mark } from "./activity-data";
import { intersectionArcs, overlapRegions } from "./overlap";
import { DEFAULTS, normalizeSettings, settingsForExport } from "./settings";

const mark = (values: Partial<Mark> = {}): Mark => ({ x: 0, y: 0, r: 3, year: 2020, row: 1, date: "2020-01-06", sport: "Cycling", hours: 1, activities: 1, ...values });

test("overlap ownership uses total week hours, not the touching bubble's size", () => {
  const cycling = mark();
  const distantRun = mark({ x: 100, sport: "Running", hours: 8 });
  const rowing = mark({ x: 4, row: 2, sport: "Rowing", hours: 4, r: 4 });
  expect(overlapRegions([cycling, distantRun, rowing])).toEqual([{ owner: cycling, others: [rowing] }]);
  expect(overlapRegions([cycling, rowing])).toEqual([{ owner: rowing, others: [cycling] }]);
  expect(overlapRegions([rowing, distantRun, cycling])).toEqual([{ owner: cycling, others: [rowing] }]);
});

test("only intersecting bubbles from distinct weeks get secondary colors; ties are stable", () => {
  const a = mark();
  expect(overlapRegions([a, mark({ x: 1, sport: "Rowing" })])).toEqual([]);
  expect(overlapRegions([a, mark({ x: 6, row: 2 })])).toEqual([]);
  const b = mark({ x: 4, row: 2 });
  expect(overlapRegions([b, a])[0]!.owner).toBe(a);
  const nextYear = mark({ x: 4, year: 2021, hours: 5 });
  expect(overlapRegions([a, nextYear])[0]!.owner).toBe(nextYear);
});

test("three-way intersections paint the strongest week last", () => {
  const a = mark({ hours: 8 });
  const b = mark({ row: 2, hours: 4, sport: "Rowing", x: 1 });
  const c = mark({ row: 3, hours: 2, sport: "Running", x: 2 });
  const regions = overlapRegions([a, b, c]);
  expect(regions.map(region => region.owner)).toEqual([b, a]);
  expect(regions[1]!.others).toEqual([b, c]);
});

test("intersection arcs cover lenses, containment and coincident circles without invalid angles", () => {
  const a = { x: 0, y: 0, r: 3 };
  expect(intersectionArcs(a, { x: 6, y: 0, r: 3 })).toEqual([]);
  expect(intersectionArcs(a, { x: 0, y: 0, r: 1 })).toEqual([{ x: 0, y: 0, r: 1, start: 0, end: 2 * Math.PI }]);
  expect(intersectionArcs(a, a)).toEqual([{ ...a, start: 0, end: 2 * Math.PI }]);
  const arcs = intersectionArcs(a, { x: 4, y: 0, r: 3 });
  expect(arcs).toHaveLength(2);
  const [first, second] = arcs;
  expect(first!.x + first!.r * Math.cos(first!.end)).toBeCloseTo(second!.x + second!.r * Math.cos(second!.start));
  expect(first!.y + first!.r * Math.sin(first!.end)).toBeCloseTo(second!.y + second!.r * Math.sin(second!.start));
});

test("overlap colors and blend modes survive settings export and reject invalid values", () => {
  const settings = normalizeSettings({ ...DEFAULTS, overlapEnabled: true, overlapColors: { Cycling: "#ff0088" }, overlapBlends: { Cycling: "screen" } });
  expect(normalizeSettings(settingsForExport(settings))).toEqual(settings);
  expect(normalizeSettings({ overlapEnabled: "yes", overlapColors: { Rowing: "bad" }, overlapBlends: { Cycling: "copy" } })).toEqual(DEFAULTS);
  settings.overlapColors.Rowing = "#ffffff";
  expect(DEFAULTS.overlapColors.Rowing).not.toBe("#ffffff");
});
