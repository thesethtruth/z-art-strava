import { PAPER, SPORTS } from "./settings";
import type { LegendSettings, Settings, Sport } from "./settings";
import { gridBounds } from "./grid";

const GRID_GAP = 24;
const PAPER_INSET = 4;
const HEIGHT = 3.6;
const GAP = 10;

// Align along the calendar bounds, just outside its selected edge.
// Vertical left-facing text reads upward; right-facing text reads downward.
export function legendPlacement(length: number, settings: LegendSettings & Pick<Settings, "gridSize" | "gridHeight">) {
  const grid = gridBounds(settings);
  const vertical = settings.legendOrientation === "vertical";
  const width = vertical ? HEIGHT : length;
  const height = vertical ? length : HEIGHT;
  const along = (start: number, end: number, size: number) => settings.legendAlign === "start" ? start
    : settings.legendAlign === "end" ? end - size : (start + end - size) / 2;
  const inPage = (start: number, size: number, extent: number) => Math.max(PAPER_INSET, Math.min(extent - PAPER_INSET - size, start));
  const left = inPage(settings.legendEdge === "left" ? grid.left - GRID_GAP - width
    : settings.legendEdge === "right" ? grid.right + GRID_GAP : along(grid.left, grid.right, width), width, PAPER.width);
  const top = inPage(settings.legendEdge === "top" ? grid.top - GRID_GAP - height
    : settings.legendEdge === "bottom" ? grid.bottom + GRID_GAP : along(grid.top, grid.bottom, height), height, PAPER.height);
  return {
    left, top, width, height,
    x: vertical ? left + width / 2 : left,
    y: vertical ? top + (settings.legendFacing === "left" ? height : 0) : top + height / 2,
    rotation: vertical ? (settings.legendFacing === "left" ? -Math.PI / 2 : Math.PI / 2) : 0,
  };
}

export function drawLegend(ctx: CanvasRenderingContext2D, settings: Settings, focusedSport?: Sport) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.font = "400 2.55px Arial, sans-serif";
  ctx.textBaseline = "middle";
  const widths = SPORTS.map(sport => ctx.measureText(sport.toLowerCase()).width + 5.5);
  const length = widths.reduce((a, b) => a + b, 0) + GAP * (SPORTS.length - 1);
  const placement = legendPlacement(length, settings);
  ctx.translate(placement.x, placement.y);
  ctx.rotate(placement.rotation);
  let x = 0;
  SPORTS.forEach((sport, i) => {
    const focused = !focusedSport || sport === focusedSport;
    ctx.globalAlpha = settings.opacity * (focused ? 1 : 0.2);
    ctx.fillStyle = settings.colors[sport];
    ctx.beginPath(); ctx.arc(x + 0.9, 0, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = focused ? 1 : 0.3;
    ctx.fillStyle = settings.ink;
    ctx.fillText(sport.toLowerCase(), x + 4, 0.1);
    x += widths[i]! + GAP;
  });
  ctx.restore();
}
