import data from "../data/daily-activities.json";

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
} as const;
export type LegendSettings = { [K in keyof typeof LEGEND_OPTIONS]: (typeof LEGEND_OPTIONS)[K][number] };
export type Settings = {
  background: string;
  centers: string;
  ink: string;
  colors: Record<Sport, string>;
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
  blend: BlendMode;
} & LegendSettings;

export const DEFAULTS: Settings = {
  background: "#fbf4eb",
  centers: "#c8c3bc",
  ink: "#7e7871",
  colors: data.meta.colors,
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
  springStrength: [0.01, 0.8], collisionStrength: [0, 1], clusterOverlap: [0, 0.8],
  outerRadius: [0, 28], dominance: [0, 1], damping: [0.1, 0.9], clusterSeed: [1, 1_000_000],
  opacity: [0.1, 1], blobRadius: [0.5, 6], baseRadius: [0, 12],
  spreadFraction: [0, 1], stackOverlap: [0, 0.5], gridSize: [360, 490],
  gridHeight: [360, GRID.bottom - GRID.top], centerSize: [0, 0.6],
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
  for (const key of ["anchorCircles", "stackMixed", "emptyWeekPointsOnly"] as const) {
    if (typeof s[key] === "boolean") result[key] = s[key];
  }
  if (s.variant === "spring" || s.variant === "weekday") result.variant = s.variant;
  result.clusterSeed = Math.round(result.clusterSeed);
  if (BLEND_MODES.some(([mode]) => mode === s.blend)) result.blend = s.blend!;
  for (const [key, choices] of Object.entries(LEGEND_OPTIONS)) {
    const value = values[key];
    if (typeof value === "string" && (choices as readonly string[]).includes(value)) Object.assign(result, { [key]: value });
  }
  return result;
}

