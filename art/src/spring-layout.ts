import { forceCollide, forceSimulation, forceX, forceY, randomLcg } from "d3";
import { SPORTS } from "./settings";
import type { Settings } from "./settings";
import type { Daily, Mark, Week } from "./activity-data";

// Each bubble's center is attached to the week center by a zero-rest-length
// spring. Larger bubble areas get stronger springs as dominance increases.
export function placeClusters(weeks: Week[], settings: Settings): Mark[] {
  const nodes = weeks.flatMap(week => {
    if (!week.days.length) return [];
    const random = randomLcg((settings.clusterSeed + Number(week.days[0]!.date.replaceAll("-", ""))) / 1_000_000_000);
    const sorted = [...week.days].sort((a, b) => b.hours - a.hours || a.date.localeCompare(b.date) || SPORTS.indexOf(a.sport) - SPORTS.indexOf(b.sport));
    const largestHours = sorted[0]!.hours;
    const largestRadius = settings.blobRadius * Math.sqrt(largestHours);
    return sorted.map((entry, index) => {
      const r = settings.blobRadius * Math.sqrt(entry.hours);
      const angle = random() * Math.PI * 2;
      const distance = index === 0 ? 0 : Math.sqrt(random()) * (largestRadius + r);
      return {
        ...entry, r, year: week.year, row: week.row,
        x: week.x + Math.cos(angle) * distance, y: week.y + Math.sin(angle) * distance,
        anchorX: week.x, anchorY: week.y, relativeArea: entry.hours / largestHours, vx: 0, vy: 0,
      };
    });
  });
  if (!nodes.length) return [];
  // A small floor keeps even tiny activities attached at full dominance.
  // Hours are proportional to painted area. With zero dominance all springs
  // are equal; increasing it gives large activities a stronger relative pull.
  const strength = (node: typeof nodes[number]) => settings.springStrength
    * (1 - settings.dominance + settings.dominance * (0.05 + 0.95 * node.relativeArea));
  // One simulation lets every nearby bubble collide, including other weeks and
  // year columns. Each spring remains attached to its own fixed week center.
  // There is no angular target: the center force is radial, so collisions can
  // turn bubbles around their anchor and reorient a cluster into nearby space.
  const simulation = forceSimulation(nodes).stop().randomSource(randomLcg(settings.clusterSeed / 1_000_001))
    .alphaDecay(0.015).velocityDecay(settings.damping)
    .force("spring-x", forceX<typeof nodes[number]>(node => node.anchorX).strength(strength))
    .force("spring-y", forceY<typeof nodes[number]>(node => node.anchorY).strength(strength));
  if (settings.collisionStrength > 0) {
    simulation.force("collide", forceCollide<typeof nodes[number]>(d => d.r * (1 - settings.clusterOverlap))
      .strength(settings.collisionStrength).iterations(2));
  }
  // Only the outer center-distance limit remains. There is no inner ring or
  // minimum distance: a dominant activity can cover the week center itself.
  for (let tick = 0; tick < 220; tick++) {
    simulation.tick();
    for (const node of nodes) {
      const dx = node.x - node.anchorX, dy = node.y - node.anchorY;
      const distance = Math.hypot(dx, dy);
      if (distance > settings.outerRadius) {
        const ux = dx / distance, uy = dy / distance;
        node.x = node.anchorX + ux * settings.outerRadius; node.y = node.anchorY + uy * settings.outerRadius;
        const radial = node.vx * ux + node.vy * uy;
        if (radial > 0) {
          node.vx -= radial * ux; node.vy -= radial * uy;
        }
      }
    }
  }
  return nodes.map(node => ({
    date: node.date, sport: node.sport, hours: node.hours, activities: node.activities,
    effort: node.effort, variability: node.variability, climb: node.climb, if: node.if, hr: node.hr,
    r: node.r, x: node.x, y: node.y, year: node.year, row: node.row,
  }));
}

// The same solver also supports a single isolated week for geometry checks.
export function placeCluster(entries: Daily[], settings: Settings) {
  return placeClusters([{ x: 0, y: 0, year: 0, row: 0, days: entries }], settings)
    .map(({ x, y, year: _year, row: _row, ...entry }) => ({ ...entry, dx: x, dy: y }));
}

