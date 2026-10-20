import { group, range, scaleLinear } from "d3";
import { LIMITS, PAPER, SPORTS } from "./settings";
import type { Settings, Sport } from "./settings";
import { calendarPosition, DAILY, ROWS, YEARS } from "./activity-data";
import type { Mark, Week } from "./activity-data";
import { placeDay } from "./weekday-layout";
import { placeClusters } from "./spring-layout";
import { drawLegend } from "./legend";
import { gridBounds } from "./grid";
import { drawOverlaps } from "./overlap";

let cachedLayout: { key: string; layout: { weeks: Week[]; marks: Mark[] } } | undefined;
export function makeLayout(settings: Settings) {
  const key = JSON.stringify([settings.variant, ...Object.keys(LIMITS).filter(key => key !== "opacity" && key !== "centerSize" && !key.startsWith("legend")).map(key => settings[key as keyof Settings]), settings.anchorCircles, settings.stackMixed]);
  if (cachedLayout?.key === key) return cachedLayout.layout;
  const bounds = gridBounds(settings);
  const x = scaleLinear().domain([YEARS[0]!, YEARS.at(-1)!]).range([bounds.left, bounds.right]);
  const y = scaleLinear().domain([0, ROWS - 1]).range([bounds.top, bounds.bottom]);
  const weeks: Week[] = YEARS.flatMap(year => range(ROWS).map(row => ({ x: x(year), y: y(row), year, row, days: [] })));
  const weekById = new Map(weeks.map(w => [`${w.year}-${w.row}`, w]));
  const marks: Mark[] = [];
  for (const [date, entries] of group(DAILY, d => d.date)) {
    const { year, row, weekday } = calendarPosition(date);
    const week = weekById.get(`${year}-${row}`)!;
    week.days.push(...entries);
    if (settings.variant === "spring") continue;
    for (const { dx, dy, angle: _angle, distance: _distance, ...d } of placeDay(entries, weekday, settings)) {
      marks.push({ ...d, year, row, x: week.x + dx, y: week.y + dy });
    }
  }
  if (settings.variant === "spring") {
    marks.push(...placeClusters(weeks, settings));
  }
  // Larger circles are painted first so small sessions remain legible in overlaps.
  marks.sort((a, b) => b.r - a.r || a.date.localeCompare(b.date) || SPORTS.indexOf(a.sport) - SPORTS.indexOf(b.sport));
  const layout = { weeks, marks };
  cachedLayout = { key, layout };
  return layout;
}

export type Layout = ReturnType<typeof makeLayout>;
export type Highlight = { sport?: Sport; week?: Week } | null;
const activityLayers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

export function drawArtwork(canvas: HTMLCanvasElement, settings: Settings, pixelsPerMm: number, highlight: Highlight = null, bleed = 0) {
  const width = Math.round((PAPER.width + 2 * bleed) * pixelsPerMm);
  const height = Math.round((PAPER.height + 2 * bleed) * pixelsPerMm);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const sx = width / (PAPER.width + 2 * bleed);
  const sy = height / (PAPER.height + 2 * bleed);
  ctx.setTransform(sx, 0, 0, sy, bleed * sx, bleed * sy);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = settings.background;
  ctx.fillRect(-bleed, -bleed, PAPER.width + 2 * bleed, PAPER.height + 2 * bleed);
  const layout = makeLayout(settings);

  ctx.fillStyle = settings.centers;
  ctx.beginPath();
  for (const week of layout.weeks) {
    if (settings.emptyWeekPointsOnly && week.days.length > 0) continue;
    ctx.moveTo(week.x + settings.centerSize, week.y);
    ctx.arc(week.x, week.y, settings.centerSize, 0, Math.PI * 2);
  }
  ctx.fill();

  // Blend circles with one another on transparency, then place them over the paper.
  // This keeps Screen visible on ivory, and leaves the centers and legend alone.
  let paint = ctx;
  let layer: HTMLCanvasElement | undefined;
  if (settings.blend !== "source-over") {
    layer = activityLayers.get(canvas) || document.createElement("canvas");
    activityLayers.set(canvas, layer);
    if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
    paint = layer.getContext("2d")!;
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.clearRect(0, 0, width, height);
    paint.setTransform(sx, 0, 0, sy, bleed * sx, bleed * sy);
  } else {
    const previous = activityLayers.get(canvas);
    if (previous) { previous.width = previous.height = 1; activityLayers.delete(canvas); }
  }
  paint.globalCompositeOperation = settings.blend;
  const focused = (mark: Mark) => (!highlight?.sport || mark.sport === highlight.sport)
    && (!highlight?.week || (mark.year === highlight.week.year && mark.row === highlight.week.row));
  for (const mark of layout.marks) {
    paint.globalAlpha = settings.opacity * (focused(mark) ? 1 : 0.1);
    paint.fillStyle = settings.colors[mark.sport];
    paint.beginPath();
    paint.arc(mark.x, mark.y, mark.r, 0, Math.PI * 2);
    paint.fill();
  }
  if (layer) { ctx.globalAlpha = 1; ctx.drawImage(layer, -bleed, -bleed, PAPER.width + 2 * bleed, PAPER.height + 2 * bleed); }
  drawOverlaps(ctx, layout.marks, settings, focused);

  // The legend shares the same placement in preview, PNG, and PDF.
  drawLegend(ctx, settings, highlight?.sport);
  ctx.globalAlpha = 1;
  return layout;
}
