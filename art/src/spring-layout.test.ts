import { expect, test } from "bun:test";
import { DEFAULTS, PAPER, normalizeSettings, SPORTS } from "./settings";
import { calendarPosition, DAILY } from "./activity-data";
import type { Daily, Mark, Week } from "./activity-data";
import { makeLayout } from "./artwork";
import { placeCluster, placeClusters } from "./spring-layout";

const crowdedWeek: Daily[] = Array.from({ length: 14 }, (_, i) => ({
  date: `2020-01-${String(6 + i % 7).padStart(2, "0")}`, sport: SPORTS[i % SPORTS.length]!, hours: i === 0 ? 9 : 1, activities: 1,
}));
const centerDistance = (node: { dx: number; dy: number }) => Math.hypot(node.dx, node.dy);

test("spring clusters preserve data, area, week membership, and reproducible export geometry", () => {
  const settings = { ...DEFAULTS, variant: "spring" as const };
  const { weeks, marks } = makeLayout(settings);
  expect(weeks).toHaveLength(530);
  expect(marks).toHaveLength(DAILY.length);
  for (const mark of marks) {
    expect(mark.r ** 2 / mark.hours).toBeCloseTo(settings.blobRadius ** 2, 10);
    const position = calendarPosition(mark.date);
    expect([mark.year, mark.row]).toEqual([position.year, position.row]);
    const week = weeks.find(w => w.year === mark.year && w.row === mark.row)!;
    const distance = Math.hypot(mark.x - week.x, mark.y - week.y);
    expect(distance).toBeLessThanOrEqual(settings.outerRadius + 1e-9);
    expect(mark.x - mark.r).toBeGreaterThan(0);
    expect(mark.x + mark.r).toBeLessThan(594);
    expect(mark.y - mark.r).toBeGreaterThan(0);
    expect(mark.y + mark.r).toBeLessThan(PAPER.height);
  }
  expect(placeCluster(crowdedWeek, settings)).toEqual(placeCluster(crowdedWeek, normalizeSettings(JSON.parse(JSON.stringify(settings)))));
  expect(placeCluster(crowdedWeek, settings)).not.toEqual(placeCluster(crowdedWeek, { ...settings, clusterSeed: 2 }));
  expect(normalizeSettings({ variant: "unknown" }).variant).toBe("weekday");
});

test("center springs collapse inward without collisions and form a dominant core with collisions", () => {
  const relaxed = placeCluster(crowdedWeek, { ...DEFAULTS, collisionStrength: 0 });
  relaxed.forEach(node => expect(centerDistance(node)).toBeLessThan(0.1));
  const crowded = placeCluster(crowdedWeek, DEFAULTS);
  expect(centerDistance(crowded[0]!)).toBeLessThan(1);
  expect(centerDistance(crowded[0]!)).toBeLessThan(Math.min(...crowded.slice(1).map(centerDistance)));
  expect(Math.max(...crowded.map(centerDistance))).toBeGreaterThan(crowded[0]!.r);
  const loose = placeCluster(crowdedWeek, { ...DEFAULTS, clusterOverlap: 0.8 });
  expect(loose.reduce((total, node) => total + centerDistance(node), 0)).toBeLessThan(crowded.reduce((total, node) => total + centerDistance(node), 0));
  for (const node of placeCluster(crowdedWeek, { ...DEFAULTS, outerRadius: 1 })) expect(centerDistance(node)).toBeLessThanOrEqual(1 + 1e-9);
  for (const node of placeCluster(crowdedWeek, { ...DEFAULTS, outerRadius: 0 })) expect(centerDistance(node)).toBe(0);
  expect(placeCluster([], DEFAULTS)).toEqual([]);
});

test("a lone activity is centered and weekday ring settings do not affect a spring cluster", () => {
  for (const hours of [0.25, 1, 9]) {
    const single = placeCluster([{ ...crowdedWeek[0]!, hours }], DEFAULTS);
    expect(centerDistance(single[0]!)).toBe(0);
  }
  expect(placeCluster(crowdedWeek, { ...DEFAULTS, baseRadius: 12, anchorCircles: false, stackMixed: true }))
    .toEqual(placeCluster(crowdedWeek, { ...DEFAULTS, baseRadius: 0 }));
});

test("increasing dominance moves the bigger bubble closer to the center", () => {
  for (const clusterSeed of [1, 2, 9]) {
    const equalSprings = placeCluster(crowdedWeek.slice(0, 2), { ...DEFAULTS, clusterSeed, dominance: 0 });
    const sizeWeighted = placeCluster(crowdedWeek.slice(0, 2), { ...DEFAULTS, clusterSeed, dominance: 1 });
    expect(centerDistance(sizeWeighted[0]!)).toBeLessThan(centerDistance(equalSprings[0]!) / 2);
    expect(centerDistance(sizeWeighted[0]!)).toBeLessThan(centerDistance(sizeWeighted[1]!));
  }
});

test("spring settings are bounded, round trip, and leave weekday options intact", () => {
  const settings = normalizeSettings({ ...DEFAULTS, variant: "spring", springStrength: 100, collisionStrength: -2, damping: Infinity, clusterSeed: 3.7, stackMixed: true });
  expect(settings.springStrength).toBe(0.8);
  expect(settings.collisionStrength).toBe(0);
  expect(settings.damping).toBe(DEFAULTS.damping);
  expect(settings.clusterSeed).toBe(4);
  expect(normalizeSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  const before = makeLayout({ ...DEFAULTS, stackMixed: true });
  makeLayout(settings);
  expect(makeLayout({ ...settings, variant: "weekday" })).toEqual(before);
});

// Squared penetration measures overlap depth, including visual overlap permitted
// by the artistic spacing setting, rather than only counting touching pairs.
function neighborOverlap(marks: Mark[]) {
  let total = 0;
  for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) {
    const a = marks[i]!, b = marks[j]!;
    if (a.year === b.year && a.row === b.row) continue;
    const penetration = Math.max(0, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
    total += penetration ** 2;
  }
  return total;
}

test("neighboring clusters reduce overlap and reorient around their own unchanged centers", () => {
  const days: Daily[] = crowdedWeek.slice(0, 7).map((day, i) => ({ ...day, hours: i === 0 ? 4 : 1 }));
  const weeks: Week[] = [
    { x: 100, y: 100, year: 2020, row: 1, days },
    { x: 100, y: 110, year: 2020, row: 2, days: days.map(d => ({ ...d, date: d.date.replace("01-", "02-") })) },
  ];
  const before = structuredClone(weeks);
  const isolated = weeks.flatMap(week => placeCluster(week.days, DEFAULTS).map(({ dx, dy, ...entry }) => ({
    ...entry, year: week.year, row: week.row, x: week.x + dx, y: week.y + dy,
  })));
  const interacting = placeClusters(weeks, DEFAULTS);
  expect(neighborOverlap(isolated)).toBeGreaterThan(1);
  expect(neighborOverlap(interacting)).toBeLessThan(neighborOverlap(isolated) * 0.5);
  expect(weeks).toEqual(before);
  expect(interacting).toHaveLength(isolated.length);
  let turned = false;
  for (let i = 0; i < interacting.length; i++) {
    const mark = interacting[i]!, original = isolated[i]!;
    const week = weeks.find(w => w.year === mark.year && w.row === mark.row)!;
    const dx = mark.x - week.x, dy = mark.y - week.y;
    const ox = original.x - week.x, oy = original.y - week.y;
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(DEFAULTS.outerRadius + 1e-9);
    // Nonzero cross product means the response includes a change in bearing,
    // so the neighbor is doing more than pushing the bubble radially outward.
    if (Math.abs(dx * oy - dy * ox) > 1) turned = true;
  }
  expect(turned).toBe(true);
  expect(placeClusters(weeks, normalizeSettings(JSON.parse(JSON.stringify(DEFAULTS))))).toEqual(interacting);
});

test("collision response includes adjacent year columns and switches off with collision pressure", () => {
  const day = crowdedWeek[0]!;
  const weeks: Week[] = [
    { x: 100, y: 100, year: 2020, row: 1, days: [day] },
    { x: 110, y: 100, year: 2021, row: 1, days: [{ ...day, date: "2021-01-04" }] },
  ];
  const off = placeClusters(weeks, { ...DEFAULTS, collisionStrength: 0 });
  expect(off.map(d => [d.x, d.y])).toEqual([[100, 100], [110, 100]]);
  const on = placeClusters(weeks, DEFAULTS);
  expect(neighborOverlap(on)).toBeLessThan(neighborOverlap(off));
  const farApart = placeClusters([weeks[0]!, { ...weeks[1]!, x: 200 }], DEFAULTS);
  expect(farApart.map(d => [d.x, d.y])).toEqual([[100, 100], [200, 100]]);
});
