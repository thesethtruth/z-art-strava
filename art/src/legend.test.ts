import { expect, test } from "bun:test";
import { DEFAULTS, LEGEND_OPTIONS, normalizeSettings, PAPER, settingsForExport } from "./settings";
import { legendPlacement } from "./legend";
import { gridBounds } from "./grid";

test("all legend edge, alignment, orientation, and facing combinations fit within the paper", () => {
  for (const legendEdge of LEGEND_OPTIONS.legendEdge) for (const legendAlign of LEGEND_OPTIONS.legendAlign) {
    for (const legendOrientation of LEGEND_OPTIONS.legendOrientation) for (const legendFacing of LEGEND_OPTIONS.legendFacing) {
      const settings = { ...DEFAULTS, legendEdge, legendAlign, legendOrientation, legendFacing };
      const p = legendPlacement(100, settings);
      expect(p.left).toBeGreaterThan(0);
      expect(p.top).toBeGreaterThan(0);
      expect(p.left + p.width).toBeLessThan(PAPER.width);
      expect(p.top + p.height).toBeLessThan(PAPER.height);
      // The transformed original legend fits the declared box, including its thickness.
      for (const x of [0, 100]) for (const y of [-1.8, 1.8]) {
        const px = p.x + x * Math.cos(p.rotation) - y * Math.sin(p.rotation);
        const py = p.y + x * Math.sin(p.rotation) + y * Math.cos(p.rotation);
        expect(px).toBeGreaterThanOrEqual(p.left - 1e-9);
        expect(px).toBeLessThanOrEqual(p.left + p.width + 1e-9);
        expect(py).toBeGreaterThanOrEqual(p.top - 1e-9);
        expect(py).toBeLessThanOrEqual(p.top + p.height + 1e-9);
      }
      expect(normalizeSettings(JSON.parse(JSON.stringify(settingsForExport(settings))))).toEqual(settings);
    }
  }
});

test("legend endpoints track grid width and height, with equal grid margins on both axes", () => {
  for (const gridSize of [360, 470, 490]) for (const gridHeight of [360, 741, 769]) {
    const settings = { ...DEFAULTS, gridSize, gridHeight };
    const grid = gridBounds(settings);
    expect(grid.left).toBeCloseTo(PAPER.width - grid.right, 10);
    expect(grid.top).toBeCloseTo(PAPER.height - grid.bottom, 10);
    for (const legendEdge of LEGEND_OPTIONS.legendEdge) for (const legendOrientation of LEGEND_OPTIONS.legendOrientation) {
      const start = legendPlacement(100, { ...settings, legendEdge, legendOrientation, legendAlign: "start" });
      const center = legendPlacement(100, { ...settings, legendEdge, legendOrientation, legendAlign: "center" });
      const end = legendPlacement(100, { ...settings, legendEdge, legendOrientation, legendAlign: "end" });
      if (legendEdge === "left" || legendEdge === "right") {
        expect(start.top).toBeCloseTo(grid.top, 10);
        expect(center.top + center.height / 2).toBeCloseTo(PAPER.height / 2, 10);
        expect(end.top + end.height).toBeCloseTo(grid.bottom, 10);
      } else {
        expect(start.left).toBeCloseTo(grid.left, 10);
        expect(center.left + center.width / 2).toBeCloseTo(PAPER.width / 2, 10);
        expect(end.left + end.width).toBeCloseTo(grid.right, 10);
      }
    }
    const left = legendPlacement(100, { ...settings, legendEdge: "left", legendOrientation: "vertical" });
    const right = legendPlacement(100, { ...settings, legendEdge: "right", legendOrientation: "vertical" });
    expect(grid.left - (left.left + left.width)).toBeCloseTo(right.left - grid.right, 10);
  }
});

test("a vertical right legend starts at the grid top and invalid options retain defaults", () => {
  const corner = legendPlacement(100, { ...DEFAULTS, legendEdge: "right", legendAlign: "start", legendOrientation: "vertical", legendFacing: "left" });
  const grid = gridBounds(DEFAULTS);
  expect(corner.left).toBeGreaterThan(grid.right);
  expect(corner.top).toBe(grid.top);
  expect(corner.rotation).toBe(-Math.PI / 2);
  const invalid = normalizeSettings({ legendEdge: "middle", legendAlign: 23, legendOrientation: "diagonal", legendFacing: null });
  expect(invalid.legendEdge).toBe(DEFAULTS.legendEdge);
  expect(invalid.legendAlign).toBe(DEFAULTS.legendAlign);
  expect(invalid.legendOrientation).toBe(DEFAULTS.legendOrientation);
  expect(invalid.legendFacing).toBe(DEFAULTS.legendFacing);
});
