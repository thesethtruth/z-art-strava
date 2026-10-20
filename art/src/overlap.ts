import type { Mark } from "./activity-data";
import { SPORTS } from "./settings";
import type { Settings } from "./settings";

export type OverlapRegion = { owner: Mark; others: Mark[] };
const weekId = (mark: Mark) => `${mark.year}-${mark.row}`;
const regionsCache = new WeakMap<Mark[], OverlapRegion[]>();

// Ascending priority: stronger weeks paint last. Equal totals favor the earlier week;
// within a week, larger daily bubbles take precedence, then date and sport order.
export function overlapRegions(marks: Mark[]): OverlapRegion[] {
  const cached = regionsCache.get(marks);
  if (cached) return cached;
  const totals = new Map<string, number>();
  for (const mark of marks) totals.set(weekId(mark), (totals.get(weekId(mark)) || 0) + mark.hours);
  const priority = (a: Mark, b: Mark) => totals.get(weekId(a))! - totals.get(weekId(b))!
    || b.year - a.year || b.row - a.row || a.hours - b.hours
    || b.date.localeCompare(a.date) || SPORTS.indexOf(b.sport) - SPORTS.indexOf(a.sport);
  const ordered = [...marks].sort((a, b) => a.x - a.r - (b.x - b.r));
  const byOwner = new Map<Mark, Mark[]>();
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i]!;
    for (let j = i + 1; j < ordered.length; j++) {
      const b = ordered[j]!;
      if (b.x - b.r >= a.x + a.r) break;
      if (weekId(a) === weekId(b) || Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r) continue;
      const [owner, other] = priority(a, b) >= 0 ? [a, b] : [b, a];
      const others = byOwner.get(owner) || [];
      others.push(other);
      byOwner.set(owner, others);
    }
  }
  const regions = [...byOwner].map(([owner, others]) => ({ owner, others })).sort((a, b) => priority(a.owner, b.owner));
  regionsCache.set(marks, regions);
  return regions;
}

type Circle = Pick<Mark, "x" | "y" | "r">;
type Arc = Circle & { start: number; end: number };
// Clockwise arcs bound the exact intersection, including full containment.
export function intersectionArcs(a: Circle, b: Circle): Arc[] {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  if (distance >= a.r + b.r || a.r <= 0 || b.r <= 0) return [];
  if (distance <= Math.abs(a.r - b.r)) {
    return [{ ...(a.r <= b.r ? a : b), start: 0, end: Math.PI * 2 }];
  }
  const direction = Math.atan2(b.y - a.y, b.x - a.x);
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const angleA = Math.acos(clamp((distance * distance + a.r * a.r - b.r * b.r) / (2 * distance * a.r)));
  const angleB = Math.acos(clamp((distance * distance + b.r * b.r - a.r * a.r) / (2 * distance * b.r)));
  return [
    { ...a, start: direction - angleA, end: direction + angleA },
    { ...b, start: direction + Math.PI - angleB, end: direction + Math.PI + angleB },
  ];
}

const pathCache = new WeakMap<OverlapRegion, Path2D>();
function regionPath(region: OverlapRegion) {
  const cached = pathCache.get(region);
  if (cached) return cached;
  const path = new Path2D();
  for (const other of region.others) {
    const arcs = intersectionArcs(region.owner, other);
    const first = arcs[0];
    if (!first) continue;
    path.moveTo(first.x + first.r * Math.cos(first.start), first.y + first.r * Math.sin(first.start));
    for (const arc of arcs) path.arc(arc.x, arc.y, arc.r, arc.start, arc.end);
    path.closePath();
  }
  pathCache.set(region, path);
  return path;
}

// Copy only the current owner's bounding box before any tinting. These small patches
// avoid retaining another full A1 canvas while preserving the untinted backdrop.
export function drawOverlaps(ctx: CanvasRenderingContext2D, marks: Mark[], settings: Settings, focused: (mark: Mark) => boolean) {
  if (!settings.overlapEnabled) return;
  const scale = ctx.getTransform();
  const regions = overlapRegions(marks);
  const patches = regions.map(region => {
    const { x, y, r } = region.owner;
    const left = Math.max(0, Math.floor((x - r) * scale.a) - 1);
    const top = Math.max(0, Math.floor((y - r) * scale.d) - 1);
    const right = Math.min(ctx.canvas.width, Math.ceil((x + r) * scale.a) + 1);
    const bottom = Math.min(ctx.canvas.height, Math.ceil((y + r) * scale.d) + 1);
    if (right <= left || bottom <= top) return null;
    const patch = document.createElement("canvas");
    patch.width = right - left; patch.height = bottom - top;
    patch.getContext("2d")!.drawImage(ctx.canvas, left, top, patch.width, patch.height, 0, 0, patch.width, patch.height);
    return { region, patch, x: left / scale.a, y: top / scale.d, width: patch.width / scale.a, height: patch.height / scale.d };
  });
  for (const item of patches) {
    if (!item) continue;
    const { region, patch, x, y, width, height } = item;
    ctx.save();
    ctx.clip(regionPath(region));
    // Restore the original artwork within this intersection before applying its style.
    // At triple overlaps the strongest week therefore selects exactly one tint/blend.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(patch, x, y, width, height);
    ctx.globalAlpha = settings.opacity * (focused(region.owner) ? 1 : 0.1);
    ctx.globalCompositeOperation = settings.overlapBlends[region.owner.sport];
    ctx.fillStyle = settings.overlapColors[region.owner.sport];
    ctx.fillRect(x, y, width, height);
    ctx.restore();
    patch.width = patch.height = 1;
  }
}
