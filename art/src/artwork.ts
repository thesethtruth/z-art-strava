import { group, range, scaleLinear } from "d3";
import { LIMITS, PAINT_LIMITS, PAPER, SPORTS } from "./settings";
import type { Settings, Sport } from "./settings";
import { calendarPosition, DAILY, ROWS, YEARS } from "./activity-data";
import type { Mark, Week } from "./activity-data";
import { placeDay } from "./weekday-layout";
import { placeClusters } from "./spring-layout";
import { drawLegend } from "./legend";
import { gridBounds } from "./grid";
import { drawOverlaps } from "./overlap";
import { blobRecipe, rasterizeBlob, swatchRecipe } from "./watercolor";
import type { BlobRecipe, Sprite } from "./watercolor";
import { GRAIN_TILE_MM, grainSampler } from "./noise";

let cachedLayout: { key: string; layout: { weeks: Week[]; marks: Mark[] } } | undefined;
export function makeLayout(settings: Settings) {
  const key = JSON.stringify([settings.variant, ...Object.keys(LIMITS).filter(key => key !== "opacity" && key !== "centerSize" && !key.startsWith("legend") && !(key in PAINT_LIMITS)).map(key => settings[key as keyof Settings]), settings.anchorCircles, settings.stackMixed]);
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

// Everything that changes a watercolor blob's recipe; layout geometry is keyed separately.
export function paintKey(settings: Settings) {
  return JSON.stringify([Object.keys(PAINT_LIMITS).map(key => settings[key as keyof Settings]), settings.shapeDistribution, settings.textureMix, settings.textureRules, settings.colors]);
}
let recipeCache: { marks: Mark[]; key: string; recipes: BlobRecipe[] } | undefined;
export function paintRecipes(marks: Mark[], settings: Settings) {
  const key = paintKey(settings);
  if (recipeCache?.marks !== marks || recipeCache.key !== key) recipeCache = { marks, key, recipes: marks.map(mark => blobRecipe(mark, settings)) };
  return recipeCache.recipes;
}

let scratch: HTMLCanvasElement | undefined;
function stamp(target: CanvasRenderingContext2D, sprite: Sprite, x = sprite.left, y = sprite.top, width = sprite.width, height = sprite.height) {
  scratch ??= document.createElement("canvas");
  if (scratch.width < sprite.width || scratch.height < sprite.height) {
    scratch.width = Math.max(scratch.width, sprite.width); scratch.height = Math.max(scratch.height, sprite.height);
  }
  scratch.getContext("2d")!.putImageData(new ImageData(sprite.data as Uint8ClampedArray<ArrayBuffer>, sprite.width, sprite.height), 0, 0);
  target.drawImage(scratch, 0, 0, sprite.width, sprite.height, x, y, width, height);
}

// Glazes are painted once per resolution and settings, then reused while the
// studio hovers, highlights, or edits the legend. Sprites stay cached on screen so
// a highlighted sport or week can be repainted at full strength over a dimmed layer.
type PaintLayer = { key: string; layer: HTMLCanvasElement; sprites: (Sprite | null)[] | null };
const paintLayers = new WeakMap<HTMLCanvasElement, PaintLayer>();
const layoutIds = new WeakMap<Mark[], number>();
let nextLayoutId = 1;
function drawWatercolor(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, marks: Mark[], settings: Settings, bleed: number, focused: (mark: Mark) => boolean, highlighted: boolean, scale: number) {
  const width = Math.max(1, Math.round(canvas.width * scale)), height = Math.max(1, Math.round(canvas.height * scale));
  const sx = width / (PAPER.width + 2 * bleed), sy = height / (PAPER.height + 2 * bleed);
  if (!layoutIds.has(marks)) layoutIds.set(marks, nextLayoutId++);
  const key = JSON.stringify([paintKey(settings), settings.opacity, settings.paintBlend, width, height, bleed, layoutIds.get(marks)]);
  let cached = paintLayers.get(canvas);
  if (cached?.key !== key) {
    const layer = cached?.layer ?? document.createElement("canvas");
    if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
    const paint = layer.getContext("2d")!;
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.clearRect(0, 0, width, height);
    paint.globalCompositeOperation = settings.paintBlend;
    const keep = width * height < 16_000_000;
    const recipes = paintRecipes(marks, settings);
    const sprites = recipes.map(recipe => {
      const sprite = rasterizeBlob(recipe, sx, sy, bleed * sx, bleed * sy, width, height, settings.opacity / 0.7);
      if (sprite) stamp(paint, sprite);
      return keep ? sprite : null;
    });
    cached = { key, layer, sprites: keep ? sprites : null };
    paintLayers.set(canvas, cached);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Multiply the finished glaze stack onto the paper: paper × Π transmittance.
  ctx.globalCompositeOperation = settings.paintBlend === "multiply" ? "multiply" : "source-over";
  ctx.globalAlpha = highlighted ? 0.12 : 1;
  ctx.drawImage(cached.layer, 0, 0, canvas.width, canvas.height);
  if (highlighted && cached.sprites) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = settings.paintBlend;
    const k = canvas.width / width;
    marks.forEach((mark, i) => {
      const sprite = cached.sprites![i];
      if (sprite && focused(mark)) stamp(ctx, sprite, sprite.left * k, sprite.top * k, sprite.width * k, sprite.height * k);
    });
  }
  ctx.restore();
  // A print-size layer is hundreds of megabytes; exports never reuse it.
  if (!cached.sprites) { cached.layer.width = cached.layer.height = 1; paintLayers.delete(canvas); }
}

// Optional printed tooth: the same grain field the pigment settles into, as a faint multiply.
const grainTiles = new Map<string, HTMLCanvasElement>();
function drawPaperGrain(ctx: CanvasRenderingContext2D, settings: Settings, pixelsPerMm: number, bleed: number) {
  if (settings.paperGrain <= 0) return;
  const size = Math.max(16, Math.round(GRAIN_TILE_MM * pixelsPerMm));
  const key = `${size}|${settings.paperGrain}`;
  let tile = grainTiles.get(key);
  if (!tile) {
    grainTiles.clear();
    tile = document.createElement("canvas");
    tile.width = tile.height = size;
    const image = new ImageData(size, size);
    const grain = grainSampler(GRAIN_TILE_MM / size, true);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const value = 255 * (1 - settings.paperGrain * 0.07 * Math.max(0, Math.min(1, 0.5 + 0.6 * grain((i + 0.5) / size * GRAIN_TILE_MM, (j + 0.5) / size * GRAIN_TILE_MM))));
      const o = (j * size + i) * 4;
      image.data[o] = image.data[o + 1] = image.data[o + 2] = value; image.data[o + 3] = 255;
    }
    tile.getContext("2d")!.putImageData(image, 0, 0);
    grainTiles.set(key, tile);
  }
  const pattern = ctx.createPattern(tile, "repeat")!;
  pattern.setTransform(new DOMMatrix().scale(GRAIN_TILE_MM / size));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = pattern;
  ctx.fillRect(-bleed, -bleed, PAPER.width + 2 * bleed, PAPER.height + 2 * bleed);
  ctx.restore();
}

// Legend swatches share the blobs' pigment model, rendered at the legend's own scale.
function paintSwatch(ctx: CanvasRenderingContext2D, settings: Settings, sport: Sport, x: number, y: number, radius: number, alpha: number) {
  const m = ctx.getTransform();
  const scale = Math.max(1, Math.hypot(m.a, m.b));
  const recipe = swatchRecipe(sport, 0, 0, radius, settings);
  const size = Math.ceil(recipe.extent * 2 * scale);
  const sprite = rasterizeBlob(recipe, scale, scale, size / 2, size / 2, size, size, settings.opacity / 0.7);
  if (!sprite) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = settings.paintBlend === "multiply" ? "multiply" : "source-over";
  const unit = 1 / scale;
  stamp(ctx, sprite, x - size / 2 * unit + sprite.left * unit, y - size / 2 * unit + sprite.top * unit, sprite.width * unit, sprite.height * unit);
  ctx.restore();
}

// paintScale < 1 paints watercolor at reduced resolution (interactive drafts only).
export function drawArtwork(canvas: HTMLCanvasElement, settings: Settings, pixelsPerMm: number, highlight: Highlight = null, bleed = 0, paintScale = 1) {
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

  const focused = (mark: Mark) => (!highlight?.sport || mark.sport === highlight.sport)
    && (!highlight?.week || (mark.year === highlight.week.year && mark.row === highlight.week.row));
  if (settings.paintStyle === "watercolor") {
    const previous = activityLayers.get(canvas);
    if (previous) { previous.width = previous.height = 1; activityLayers.delete(canvas); }
    drawPaperGrain(ctx, settings, sx, bleed);
    drawWatercolor(ctx, canvas, layout.marks, settings, bleed, focused, Boolean(highlight?.sport || highlight?.week), paintScale);
    drawLegend(ctx, settings, highlight?.sport, (sport, x, y, radius, alpha) => paintSwatch(ctx, settings, sport, x, y, radius, alpha));
    ctx.globalAlpha = 1;
    return layout;
  }
  const watercolor = paintLayers.get(canvas);
  if (watercolor) { watercolor.layer.width = watercolor.layer.height = 1; paintLayers.delete(canvas); }

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
