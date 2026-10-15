# Movement · 2016–2025

A minimal A1 portrait artwork, rendered with HTML Canvas and D3. Everything runs locally in this folder. No framework, remote fonts, or external data requests.

## Open the studio

```sh
cd art
bun install
bun run dev
```

Open http://127.0.0.1:3000. Choose a palette preset, generate a palette, or edit the colors individually. Adjust circle sizes, the base radius, mixed-sport spreading or stacking, opacity, grid width and height, and blending. Changes persist in this browser. Save/load settings to keep alternative compositions, including generated colors. Older settings retain their colors and radius: `dayRadius` migrates to `baseRadius`, `gridSize` remains width only, and removed duration-based positioning and millimeter offsets are ignored.

Click a sport name to highlight it. Enable **Inspect weeks** and move over the canvas to read the week in the sidebar. **Preview** hides the studio controls and removes highlighting; Escape returns to editing. Neither highlights nor studio controls appear in exports.

## Drawing and dates

- The confirmed date range is **1 January 2016 through 31 December 2025**, inclusive: ten calendar-year columns, left to right.
- There are 53 rows of Monday-start weeks, top to bottom. Partial weeks stay in their calendar-year column. No ISO week-year reassignment or discarded December dates.
- Every year/week intersection has a tiny muted gray center, including empty weeks. The default grid spans **470 × 741 mm** on 594 × 841 mm paper: the first week is 36 mm from the top, the last is at 777 mm, and the legend is at 820 mm. Week spacing at full height is **14.25 mm**. **Grid height** ranges from **360 to 741 mm**, centered in the same vertical space; all 53 rows remain present. Width and height change only the distances between week centers, never circle sizes or radial positioning within a week.
- Monday is at 12 o'clock. The seven days progress clockwise around each week center. There are no visible day centers or connecting lines.
- Each circle aggregates **all recorded hours of one sport on one local calendar day**. Circle area is proportional to hours: `radius = sizeAtOneHour × sqrt(hours)`. Durations are not capped or log-transformed.
- **Anchor circles to week**, enabled by default, puts each circle center at `baseRadius + circleRadius` along its weekday direction. Its inner edge therefore touches an invisible ring of radius `baseRadius`. At base radius zero, the circles touch the week point itself. Turning anchoring off puts circle centers at the base radius instead. Circle area continues to encode hours in both cases.
- **Mixed-sport spread** is a fraction from **0 to 1** of the day's `2π/7` sector. Activities are distributed evenly from `−fraction/2` to `+fraction/2` around that weekday's center line, in stable sport order. At 0.80, two activities use the −40% and +40% ends; three use both ends and the middle. A single activity always stays on the center line.
- **Stack mixed sport** puts the largest circle closest to the week, with smaller circles outward on the same weekday line. Its first circle follows the anchoring toggle. The spread slider is replaced by **Stack overlap**, from **0 to 0.5**. For each subsequent circle, `distance = previousDistance + previousRadius + radius − overlap × 2 × radius`. At zero they touch; at 0.5 the current circle's center lies on the previous circle's outer edge. Only the new circle's own diameter determines the overlap. Single-activity days are unaffected by spreading or stacking.
- Large circles are painted first so smaller ones remain visible. The default uses **0.7 opacity**, with natural overlaps. Neither the base ring nor the weekday direction lines are drawn on the artwork.
- The original sport palette comes directly from `plotfunctions.py`: rowing `#4CC9F0`, weight training `#60A5FA`, cycling `#5FE3C3`, running `#818CF8`. The initial paper is warm ivory `#FBF4EB`.
- The only text on the artwork is the small four-sport legend. All configuration and date inspection stay outside the paper.

Defaults and control bounds live in `src/artwork.ts`.

## Palettes and blending

Seven one-click palettes include the original colors plus six new starting points. Each sets the four activity colors, paper, week dots, and legend text together; it preserves the current sizes, opacity, and blending. Individual color edits are still available, and a modified palette no longer shows as a selected preset.

| Palette | Direction |
| --- | --- |
| Original | Existing mint, cyan, blue, and periwinkle on warm ivory |
| Mineral | Teal, mauve, ochre, and coral on stone |
| Terracotta | Clay, sand, olive, and dusty rose on cream |
| Botanical | Evergreen, moss, apricot, and muted plum on pale sage |
| Dusk | Violet, lilac, salmon, and petrol on pale rose |
| Cyanotype | Four blue tones on cool paper |
| Risograph | Blue, coral, mustard, and teal on warm stock |

Four blend modes suit the translucent marks: **Layered color** for straightforward overlapping color, **Multiply** for deeper overlaps, **Screen** for luminous overlaps, and **Soft light** for subtler mixing. The added modes blend circles together on a transparent activity layer before placing them over the paper. This keeps non-overlapping marks visible with Screen on a light background, and keeps the week dots and legend out of the blending. The same renderer is used for preview, PNG, and PDF. Saved settings using a removed blend mode fall back to Layered color.

### Color randomizer

Choose **Muted**, **Neon**, **High contrast**, or **Surprise me**, then click **Randomize colors**. Surprise me selects the mood first; the chosen mood constrains the subsequent color generation. Presets remain available and are never overwritten. The randomizer changes only colors, leaving composition, blending, and opacity intact.

The generator uses **OKLCH**, the polar form of OKLab, to control perceived lightness, chroma, and hue separately. It rotates one of three four-color harmonies (paired complements, a square, or split complements), varies tones within mood-specific ranges, and shuffles the sport assignments. Muted uses low chroma, Neon approaches the sRGB gamut boundary, and High contrast uses a wider lightness range with stronger hues. All keep a coordinated pale background and dark legend text.

Out-of-gamut colors are fitted by reducing chroma at fixed lightness and hue through a bounded binary search. This is a strict sRGB boundary fit, not CSS's local-MINDE gamut-mapping algorithm. Up to 64 candidates are scored using pairwise OKLab distance and contrast against the paper **after compositing at the current opacity**; the best candidate is retained. These scores target distinct, harmonious marks under ordinary layering, not an accessibility guarantee under every overlap/blend combination. The Neon mood is a saturated RGB approximation, not fluorescent print ink.

The lightweight implementation is in `src/color-science.ts` and `src/random-palette.ts`, with no additional dependencies. The conversion matrices come from [Björn Ottosson's public-domain OKLab implementation](https://bottosson.github.io/posts/oklab/); the choice of constant-lightness/hue chroma reduction follows the principles discussed in [CSS Color 4](https://www.w3.org/TR/css-color-4/#css-gamut-mapping). Mood ranges, harmony selection, and palette scoring are design decisions for this artwork.

## Data provenance

The input is **`../data/consolidated_trainings.json`**, the result of `join_strava_polar.py`. Its source selection, sport mapping, and local calendar dates are retained. No upstream scripts or data are modified, and no additional deduplication is performed.

`scripts/prepare_data.py` filters the date range and four sports, aggregates daily hours, reads the existing palette without importing its S3 code, and writes **`data/daily-activities.json`**. The derived file includes source hash, totals, and an explicit exclusion log. Rebuild with:

```sh
bun run data
```

The prepared artwork contains **1,965 activities**, **1,614 active days**, **1,684 daily sport circles**, and **3,126.955244 hours**. It excludes all **four individual rowing sessions longer than four hours**, the erroneous **23.4562847222-hour Polar cycling session on 7 January 2017**, and one zero-hour cycling entry (which has no drawable area). The rowing threshold is applied before daily aggregation: a day with multiple valid sessions can still total more than four hours. Swimming and Other are outside the requested sports.

The **19.9483333333-hour Amsterdam–Paris ride on 8 June 2019 is retained**. No general cycling-duration cap is applied. The first retained activity is **2 January 2016** and the last is **12 December 2025**; the matrix still extends through 31 December. No activity is fabricated for missing dates.

## Print and export

**Export A1 PDF** uses your installed Chrome in headless mode through `puppeteer-core`, with the current settings. It draws a **7016 × 9933 px canvas** (300 pixels per inch at A1), then places it on one **594 × 841 mm** PDF page with no margins, headers, footers, or controls. This is a high-resolution raster artwork inside a PDF, not a vector PDF. Export always includes all four sports, regardless of current highlighting.

Chrome is detected on macOS and common Linux paths; set `CHROME_PATH` for another installation. No browser download is required. The local server handles one PDF export at a time.

To export the default composition without opening the studio:

```sh
bun run export:pdf
```

To reproduce a saved composition:

```sh
bun run export:pdf --settings /path/to/movement-settings.json --output output/pdf/my-artwork.pdf
```

The CLI saves the PDF and a small PNG preview under `output/pdf/`. The default deliverable is `output/pdf/movement-2016-2025-A1.pdf`.

For printing, use **actual size / 100%** on A1, with scaling disabled. The PDF already includes the warm paper color. Ask the printer to use the supplied page dimensions and provide a color proof on the intended stock; this browser export is RGB, without a CMYK conversion, bleed, or PDF/X profile. Those can be prepared by the printer if needed.

**PNG** saves the same full-resolution artwork. Canvas PNG metadata can report 96 dpi even though the pixel dimensions are correct: place it at **594 × 841 mm** when printing. Prefer the PDF when physical page dimensions matter.

Browser **Print** is also supported: the canvas redraws at 300 dpi before printing, and `@page` declares A1. Choose A1/custom 594 × 841 mm paper, no margins, no headers/footers, and background graphics. The built-in export is more reproducible because it sets these explicitly. The static `dist/` build supports browser printing and PNG, while one-click PDF requires the Bun server.

## Check and build

```sh
bun run check
bun run test
bun run build
```

Tests cover every calendar date, source/derived totals and exclusions, preservation of the Amsterdam–Paris ride, square-root area scaling, exact ring tangency, fractional sector positions, diameter-based stacking, grid-height centering, settings migration, and palette application. Color tests check reference conversions, gamut fitting, seeded reproducibility, perceptual separation, and legend contrast across 180 generated palettes. On macOS, PDFKit can verify the one-page A1 size and render a preview without additional dependencies:

```sh
swift scripts/verify_pdf.swift output/pdf/movement-2016-2025-A1.pdf output/pdf/verified-preview.png
```

## References

The visual direction follows the request for a data-led composition with repetition, radial structure, translucent color, and quiet typography. Nadieh Bremer describes her custom data-art and D3 approach on [Visual Cinnamon](https://www.visualcinnamon.com/about/). The implementation is original and follows this project's specific calendar layout.

Export references: [Puppeteer PDF options](https://pptr.dev/api/puppeteer.pdfoptions) for explicit paper dimensions and background printing; [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) for PNG resolution metadata.

Blend-mode reference: [Canvas globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation).
