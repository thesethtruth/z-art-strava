import { PAPER, SPORTS } from "./settings";
import type { Settings, Sport } from "./settings";
import { DAILY } from "./activity-data";
import { gridBounds } from "./grid";

type PlacementSettings = Pick<Settings, "legendEdge" | "legendAlign" | "legendOrientation" | "legendFacing" | "legendMarginAlign" | "legendPadding" | "gridSize" | "gridHeight">;
function paddingAxes(settings: PlacementSettings) {
  const side = settings.legendEdge === "left" || settings.legendEdge === "right";
  return { x: side ? settings.legendPadding : 0, y: side ? 0 : settings.legendPadding };
}
export function legendMargin(settings: PlacementSettings) {
  const grid = gridBounds(settings);
  const padding = paddingAxes(settings);
  const left = settings.legendEdge === "left" ? 0 : settings.legendEdge === "right" ? grid.right : grid.left;
  const right = settings.legendEdge === "left" ? grid.left : settings.legendEdge === "right" ? PAPER.width : grid.right;
  const top = settings.legendEdge === "top" ? 0 : settings.legendEdge === "bottom" ? grid.bottom : grid.top;
  const bottom = settings.legendEdge === "top" ? grid.top : settings.legendEdge === "bottom" ? PAPER.height : grid.bottom;
  return { left: left + padding.x, top: top + padding.y, width: Math.max(0, right - left - 2 * padding.x), height: Math.max(0, bottom - top - 2 * padding.y) };
}

// Align the complete legend container in its orientation. Its local vertical axis
// rotates with the text: facing right reverses Top/Bottom on the page's x axis.
export function legendPlacement(length: number, settings: PlacementSettings, thickness = 3.6) {
  const margin = legendMargin(settings);
  const vertical = settings.legendOrientation === "vertical";
  const width = vertical ? thickness : length;
  const height = vertical ? length : thickness;
  const align = (start: number, available: number, size: number, alignment: Settings["legendAlign"]) => start + (alignment === "start" ? 0 : alignment === "end" ? available - size : (available - size) / 2);
  const padding = paddingAxes(settings);
  const inPage = (start: number, size: number, extent: number, inset: number) => Math.max(inset, Math.min(extent - inset - size, start));
  const reverse = (value: Settings["legendAlign"]) => value === "start" ? "end" : value === "end" ? "start" : "center";
  const across = vertical && settings.legendFacing === "right" ? reverse(settings.legendMarginAlign) : settings.legendMarginAlign;
  const left = inPage(align(margin.left, margin.width, width, vertical ? across : settings.legendAlign), width, PAPER.width, padding.x);
  const top = inPage(align(margin.top, margin.height, height, vertical ? settings.legendAlign : settings.legendMarginAlign), height, PAPER.height, padding.y);
  return {
    left, top, width, height,
    fits: width <= margin.width + 1e-9 && height <= margin.height + 1e-9,
    x: vertical ? left + width / 2 : left,
    y: vertical ? top + (settings.legendFacing === "left" ? height : 0) : top + height / 2,
    rotation: vertical ? (settings.legendFacing === "left" ? -Math.PI / 2 : Math.PI / 2) : 0,
  };
}

// Three consecutive 1–2–5 steps ending at or above the largest daily sport volume.
export function automaticVolumeValues(maxHours = Math.max(...DAILY.map(day => day.hours))) {
  if (!Number.isFinite(maxHours) || maxHours <= 0) return [0.5, 1, 2];
  const exponent = Math.floor(Math.log10(maxHours));
  const candidates = [exponent - 1, exponent, exponent + 1].flatMap(power => [1, 2, 5].map(step => Number((step * 10 ** power).toPrecision(12))));
  const end = candidates.findIndex(value => value >= maxHours);
  return candidates.slice(end - 2, end + 1);
}
export const volumeValues = (settings: Settings) => settings.volumeLegendScale === "manual" ? settings.volumeLegendValues : automaticVolumeValues();
export const volumeRadius = (hours: number, settings: Pick<Settings, "blobRadius">) => settings.blobRadius * Math.sqrt(hours);
export const formatVolume = (hours: number) => `${Number(hours.toPrecision(6))} h`;

export function parseVolumeValues(text: string): number[] | null {
  const parts = text.trim().split(/[,;\s]+/).filter(Boolean);
  const values = parts.map(Number);
  if (!values.length || values.length > 6 || values.some(value => !Number.isFinite(value) || value <= 0 || value > 100)) return null;
  return [...new Set(values)].sort((a, b) => a - b);
}

type Cell = { label: string; radius: number; width: number; height: number; sport?: Sport; x: number; y: number };
type Block = { kind: "color" | "volume"; cells: Cell[]; width: number; height: number; x: number; y: number };
function wrapCells(cells: Cell[], maxWidth: number, gap: number): Pick<Block, "cells" | "width" | "height"> {
  let x = 0, y = 0, rowHeight = 0, width = 0;
  let row: Cell[] = [];
  const finishRow = () => { for (const cell of row) cell.y = y + (rowHeight - cell.height) / 2; row = []; };
  for (const cell of cells) {
    if (x > 0 && x + cell.width > maxWidth) { finishRow(); y += rowHeight + gap; x = 0; rowHeight = 0; }
    cell.x = x; row.push(cell);
    rowHeight = Math.max(rowHeight, cell.height);
    width = Math.max(width, x + cell.width);
    x += cell.width + gap;
  }
  finishRow();
  return { cells, width, height: y + rowHeight };
}

export function legendLayout(settings: Settings, measure: (text: string) => number) {
  const font = settings.legendFontSize;
  const gap = font * 0.75;
  const margin = legendMargin(settings);
  const maxLength = Math.max(1, settings.legendOrientation === "vertical" ? margin.height : margin.width);
  const opposite = settings.volumeLegendEnabled && settings.volumeLegendPosition === "opposite" && settings.legendAlign !== "center";
  const beside = settings.volumeLegendEnabled && settings.volumeLegendPosition === "beside";
  const available = opposite || beside ? (maxLength - gap) / 2 : maxLength;
  const colorRadius = font * (0.9 / 2.55);
  const colorCells = SPORTS.map(sport => ({ label: sport.toLowerCase(), radius: colorRadius, width: colorRadius * 2 + gap + measure(sport.toLowerCase()), height: font * (3.6 / 2.55), sport, x: 0, y: 0 }));
  const color: Block = { kind: "color", ...wrapCells(colorCells, available, font * 3), x: 0, y: 0 };
  const blocks = [color];
  if (settings.volumeLegendEnabled) {
    const cells = volumeValues(settings).map(hours => {
      const radius = volumeRadius(hours, settings);
      const label = formatVolume(hours);
      return { label, radius, width: radius * 2 + gap + measure(label), height: Math.max(radius * 2, font * 1.4), x: 0, y: 0 };
    });
    blocks.push({ kind: "volume", ...wrapCells(cells, available, font * 2), x: 0, y: 0 });
  }
  if (opposite) {
    return blocks.map((block, i) => ({ blocks: [block], width: block.width, height: block.height, placement: legendPlacement(block.width, { ...settings, legendAlign: i === 0 ? settings.legendAlign : settings.legendAlign === "start" ? "end" : "start" }, block.height) }));
  }
  const volume = blocks[1];
  let width = color.width, height = color.height;
  if (volume) {
    if (beside) {
      volume.x = color.width + gap * 2;
      width = volume.x + volume.width; height = Math.max(color.height, volume.height);
      color.y = (height - color.height) / 2; volume.y = (height - volume.height) / 2;
    } else {
      volume.y = color.height + gap;
      width = Math.max(color.width, volume.width); height = volume.y + volume.height;
      color.x = (width - color.width) / 2; volume.x = (width - volume.width) / 2;
    }
  }
  // Measure the union of both sections before positioning, exactly like one
  // container holding the color row and its volume row. Rotate only that container.
  width = Math.max(...blocks.map(block => block.x + block.width));
  height = Math.max(...blocks.map(block => block.y + block.height));
  return [{ blocks, width, height, placement: legendPlacement(width, settings, height) }];
}

export type SwatchPainter = (sport: Sport, x: number, y: number, radius: number, alpha: number) => void;
export function drawLegend(ctx: CanvasRenderingContext2D, settings: Settings, focusedSport?: Sport, paintSwatch?: SwatchPainter) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.font = `400 ${settings.legendFontSize}px Arial, sans-serif`;
  ctx.textBaseline = "middle";
  const groups = legendLayout(settings, text => ctx.measureText(text).width);
  for (const group of groups) {
    ctx.save();
    ctx.translate(group.placement.x, group.placement.y);
    ctx.rotate(group.placement.rotation);
    ctx.translate(0, -group.height / 2);
    for (const block of group.blocks) for (const cell of block.cells) {
      const x = block.x + cell.x;
      const y = block.y + cell.y + cell.height / 2;
      const focused = !cell.sport || !focusedSport || cell.sport === focusedSport;
      ctx.beginPath(); ctx.arc(x + cell.radius, y, cell.radius, 0, Math.PI * 2);
      if (cell.sport && paintSwatch) {
        paintSwatch(cell.sport, x + cell.radius, y, cell.radius, focused ? 1 : 0.2);
      } else if (cell.sport) {
        ctx.globalAlpha = settings.opacity * (focused ? 1 : 0.2);
        ctx.fillStyle = settings.colors[cell.sport]; ctx.fill();
      } else {
        ctx.globalAlpha = 0.65; ctx.strokeStyle = settings.ink;
        ctx.lineWidth = settings.legendFontSize * 0.045; ctx.stroke();
      }
      ctx.globalAlpha = focused ? 1 : 0.3;
      ctx.fillStyle = settings.ink;
      ctx.fillText(cell.label, x + cell.radius * 2 + settings.legendFontSize * 0.75, y);
    }
    ctx.restore();
  }
  ctx.restore();
  return groups.every(group => group.placement.fits);
}
