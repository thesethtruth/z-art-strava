import { scaleSqrt } from "d3";
import { DAY_SECTOR, SPORTS } from "./settings";
import type { Settings } from "./settings";
import type { Daily } from "./activity-data";

// Distances are in mm. Angles come from the weekday; circle AREA stays tied to hours.
export function placeDay(entries: Daily[], weekday: number, settings: Settings) {
  const radius = scaleSqrt().domain([0, 1]).range([0, settings.blobRadius]);
  const circles = entries.map(entry => ({ ...entry, r: radius(entry.hours) }));
  circles.sort((a, b) => (settings.stackMixed ? b.r - a.r : 0) || SPORTS.indexOf(a.sport) - SPORTS.indexOf(b.sport));
  let previousDistance = 0;
  let previousRadius = 0;
  return circles.map((circle, i) => {
    const offset = settings.stackMixed || circles.length === 1 ? 0
      : (i / (circles.length - 1) - 0.5) * settings.spreadFraction * DAY_SECTOR;
    const angle = -Math.PI / 2 + weekday * DAY_SECTOR + offset;
    const distance = settings.stackMixed && i > 0
      ? previousDistance + previousRadius + circle.r - settings.stackOverlap * 2 * circle.r
      : settings.baseRadius + (settings.anchorCircles ? circle.r : 0);
    previousDistance = distance;
    previousRadius = circle.r;
    return { ...circle, angle, distance, dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance };
  });
}

