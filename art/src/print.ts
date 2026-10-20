import { PAPER, type Settings } from "./settings";

// ISO A1 finished size; standard commercial-print bleed on all four edges.
export function printDimensions(settings: Pick<Settings, "printBleed">) {
  const bleed = settings.printBleed ? 3 : 0;
  return { width: PAPER.width + bleed * 2, height: PAPER.height + bleed * 2, bleed };
}
