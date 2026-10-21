import { printDimensions } from "./print";
import { BLEND_MODES, DEFAULTS, LEGEND_OPTIONS, LIMITS, ODDS_LIMIT, PAINT_LIMITS, PALETTES, PAPER, RULE_LIMITS, SESSION_BANDS, SPORTS, TEXTURE_LIMIT, TEXTURES, applyPalette, settingsForExport, matchingPalette, normalizeSettings } from "./settings";
import type { SessionBand, Settings, Sport, Texture } from "./settings";
import { ARTWORK_NAME, DAILY, YEARS } from "./activity-data";
import { sessionBand } from "./watercolor";
import { drawArtwork, makeLayout, paintRecipes } from "./artwork";
import { DISTRIBUTIONS, sample, seeded } from "./distributions";
import type { Distribution } from "./distributions";
import { formatVolume, legendLayout, parseVolumeValues, volumeValues } from "./legend";
import type { Highlight } from "./artwork";
import { randomPalette } from "./random-palette";
import type { ColorMood } from "./random-palette";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("artwork");
const STORAGE_KEY = "movement-artwork-v1";
const exportMode = new URLSearchParams(location.search).has("export");
let settings = normalizeSettings(DEFAULTS);
if (!exportMode) {
  try { settings = normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")); } catch { /* Defaults also work without storage. */ }
}
let exporting = exportMode;
let inspecting = false;
let selectedSport: Sport | undefined;
let highlight: Highlight = null;
// The first paint happens in render(); a watercolor page is too costly to paint twice.
let layout = makeLayout(settings);
let frame = 0;
// While a slider moves, watercolor repaints at reduced resolution, then refines.
let draftUntil = 0;
let refine = 0;

function render() {
  if (exporting) return;
  const pixelsPerMm = Math.max(1, Math.min(4, canvas.getBoundingClientRect().width * (window.devicePixelRatio || 1) / PAPER.width));
  const draft = settings.paintStyle === "watercolor" && performance.now() < draftUntil;
  layout = drawArtwork(canvas, settings, pixelsPerMm, highlight, 0, draft ? 0.45 : 1);
  clearTimeout(refine);
  if (draft) refine = window.setTimeout(scheduleRender, draftUntil - performance.now() + 20);
  if (settings.paintStyle === "watercolor") {
    const counts = new Map<Texture, number>();
    for (const recipe of paintRecipes(layout.marks, settings)) counts.set(recipe.texture, (counts.get(recipe.texture) || 0) + 1);
    $("texture-share").textContent = `On this print: ${TEXTURES.filter(([t]) => counts.get(t)).map(([t, title]) => `${title.toLowerCase()} ${(100 * counts.get(t)! / layout.marks.length).toFixed(1)}%`).join(" · ")}.`;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.save(); ctx.font = `400 ${settings.legendFontSize}px Arial, sans-serif`;
  const fits = legendLayout(settings, text => ctx.measureText(text).width).every(group => group.placement.fits);
  ctx.restore();
  $("legend-fit-help").textContent = fits ? "" : "The legend needs more margin space. Reduce the grid size, padding, or font size; volume circles retain their true artwork scale.";
}
function scheduleRender() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}
function persist() {
  syncPresetSelection();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage is optional. */ }
  scheduleRender();
}
function message(text: string) { $("status").textContent = text; }

for (const preset of PALETTES) {
  const button = document.createElement("button");
  button.className = "palette-preset";
  button.dataset.palette = preset.id;
  button.setAttribute("aria-label", `${preset.name} palette`);
  button.setAttribute("aria-pressed", "false");
  const swatches = document.createElement("span");
  swatches.className = "preset-swatches";
  swatches.style.backgroundColor = preset.background;
  swatches.setAttribute("aria-hidden", "true");
  for (const sport of SPORTS) {
    const swatch = document.createElement("span");
    swatch.style.backgroundColor = preset.colors[sport];
    swatches.append(swatch);
  }
  const name = document.createElement("span"); name.textContent = preset.name;
  button.append(swatches, name);
  button.addEventListener("click", () => { settings = applyPalette(settings, preset); $("palette-note").textContent = ""; syncControls(); persist(); });
  $("palette-presets").append(button);
}
function syncPresetSelection() {
  const active = matchingPalette(settings)?.id;
  document.querySelectorAll<HTMLButtonElement>(".palette-preset").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.palette === active));
  });
}
for (const [value, label] of BLEND_MODES) {
  $<HTMLSelectElement>("blend").add(new Option(label, value));
}
for (const sport of SPORTS) {
  const row = document.createElement("div");
  row.className = "overlap-row";
  const label = document.createElement("label");
  label.textContent = sport;
  const color = document.createElement("input");
  color.type = "color";
  color.dataset.overlapSport = sport;
  color.setAttribute("aria-label", `${sport} overlap color`);
  label.prepend(color);
  const blend = document.createElement("select");
  blend.dataset.overlapSport = sport;
  blend.setAttribute("aria-label", `${sport} overlap blending`);
  for (const [value, title] of BLEND_MODES) blend.add(new Option(title, value));
  color.addEventListener("input", () => { settings.overlapColors[sport] = color.value; persist(); });
  blend.addEventListener("change", () => { settings.overlapBlends[sport] = blend.value as Settings["blend"]; persist(); });
  row.append(label, blend);
  $("overlap-palette").append(row);
}
$("overlap-enabled").addEventListener("change", e => {
  settings.overlapEnabled = (e.target as HTMLInputElement).checked;
  syncControls(); persist();
});
$("randomize-colors").addEventListener("click", () => {
  const preset = randomPalette($<HTMLSelectElement>("color-mood").value as ColorMood, settings.opacity);
  settings = applyPalette(settings, preset);
  $("palette-note").textContent = preset.name;
  syncControls(); persist();
});

for (const sport of SPORTS) {
  const row = document.createElement("div");
  row.className = "color-row";
  const color = document.createElement("input");
  color.type = "color";
  color.setAttribute("aria-label", `${sport} color`);
  color.dataset.sport = sport;
  const label = document.createElement("button");
  label.textContent = sport;
  label.title = `Highlight ${sport.toLowerCase()}`;
  label.dataset.sport = sport;
  label.setAttribute("aria-pressed", "false");
  const code = document.createElement("code");
  code.dataset.sport = sport;
  color.addEventListener("input", () => { settings.colors[sport] = color.value; code.textContent = color.value; $("palette-note").textContent = ""; persist(); });
  label.addEventListener("click", () => {
    selectedSport = selectedSport === sport ? undefined : sport;
    highlight = selectedSport ? { sport: selectedSport } : null;
    document.querySelectorAll<HTMLButtonElement>(".color-row button").forEach(button => {
      button.classList.toggle("active", button.dataset.sport === selectedSport);
      button.setAttribute("aria-pressed", String(button.dataset.sport === selectedSport));
    });
    scheduleRender();
  });
  row.append(color, label, code);
  $("palette").append(row);
}

const sliderDefinitions = [
  ["blobRadius", "Circle size · radius at 1 hour", 0.1, "mm", "shape"],
  ["baseRadius", "Inner ring radius", 0.1, "mm", "weekday"],
  ["spreadFraction", "Mixed-sport spread", 0.01, "", "weekday"],
  ["stackOverlap", "Stack overlap", 0.01, "", "weekday"],
  ["opacity", "Opacity", 0.05, "", "color"],
  ["gridSize", "Grid width", 5, "mm", "grid"],
  ["gridHeight", "Grid height", 1, "mm", "grid"],
  ["centerSize", "Week point size", 0.01, "mm", "grid"],
  ["legendFontSize", "Legend font size", 0.05, "mm", "legend"],
  ["legendPadding", "Legend padding · Y", 0.5, "mm", "legend"],
  ["springStrength", "Spring strength", 0.01, "", "spring"],
  ["collisionStrength", "Collision pressure", 0.05, "", "spring"],
  ["clusterOverlap", "Allowed overlap", 0.05, "", "spring"],
  ["outerRadius", "Maximum center distance", 0.5, "mm", "spring"],
  ["dominance", "Size dominance", 0.05, "", "spring"],
  ["damping", "Damping", 0.05, "", "spring"],
  ["dataDrive", "Data drive", 0.05, "", "data"],
  ["irregularity", "Irregularity · mean wobble", 0.01, "", "shape-paint"],
  ["shapeVariance", "Variance · coefficient of variation", 0.05, "", "shape-paint"],
  ["elongation", "Elongation · mean stretch", 0.05, "", "shape-paint"],
  ["lobes", "Lobes", 1, "", "shape-paint"],
  ["edgeRoughness", "Edge roughness", 0.05, "mm", "shape-paint"],
  ["orientation", "Orientation", 5, "°", "shape-paint"],
  ["orientationJitter", "Orientation jitter", 0.05, "", "shape-paint"],
  ["funk", "Funk · odd-one-out colors", 0.05, "", "pigment"],
  ["spotRate", "Dark centers · rate per hour", 0.05, "", "pigment"],
  ["spotStrength", "Dark centers · strength", 0.05, "", "pigment"],
  ["lightnessJitter", "Lightness jitter", 0.05, "", "pigment"],
  ["saturationJitter", "Saturation jitter", 0.05, "", "pigment"],
  ["mottling", "Mottling", 0.05, "", "pigment"],
  ["pooling", "Pooling · pigment settles downward", 0.05, "", "pigment"],
  ["wetness", "Wetness · soft and bleeding edges", 0.05, "", "water"],
  ["edgeDarkening", "Edge darkening", 0.05, "", "water"],
  ["granulation", "Granulation", 0.05, "", "water"],
  ["paperGrain", "Paper grain", 0.05, "", "water"],
] as const;
function sliderValue(key: string, value: number, unit: string, step = 1) {
  const decimals = key in PAINT_LIMITS ? Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) : -1;
  const text = key === "spreadFraction" || key === "stackOverlap" ? value.toFixed(2) : decimals >= 0 ? value.toFixed(decimals) : String(value);
  return `${text}${unit === "°" ? unit : unit ? ` ${unit}` : ""}`;
}
for (const [key, title, step, unit, panel] of sliderDefinitions) {
  const label = document.createElement("label");
  label.className = "slider";
  label.id = `${key}-control`;
  const head = document.createElement("span");
  head.className = "slider-heading";
  const text = document.createElement("span");
  text.textContent = title;
  const output = document.createElement("output");
  output.htmlFor = key;
  output.id = `${key}-value`;
  const input = document.createElement("input");
  input.type = "range";
  input.id = key;
  input.min = String(LIMITS[key][0]); input.max = String(LIMITS[key][1]); input.step = String(step);
  input.addEventListener("input", () => {
    settings[key] = Number(input.value);
    output.value = sliderValue(key, settings[key], unit, step);
    draftUntil = performance.now() + 220;
    if (key === "irregularity" || key === "shapeVariance") drawDistribution();
    persist();
  });
  head.append(text, output); label.append(head, input); $(`${panel}-sliders`).append(label);
}
for (const [texture, title] of TEXTURES) {
  const label = document.createElement("label");
  label.className = "slider";
  const head = document.createElement("span");
  head.className = "slider-heading";
  const text = document.createElement("span");
  text.textContent = title;
  const output = document.createElement("output");
  output.id = `texture-${texture}-value`;
  const input = document.createElement("input");
  input.type = "range"; input.id = `texture-${texture}`;
  input.min = String(TEXTURE_LIMIT[0]); input.max = String(TEXTURE_LIMIT[1]); input.step = "0.05";
  input.addEventListener("input", () => {
    settings.textureMix[texture] = Number(input.value);
    output.value = settings.textureMix[texture].toFixed(2);
    draftUntil = performance.now() + 220;
    persist();
  });
  head.append(text, output); label.append(head, input); $("texture-sliders").append(label);
}
// Session table: one row per band with its rule, its days, and its odds as a bar.
// Selecting a row edits its threshold and odds below.
const TEXTURE_COLORS: Record<Texture, string> = {
  wash: "#cbc4b6", stripes: "#7d9db6", dots: "#c48a6c", bloom: "#97b38c", outline: "#d9b968", drybrush: "#a291b5", bleed: "#56677f",
};
const RULE_TEXT: Record<SessionBand, { label: string; step: number; format: (v: number) => string }> = {
  hard: { label: "Effort at least", step: 0.01, format: v => `p${Math.round(v * 100)}` },
  intervals: { label: "Variability at least", step: 0.01, format: v => `p${Math.round(v * 100)}` },
  climbing: { label: "Climbing at least", step: 25, format: v => `${v} m/h` },
  long: { label: "Duration at least", step: 0.5, format: v => `${v} h` },
  easy: { label: "Effort at most", step: 0.01, format: v => `p${Math.round(v * 100)}` },
  steady: { label: "", step: 1, format: () => "every other day" },
};
let selectedBand: SessionBand = "hard";
for (const [texture, title] of TEXTURES) {
  const key = document.createElement("span");
  key.innerHTML = `<span class="texture-dot"></span>`;
  key.querySelector<HTMLElement>(".texture-dot")!.style.background = TEXTURE_COLORS[texture];
  key.append(title.toLowerCase());
  $("texture-key").append(key);
}
for (const [band, title] of SESSION_BANDS) {
  const row = document.createElement("button");
  row.className = "rule-row"; row.dataset.band = band;
  row.innerHTML = `<span class="rule-name"></span><span class="rule-meta"></span><span class="rule-bar" aria-hidden="true"></span>`;
  row.querySelector(".rule-name")!.textContent = title;
  row.addEventListener("click", () => { selectedBand = band; syncRules(); });
  $("texture-rules").append(row);
}
for (const [texture, title] of TEXTURES) {
  const label = document.createElement("label");
  label.className = "slider";
  label.innerHTML = `<span class="slider-heading"><span><span class="texture-dot"></span></span><output></output></span><input type="range" />`;
  label.querySelector<HTMLElement>(".texture-dot")!.style.background = TEXTURE_COLORS[texture];
  label.querySelector(".slider-heading > span")!.append(title);
  const input = label.querySelector("input")!;
  input.id = `rule-odds-${texture}`; input.min = String(ODDS_LIMIT[0]); input.max = String(ODDS_LIMIT[1]); input.step = "5";
  label.querySelector("output")!.id = `rule-odds-${texture}-value`;
  input.addEventListener("input", () => {
    settings.textureRules[selectedBand].odds[texture] = Number(input.value);
    draftUntil = performance.now() + 220;
    syncRules(); persist();
  });
  $("rule-odds").append(label);
}
$("rule-threshold").addEventListener("input", e => {
  settings.textureRules[selectedBand].threshold = Number((e.target as HTMLInputElement).value);
  draftUntil = performance.now() + 220;
  syncRules(); persist();
});
function syncRules() {
  const counts = new Map<SessionBand, number>();
  for (const day of DAILY) { const band = sessionBand(day, settings.textureRules); if (band) counts.set(band, (counts.get(band) || 0) + 1); }
  for (const [band, title] of SESSION_BANDS) {
    const row = document.querySelector<HTMLButtonElement>(`.rule-row[data-band="${band}"]`)!;
    const rule = settings.textureRules[band];
    row.setAttribute("aria-pressed", String(band === selectedBand));
    const total = TEXTURES.reduce((a, [t]) => a + rule.odds[t], 0);
    row.querySelector(".rule-meta")!.textContent = `${RULE_TEXT[band].format(rule.threshold)} · ${counts.get(band) || 0} days`;
    const bar = row.querySelector(".rule-bar")!;
    bar.replaceChildren(...TEXTURES.filter(([t]) => rule.odds[t] > 0).map(([t, name]) => {
      const part = document.createElement("span");
      part.style.background = TEXTURE_COLORS[t]; part.style.width = `${100 * rule.odds[t] / total}%`;
      part.title = `${name} ${Math.round(100 * rule.odds[t] / total)}%`;
      return part;
    }));
    row.title = total ? "" : "No odds set: these days use the Texture mix.";
    if (band === selectedBand) {
      $("rule-title").textContent = `${title} days`;
      const [lo, hi] = RULE_LIMITS[band];
      const threshold = $<HTMLInputElement>("rule-threshold");
      $("rule-threshold-control").hidden = band === "steady";
      threshold.min = String(lo); threshold.max = String(hi); threshold.step = String(RULE_TEXT[band].step);
      threshold.value = String(rule.threshold);
      $("rule-threshold-label").textContent = RULE_TEXT[band].label;
      $<HTMLOutputElement>("rule-threshold-value").value = RULE_TEXT[band].format(rule.threshold);
      for (const [t] of TEXTURES) {
        $<HTMLInputElement>(`rule-odds-${t}`).value = String(rule.odds[t]);
        $<HTMLOutputElement>(`rule-odds-${t}-value`).value = total ? `${Math.round(100 * rule.odds[t] / total)}%` : "–";
      }
    }
  }
}

for (const [value, label] of DISTRIBUTIONS) $<HTMLSelectElement>("shapeDistribution").add(new Option(label, value));
for (const [value, label] of BLEND_MODES) $<HTMLSelectElement>("paintBlend").add(new Option(value === "multiply" ? "Glaze · multiply" : label, value));
$("shapeDistribution").addEventListener("change", e => {
  settings.shapeDistribution = (e.target as HTMLSelectElement).value as Distribution;
  drawDistribution(); persist();
});
$("paintBlend").addEventListener("change", e => { settings.paintBlend = (e.target as HTMLSelectElement).value as Settings["paintBlend"]; persist(); });
$("repaint").addEventListener("click", () => { settings.paintSeed = settings.paintSeed % 1_000_000 + 1; persist(); });

// The same sampler the blobs use, drawn as a histogram of per-blob irregularity.
const DISTRIBUTION_NOTES: Record<Distribution, string> = {
  normal: "Symmetric around the mean, truncated at zero.",
  uniform: "Every wobble in the range is equally likely.",
  lognormal: "Mostly modest, with a long tail of strongly deformed blobs.",
  gamma: "Right-skewed; at high variance most blobs are near round.",
  weibull: "Flexible skew, matched to the same mean and variance.",
  poisson: "Discrete steps: blobs fall into a few families of wobble.",
  exponential: "A floor of mean − σ, then an exponential tail.",
};
function drawDistribution() {
  const preview = $<HTMLCanvasElement>("distribution-preview");
  const ratio = window.devicePixelRatio || 1;
  const width = preview.clientWidth || 242, height = preview.clientHeight || 46;
  preview.width = Math.round(width * ratio); preview.height = Math.round(height * ratio);
  const ctx = preview.getContext("2d")!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const random = seeded(7);
  const mean = settings.irregularity, cv = settings.shapeVariance;
  const values = Array.from({ length: 4000 }, () => sample(settings.shapeDistribution, mean, cv, random));
  const top = Math.max(0.05, mean * 3.2, [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.99)]!);
  const bins = new Array(48).fill(0);
  for (const value of values) bins[Math.min(bins.length - 1, Math.floor(value / top * bins.length))]++;
  const peak = Math.max(...bins);
  const barWidth = width / bins.length;
  ctx.fillStyle = "#9db0a3";
  bins.forEach((count, i) => { const h = count / peak * (height - 8); ctx.fillRect(i * barWidth + 0.5, height - h, barWidth - 1, h); });
  ctx.fillStyle = "#4f6256";
  ctx.fillRect(Math.min(width - 1, mean / top * width), 0, 1, height);
  $("distribution-help").textContent = `${DISTRIBUTION_NOTES[settings.shapeDistribution]} Mean ${mean.toFixed(2)} of the radius, σ ${(mean * cv).toFixed(3)}. Elongation uses the same family.`;
}

function setupTabs(tabs: HTMLButtonElement[], activate: (tab: HTMLButtonElement) => void) {
  for (const tab of tabs) {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", e => {
      const index = tabs.indexOf(tab);
      const next = e.key === "ArrowRight" ? (index + 1) % tabs.length : e.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
      if (next < 0) return;
      e.preventDefault(); tabs[next]!.focus(); activate(tabs[next]!);
    });
  }
}
const controlTabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".control-tabs [role=tab]"));
setupTabs(controlTabs, active => {
  for (const tab of controlTabs) {
    const selected = tab === active;
    tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute("aria-controls")!).hidden = !selected;
  }
});
const variantTabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".variant-tabs [role=tab]"));
setupTabs(variantTabs, active => {
  settings.variant = active.id === "variant-spring" ? "spring" : "weekday";
  syncControls(); persist();
});
const paintTabs = Array.from(document.querySelectorAll<HTMLButtonElement>("#panel-paint .variant-tabs [role=tab]"));
setupTabs(paintTabs, active => {
  settings.paintStyle = active.id === "paint-watercolor" ? "watercolor" : "flat";
  syncControls(); persist();
});
$("reshuffle").addEventListener("click", () => {
  settings.clusterSeed = settings.clusterSeed % 1_000_000 + 1;
  persist();
});

function syncLegendControls() {
  const side = settings.legendEdge === "left" || settings.legendEdge === "right";
  $("legendPadding-control").querySelector(".slider-heading > span")!.textContent = `Legend padding · ${side ? "X" : "Y"}`;
  const vertical = settings.legendOrientation === "vertical";
  const align = $<HTMLSelectElement>("legendAlign");
  align.options[0]!.text = vertical ? "Top" : "Left";
  align.options[2]!.text = vertical ? "Bottom" : "Right";
  for (const key of Object.keys(LEGEND_OPTIONS) as (keyof typeof LEGEND_OPTIONS)[]) {
    $<HTMLSelectElement>(key).value = settings[key];
  }
  $("legend-facing-control").hidden = settings.legendOrientation !== "vertical";
  $<HTMLInputElement>("volume-legend-enabled").checked = settings.volumeLegendEnabled;
  $("volume-legend-controls").hidden = !settings.volumeLegendEnabled;
  $<HTMLSelectElement>("volumeLegendPosition").options[2]!.disabled = settings.legendAlign === "center";
  $("volume-values-control").hidden = settings.volumeLegendScale !== "manual";
  $<HTMLInputElement>("volume-legend-values").value = settings.volumeLegendValues.join(", ");
  $("volume-legend-values").removeAttribute("aria-invalid");
  $("volume-values-help").textContent = settings.volumeLegendScale === "auto"
    ? `Automatic: ${volumeValues(settings).map(formatVolume).join(" · ")}. Circle areas match the artwork’s hours scale.`
    : "Enter up to six positive hour values (maximum 100 each), separated by commas. Circle areas match the artwork.";
}
$("volume-legend-enabled").addEventListener("change", e => {
  settings.volumeLegendEnabled = (e.target as HTMLInputElement).checked;
  syncLegendControls(); persist();
});
$("volume-legend-values").addEventListener("change", e => {
  const input = e.target as HTMLInputElement;
  const values = parseVolumeValues(input.value);
  if (!values) {
    input.setAttribute("aria-invalid", "true");
    $("volume-values-help").textContent = "Use one to six positive numbers up to 100, separated by commas. The previous scale remains active.";
    return;
  }
  settings.volumeLegendValues = values;
  syncLegendControls(); persist();
});
for (const key of Object.keys(LEGEND_OPTIONS) as (keyof typeof LEGEND_OPTIONS)[]) {
  $(key).addEventListener("change", event => {
    settings = normalizeSettings({ ...settings, [key]: (event.target as HTMLSelectElement).value });
    syncLegendControls(); persist();
  });
}

function syncControls() {
  $<HTMLInputElement>("print-bleed").checked = settings.printBleed;
  $("print-size").textContent = settings.printBleed ? "600 × 847 mm with bleed · trims to A1 (594 × 841 mm)." : "A1 · 594 × 841 mm, no bleed.";
  configurePrint();
  syncLegendControls();
  for (const tab of variantTabs) {
    const selected = tab.id === `variant-${settings.variant}`;
    tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute("aria-controls")!).hidden = !selected;
  }
  const watercolor = settings.paintStyle === "watercolor";
  for (const tab of paintTabs) {
    const selected = tab.id === `paint-${settings.paintStyle}`;
    tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute("aria-controls")!).hidden = !selected;
  }
  $("blend-control").hidden = watercolor;
  $("overlap-section").hidden = watercolor;
  $("watercolor-color-help").hidden = !watercolor;
  $("opacity-control").querySelector(".slider-heading > span")!.textContent = watercolor ? "Pigment load" : "Opacity";
  $<HTMLSelectElement>("shapeDistribution").value = settings.shapeDistribution;
  $<HTMLSelectElement>("paintBlend").value = settings.paintBlend;
  for (const [texture] of TEXTURES) {
    $<HTMLInputElement>(`texture-${texture}`).value = String(settings.textureMix[texture]);
    $<HTMLOutputElement>(`texture-${texture}-value`).value = settings.textureMix[texture].toFixed(2);
  }
  if (watercolor) { drawDistribution(); syncRules(); }
  $("layout-help").textContent = settings.variant === "spring"
    ? "Bubbles gather around their week’s center and make room for neighboring clusters. Their angles are free to change."
    : "A fixed angle for each weekday, Monday through Sunday.";
  canvas.setAttribute("aria-label", `Sporting activity from 2016 through 2025. Ten columns of years, fifty-three rows of weeks; ${settings.variant === "spring" ? "spring clusters" : "weekday circles"} show daily hours of rowing, weight training, cycling, and running.`);
  syncPresetSelection();
  for (const sport of SPORTS) {
    document.querySelector<HTMLInputElement>(`input[data-sport="${sport}"]`)!.value = settings.colors[sport];
    document.querySelector<HTMLElement>(`code[data-sport="${sport}"]`)!.textContent = settings.colors[sport];
    document.querySelector<HTMLInputElement>(`input[data-overlap-sport="${sport}"]`)!.value = settings.overlapColors[sport];
    document.querySelector<HTMLSelectElement>(`select[data-overlap-sport="${sport}"]`)!.value = settings.overlapBlends[sport];
  }
  $<HTMLInputElement>("overlap-enabled").checked = settings.overlapEnabled;
  $("overlap-palette").hidden = !settings.overlapEnabled;
  for (const key of ["background", "centers", "ink"] as const) $<HTMLInputElement>(key).value = settings[key];
  for (const [key, , step, unit] of sliderDefinitions) {
    $<HTMLInputElement>(key).value = String(settings[key]);
    $<HTMLOutputElement>(`${key}-value`).value = sliderValue(key, settings[key], unit, step);
  }
  $<HTMLInputElement>("anchor-circles").checked = settings.anchorCircles;
  $<HTMLInputElement>("stack-mixed").checked = settings.stackMixed;
  $<HTMLInputElement>("empty-week-points-only").checked = settings.emptyWeekPointsOnly;
  $("spreadFraction-control").hidden = settings.stackMixed;
  $("stackOverlap-control").hidden = !settings.stackMixed;
  $("mixed-help").textContent = settings.stackMixed
    ? "Largest first, outward along the day. Overlap is a fraction of each smaller circle’s diameter."
    : "Spread is a fraction of the day’s sector. 0.80 places the ends at −40% and +40%.";
  $<HTMLSelectElement>("blend").value = settings.blend;
}
for (const key of ["background", "centers", "ink"] as const) {
  $<HTMLInputElement>(key).addEventListener("input", e => { settings[key] = (e.target as HTMLInputElement).value; $("palette-note").textContent = ""; persist(); });
}
$("print-bleed").addEventListener("change", e => { settings.printBleed = (e.target as HTMLInputElement).checked; syncControls(); persist(); });
$("anchor-circles").addEventListener("change", e => { settings.anchorCircles = (e.target as HTMLInputElement).checked; persist(); });
$("empty-week-points-only").addEventListener("change", e => { settings.emptyWeekPointsOnly = (e.target as HTMLInputElement).checked; persist(); });
$("stack-mixed").addEventListener("change", e => { settings.stackMixed = (e.target as HTMLInputElement).checked; syncControls(); persist(); });
$("blend").addEventListener("change", e => { settings.blend = (e.target as HTMLSelectElement).value as Settings["blend"]; persist(); });
$("reset-palette").addEventListener("click", () => {
  $("palette-note").textContent = "";
  settings.colors = { ...DEFAULTS.colors };
  for (const key of ["background", "centers", "ink"] as const) settings[key] = DEFAULTS[key];
  syncControls(); persist();
});
$("reset-all").addEventListener("click", () => {
  $("palette-note").textContent = "";
  settings = normalizeSettings(DEFAULTS); selectedSport = undefined; highlight = null;
  document.querySelectorAll(".color-row button").forEach(button => { button.classList.remove("active"); button.setAttribute("aria-pressed", "false"); });
  syncControls(); persist(); message("");
});

function preview(enabled: boolean) {
  document.body.classList.toggle("preview", enabled);
  $("edit").hidden = !enabled;
  highlight = enabled ? null : selectedSport ? { sport: selectedSport } : null;
  scheduleRender();
  if (enabled) $("edit").focus(); else $("preview").focus();
}
$("preview").addEventListener("click", () => preview(true));
$("edit").addEventListener("click", () => preview(false));
document.addEventListener("keydown", e => { if (e.key === "Escape") preview(false); });
$("inspect").addEventListener("change", e => {
  inspecting = (e.target as HTMLInputElement).checked;
  highlight = selectedSport ? { sport: selectedSport } : null;
  $("inspection").textContent = inspecting ? "Move over a week in the artwork." : "Turn on to explore the marks.";
  canvas.style.cursor = inspecting ? "crosshair" : "default";
  scheduleRender();
});
canvas.addEventListener("pointermove", e => {
  if (!inspecting || document.body.classList.contains("preview") || exporting) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * PAPER.width;
  const y = (e.clientY - rect.top) / rect.height * PAPER.height;
  const week = layout.weeks.reduce((best, w) => Math.hypot(x - w.x, y - w.y) < Math.hypot(x - best.x, y - best.y) ? w : best);
  if (Math.abs(x - week.x) > settings.gridSize / (2 * (YEARS.length - 1)) || Math.abs(y - week.y) > 12) { clearInspection(); return; }
  highlight = { sport: selectedSport, week };
  const jan1 = new Date(Date.UTC(week.year, 0, 1));
  const startDay = Math.max(1, 1 - (jan1.getUTCDay() + 6) % 7 + week.row * 7);
  const start = new Date(Date.UTC(week.year, 0, startDay));
  const end = new Date(Math.min(Date.UTC(week.year, 0, 7 - (jan1.getUTCDay() + 6) % 7 + week.row * 7), Date.UTC(week.year, 11, 31)));
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const recipes = settings.paintStyle === "watercolor" ? paintRecipes(layout.marks, settings) : [];
  const lines = SPORTS.map(sport => {
    const days = week.days.filter(d => d.sport === sport);
    const hours = days.reduce((a, d) => a + d.hours, 0);
    if (!hours) return "";
    const weighted = (key: "effort" | "if" | "hr") => {
      const known = days.filter(d => d[key] != null);
      const total = known.reduce((a, d) => a + d.hours, 0);
      return total ? known.reduce((a, d) => a + d[key]! * d.hours, 0) / total : null;
    };
    const effort = weighted("effort"), intensity = weighted("if"), hr = weighted("hr");
    const textures = recipes.flatMap((recipe, i) => {
      const m = layout.marks[i]!;
      if (m.sport !== sport || m.year !== week.year || m.row !== week.row) return [];
      const band = sessionBand(m, settings.textureRules);
      return [band ? `${band} → ${recipe.texture}` : recipe.texture];
    });
    return [`${sport} ${hours.toFixed(2)} h`, effort == null ? "" : `effort ${Math.round(effort * 100)}%`,
      intensity == null ? "" : `IF ${intensity.toFixed(2)}`, intensity == null && hr != null ? `${Math.round(hr)} bpm` : "",
      textures.length ? [...new Set(textures)].join(", ") : ""].filter(Boolean).join(" · ");
  }).filter(Boolean);
  $("inspection").textContent = `${fmt.format(start)} – ${fmt.format(end)} ${week.year}\n${lines.join("\n") || "No recorded activity"}`;
  scheduleRender();
});
function clearInspection() {
  highlight = selectedSport ? { sport: selectedSport } : null;
  $("inspection").textContent = inspecting ? "Move over a week in the artwork." : "Turn on to explore the marks.";
  scheduleRender();
}
canvas.addEventListener("pointerleave", clearInspection);

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
$("save-settings").addEventListener("click", () => {
  const file = settingsForExport(settings);
  download(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }), `movement-${file.mode}-settings.json`);
  message(`${file.mode === "spring" ? "Spring cluster" : "Seven day"} settings exported, including both layouts’ controls and the saved arrangement seed.`);
});
$("load-settings").addEventListener("click", () => $("settings-file").click());
$("settings-file").addEventListener("change", async e => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0]; if (!file) return;
  try {
    if (file.size > 20_000) throw new Error("That file is too large for artwork settings.");
    const value = JSON.parse(await file.text());
    if (!value || typeof value !== "object" || !value.colors) throw new Error("Choose an exported artwork settings file.");
    settings = normalizeSettings(value); $("palette-note").textContent = ""; syncControls(); persist(); message(`${settings.variant === "spring" ? "Spring cluster" : "Seven day"} settings imported.`);
  } catch (error) { message(error instanceof Error ? error.message : "Could not read settings."); }
  input.value = "";
});

async function busy(id: string, work: () => Promise<void>) {
  const button = $<HTMLButtonElement>(id);
  button.disabled = true;
  try { await work(); } catch (error) { message(error instanceof Error ? error.message : "Export failed."); }
  finally { button.disabled = false; }
}
$("export-pdf").addEventListener("click", () => busy("export-pdf", async () => {
  message("Preparing A1 at 300 dpi…");
  const response = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
  if (!response.ok) {
    if (response.status === 404 || response.status === 405) throw new Error("For PDF export, start the Bun server. Browser Print also supports the A1 print layout.");
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error || "Could not export PDF. Check that Chrome is installed.");
  }
  download(await response.blob(), `${ARTWORK_NAME}.pdf`);
  message(settings.printBleed ? "A1 PDF saved · 3 mm bleed · A1 trim boundary · 300 dpi." : "A1 PDF saved · no bleed · 300 dpi.");
}));
$("export-png").addEventListener("click", () => busy("export-png", async () => {
  message("Preparing full-size PNG…");
  await new Promise(resolve => setTimeout(resolve, 30));
  const output = document.createElement("canvas");
  drawArtwork(output, settings, 300 / 25.4, null, printDimensions(settings).bleed);
  const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser could not allocate the full-size image.");
  download(blob, `${ARTWORK_NAME}-300dpi.png`);
  output.width = output.height = 1;
  const size = printDimensions(settings);
  message(`PNG saved · ${Math.round(size.width * 300 / 25.4)} × ${Math.round(size.height * 300 / 25.4)} pixels${settings.printBleed ? " · 3 mm bleed" : ""}.`);
}));

function configurePrint() {
  const size = printDimensions(settings);
  let style = document.getElementById("print-page-size");
  if (!style) { style = document.createElement("style"); style.id = "print-page-size"; document.head.append(style); }
  style.textContent = `@page { size: ${size.width}mm ${size.height}mm; margin: 0; }`;
  document.documentElement.style.setProperty("--print-width", `${size.width}mm`);
  document.documentElement.style.setProperty("--print-height", `${size.height}mm`);
}
window.addEventListener("beforeprint", () => { exporting = true; configurePrint(); drawArtwork(canvas, settings, 300 / 25.4, null, printDimensions(settings).bleed); });
window.addEventListener("afterprint", () => { exporting = exportMode; scheduleRender(); });
new ResizeObserver(scheduleRender).observe(canvas.parentElement!);
syncControls();
if (exportMode) document.body.classList.add("exporting");
else render();

// Shared by the Chromium export and browser verification. Every export ignores UI highlights.
const artworkApi = {
  ready: true,
  getSettings: () => structuredClone(settings),
  renderForExport: async (input: unknown, dpi = 300) => {
    exporting = true;
    document.body.classList.add("exporting");
    settings = normalizeSettings(input);
    configurePrint();
    await document.fonts.ready;
    layout = drawArtwork(canvas, settings, Math.max(72, Math.min(300, dpi)) / 25.4, null, printDimensions(settings).bleed);
    return { width: canvas.width, height: canvas.height, marks: layout.marks.length };
  },
};
declare global { interface Window { artwork: typeof artworkApi } }
window.artwork = artworkApi;
