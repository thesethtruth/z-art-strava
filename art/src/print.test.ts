import { expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { DEFAULTS, normalizeSettings, settingsForExport } from "./settings";
import { printDimensions } from "./print";
import { setPrintBoxes } from "../scripts/pdf-boxes";

test("bleed defaults on for existing settings and survives settings round trips", () => {
  expect(normalizeSettings({}).printBleed).toBe(true);
  expect(normalizeSettings({ printBleed: "false" }).printBleed).toBe(true);
  for (const printBleed of [true, false]) {
    expect(normalizeSettings(settingsForExport({ ...DEFAULTS, printBleed })).printBleed).toBe(printBleed);
  }
});

test("PDF encodes exact A1 trim size and optional 3 mm bleed", async () => {
  for (const printBleed of [true, false]) {
    const size = printDimensions({ printBleed });
    expect(size).toEqual(printBleed ? { width: 600, height: 847, bleed: 3 } : { width: 594, height: 841, bleed: 0 });
    const document = await PDFDocument.create();
    document.addPage([size.width * 72 / 25.4 + 0.1, size.height * 72 / 25.4 + 0.1]);
    const output = await PDFDocument.load(await setPrintBoxes(await document.save(), { printBleed }));
    const page = output.getPage(0);
    const mm = 25.4 / 72;
    expect(page.getTrimBox().width * mm).toBeCloseTo(594, 8);
    expect(page.getTrimBox().height * mm).toBeCloseTo(841, 8);
    expect(page.getTrimBox().x * mm).toBeCloseTo(size.bleed, 8);
    expect(page.getTrimBox().y * mm).toBeCloseTo(size.bleed, 8);
    expect(page.getMediaBox().width * mm).toBeCloseTo(size.width, 8);
    expect(page.getMediaBox().height * mm).toBeCloseTo(size.height, 8);
    expect(page.getBleedBox()).toEqual(page.getMediaBox());
    expect(page.getCropBox()).toEqual(page.getMediaBox());
  }
});
