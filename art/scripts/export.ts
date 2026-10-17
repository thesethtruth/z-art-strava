import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { startServer } from "../index";
import { ARTWORK_NAME } from "../src/activity-data";
import { DEFAULTS } from "../src/settings";
import { createPdf } from "./chromium";

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const settingsFile = option("--settings");
const settings = settingsFile ? await Bun.file(settingsFile).json() : DEFAULTS;
const output = resolve(option("--output") || `output/pdf/${ARTWORK_NAME}.pdf`);
await mkdir(dirname(output), { recursive: true });
const server = startServer(0);
try {
  const pdf = await createPdf(server.url.toString(), settings, output.replace(/\.pdf$/i, "-preview.png"));
  await Bun.write(output, pdf);
  console.log(`Saved ${output} (${(pdf.byteLength / 1024 / 1024).toFixed(1)} MB)`);
} finally { await server.stop(true); }
