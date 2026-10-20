import { expect, test } from "bun:test";
import { DEFAULTS, LEGEND_OPTIONS, normalizeSettings, PAPER, settingsForExport } from "./settings";
import { automaticVolumeValues, legendLayout, legendMargin, legendPlacement, parseVolumeValues, volumeRadius } from "./legend";
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
    for (const legendEdge of LEGEND_OPTIONS.legendEdge) {
      const legendOrientation = legendEdge === "left" || legendEdge === "right" ? "vertical" : "horizontal";
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

test("margin alignment uses padded space between grid and paper on every edge", () => {
  for (const legendEdge of LEGEND_OPTIONS.legendEdge) for (const legendMarginAlign of LEGEND_OPTIONS.legendMarginAlign) {
    const side = legendEdge === "left" || legendEdge === "right";
    const settings = { ...DEFAULTS, legendEdge, legendMarginAlign, legendPadding: 5, legendOrientation: side ? "vertical" as const : "horizontal" as const };
    const margin = legendMargin(settings);
    const placement = legendPlacement(100, settings, 10);
    const start = side ? placement.left : placement.top;
    const marginStart = side ? margin.left : margin.top;
    const marginSize = side ? margin.width : margin.height;
    expect(start).toBeCloseTo(marginStart + (legendMarginAlign === "start" ? 0 : legendMarginAlign === "center" ? (marginSize - 10) / 2 : marginSize - 10));
    expect(placement.fits).toBe(true);
  }
});

test("volume scale rounds upward through 1–2–5 intervals and manual values are validated", () => {
  expect(automaticVolumeValues(19.948)).toEqual([5, 10, 20]);
  expect(automaticVolumeValues(3.4)).toEqual([1, 2, 5]);
  expect(automaticVolumeValues(0.12)).toEqual([0.05, 0.1, 0.2]);
  expect(parseVolumeValues("5, 0.5, 1, 1")).toEqual([0.5, 1, 5]);
  for (const input of ["", "zero", "1, -2", "Infinity", "101", "1,2,3,4,5,6,7"]) expect(parseVolumeValues(input)).toBeNull();
  expect(volumeRadius(4, DEFAULTS) ** 2 / volumeRadius(1, DEFAULTS) ** 2).toBeCloseTo(4);
});

test("volume placements preserve scale while font size scales color dots", () => {
  const measure = (text: string) => text.length * 1.3;
  const settings = { ...DEFAULTS, volumeLegendEnabled: true, legendAlign: "start" as const };
  const below = legendLayout(settings, measure)[0]!;
  expect(below.placement.fits).toBe(true);
  expect(below.blocks[1]!.y).toBeGreaterThan(below.blocks[0]!.height);
  const beside = legendLayout({ ...settings, volumeLegendPosition: "beside" }, measure)[0]!;
  expect(beside.blocks[1]!.x).toBeGreaterThan(beside.blocks[0]!.width);
  const opposite = legendLayout({ ...settings, volumeLegendPosition: "opposite" }, measure);
  expect(opposite).toHaveLength(2);
  expect(opposite[0]!.placement.left + opposite[0]!.placement.width).toBeLessThan(opposite[1]!.placement.left);
  const larger = legendLayout({ ...settings, legendFontSize: settings.legendFontSize * 2 }, measure)[0]!;
  expect(larger.blocks[0]!.cells[0]!.radius).toBeCloseTo(2 * below.blocks[0]!.cells[0]!.radius);
  expect(larger.blocks[1]!.cells.map(cell => cell.radius)).toEqual(below.blocks[1]!.cells.map(cell => cell.radius));
});

test("new legend settings round trip and unavailable opposite placement falls back below", () => {
  const settings = normalizeSettings({ ...DEFAULTS, volumeLegendEnabled: true, volumeLegendScale: "manual", volumeLegendValues: [0.5, 1, 3], legendPadding: 9, legendFontSize: 4.5, legendMarginAlign: "end", legendAlign: "end", volumeLegendPosition: "opposite" });
  expect(normalizeSettings(settingsForExport(settings))).toEqual(settings);
  expect(normalizeSettings({ ...settings, legendAlign: "center" }).volumeLegendPosition).toBe("below");
  expect(normalizeSettings({ volumeLegendValues: ["no", -1, null] }).volumeLegendValues).toEqual(DEFAULTS.volumeLegendValues);
});

test("stacked legends align their combined bounds on the local vertical axis, including both rotations", () => {
  for (const legendEdge of LEGEND_OPTIONS.legendEdge) for (const legendOrientation of LEGEND_OPTIONS.legendOrientation) {
    for (const legendFacing of LEGEND_OPTIONS.legendFacing) for (const legendMarginAlign of LEGEND_OPTIONS.legendMarginAlign) {
      const settings = { ...DEFAULTS, gridSize: 360, gridHeight: 360, legendEdge, legendOrientation, legendFacing, legendMarginAlign,
        volumeLegendEnabled: true, volumeLegendPosition: "below" as const, volumeLegendScale: "manual" as const, volumeLegendValues: [1, 4] };
      const groups = legendLayout(settings, text => text.length * 1.2);
      expect(groups).toHaveLength(1);
      const group = groups[0]!;
      expect(group.blocks).toHaveLength(2);
      expect(group.height).toBeCloseTo(group.blocks[1]!.y + group.blocks[1]!.height);
      const margin = legendMargin(settings);
      const vertical = legendOrientation === "vertical";
      const near = vertical ? group.placement.left : group.placement.top;
      const far = near + (vertical ? group.placement.width : group.placement.height);
      const marginNear = vertical ? margin.left : margin.top;
      const marginFar = marginNear + (vertical ? margin.width : margin.height);
      if (legendMarginAlign === "center") expect((near + far) / 2).toBeCloseTo((marginNear + marginFar) / 2);
      else if ((legendMarginAlign === "start") !== (vertical && legendFacing === "right")) expect(near).toBeCloseTo(marginNear);
      else expect(far).toBeCloseTo(marginFar);
      // Each section is transformed by the shared container, so neither can spill
      // outside its measured box when the font, orientation, or volume sizes change.
      for (const block of group.blocks) for (const x of [block.x, block.x + block.width]) for (const y of [block.y, block.y + block.height]) {
        const p = group.placement;
        const px = p.x + x * Math.cos(p.rotation) - (y - group.height / 2) * Math.sin(p.rotation);
        const py = p.y + x * Math.sin(p.rotation) + (y - group.height / 2) * Math.cos(p.rotation);
        expect(px).toBeGreaterThanOrEqual(p.left - 1e-9);
        expect(px).toBeLessThanOrEqual(p.left + p.width + 1e-9);
        expect(py).toBeGreaterThanOrEqual(p.top - 1e-9);
        expect(py).toBeLessThanOrEqual(p.top + p.height + 1e-9);
      }
    }
  }
});
