import { PAPER } from "./settings";
import type { Settings } from "./settings";

// Both the calendar and its legend use these bounds; no edge reserves extra space.
export function gridBounds(settings: Pick<Settings, "gridSize" | "gridHeight">) {
  const left = (PAPER.width - settings.gridSize) / 2;
  const top = (PAPER.height - settings.gridHeight) / 2;
  return { left, top, right: left + settings.gridSize, bottom: top + settings.gridHeight };
}
