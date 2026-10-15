import { group, range, scaleLinear, scaleSqrt, sum } from "d3";
import data from "../data/daily-activities.json";

export const PAPER = { width: 594, height: 841 } as const;
// Maximum vertical extent. Shorter grids remain centered in this space.
export const GRID = { top: 36, bottom: 777, legendY: 820 } as const;
export const DAY_SECTOR = Math.PI * 2 / 7;
export const SPORTS = ["Rowing", "Weight training", "Cycling", "Running"] as const;
export type Sport = (typeof SPORTS)[number];
export const BLEND_MODES = [
  ["source-over", "Layered color"], ["multiply", "Multiply"],
  ["screen", "Screen"], ["soft-light", "Soft light"],
] as const satisfies ReadonlyArray<readonly [GlobalCompositeOperation, string]>;
export type BlendMode = (typeof BLEND_MODES)[number][0];
export type Settings = {
  background: string;
  centers: string;
  ink: string;
  colors: Record<Sport, string>;
  opacity: number;
  blobRadius: number;
  baseRadius: number;
  anchorCircles: boolean;
  spreadFraction: number;
  stackMixed: boolean;
  stackOverlap: number;
  gridSize: number;
  gridHeight: number;
  centerSize: number;
  blend: BlendMode;
};

export const DEFAULTS: Settings = {
  background: "#fbf4eb",
  centers: "#c8c3bc",
  ink: "#7e7871",
  colors: data.meta.colors,
  opacity: 0.7,
  blobRadius: 2.9,
  baseRadius: 4.3,
  anchorCircles: true,
  spreadFraction: 0.8,
  stackMixed: false,
  stackOverlap: 0.25,
  gridSize: 470,
  gridHeight: GRID.bottom - GRID.top,
  centerSize: 0.23,
  blend: "source-over",
};

export type Palette = Pick<Settings, "colors" | "background" | "centers" | "ink"> & { id: string; name: string };
const palette = (id: string, name: string, colors: readonly [string, string, string, string], background: string, centers: string, ink: string): Palette => ({
  id, name, colors: Object.fromEntries(SPORTS.map((sport, i) => [sport, colors[i]])) as Record<Sport, string>, background, centers, ink,
});
export const PALETTES: Palette[] = [
  { id: "original", name: "Original", colors: { ...DEFAULTS.colors }, background: DEFAULTS.background, centers: DEFAULTS.centers, ink: DEFAULTS.ink },
  palette("mineral", "Mineral", ["#498d97", "#b88baf", "#d8ad55", "#db8069"], "#f5f1e8", "#c4c2b7", "#716e65"),
  palette("terracotta", "Terracotta", ["#b9573f", "#ce9360", "#807d5c", "#975a70"], "#fbf0e4", "#cfc0af", "#816c5b"),
  palette("botanical", "Botanical", ["#367f76", "#9aa358", "#d19a70", "#9d7997"], "#f4f5eb", "#c4c8b5", "#687365"),
  palette("dusk", "Dusk", ["#7666a6", "#b38dac", "#db917d", "#5c8f9a"], "#f7f0f2", "#cbc1c8", "#796c7d"),
  palette("cyanotype", "Cyanotype", ["#285d91", "#658db2", "#85b6c7", "#454e7c"], "#f0f4f3", "#c1ccce", "#687c86"),
  palette("risograph", "Risograph", ["#337cc1", "#ed7868", "#e2b63d", "#469b8a"], "#faf4e8", "#c9c0ae", "#7d7566"),
];

export function applyPalette(settings: Settings, preset: Palette): Settings {
  return { ...settings, colors: { ...preset.colors }, background: preset.background, centers: preset.centers, ink: preset.ink };
}

export function matchingPalette(settings: Settings) {
  return PALETTES.find(preset => (["background", "centers", "ink"] as const).every(key => preset[key].toLowerCase() === settings[key].toLowerCase())
    && SPORTS.every(sport => preset.colors[sport].toLowerCase() === settings.colors[sport].toLowerCase()));
}

const HEX = /^#[\da-f]{6}$/i;
export const LIMITS = {
  opacity: [0.1, 1], blobRadius: [0.5, 6], baseRadius: [0, 12],
  spreadFraction: [0, 1], stackOverlap: [0, 0.5], gridSize: [360, 490],
  gridHeight: [360, GRID.bottom - GRID.top], centerSize: [0, 0.6],
} as const;

export function normalizeSettings(input: unknown): Settings {
  const s = input && typeof input === "object" ? input as Partial<Settings> & { dayRadius?: unknown } : {};
  const result = { ...DEFAULTS, colors: { ...DEFAULTS.colors } };
  // Preserve old radius settings, but never reinterpret millimeters as a fraction.
  // The removed durationRadius and activitySpread fields are deliberately ignored.
  if (s.baseRadius === undefined && typeof s.dayRadius === "number" && Number.isFinite(s.dayRadius)) {
    result.baseRadius = Math.max(LIMITS.baseRadius[0], Math.min(LIMITS.baseRadius[1], s.dayRadius));
  }
  for (const key of ["background", "centers", "ink"] as const) {
    if (typeof s[key] === "string" && HEX.test(s[key])) result[key] = s[key];
  }
  for (const sport of SPORTS) {
    const value = s.colors?.[sport];
    if (typeof value === "string" && HEX.test(value)) result.colors[sport] = value;
  }
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const value = s[key];
    const [lo, hi] = LIMITS[key];
    if (typeof value === "number" && Number.isFinite(value)) result[key] = Math.min(hi, Math.max(lo, value));
  }
  for (const key of ["anchorCircles", "stackMixed"] as const) {
    if (typeof s[key] === "boolean") result[key] = s[key];
  }
  if (BLEND_MODES.some(([mode]) => mode === s.blend)) result.blend = s.blend!;
  return result;
}

export type Daily = { date: string; sport: Sport; hours: number; activities: number };
export const DAILY = data.daily as Daily[];
export const META = data.meta;
export const YEARS = data.meta.years;
export const ARTWORK_NAME = `movement-${YEARS[0]}-${YEARS.at(-1)}-A1`;
export const ROWS = 53;

// UTC is used for arithmetic only. These date strings are already local calendar days.
// ISO week-years would put some January / December dates in the wrong year column.
export function calendarPosition(date: string) {
  const d = new Date(date + "T00:00:00Z");
  const year = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.round((+d - +jan1) / 86_400_000);
  const mondayOffset = (jan1.getUTCDay() + 6) % 7;
  return { year, row: Math.floor((dayOfYear + mondayOffset) / 7), weekday: (d.getUTCDay() + 6) % 7 };
}

export type Mark = Daily & { x: number; y: number; r: number; year: number; row: number };
export type Week = { x: number; y: number; year: number; row: number; days: Daily[] };

// Distances are in mm. Angles come from the weekday; circle AREA stays tied to hours.
export function placeDay(entries: Daily[], weekday: number, settings: Settings) {
  const radius = scaleSqrt().domain([0, 1]).range([0, settings.blobRadius]);
  const circles = entries.map(entry => ({ ...entry, r: radius(entry.hours) }));
  circles.sort((a, b) => (settings.stackMixed ? b.r - a.r : 0) || SPORTS.indexOf(a.sport) - SPORTS.indexOf(b.sport));
  let previousDistance = 0;
  let previousRadius = 0;
  return circles.map((circle, i) => {
    const offset = settings.stackMixed || circles.length === 1 ? 0
      : (i / (circles.length - 1) - 0.5) * settings.spreadFraction * DAY_SECTOR;
    const angle = -Math.PI / 2 + weekday * DAY_SECTOR + offset;
    const distance = settings.stackMixed && i > 0
      ? previousDistance + previousRadius + circle.r - settings.stackOverlap * 2 * circle.r
      : settings.baseRadius + (settings.anchorCircles ? circle.r : 0);
    previousDistance = distance;
    previousRadius = circle.r;
    return { ...circle, angle, distance, dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance };
  });
}

export function makeLayout(settings: Settings) {
  const side = settings.gridSize;
  const left = (PAPER.width - side) / 2;
  const x = scaleLinear().domain([YEARS[0]!, YEARS.at(-1)!]).range([left, left + side]);
  const middle = (GRID.top + GRID.bottom) / 2;
  const y = scaleLinear().domain([0, ROWS - 1]).range([middle - settings.gridHeight / 2, middle + settings.gridHeight / 2]);
  const weeks: Week[] = YEARS.flatMap(year => range(ROWS).map(row => ({ x: x(year), y: y(row), year, row, days: [] })));
  const weekById = new Map(weeks.map(w => [`${w.year}-${w.row}`, w]));
  const marks: Mark[] = [];
  for (const [date, entries] of group(DAILY, d => d.date)) {
    const { year, row, weekday } = calendarPosition(date);
    const week = weekById.get(`${year}-${row}`)!;
    week.days.push(...entries);
    for (const { dx, dy, angle: _angle, distance: _distance, ...d } of placeDay(entries, weekday, settings)) {
      marks.push({ ...d, year, row, x: week.x + dx, y: week.y + dy });
    }
  }
  // Larger circles are painted first so small sessions remain legible in overlaps.
  marks.sort((a, b) => b.r - a.r || a.date.localeCompare(b.date) || SPORTS.indexOf(a.sport) - SPORTS.indexOf(b.sport));
  return { weeks, marks };
}

export type Layout = ReturnType<typeof makeLayout>;
export type Highlight = { sport?: Sport; week?: Week } | null;
const activityLayers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

export function drawArtwork(canvas: HTMLCanvasElement, settings: Settings, pixelsPerMm: number, highlight: Highlight = null) {
  const width = Math.round(PAPER.width * pixelsPerMm);
  const height = Math.round(PAPER.height * pixelsPerMm);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.setTransform(width / PAPER.width, 0, 0, height / PAPER.height, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, PAPER.width, PAPER.height);
  const layout = makeLayout(settings);

  ctx.fillStyle = settings.centers;
  ctx.beginPath();
  for (const week of layout.weeks) {
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
    paint.setTransform(width / PAPER.width, 0, 0, height / PAPER.height, 0, 0);
  } else {
    const previous = activityLayers.get(canvas);
    if (previous) { previous.width = previous.height = 1; activityLayers.delete(canvas); }
  }
  paint.globalCompositeOperation = settings.blend;
  for (const mark of layout.marks) {
    const focused = (!highlight?.sport || mark.sport === highlight.sport)
      && (!highlight?.week || (mark.year === highlight.week.year && mark.row === highlight.week.row));
    paint.globalAlpha = settings.opacity * (focused ? 1 : 0.1);
    paint.fillStyle = settings.colors[mark.sport];
    paint.beginPath();
    paint.arc(mark.x, mark.y, mark.r, 0, Math.PI * 2);
    paint.fill();
  }
  if (layer) { ctx.globalAlpha = 1; ctx.drawImage(layer, 0, 0, PAPER.width, PAPER.height); }

  // The legend is the only text on the paper. All controls and inspection stay outside it.
  ctx.globalCompositeOperation = "source-over";
  ctx.font = "400 2.55px Arial, sans-serif";
  ctx.textBaseline = "middle";
  const gap = 10;
  const widths = SPORTS.map(s => ctx.measureText(s.toLowerCase()).width + 5.5);
  const total = sum(widths) + gap * (SPORTS.length - 1);
  let lx = (PAPER.width - total) / 2;
  const ly = GRID.legendY;
  SPORTS.forEach((sport, i) => {
    ctx.globalAlpha = settings.opacity * (!highlight?.sport || sport === highlight.sport ? 1 : 0.2);
    ctx.fillStyle = settings.colors[sport];
    ctx.beginPath(); ctx.arc(lx + 0.9, ly, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = !highlight?.sport || sport === highlight.sport ? 1 : 0.3;
    ctx.fillStyle = settings.ink;
    ctx.fillText(sport.toLowerCase(), lx + 4, ly + 0.1);
    lx += widths[i]! + gap;
  });
  ctx.globalAlpha = 1;
  return layout;
}
