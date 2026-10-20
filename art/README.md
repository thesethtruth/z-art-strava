# Movement · 2016–2025

A minimal A1 portrait artwork, rendered with HTML Canvas and D3. Everything runs locally in this folder. No framework, remote fonts, or external data requests.

## Open the studio

```sh
cd art
bun install
bun run dev
```

Open http://127.0.0.1:3000. Controls are organized into **Layout**, **Color** (including opacity and blending), and **Grid** tabs. Layout contains **Seven day** and **Spring cluster** variants. Choose a palette preset, generate a palette, or edit the colors individually. Adjust circle sizes, the base radius, mixed-sport spreading or stacking, opacity, grid width and height, and blending. Changes persist in this browser. **Export settings** downloads a JSON file named for the active mode; **Import settings** restores it. The file explicitly includes `mode`, a `spring` block with all seven simulation parameters (including the arrangement seed), a `weekday` block, and the shared color, size, and grid settings. Both layouts’ controls are retained. Older settings retain their colors and radius: `dayRadius` migrates to `baseRadius`, `gridSize` remains width only, and removed duration-based positioning and millimeter offsets are ignored.

Click a sport name to highlight it. Enable **Inspect weeks** and move over the canvas to read the week in the sidebar. **Preview** hides the studio controls and removes highlighting; Escape returns to editing. Neither highlights nor studio controls appear in exports.

## Drawing and dates

- The confirmed date range is **1 January 2016 through 31 December 2025**, inclusive: ten calendar-year columns, left to right.
- There are 53 rows of Monday-start weeks, top to bottom. Partial weeks stay in their calendar-year column. No ISO week-year reassignment or discarded December dates.
- Every year/week intersection has a tiny muted gray center, including empty weeks. The default grid spans **470 × 769 mm** on 594 × 841 mm paper: the first week is 36 mm from the top, the last is at 805 mm, leaving equal 36 mm top and bottom margins. Week spacing at full height is approximately **14.79 mm**. **Grid height** ranges from **360 to 769 mm**, centered on the paper; all 53 rows remain present. Width and height change the distances between week centers without changing circle sizes. In Spring cluster, the layout also settles again to account for collisions at the new spacing.
- Monday is at 12 o'clock. The seven days progress clockwise around each week center. There are no visible day centers or connecting lines.
- Each circle aggregates **all recorded hours of one sport on one local calendar day**. Circle area is proportional to hours: `radius = sizeAtOneHour × sqrt(hours)`. Durations are not capped or log-transformed.
- **Anchor circles to week**, enabled by default, puts each circle center at `baseRadius + circleRadius` along its weekday direction. Its inner edge therefore touches an invisible ring of radius `baseRadius`. At base radius zero, the circles touch the week point itself. Turning anchoring off puts circle centers at the base radius instead. Circle area continues to encode hours in both cases.
- **Mixed-sport spread** is a fraction from **0 to 1** of the day's `2π/7` sector. Activities are distributed evenly from `−fraction/2` to `+fraction/2` around that weekday's center line, in stable sport order. At 0.80, two activities use the −40% and +40% ends; three use both ends and the middle. A single activity always stays on the center line.
- **Stack mixed sport** puts the largest circle closest to the week, with smaller circles outward on the same weekday line. Its first circle follows the anchoring toggle. The spread slider is replaced by **Stack overlap**, from **0 to 0.5**. For each subsequent circle, `distance = previousDistance + previousRadius + radius − overlap × 2 × radius`. At zero they touch; at 0.5 the current circle's center lies on the previous circle's outer edge. Only the new circle's own diameter determines the overlap. Single-activity days are unaffected by spreading or stacking.
- Large circles are painted first so smaller ones remain visible. The default uses **0.7 opacity**, with natural overlaps. Neither the base ring nor the weekday direction lines are drawn on the artwork.
- The original sport palette comes directly from `plotfunctions.py`: rowing `#4CC9F0`, weight training `#60A5FA`, cycling `#5FE3C3`, running `#818CF8`. The initial paper is warm ivory `#FBF4EB`.
- The artwork text is limited to the sport legend and optional volume labels. All configuration and date inspection stay outside the paper.

Defaults, control bounds, validation, and the versioned settings-file format live in `src/settings.ts`.

### Legend placement

The **Grid** tab also contains **Legend placement**. Choose a page edge (top, bottom, left, or right), a position along that edge, and horizontal or vertical orientation. Vertical text can face left (read upward) or right (read downward). **Vertical alignment** always offers Top, Middle, and Bottom relative to the legend’s orientation. Its axis rotates with the legend, including its facing direction. Color and volume sections placed below or beside each other are measured and aligned as one combined container in the space between the grid and paper edge. **Legend padding** applies only perpendicular to the chosen page edge: X padding for left/right edges, Y padding for top/bottom edges. It insets both sides of that margin without changing the endpoints along the grid, regardless of text orientation. Font size is in millimeters on the printed artwork, and color dots scale proportionally. The grid keeps equal opposing margins. Defaults place the legend in the middle of the bottom margin with 2 mm padding.

Enable **Volume size legend** for outline circles at the same area-per-hour scale as the activity bubbles. Automatic values use three successive rounded 1–2–5 intervals ending at or above the largest daily sport volume (currently 5, 10, and 20 hours). A manual list accepts up to six distinct values from above zero through 100 hours. Position it below or next to the color legend, or at the opposite end of the same margin when aligned to an end. Opposite placement returns to Below when the color legend is centered. Volume circles retain their actual artwork sizes when the font changes. Labels wrap where space is limited; a studio hint indicates when the margin is too small, so it can be enlarged without misrepresenting volume.

Grid bounds are shared through `src/grid.ts`; legend layout, scales, and drawing live in `src/legend.ts`. All legend settings persist and apply to preview, PNG, PDF, and settings export/import.

## Spring cluster layout

Choose **Layout → Spring cluster** to gather each week's daily sport circles around its center with free, seeded angles instead of weekday directions. The calendar grid, duration-to-area mapping, palettes, and print style remain the same. Seven day remains the default for older settings; its anchoring, spreading, and stacking settings are preserved when switching variants.

The simulation lives in `src/spring-layout.ts`, alongside the independent seven-day placement in `src/weekday-layout.ts`. `src/activity-data.ts` owns calendar/data types and `src/artwork.ts` composes and draws the selected layout. The layout uses D3's existing [position forces](https://d3js.org/d3-force/position), [soft collision force](https://d3js.org/d3-force/collide), and [velocity damping](https://d3js.org/d3-force/simulation), inspired by the [D3 clustered bubbles example](https://observablehq.com/@d3/clustered-bubbles). All active weeks share one simulation for 220 steps and are then drawn as a still composition. Each bubble keeps its own week center as its spring anchor, while collision handling includes nearby bubbles from other weeks and year columns. The spring force is purely radial: there is no preferred angle or angular restoring force, so neighbors can turn and reshape clusters into open space. Calendar centers stay fixed. No new dependency is needed.

- **Spring strength** attaches each bubble center to its week center with a zero-rest-length spring: the pull grows with displacement (`F = −k × displacement`). Higher values produce tighter clusters. There is no inner ring or minimum distance; a lone bubble is centered exactly on its week.
- **Collision pressure** pushes crowded circles apart both within and between weekly clusters. Zero disables these interactions. Grid width and height now affect the clusters’ shapes as well as their spacing, because changing the spacing changes which bubbles collide.
- **Allowed overlap** shrinks the collision radius by that fraction, while leaving painted circle sizes unchanged. This is an artistic spacing control, not an exact overlap guarantee.
- **Maximum center distance** bounds each bubble center’s distance from the week center, in millimeters. The painted radius is unchanged. At zero, all bubble centers coincide.
- **Size dominance** controls how strongly bubble area affects the spring. At zero, springs have equal strength. Increasing it gives larger bubbles a stronger relative pull toward the center, forming a dominant core with smaller bubbles outside. Collision handling also displaces larger bubbles less. This encourages a size ordering without imposing fixed radial layers. A small minimum spring strength keeps tiny activities attached at full dominance.
- **Damping** controls how quickly velocity dissipates during settling.
- **Reshuffle arrangement** changes the saved seed. Angles vary by week, but the same settings reproduce the same composition in the preview, PNG, and PDF.

Layout geometry is cached so color edits and inspection do not rerun the simulation. Circle size is shared by both variants. Inner ring radius, anchoring, spreading, and stacking apply only to Seven day and retain their values when switching. Settings files include these under `weekday`; older files with a top-level `baseRadius` still import correctly. Existing spring settings now use the center-attraction model, and `outerRadius` is interpreted as a maximum center distance.

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

**Color → Between-week overlaps → Use overlap colors** enables a secondary color and blend mode for each sport. Only the actual intersections of bubbles from different weeks receive this treatment. The week with more total activity hours supplies the touching bubble’s sport color and blend mode; equal totals favor the earlier week. At three-way intersections, the strongest week takes precedence without accumulating earlier tints. Within the winning week, larger daily bubbles take precedence. The shared opacity applies to the overlap treatment. These settings persist and export with both layout modes; older files default to the treatment being off. Palette presets and the randomizer preserve these independently chosen secondary colors. Geometry, ownership, and rendering live in `src/overlap.ts`.

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

**Export A1 PDF** uses your installed Chrome in headless mode through `puppeteer-core`, with the current settings. The **Print bleed · 3 mm** toggle is on by default, including for older saved settings. It draws a **7087 × 10004 px canvas** at 300 dpi on a **600 × 847 mm** page, extending the background 3 mm beyond every edge without resizing the composition. The PDF embeds an exact **594 × 841 mm A1 TrimBox**, inset 3 mm, and a **600 × 847 mm BleedBox/MediaBox** so the printer knows where to cut. With bleed off, the canvas is **7016 × 9933 px** and all PDF boxes are A1. No headers, footers, controls, or visible crop marks are added; the printer can generate cutting marks from the TrimBox. This is a high-resolution raster artwork inside a PDF, not a vector PDF. Export always includes all four sports, regardless of current highlighting.

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

For printing, use **actual size / 100%**, with scaling disabled. With bleed enabled, print on stock larger than A1 and trim to the embedded A1 boundary. The PDF already includes the warm paper color. Ask the printer to use the supplied page dimensions and provide a color proof on the intended stock; this browser export is RGB, without a CMYK conversion or PDF/X profile. Those can be prepared by the printer if needed.

**PNG** saves the same full-resolution artwork. Canvas PNG metadata can report 96 dpi even though the pixel dimensions are correct: place it at **600 × 847 mm** with bleed on or **594 × 841 mm** with bleed off. PNG does not carry PDF trim boundaries. Prefer the PDF when physical page dimensions matter.

Browser **Print** is also supported: the canvas redraws at 300 dpi before printing, and `@page` declares the selected dimensions. Choose custom 600 × 847 mm paper with bleed on, or A1 594 × 841 mm with bleed off, no margins, no headers/footers, and background graphics. The built-in PDF export also embeds the trim and bleed boxes; browser Print does not guarantee those boundaries. The static `dist/` build supports browser printing and PNG, while one-click PDF requires the Bun server.

## Check and build

```sh
bun run check
bun run test
bun run build
```

Tests cover every calendar date, source/derived totals and exclusions, preservation of the Amsterdam–Paris ride, square-root area scaling, exact ring tangency, fractional sector positions, diameter-based stacking, grid-height centering, settings migration, and palette application. Spring tests cover deterministic geometry, calendar membership, duration areas, center-distance bounds, centered single bubbles, collision-driven outward movement, size dominance, reduced overlap and free reorientation between neighboring clusters, and settings round trips. Color tests check reference conversions, gamut fitting, seeded reproducibility, perceptual separation, and legend contrast across 180 generated palettes. On macOS, PDFKit can verify the one-page A1 size and render a preview without additional dependencies:

```sh
swift scripts/verify_pdf.swift output/pdf/movement-2016-2025-A1.pdf output/pdf/verified-preview.png
```

## References

The visual direction follows the request for a data-led composition with repetition, radial structure, translucent color, and quiet typography. Nadieh Bremer describes her custom data-art and D3 approach on [Visual Cinnamon](https://www.visualcinnamon.com/about/). The implementation is original and follows this project's specific calendar layout.

Export references: [Puppeteer PDF options](https://pptr.dev/api/puppeteer.pdfoptions) for explicit paper dimensions and background printing; [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) for PNG resolution metadata.

Blend-mode reference: [Canvas globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation).

Print sizing references: [A1 dimensions](https://www.helloprint.com/en-ie/posters), [Adobe’s standard 3 mm bleed guidance](https://www.adobe.com/learn/indesign/web/set-print-bleed?locale=en). Individual print providers may specify a different bleed.
