import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { normalizeSettings } from "../src/artwork";

export function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const executable = candidates.find((path): path is string => Boolean(path && existsSync(path)));
  if (!executable) throw new Error("Chrome was not found. Install Chrome or set CHROME_PATH to its executable.");
  return executable;
}

export async function createPdf(baseUrl: string, input: unknown, previewPath?: string) {
  const browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1000 });
    await page.goto(`${baseUrl}?export=1`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => window.artwork?.ready);
    await page.evaluate(async settings => { await window.artwork.renderForExport(settings, 300); }, normalizeSettings(input));
    const pdf = await page.pdf({
      width: "594mm", height: "841mm", preferCSSPageSize: true,
      printBackground: true, displayHeaderFooter: false,
      margin: { top: 0, bottom: 0, left: 0, right: 0 }, timeout: 120_000,
    });
    if (previewPath) {
      // A small QA preview from the same canvas, without changing the PDF's resolution.
      const png = await page.evaluate(() => {
        const source = document.querySelector("canvas")!;
        const preview = document.createElement("canvas");
        preview.width = 1188; preview.height = 1682;
        preview.getContext("2d")!.drawImage(source, 0, 0, preview.width, preview.height);
        return preview.toDataURL("image/png").split(",")[1]!;
      });
      await Bun.write(previewPath, Buffer.from(png, "base64"));
    }
    return pdf;
  } finally { await browser.close(); }
}
