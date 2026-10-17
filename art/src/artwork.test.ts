import { expect, test } from "bun:test";
import { applyPalette, BLEND_MODES, DAY_SECTOR, DEFAULTS, GRID, matchingPalette, normalizeSettings, PALETTES, PAPER, SPORTS } from "./settings";
import { calendarPosition, DAILY, META, YEARS } from "./activity-data";
import type { Daily } from "./activity-data";
import { makeLayout } from "./artwork";
import { placeDay } from "./weekday-layout";
import source from "../../data/consolidated_trainings.json";

test("every day stays in its calendar year and the 53-row Monday-start grid", () => {
  const occupied = new Set<string>();
  for (let value = Date.UTC(2016, 0, 1); value < Date.UTC(2026, 0, 1); value += 86_400_000) {
    const day = new Date(value).toISOString().slice(0, 10);
    const p = calendarPosition(day);
    expect(p.year).toBe(Number(day.slice(0, 4)));
    expect(p.row).toBeGreaterThanOrEqual(0); expect(p.row).toBeLessThan(53);
    expect(p.weekday).toBeGreaterThanOrEqual(0); expect(p.weekday).toBeLessThan(7);
    occupied.add(`${p.year}-${p.row}-${p.weekday}`);
  }
  expect(occupied.size).toBe(3653);
  expect(calendarPosition("2016-01-01")).toEqual({ year: 2016, row: 0, weekday: 4 });
  expect(calendarPosition("2024-12-31")).toEqual({ year: 2024, row: 52, weekday: 1 });
  expect(calendarPosition("2020-02-29")).toEqual({ year: 2020, row: 8, weekday: 5 });
});

test("derived totals match the joined input with exactly the documented exclusions", () => {
  const selected = source.filter(r => r.date >= "2016-01-01" && r.date < "2026-01-01" && SPORTS.includes(r.sport as typeof SPORTS[number]));
  const excluded = new Set(META.excluded.map(r => `${r.source}-${r.source_row}`));
  const expectedExcluded = selected.filter(r => r.duration <= 0 || (r.sport === "Rowing" && r.duration > 4)
    || (r.sport === "Cycling" && r.source === "Polar" && r.date === "2017-01-07T17:07:21.000"));
  expect(excluded).toEqual(new Set(expectedExcluded.map(r => `${r.source}-${r.source_row}`)));
  const retained = selected.filter(r => !expectedExcluded.includes(r));
  expect(excluded.size).toBe(6);
  expect(retained.length).toBe(META.activities);
  expect(DAILY.reduce((a, d) => a + d.activities, 0)).toBe(retained.length);
  for (const sport of SPORTS) {
    const hours = retained.filter(r => r.sport === sport).reduce((a, r) => a + r.duration, 0);
    expect(DAILY.filter(d => d.sport === sport).reduce((a, d) => a + d.hours, 0)).toBeCloseTo(hours, 7);
  }
  expect(new Set(DAILY.map(d => `${d.date}-${d.sport}`)).size).toBe(DAILY.length);
  // The filter applies to individual sessions, not a daily total or all long rides.
  const paris = retained.find(r => r.sport === "Cycling" && r.date.startsWith("2019-06-08"))!;
  expect(paris.duration).toBeCloseTo(19.9483333333, 8);
  expect(DAILY.find(d => d.sport === "Cycling" && d.date === "2019-06-08")!.hours).toBeGreaterThanOrEqual(paris.duration);
});

test("all weekly centers exist, and circle area is proportional to hours without capping", () => {
  const { weeks, marks } = makeLayout(DEFAULTS);
  expect(YEARS).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  expect(weeks).toHaveLength(10 * 53);
  expect(marks).toHaveLength(DAILY.length);
  for (const m of marks) expect(m.r * m.r / m.hours).toBeCloseTo(DEFAULTS.blobRadius ** 2, 10);
  const days = new Map<string, number>();
  for (const m of marks) days.set(m.date, (days.get(m.date) || 0) + m.hours);
  expect(days.size).toBe(META.activeDays);
});

test("spread and stacked compositions stay inside the paper at default scale", () => {
  for (const stackMixed of [false, true]) for (const stackOverlap of [0, 0.5]) {
    for (const m of makeLayout({ ...DEFAULTS, stackMixed, stackOverlap }).marks) {
      expect(m.x - m.r).toBeGreaterThan(0); expect(m.x + m.r).toBeLessThan(594);
      expect(m.y - m.r).toBeGreaterThan(0); expect(m.y + m.r).toBeLessThan(PAPER.height);
    }
  }
});

test("weeks use the vertical page extent independently of circle scales and grid width", () => {
  const wide = makeLayout(DEFAULTS);
  const narrow = makeLayout({ ...DEFAULTS, gridSize: 360 });
  expect(wide.weeks[0]!.y).toBe(GRID.top);
  expect(wide.weeks[52]!.y).toBe(GRID.bottom);
  expect(GRID.bottom - GRID.top).toBe(769);
  expect(narrow.weeks.map(w => w.y)).toEqual(wide.weeks.map(w => w.y));
  expect(narrow.marks.map(m => m.r)).toEqual(wide.marks.map(m => m.r));
  expect(DEFAULTS.blobRadius).toBe(2.9);
  expect(DEFAULTS.baseRadius).toBe(4.3);
  const cropped = makeLayout({ ...DEFAULTS, gridHeight: 470 });
  expect(cropped.weeks).toHaveLength(wide.weeks.length);
  expect(cropped.marks.map(m => m.r)).toEqual(wide.marks.map(m => m.r));
  expect(cropped.weeks[52]!.y - cropped.weeks[0]!.y).toBe(470);
  expect(cropped.weeks[0]!.y).toBe(PAPER.height - cropped.weeks[52]!.y);
  expect(cropped.weeks[0]!.y + cropped.weeks[52]!.y).toBe(PAPER.height);
  expect(wide.weeks[0]!.y).toBe(PAPER.height - wide.weeks[52]!.y);
});

const exampleDay: Daily[] = SPORTS.map((sport, i) => ({ date: "2020-01-06", sport, hours: [1, 9, 4, 0.25][i]!, activities: 1 }));

test("anchored circles meet the base ring exactly at their inner edge", () => {
  for (const baseRadius of [0, 4.3, 12]) for (const weekday of [0, 3, 6]) {
    const circles = placeDay(exampleDay, weekday, { ...DEFAULTS, baseRadius });
    for (const c of circles) expect(Math.hypot(c.dx, c.dy) - c.r).toBeCloseTo(baseRadius, 10);
    const unanchored = placeDay(exampleDay, weekday, { ...DEFAULTS, baseRadius, anchorCircles: false });
    for (const c of unanchored) expect(Math.hypot(c.dx, c.dy)).toBeCloseTo(baseRadius, 10);
  }
});

test("fractional spread puts two activities at the ends and three at ends plus center", () => {
  for (const count of [2, 3, 4]) {
    const circles = placeDay(exampleDay.slice(0, count), 0, { ...DEFAULTS, spreadFraction: 0.8 });
    expect(circles[0]!.angle + Math.PI / 2).toBeCloseTo(-0.4 * DAY_SECTOR, 12);
    expect(circles.at(-1)!.angle + Math.PI / 2).toBeCloseTo(0.4 * DAY_SECTOR, 12);
    if (count === 3) expect(circles[1]!.angle).toBeCloseTo(-Math.PI / 2, 12);
    for (let i = 1; i < circles.length; i++) {
      expect(circles[i]!.angle - circles[i - 1]!.angle).toBeCloseTo(0.8 * DAY_SECTOR / (count - 1), 12);
    }
  }
  const single = [exampleDay[0]!];
  expect(placeDay(single, 3, { ...DEFAULTS, spreadFraction: 0 })).toEqual(placeDay(single, 3, { ...DEFAULTS, spreadFraction: 1, stackMixed: true }));
});

test("radial stacks place the biggest nearest the week with overlap based on each smaller diameter", () => {
  for (const stackOverlap of [0, 0.25, 0.5]) {
    const circles = placeDay(exampleDay, 2, { ...DEFAULTS, stackMixed: true, stackOverlap });
    expect(circles.map(c => c.hours)).toEqual([9, 4, 1, 0.25]);
    expect(circles[0]!.distance - circles[0]!.r).toBeCloseTo(DEFAULTS.baseRadius, 10);
    for (let i = 1; i < circles.length; i++) {
      const previous = circles[i - 1]!, current = circles[i]!;
      expect(current.angle).toBe(previous.angle);
      const actualOverlap = previous.distance + previous.r - (current.distance - current.r);
      expect(actualOverlap).toBeCloseTo(stackOverlap * 2 * current.r, 10);
      expect(current.distance).toBeGreaterThan(previous.distance);
      if (stackOverlap === 0.5) expect(current.distance).toBeCloseTo(previous.distance + previous.r, 10);
    }
  }
});

test("old settings migrate the base radius without keeping removed options or millimeter offsets", () => {
  const settings = normalizeSettings({ dayRadius: 7.2, durationRadius: true, activitySpread: 3 });
  expect(settings.baseRadius).toBe(7.2);
  expect(settings.anchorCircles).toBe(true);
  expect(settings.spreadFraction).toBe(0.8);
  expect(settings).not.toHaveProperty("durationRadius");
  expect(settings).not.toHaveProperty("activitySpread");
  const bounds = normalizeSettings({ gridHeight: 900, spreadFraction: 5, stackOverlap: 1 });
  expect(bounds.gridHeight).toBe(769);
  expect(bounds.spreadFraction).toBe(1);
  expect(bounds.stackOverlap).toBe(0.5);
});

test("all blend modes survive settings round trips and palettes change only color", () => {
  for (const [blend] of BLEND_MODES) expect(normalizeSettings({ blend }).blend).toBe(blend);
  const original = normalizeSettings({ ...DEFAULTS, blend: "screen", opacity: 0.55, gridSize: 445, gridHeight: 620, stackMixed: true });
  for (const preset of PALETTES) {
    const applied = applyPalette(original, preset);
    expect(matchingPalette(applied)?.id).toBe(preset.id);
    expect(normalizeSettings(JSON.parse(JSON.stringify(applied)))).toEqual(applied);
    const { colors, background, centers, ink, ...geometry } = applied;
    const { colors: _c, background: _b, centers: _w, ink: _i, ...before } = original;
    expect(geometry).toEqual(before);
    applied.colors.Rowing = "#000000";
    expect(preset.colors.Rowing).not.toBe("#000000");
    expect(matchingPalette(applied)).toBeUndefined();
  }
});

test("settings imports are bounded and cannot carry invalid canvas values", () => {
  const settings = normalizeSettings({ opacity: Infinity, gridSize: 100000, colors: { Rowing: "not a color" }, background: "url(invalid)", blend: "invalid" });
  expect(settings.opacity).toBe(0.7);
  expect(settings.gridSize).toBe(490);
  expect(settings.colors.Rowing).toBe(DEFAULTS.colors.Rowing);
  expect(settings.background).toBe(DEFAULTS.background);
  expect(settings.blend).toBe("source-over");
});
