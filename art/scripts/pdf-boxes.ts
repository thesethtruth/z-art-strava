import { PDFDocument } from "pdf-lib";
import { PAPER, type Settings } from "../src/settings";
import { printDimensions } from "../src/print";

export async function setPrintBoxes(bytes: Uint8Array, settings: Pick<Settings, "printBleed">) {
  const document = await PDFDocument.load(bytes);
  if (document.getPageCount() !== 1) throw new Error("Expected a single-page artwork PDF.");
  const page = document.getPage(0);
  const size = printDimensions(settings);
  const pt = 72 / 25.4;
  // Chromium rounds paper dimensions. Normalize to exact millimetres.
  page.scaleContent(size.width * pt / page.getWidth(), size.height * pt / page.getHeight());
  page.setMediaBox(0, 0, size.width * pt, size.height * pt);
  page.setCropBox(0, 0, size.width * pt, size.height * pt);
  page.setBleedBox(0, 0, size.width * pt, size.height * pt);
  page.setTrimBox(size.bleed * pt, size.bleed * pt, PAPER.width * pt, PAPER.height * pt);
  return document.save();
}
