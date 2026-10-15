// OKLab matrices: Björn Ottosson's public-domain reference implementation.
// https://bottosson.github.io/posts/oklab/
// Gamut fitting reduces chroma at constant OKLCH lightness and hue. This is a
// strict sRGB boundary search, not an implementation of CSS's local-MINDE algorithm.
export type Triple = [number, number, number];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const decode = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const encode = (v: number) => v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;

export function hexToRgb(hex: string): Triple {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as Triple;
}

export function rgbToOklab(rgb: Triple): Triple {
  const [r, g, b] = rgb.map(decode) as Triple;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

export function oklchToLinearRgb(lightness: number, chroma: number, hue: number): Triple {
  const a = chroma * Math.cos(hue * Math.PI / 180);
  const b = chroma * Math.sin(hue * Math.PI / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

const inGamut = (rgb: Triple) => rgb.every(v => v >= -1e-8 && v <= 1 + 1e-8);
export function fitChroma(lightness: number, chroma: number, hue: number) {
  if (inGamut(oklchToLinearRgb(lightness, chroma, hue))) return chroma;
  let lo = 0;
  let hi = chroma;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearRgb(lightness, mid, hue))) lo = mid; else hi = mid;
  }
  return lo;
}

export function oklchHex(lightness: number, chroma: number, hue: number) {
  const rgb = oklchToLinearRgb(lightness, fitChroma(lightness, chroma, hue), hue);
  return "#" + rgb.map(v => Math.round(clamp(encode(v)) * 255).toString(16).padStart(2, "0")).join("");
}

export function overPaper(color: string, paper: string, opacity: number): Triple {
  const foreground = hexToRgb(color);
  const background = hexToRgb(paper);
  // The default sRGB canvas composites encoded channels, matching this preview.
  return foreground.map((v, i) => v * opacity + background[i]! * (1 - opacity)) as Triple;
}

export function contrastRatio(a: Triple, b: Triple) {
  const luminance = (rgb: Triple) => rgb.map(decode).reduce((v, c, i) => v + c * [0.2126, 0.7152, 0.0722][i]!, 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function paletteQuality(colors: string[], paper: string, opacity: number) {
  const visible = colors.map(color => overPaper(color, paper, opacity));
  const labs = visible.map(rgbToOklab);
  let separation = Infinity;
  for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) {
    separation = Math.min(separation, Math.hypot(...labs[i]!.map((v, c) => v - labs[j]![c]!)));
  }
  return { separation, paperContrast: Math.min(...visible.map(rgb => contrastRatio(rgb, hexToRgb(paper)))) };
}
