import { SPORTS } from "./artwork";
import type { Palette, Sport } from "./artwork";
import { fitChroma, oklchHex, paletteQuality } from "./color-science";

export const MOODS = ["muted", "neon", "high-contrast"] as const;
export type Mood = (typeof MOODS)[number];
export type ColorMood = Mood | "auto";
export const MOOD_LABELS = { muted: "Muted", neon: "Neon", "high-contrast": "High contrast" } as const;
const HARMONIES = [
  { name: "paired complements", offsets: [0, 60, 180, 240] },
  { name: "square harmony", offsets: [0, 90, 180, 270] },
  { name: "split complements", offsets: [0, 35, 160, 205] },
] as const;
export type GeneratedPalette = Palette & { mood: Mood; harmony: string; quality: ReturnType<typeof paletteQuality> };

export function randomPalette(requested: ColorMood = "auto", opacity = 0.7, random: () => number = Math.random): GeneratedPalette {
  // Select the mood first; all subsequent sampling is constrained by that mood.
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const between = (lo: number, hi: number) => lo + random() * (hi - lo);
  const mood = requested === "auto" ? pick(MOODS) : requested;
  const alpha = Math.max(0.1, Math.min(1, opacity));
  let best: GeneratedPalette | undefined;
  let bestScore = -Infinity;
  // Bounded rejection sampling checks colors AFTER the current opacity is applied.
  for (let attempt = 0; attempt < 64; attempt++) {
    const hue = between(0, 360);
    const harmony = pick(HARMONIES);
    const paperHue = (hue + pick([30, 180])) % 360;
    const background = oklchHex(between(0.97, 0.985), mood === "neon" ? 0.006 : between(0.009, 0.018), paperHue);
    const colors = harmony.offsets.map((offset, i) => {
      const h = hue + offset + between(-4, 4);
      const l = mood === "muted" ? between(0.57, 0.70)
        : mood === "neon" ? between(0.64, 0.78)
        : [0.40, 0.64, 0.48, 0.70][i]! + between(-0.025, 0.025);
      const c = mood === "muted" ? between(0.065, 0.105)
        : mood === "neon" ? fitChroma(l, 0.4, h) * between(0.91, 0.99)
        : between(0.12, 0.22);
      return oklchHex(l, c, h);
    });
    // Randomize the sport assignment as well as hue; keep each four-color set coherent.
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [colors[i], colors[j]] = [colors[j]!, colors[i]!];
    }
    const quality = paletteQuality(colors, background, alpha);
    const separationGoal = (mood === "muted" ? 0.055 : mood === "neon" ? 0.075 : 0.09) * alpha / 0.7;
    const contrastGoal = 1 + (mood === "high-contrast" ? 0.9 : 0.55) * alpha / 0.7;
    const score = Math.min(quality.separation / separationGoal, quality.paperContrast / contrastGoal);
    if (score > bestScore) {
      bestScore = score;
      best = {
        id: "generated", name: `${MOOD_LABELS[mood]} · ${harmony.name}`, mood, harmony: harmony.name, quality,
        colors: Object.fromEntries(SPORTS.map((sport, i) => [sport, colors[i]!])) as Record<Sport, string>,
        background,
        centers: oklchHex(0.80, 0.012, paperHue),
        ink: oklchHex(0.44, 0.022, paperHue),
      };
    }
    if (score >= 1) break;
  }
  return best!;
}
