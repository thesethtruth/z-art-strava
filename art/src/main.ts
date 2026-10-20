import { BLEND_MODES, DEFAULTS, LEGEND_OPTIONS, LIMITS, PALETTES, PAPER, SPORTS, applyPalette, settingsForExport, matchingPalette, normalizeSettings } from "./settings";
import type { Settings, Sport } from "./settings";
import { ARTWORK_NAME, YEARS } from "./activity-data";
import { drawArtwork } from "./artwork";
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
let layout = drawArtwork(canvas, settings, 2);
let frame = 0;

function render() {
  if (exporting) return;
  const pixelsPerMm = Math.max(1, Math.min(4, canvas.getBoundingClientRect().width * (window.devicePixelRatio || 1) / PAPER.width));
  layout = drawArtwork(canvas, settings, pixelsPerMm, highlight);
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
] as const;
function sliderValue(key: string, value: number, unit: string) {
  return `${key === "spreadFraction" || key === "stackOverlap" ? value.toFixed(2) : value}${unit ? ` ${unit}` : ""}`;
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
    output.value = sliderValue(key, settings[key], unit);
    persist();
  });
  head.append(text, output); label.append(head, input); $(`${panel}-sliders`).append(label);
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
  syncLegendControls();
  for (const tab of variantTabs) {
    const selected = tab.id === `variant-${settings.variant}`;
    tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute("aria-controls")!).hidden = !selected;
  }
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
  for (const [key, , , unit] of sliderDefinitions) {
    $<HTMLInputElement>(key).value = String(settings[key]);
    $<HTMLOutputElement>(`${key}-value`).value = sliderValue(key, settings[key], unit);
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
  const totals = SPORTS.map(sport => [sport, week.days.filter(d => d.sport === sport).reduce((a, d) => a + d.hours, 0)] as const).filter(([, hours]) => hours > 0);
  $("inspection").textContent = `${fmt.format(start)} – ${fmt.format(end)} ${week.year}\n${totals.map(([sport, hours]) => `${sport} ${hours.toFixed(2)} h`).join(" · ") || "No recorded activity"}`;
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
  message("A1 PDF saved · 300 dpi.");
}));
$("export-png").addEventListener("click", () => busy("export-png", async () => {
  message("Preparing full-size PNG…");
  await new Promise(resolve => setTimeout(resolve, 30));
  const output = document.createElement("canvas");
  drawArtwork(output, settings, 300 / 25.4);
  const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser could not allocate the full-size image.");
  download(blob, `${ARTWORK_NAME}-300dpi.png`);
  output.width = output.height = 1;
  message("PNG saved · 7016 × 9933 pixels.");
}));

window.addEventListener("beforeprint", () => { exporting = true; drawArtwork(canvas, settings, 300 / 25.4); });
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
    await document.fonts.ready;
    layout = drawArtwork(canvas, settings, Math.max(72, Math.min(300, dpi)) / 25.4);
    return { width: canvas.width, height: canvas.height, marks: layout.marks.length };
  },
};
declare global { interface Window { artwork: typeof artworkApi } }
window.artwork = artworkApi;
