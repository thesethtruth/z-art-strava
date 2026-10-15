import { ARTWORK_NAME, BLEND_MODES, DEFAULTS, LIMITS, PALETTES, PAPER, SPORTS, YEARS, applyPalette, drawArtwork, matchingPalette, normalizeSettings } from "./artwork";
import type { Highlight, Settings, Sport } from "./artwork";
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
  ["blobRadius", "Circle size · radius at 1 hour", 0.1, "mm"],
  ["baseRadius", "Base radius", 0.1, "mm"],
  ["spreadFraction", "Mixed-sport spread", 0.01, ""],
  ["stackOverlap", "Stack overlap", 0.01, ""],
  ["opacity", "Opacity", 0.05, ""],
  ["gridSize", "Grid width", 5, "mm"],
  ["gridHeight", "Grid height", 1, "mm"],
  ["centerSize", "Week point size", 0.01, "mm"],
] as const;
function sliderValue(key: string, value: number, unit: string) {
  return `${key === "spreadFraction" || key === "stackOverlap" ? value.toFixed(2) : value}${unit ? ` ${unit}` : ""}`;
}
for (const [key, title, step, unit] of sliderDefinitions) {
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
  head.append(text, output); label.append(head, input); $("sliders").append(label);
}

function syncControls() {
  syncPresetSelection();
  for (const sport of SPORTS) {
    document.querySelector<HTMLInputElement>(`input[data-sport="${sport}"]`)!.value = settings.colors[sport];
    document.querySelector<HTMLElement>(`code[data-sport="${sport}"]`)!.textContent = settings.colors[sport];
  }
  for (const key of ["background", "centers", "ink"] as const) $<HTMLInputElement>(key).value = settings[key];
  for (const [key, , , unit] of sliderDefinitions) {
    $<HTMLInputElement>(key).value = String(settings[key]);
    $<HTMLOutputElement>(`${key}-value`).value = sliderValue(key, settings[key], unit);
  }
  $<HTMLInputElement>("anchor-circles").checked = settings.anchorCircles;
  $<HTMLInputElement>("stack-mixed").checked = settings.stackMixed;
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
$("save-settings").addEventListener("click", () => download(new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" }), "movement-settings.json"));
$("load-settings").addEventListener("click", () => $("settings-file").click());
$("settings-file").addEventListener("change", async e => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0]; if (!file) return;
  try {
    if (file.size > 20_000) throw new Error("That file is too large for artwork settings.");
    const value = JSON.parse(await file.text());
    if (!value || typeof value !== "object" || !value.colors) throw new Error("Choose an exported artwork settings file.");
    settings = normalizeSettings(value); $("palette-note").textContent = ""; syncControls(); persist(); message("Settings loaded.");
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
    drawArtwork(canvas, settings, Math.max(72, Math.min(300, dpi)) / 25.4);
    return { width: canvas.width, height: canvas.height, marks: layout.marks.length };
  },
};
declare global { interface Window { artwork: typeof artworkApi } }
window.artwork = artworkApi;
