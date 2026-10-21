import data from "../data/daily-activities.json";
import { DISTRIBUTIONS } from "./distributions";
import type { Distribution } from "./distributions";

export const PAPER = { width: 594, height: 841 } as const;
// Maximum vertical extent, with equal paper margins above and below.
export const GRID = { top: 36, bottom: PAPER.height - 36 } as const;
export const DAY_SECTOR = Math.PI * 2 / 7;
export const SPORTS = ["Rowing", "Weight training", "Cycling", "Running"] as const;
export type Sport = (typeof SPORTS)[number];
export const BLEND_MODES = [
  ["source-over", "Layered color"], ["multiply", "Multiply"],
  ["screen", "Screen"], ["soft-light", "Soft light"],
] as const satisfies ReadonlyArray<readonly [GlobalCompositeOperation, string]>;
export type BlendMode = (typeof BLEND_MODES)[number][0];
export const LEGEND_OPTIONS = {
  legendEdge: ["top", "bottom", "left", "right"],
  legendAlign: ["start", "center", "end"],
  legendOrientation: ["horizontal", "vertical"],
  legendFacing: ["left", "right"],
  legendMarginAlign: ["start", "center", "end"],
  volumeLegendPosition: ["below", "beside", "opposite"],
  volumeLegendScale: ["auto", "manual"],
} as const;
export type LegendSettings = { [K in keyof typeof LEGEND_OPTIONS]: (typeof LEGEND_OPTIONS)[K][number] };
export const PAINT_STYLES = [["flat", "Flat"], ["watercolor", "Watercolor"]] as const;
export type PaintStyle = (typeof PAINT_STYLES)[number][0];
export const TEXTURES = [
  ["wash", "Wash"], ["stripes", "Stripes"], ["dots", "Speckle"], ["bloom", "Bloom"],
  ["outline", "Outline"], ["drybrush", "Dry brush"], ["bleed", "Bleed"],
] as const;
export type Texture = (typeof TEXTURES)[number][0];
// Session rules, checked top to bottom: the first band a day falls into picks its
// texture odds. Thresholds are per-sport percentiles for effort and variability,
// meters climbed per hour, or hours on that day.
export const SESSION_BANDS = [
  ["hard", "Hard"], ["intervals", "Intervals"], ["climbing", "Climbing"],
  ["long", "Long day"], ["easy", "Easy"], ["steady", "Steady"],
] as const;
export type SessionBand = (typeof SESSION_BANDS)[number][0];
export type TextureRule = { threshold: number; odds: Record<Texture, number> };
export const RULE_LIMITS: Record<SessionBand, readonly [number, number]> = {
  hard: [0.5, 1], intervals: [0.5, 1], climbing: [100, 1500], long: [1, 12], easy: [0, 0.5], steady: [0, 0],
};
export const ODDS_LIMIT = [0, 100] as const;
export type Settings = {
  printBleed: boolean;
  background: string;
  centers: string;
  ink: string;
  colors: Record<Sport, string>;
  overlapEnabled: boolean;
  overlapColors: Record<Sport, string>;
  overlapBlends: Record<Sport, BlendMode>;
  variant: "weekday" | "spring";
  springStrength: number;
  collisionStrength: number;
  clusterOverlap: number;
  outerRadius: number;
  dominance: number;
  damping: number;
  clusterSeed: number;
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
  emptyWeekPointsOnly: boolean;
  legendFontSize: number;
  legendPadding: number;
  volumeLegendEnabled: boolean;
  volumeLegendValues: number[];
  blend: BlendMode;
  paintStyle: PaintStyle;
  paintBlend: BlendMode;
  paintSeed: number;
  shapeDistribution: Distribution;
  irregularity: number;
  elongation: number;
  shapeVariance: number;
  lobes: number;
  edgeRoughness: number;
  orientation: number;
  orientationJitter: number;
  wetness: number;
  edgeDarkening: number;
  mottling: number;
  pooling: number;
  granulation: number;
  paperGrain: number;
  spotRate: number;
  spotStrength: number;
  lightnessJitter: number;
  saturationJitter: number;
  funk: number;
  dataDrive: number;
  textureMix: Record<Texture, number>;
  textureRules: Record<SessionBand, TextureRule>;
} & LegendSettings;

export const DEFAULTS: Settings = {
  printBleed: true,
  background: "#fbf4eb",
  centers: "#c8c3bc",
  ink: "#7e7871",
  colors: data.meta.colors,
  overlapEnabled: false,
  overlapColors: { Rowing: "#257966", "Weight training": "#795692", Cycling: "#ad7026", Running: "#b44848" },
  overlapBlends: { Rowing: "multiply", "Weight training": "multiply", Cycling: "multiply", Running: "multiply" },
  variant: "weekday",
  springStrength: 0.16,
  collisionStrength: 0.8,
  clusterOverlap: 0.2,
  outerRadius: 14,
  dominance: 0.75,
  damping: 0.45,
  clusterSeed: 1,
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
  emptyWeekPointsOnly: false,
  blend: "source-over",
  legendEdge: "bottom",
  legendAlign: "center",
  legendOrientation: "horizontal",
  legendFacing: "left",
  legendMarginAlign: "center",
  legendFontSize: 2.55,
  legendPadding: 2,
  volumeLegendEnabled: false,
  volumeLegendPosition: "below",
  volumeLegendScale: "auto",
  volumeLegendValues: [1, 2, 5],
  paintStyle: "flat",
  paintBlend: "multiply",
  paintSeed: 1,
  shapeDistribution: "gamma",
  irregularity: 0.09,
  elongation: 0.3,
  shapeVariance: 0.6,
  lobes: 3,
  edgeRoughness: 0.25,
  orientation: 90,
  orientationJitter: 0.35,
  wetness: 0.35,
  edgeDarkening: 0.45,
  mottling: 0.45,
  pooling: 0.4,
  granulation: 0.15,
  paperGrain: 0,
  spotRate: 0.45,
  spotStrength: 0.8,
  lightnessJitter: 0.4,
  saturationJitter: 0.4,
  funk: 0.2,
  dataDrive: 1,
  textureMix: { wash: 2, stripes: 0.12, dots: 0.45, bloom: 0.6, outline: 0.6, drybrush: 0.45, bleed: 0.5 },
  textureRules: {
    hard: { threshold: 0.8, odds: { wash: 5, stripes: 0, dots: 45, bloom: 0, outline: 0, drybrush: 0, bleed: 50 } },
    intervals: { threshold: 0.95, odds: { wash: 10, stripes: 80, dots: 10, bloom: 0, outline: 0, drybrush: 0, bleed: 0 } },
    climbing: { threshold: 350, odds: { wash: 20, stripes: 0, dots: 0, bloom: 0, outline: 0, drybrush: 80, bleed: 0 } },
    long: { threshold: 4, odds: { wash: 20, stripes: 0, dots: 0, bloom: 80, outline: 0, drybrush: 0, bleed: 0 } },
    easy: { threshold: 0.2, odds: { wash: 15, stripes: 0, dots: 0, bloom: 0, outline: 85, drybrush: 0, bleed: 0 } },
    steady: { threshold: 0, odds: { wash: 90, stripes: 0, dots: 0, bloom: 5, outline: 0, drybrush: 5, bleed: 0 } },
  },
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
  // Pigments read from the reference watercolor: indigo, raw sienna, sap green, peach.
  palette("aquarelle", "Aquarelle", ["#41609f", "#d5a03c", "#3f8a73", "#e2906f"], "#f7f4ee", "#cdc8bf", "#6f6a62"),
];

export function applyPalette(settings: Settings, preset: Palette): Settings {
  return { ...settings, colors: { ...preset.colors }, background: preset.background, centers: preset.centers, ink: preset.ink };
}

export function matchingPalette(settings: Settings) {
  return PALETTES.find(preset => (["background", "centers", "ink"] as const).every(key => preset[key].toLowerCase() === settings[key].toLowerCase())
    && SPORTS.every(sport => preset.colors[sport].toLowerCase() === settings.colors[sport].toLowerCase()));
}

const HEX = /^#[\da-f]{6}$/i;
// Paint controls never move a bubble; the layout cache ignores them.
export const PAINT_LIMITS = {
  paintSeed: [1, 1_000_000], irregularity: [0, 0.4], elongation: [0, 1.5], shapeVariance: [0, 1.5],
  lobes: [2, 8], edgeRoughness: [0, 1.5], orientation: [0, 180], orientationJitter: [0, 1],
  wetness: [0, 1], edgeDarkening: [0, 1], mottling: [0, 1], pooling: [0, 1], granulation: [0, 1], paperGrain: [0, 1],
  spotRate: [0, 2], spotStrength: [0, 2], lightnessJitter: [0, 1], saturationJitter: [0, 1], funk: [0, 1], dataDrive: [0, 1],
} as const;
export const TEXTURE_LIMIT = [0, 3] as const;
export const LIMITS = {
  springStrength: [0.01, 0.8], collisionStrength: [0, 1], clusterOverlap: [0, 0.8],
  outerRadius: [0, 28], dominance: [0, 1], damping: [0.1, 0.9], clusterSeed: [1, 1_000_000],
  opacity: [0.1, 1], blobRadius: [0.5, 6], baseRadius: [0, 12],
  spreadFraction: [0, 1], stackOverlap: [0, 0.5], gridSize: [360, 490],
  gridHeight: [360, GRID.bottom - GRID.top], centerSize: [0, 0.6],
  legendFontSize: [1.5, 8], legendPadding: [0, 30],
  ...PAINT_LIMITS,
} as const;

const MODE_FIELDS = {
  spring: ["springStrength", "collisionStrength", "clusterOverlap", "outerRadius", "dominance", "damping", "clusterSeed"],
  weekday: ["baseRadius", "anchorCircles", "spreadFraction", "stackMixed", "stackOverlap"],
} as const;

type SpringField = (typeof MODE_FIELDS.spring)[number];
type WeekdayField = (typeof MODE_FIELDS.weekday)[number];
type SharedSettings = Omit<Settings, "variant" | SpringField | WeekdayField>;
export type SettingsFile = SharedSettings & {
  schemaVersion: 2;
  mode: Settings["variant"];
  spring: Pick<Settings, SpringField>;
  weekday: Pick<Settings, WeekdayField>;
};

// Keep the file self-describing and retain the inactive layout's controls, too.
// Flat settings from earlier versions are still accepted by normalizeSettings.
export function settingsForExport(settings: Settings): SettingsFile {
  const normalized = normalizeSettings(settings);
  const { variant, ...fields } = normalized;
  const modeKeys: readonly string[] = [...MODE_FIELDS.spring, ...MODE_FIELDS.weekday];
  return {
    schemaVersion: 2,
    mode: variant,
    ...Object.fromEntries(Object.entries(fields).filter(([key]) => !modeKeys.includes(key))) as SharedSettings,
    spring: Object.fromEntries(MODE_FIELDS.spring.map(key => [key, normalized[key]])) as SettingsFile["spring"],
    weekday: Object.fromEntries(MODE_FIELDS.weekday.map(key => [key, normalized[key]])) as SettingsFile["weekday"],
  };
}

export function normalizeSettings(input: unknown): Settings {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const values = { ...raw };
  for (const [mode, keys] of Object.entries(MODE_FIELDS)) {
    const section = raw[mode];
    if (!section || typeof section !== "object" || Array.isArray(section)) continue;
    for (const key of keys) {
      const value = (section as Record<string, unknown>)[key];
      if (value !== undefined) values[key] = value;
    }
  }
  if (raw.mode !== undefined) values.variant = raw.mode;
  const s = values as Partial<Settings> & { dayRadius?: unknown };
  const result = { ...DEFAULTS, colors: { ...DEFAULTS.colors }, overlapColors: { ...DEFAULTS.overlapColors }, overlapBlends: { ...DEFAULTS.overlapBlends }, volumeLegendValues: [...DEFAULTS.volumeLegendValues], textureMix: { ...DEFAULTS.textureMix }, textureRules: structuredClone(DEFAULTS.textureRules) };
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
    const overlapColor = s.overlapColors?.[sport];
    if (typeof overlapColor === "string" && HEX.test(overlapColor)) result.overlapColors[sport] = overlapColor;
    const overlapBlend = s.overlapBlends?.[sport];
    if (BLEND_MODES.some(([mode]) => mode === overlapBlend)) result.overlapBlends[sport] = overlapBlend!;
  }
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const value = s[key];
    const [lo, hi] = LIMITS[key];
    if (typeof value === "number" && Number.isFinite(value)) result[key] = Math.min(hi, Math.max(lo, value));
  }
  for (const key of ["printBleed", "anchorCircles", "stackMixed", "emptyWeekPointsOnly", "overlapEnabled", "volumeLegendEnabled"] as const) {
    if (typeof s[key] === "boolean") result[key] = s[key];
  }
  if (s.variant === "spring" || s.variant === "weekday") result.variant = s.variant;
  result.clusterSeed = Math.round(result.clusterSeed);
  result.paintSeed = Math.round(result.paintSeed);
  if (BLEND_MODES.some(([mode]) => mode === s.blend)) result.blend = s.blend!;
  if (BLEND_MODES.some(([mode]) => mode === s.paintBlend)) result.paintBlend = s.paintBlend!;
  if (PAINT_STYLES.some(([style]) => style === s.paintStyle)) result.paintStyle = s.paintStyle!;
  if (DISTRIBUTIONS.some(([name]) => name === s.shapeDistribution)) result.shapeDistribution = s.shapeDistribution!;
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  for (const [texture] of TEXTURES) {
    const value = s.textureMix?.[texture];
    if (finite(value)) result.textureMix[texture] = Math.min(TEXTURE_LIMIT[1], Math.max(TEXTURE_LIMIT[0], value));
  }
  for (const [band] of SESSION_BANDS) {
    const rule = s.textureRules?.[band];
    if (!rule || typeof rule !== "object") continue;
    const [lo, hi] = RULE_LIMITS[band];
    if (finite(rule.threshold)) result.textureRules[band].threshold = Math.min(hi, Math.max(lo, rule.threshold));
    for (const [texture] of TEXTURES) {
      const value = rule.odds?.[texture];
      if (finite(value)) result.textureRules[band].odds[texture] = Math.min(ODDS_LIMIT[1], Math.max(ODDS_LIMIT[0], value));
    }
  }
  for (const [key, choices] of Object.entries(LEGEND_OPTIONS)) {
    const value = values[key];
    if (typeof value === "string" && (choices as readonly string[]).includes(value)) Object.assign(result, { [key]: value });
  }
  if (Array.isArray(s.volumeLegendValues)) {
    const valid = s.volumeLegendValues.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100);
    if (valid.length) result.volumeLegendValues = [...new Set(valid)].sort((a, b) => a - b).slice(0, 6);
  }
  if (result.legendAlign === "center" && result.volumeLegendPosition === "opposite") result.volumeLegendPosition = "below";
  return result;
}

