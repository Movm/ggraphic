# Vector export: SVG, vector PDF and sharper PPTX

Status: design, 2026-11-06. Built in `@ggraphic/editor`; the Grünerator picks it up with a version bump.

## Why

A Grünerator user asked for SVG. Looking at the exports as a whole, the gap is bigger than one format:

- The print PDF (`export/printPdf.ts`) is JPEG tiles at 300 dpi. Bleed, trim and crop marks are right and tested, but text is not selectable, edges are not crisp, and files are large.
- The slides PDF (`export/slidesPdf.ts`) is one PNG per slide.
- The PPTX export (`export/pptx/`) rasters every element PowerPoint cannot draw natively — path shapes, styled or flipped shapes, icons, illustrations, frames, unmapped charts — as PNG, so they go soft when zoomed or printed.
- There is no SVG.

Goal: every export that can be vector is vector, looks exactly like the canvas, and opens cleanly in the tools people use (Illustrator, Inkscape, Affinity, Acrobat, PowerPoint, Keynote, print-shop preflight).

## Decisions (made by the maintainer)

1. **Approach: record the drawing.** SVG and PDF come from a recording of what Konva actually draws, not from a second interpretation of the page state. PPTX keeps its state model (`buildPptxModel`), because editable text boxes need the semantic model, but uses the recording to replace PNG raster requests with vector images.
2. **Print colour: brand colours in CMYK.** Vector fills, strokes and text whose colour matches a brand colour with a defined CMYK value are written as DeviceCMYK with exactly those values. Everything else, photos included, stays RGB. Not PDF/X, no OutputIntent.
3. **SVG text: outlines by default, with a switch.** By default text becomes glyph outlines, so the SVG looks right everywhere. The download view has a switch, "Keep text editable", that writes real `<text>` with the font family name instead. Fonts are never embedded in an SVG.
4. **Where:** every format, with a sensible default per format (see "Download view").
5. **Raster PDF:** the vector PDF replaces it in the menu. The raster path stays in code as an internal fallback: if the vector export fails (for example a font file cannot be loaded), the export falls back to the raster PDF and tells the person.
6. **Chart text: the brand body font, on the canvas and in exports.**
   - Today the chart SVG is drawn as an image and cannot load web fonts, so its labels come out in the system sans.
   - The chart SVG gets the brand body font embedded (`@font-face` with a data URL in a `<style>` inside the chart SVG, loaded through the same font resolver).
   - Canvas and export then match, and both are on-brand.
   - This is a visible change to existing charts. It goes into the changeset and the render-gate goldens with that reason.
7. **Grünerator CMYK values** come from the official corporate design manuals of Die Grünen (DE) and Die Grünen (AT). Every number in the packs carries its source, and the maintainer checks them before the Grünerator PR merges.

## Approaches considered

| #   | Approach                                                                          | Verdict                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Generalise the PPTX state model into one export model with SVG/PDF writers        | Rejected. It is a second renderer: line wrapping, paths, gradients, notches, bubble tails, markers, glow would all be rebuilt and drift from the canvas. Every element kind, host kinds included, would need three mappings. |
| 2   | Walk the Konva node tree (Rect, Text, Path, Image …)                              | Rejected as the main path. Exact geometry, but `sceneFunc` shapes (shapes, frames, user images) are opaque, and it reads Konva internals such as `textArr`.                                                                  |
| 3   | **Record Canvas 2D calls** while Konva draws each element into a recording canvas | **Chosen.** Complete by construction, including custom `sceneFunc` and host kinds such as the Grünerator's Balken. Same output as the screen. The Canvas 2D model maps almost one-to-one onto PDF.                           |
| 4   | SVG only, PDF via headless Chromium on a server                                   | Fallback only. Very faithful, but ggraphic is a library: an embedder without a server would get no PDF.                                                                                                                      |
| 5   | Rebuild the renderer around a declarative scene shared by Konva and the exporters | Rejected for now. Cleanest long term, but means rewriting ~7,000 lines of primitives and their interaction code for an export feature.                                                                                       |

## Architecture

### 1. Scene recording (`export/scene/`)

`recordPageScene(stage, options) → ExportScene` records one mounted page stage. Every export already needs mounted stages (`CanvasEditorShell`: `buildPptx`, `printPages`).

- **Recording canvas.** This is a `Konva.SceneCanvas` subclass whose 2D context records calls into an intermediate representation (IR) instead of painting. Only the visible scene is recorded; the hit graph is not. Selection chrome is hidden the way `withSelectionChromeHidden` does it, and nodes named `EXPORT_HIDDEN_NAME` stay out as they do today.
- **Per element.** The recorder draws the background first, then each `name="canvas-item"` group in render order (`group.drawScene(recordingCanvas)`), so the IR keeps one entry per element with its `canvasItemId`. Anything drawn outside a canvas item, such as the stage surface rect, is recorded as page-level content in order.
- **IR, rough shape.** The builder settles the exact types.
  - `ExportScene { width, height, items: SceneItem[] }`, in page px.
  - Each `SceneItem` carries `elementId | null`, `label` (from `layerLabels`, for SVG `id` and `<title>` and for PDF structure if cheap), and `ops: SceneOp[]`.
  - `SceneOp` is one of:
    - `path`: commands moveTo, lineTo, bezier, quad, arc→bezier, rect, close; fill rule; fill and/or stroke paint (solid rgba, linear or radial gradient with stops); stroke width, cap, join, dash, miter.
    - `text`: string, glyph x positions, baseline y, font family, weight, style and size, fill and/or stroke paint.
    - `image`: a source that is either SVG markup or raster bytes with mime; source and destination rects.
    - `group`: opacity, clip path, children.
    - `raster`: a PNG island, with box and reason.
  - Every op carries its absolute 2×3 matrix and global alpha.
- **Konva's buffer canvases.** For fill+stroke+opacity shapes Konva paints via `_prepareIsolationCanvas` and then `drawImage`s the buffer. The recording canvas returns a nested recorder from that hook, and the following `drawImage` of that buffer becomes a `group` with the opacity. This depends on a Konva internal, so a guard test fails loudly if the hook stops being called (for example after a Konva update).
- **Text.** Konva draws text with `fillText`/`strokeText`. When `letterSpacing` is set, it draws per grapheme. The recorder merges consecutive glyph calls with the same style on one baseline into one `text` op with per-glyph x positions. Underline and strike-through are separate rect or line paths in Konva and stay paths.
- **Images.**
  - `drawImage` of an `HTMLImageElement` whose `src` is `data:image/svg+xml` becomes an `image` op with SVG markup. That is how icons, illustrations (incl. Kawaii) and charts reach the canvas, so they stay vector.
  - Other images keep their source bytes (fetched; a tainted or unloadable source → `raster` island from the stage, same as `rasterizeStageElement`).
  - `drawImage` of a canvas becomes a `raster` island: Konva filter caches (image adjustments), `cache()`d nodes.
- **What cannot be vector** becomes a `raster` island for exactly that element or op, at print resolution, with a reason. Examples: canvas filters, unsupported composite operations, shadows in PDF. In PDF, a shadow with blur is drawn as a raster island of the shadow alone under the vector content, so text stays text; in SVG it is an `feDropShadow` filter.
- **Patterns (grain).** `utils/grain.ts` fills with `createPattern(noiseCanvas, 'repeat')`. The recorder supports pattern paint with a tile image, repeat mode and pattern transform:
  - SVG: `<pattern>` with the tile embedded once.
  - PDF: a tiling pattern whose tile is the image XObject (with its alpha as SMask).
  - A pattern fill is **not** a raster island: the shapes under and over it stay vector. Only `repeat` is needed; other repeat modes raster that op and are reported.
- **Cached nodes.** `cache()` without filters (e.g. `applyPixelHitArea` on assets) is only for hit testing. While recording, such a node is drawn uncached:
  - `clearCache()` before its draw, re-cache with the same config after, in a `finally`.
  - Then its source, which may be an SVG asset, is recorded.
  - A cached node with `filters` stays a raster island ("image adjustments").
- **Image bytes.**
  - JPEG and PNG pass through unchanged, unless the JPEG carries an EXIF orientation other than 1.
  - WebP, GIF, AVIF, and JPEGs with an orientation are re-encoded via a canvas, which applies the orientation: opaque → JPEG at 0.92, with alpha → PNG.
  - SVG images that are not one of our own data-URL sources (uploads, asset URLs) are fetched and run through `sanitizeSvg` from `@ggraphic/schema` before they are inlined anywhere. This is a trust boundary.
  - A source that cannot be fetched (CORS) is rastered from the stage. If that fails too (a tainted canvas), the element is missing: reported and shown in the notice, never silent.
- **Report.** Every recording returns `{ scene, report }`. `report.rasterIslands` lists `{ elementId, reason }`, and `report.unknownCalls` lists context calls the recorder does not model. An unknown call must never be silently dropped: the element becomes a raster island and the call is reported.

### 2. Fonts (`export/fonts/`)

SVG outlines and PDF embedding need the font files.

- **Resolver.** `resolveFontFile(family, weight, style) → Promise<Uint8Array | null>` tries, in order:
  1. A new optional host service `exportFonts.load(face)` (`hostServices.ts`).
  2. The brand pack's `fontFaces`.
  3. `@font-face` rules in same-origin stylesheets (`document.styleSheets`, CORS-safe only). Font aliases (`resolveFontFamily`) and `boldFamilies` are applied first.
- **Unicode ranges.** A family can be split into several files by `unicode-range` (Fontsource: latin, latin-ext, …), so the resolver works per code point:
  - `resolveFontFiles(face) → FontFileSet`, which yields the file covering a code point.
  - Writers split a `text` op into runs per file.
  - A code point no file covers is a **missing glyph**; on screen the browser filled it from a system font. In SVG outline mode that run is written as `<text>`. In the PDF that text op becomes a raster island. Both are reported.
- **Embedding rights.** The resolver reads OS/2 `fsType`:
  - Restricted licence (bit 1, value `0x0002`): never embedded in a PDF. Its text is written as vector glyph outlines instead, so it stays crisp but is not selectable, and this is reported.
  - Bitmap-only (`0x0200`): rastered.
  - Outlines in SVG are allowed for every font, since no font program is distributed.
- **Parser:** `@pdf-lib/fontkit`, a new dependency. It is the fontkit `pdf-lib` is built for, and it reads TTF, OTF, WOFF and WOFF2. It is loaded with a dynamic `import()` like `pdf-lib` and `pptxgenjs`.
- **SVG outlines:** glyph paths from fontkit's layout (`font.layout(text).glyphs` with advances), placed at the recorded glyph positions, so kerning matches the canvas.
- **PDF:** fonts are embedded as subsets (`pdf-lib` `embedFont(bytes, { subset: true })`), and text is drawn as real text, so it is selectable and searchable.
  - **WOFF2 needs a repair.** fontkit never rebuilds the `glyf` and `loca` tables of a WOFF2 file, so the subset `pdf-lib` cuts from it has empty or damaged glyphs (the PDF is valid and the text invisible), and a composite glyph (`"`, `:`, accented capitals) makes `save()` hang in a timer. `export/pdf/pdfFontkit.ts` is the fontkit given to `registerFontkit`: for a WOFF2 font it builds the subset from the glyph paths. Measured against Instrument Sans (Fontsource WOFF2); the writer test reads every glyph back.
  - A font that forbids subsetting (`fsType` bit 8) is embedded whole, as it is when it is a TrueType or OpenType file; a WOFF or WOFF2 file cannot go into a PDF as it is, so it goes through the subsetter with every glyph.
- **No font file:**
  - The SVG uses `<text>` for that run, even in outline mode, and the report says so.
  - The PDF draws that text item as a raster island and reports it.
  - If more than the text of one element is affected, the PDF falls back to the raster PDF as a whole (decision 5).

### 3. SVG writer (`export/svg/writeSvg.ts`)

`writeSvg(scene, { text: 'outlines' | 'editable', fonts }) → string`.

- Root `<svg>`: `viewBox` in page px, `width`/`height` in px.
- One `<g id="…" data-element-id="…">` per item, with `<title>` = layer label. These become layers in Illustrator and Inkscape.
- Matrices go to `transform="matrix(…)"`, collapsed to translate/rotate where exact.
- Gradients go to `<defs>`. Clips become `<clipPath>`. Opacity sits on `<g>`.
- SVG sources are inlined as nested `<svg>`, with every `id` and reference prefixed per instance so two icons never collide.
- Raster images are embedded as data URLs.
- Numbers are rounded to 3 decimals. Output is deterministic and therefore golden-testable.
- Multi-page documents get one SVG per page in a ZIP (`zipPageImages` generalised to named files).

### 4. PDF writer (`export/pdf/writePdf.ts`)

`writePdf(pages: ExportScene[], { mode: 'digital' | 'slides' | 'print', print?: PrintCanvasFormat, cmyk?: CmykMap, fonts }) → { bytes, report }`, using `pdf-lib`.

- **Content.** The page content is written as raw operators from the IR:
  - paths `m l c h re`, fill and stroke `f f* S B`
  - `cm` for matrices, `q`/`Q`
  - clip `W n`
  - ExtGState for alpha
  - shading dictionaries for linear and radial gradients
  - image XObjects (JPEG stays JPEG, everything else PNG via `pdf-lib`)
  - text `BT Tf Td TJ ET` with per-glyph positioning
- **SVG sources.** Markup from icons, illustrations and charts is converted to IR ops by a small SVG interpreter (`export/svg/svgToScene.ts`). It handles path, rect, circle, ellipse, line, polyline, polygon, g, use, transform, fill, stroke, opacity, linear/radial gradients and text. An unsupported construct rasters that one image and reports it. Chart text (Recharts writes `font-family="sans-serif"`) uses the document brand's body font.
- **Print mode.**
  - MediaBox, BleedBox and TrimBox, plus crop marks, come from the existing `pdfPageGeometry` and mark code in `printPdf.ts`, which stays the single place for that geometry.
  - The scene is placed on the bleed box, scaled from page px to pt.
  - `lowResolutionWarnings` keeps working.
- **Pictures inside a vector page.** The writer cannot draw a blurred shadow, a glyph no font covers, or an SVG `svgToScene` cannot convert. It asks its caller (`WritePdfOptions.rasterize(ops, box, pixelRatio)`, answered with `replayScene` on a canvas; `rebaseOps` moves the ops onto the box) and places the PNG. A blurred shadow is a picture of the shadow alone, under the op, which stays vector: the op is replayed far off the box with its shadow offset by as much, so only the shadow lands on it. A picture that cannot be made is a `missingElements` entry.
- **Slides mode:** page = `SLIDE_PDF_PAGE_PT`.
- **Digital mode:** page = format px at 72 dpi.
- **CMYK.**
  - New optional brand field `BrandPack.print?: { cmyk?: Readonly<Record<string, readonly [number, number, number, number]>> }`, keyed by `#rrggbb`, values in 0–100.
  - A solid paint whose RGB matches a key (case-insensitive, alpha kept separately) is written with `k`/`K` (DeviceCMYK); everything else stays `rg`/`RG`.
  - Gradient stops stay RGB.
  - Gradients whose stops are all mapped (e.g. brand ground `glow`) are written as DeviceCMYK shadings. Mixed gradients stay RGB.
  - `report.rgbBrandColors` lists every brand palette colour that left the PDF in RGB. That makes "a brand colour silently in RGB" visible and testable.
  - `brandDefault` gets no map. Packs without a map produce a pure RGB PDF.
  - The Grünerator packs get their values from the party's corporate design manual. The maintainer supplies them; they are not invented.
- **Fallback boundary, per document.** The whole PDF falls back to raster when:
  - vector writing throws, or does not finish within 60 s (a font fontkit cannot subset can fail inside a timer callback, where nothing catches it and `save()` never settles), or
  - font failures (`font-unavailable`, `bitmap-only-font`) affect the text of more than one element across the document (distinct page and element id).

  Other raster islands (filtered photos, PDF shadows, a missing glyph) are legitimate and never trigger the fallback. If the raster fallback fails too, the download fails with today's error message.

- **Fallback.** `exportPrintPdf` and the slides PDF try vector first. On failure they log, run the existing raster path, and return `report.fallback = { reason }`. The download view shows that as a notice.

### 5. PPTX: vector instead of PNG

In `writePptx`, a raster request is answered in one of two ways:

- **Vector image.** If the element's recording has no raster island, the element is written as an SVG image built from its scene item: the item's ops moved so its bounds (ink, stroke and shadow reach) start at the origin, written with text as outlines and a `viewBox` of the bounds. The picture sits at those bounds, unrotated, because the rotation is already in the ops, exactly where the PNG of the element would have sat.
- **PNG.** Otherwise it stays PNG: a raster op in the element, a text run no font file covers, an SVG picture with text of its own (a viewer would set it in a font the file does not carry), or a page that cannot be recorded.

`pptxgenjs` 4.0.1 writes `svgBlip` itself: `addImage({ data: 'data:image/svg+xml;base64,…' })` stores the SVG and a PNG preview that PowerPoint 2013 and other programs show. The preview is made by pptxgenjs (`createSvgPngPreview`: the SVG drawn on a canvas at its own size), so the SVG's `width`/`height` are set to twice the page px, the pixel ratio the PNG raster used; in node it is a placeholder. Each slide is recorded and resolved once, and only if one of its elements asks. Native text, shapes and charts are unchanged.

### 6. Download view (`components/TopBar/DownloadSection.tsx`)

Formats per canvas category, default first:

| Category                                | Formats                                                |
| --------------------------------------- | ------------------------------------------------------ |
| Print formats                           | **PDF (Druck)** vector · SVG · PNG                     |
| Slide decks                             | **PowerPoint** · PDF (vector) · SVG · PNG · JPG · WebP |
| Digital (sharepics, profile pictures …) | **PNG** · JPG · WebP · PDF · SVG                       |

- SVG shows the switch "Text bearbeitbar lassen" ("Keep text editable"), off by default.
- SVG honours the existing transparent-background switch (digital formats); PDF always includes the background. Neither shows the scale option.
- A print-format SVG covers the whole canvas (trim + bleed), like the PNG export.
- Multi-page documents: SVG asks current page vs all pages (ZIP), like the raster formats. PDF always contains all pages.
- A notice under the button lists raster islands in plain words ("2 Elemente als Bild eingebettet: Foto mit Filter, Schatten") and a fallback if one happened.
- Strings go through `i18n/catalogue.ts`.
- Host-facing callbacks follow the existing `printExport`/`slideDeck` props pattern: new `vectorExport` props provided by `CanvasEditorShell`. The `exportApi` imperative handle gets two methods for embedders without the shell:
  - `exportSvg({ pages: 'current' | 'all', text: 'outlines' | 'editable', transparent?: boolean }) → Promise<{ blob: Blob; filename: string; report: ExportReport }>`. With `'all'` and more than one page, `blob` is a ZIP.
  - `exportPdf() → Promise<{ blob: Blob; filename: string; report: ExportReport }>`, in the mode that fits the format.

### 7. Public surface

- `@ggraphic/editor/export` adds: `recordPageScene`, `writeSvg`, `writePdf`, the IR types, `resolveFontFile`, and the report type.
- `@ggraphic/core` adds the optional `BrandPack.print` field.
- One changeset per published package (pre mode `alpha`).

## Testing

"Thoroughly tested" means each layer has its own proof, and the proofs are not the same test repeated.

1. **Recorder unit tests** (vitest, node lane with `@napi-rs/canvas`): each Canvas 2D call maps to the right op (paths, arcs, transforms, save/restore, clip, alpha, gradients, text merge, drawImage variants, buffer-canvas group), and an unknown call produces a raster island and a report entry.
2. **Replay differential** (vitest, `@napi-rs/canvas`):
   - A test replay writes the IR back onto a real canvas, and the result must match Konva's own drawing of the same page, pixel for pixel within a tiny tolerance.
   - It runs for every template in `@ggraphic/templates-open` on the default brand and every format.
   - It also runs for a fixture page with every element kind: shapes of every type incl. flipped, gradient and corner radius; rich text with markers, highlights and letter spacing; badges; frames; user image with crop and notch; chart; icon; illustration; asset (cached for hit testing); grain pattern; shadows; opacity groups.
   - This proves the recorder misses nothing.
   - It runs in the existing jsdom + `@napi-rs/canvas` lane, with the shims `stageExportAsync.vitest.tsx` uses and the template fonts registered in napi.
   - If that lane proves too brittle for whole templates, the template sweep moves into the Playwright gate (stage 3), and the fixture page stays in vitest.
3. **Guard test** for the Konva buffer-canvas hook: an opacity+fill+stroke shape must produce a `group` op, never a raster island.
4. **SVG writer:**
   - Deterministic goldens for the fixture page in both text modes.
   - Structural assertions: one `<g>` per element, unique ids across inlined sources, no raster `<image>` for templates without photos or filters, no `<text>` in outline mode when fonts resolve.
5. **PDF writer** (parse the output back with `pdf-lib`; extract text with `pdfjs-dist`, a new dev dependency):
   - box values equal `pdfPageGeometry`
   - fonts embedded as subsets (`ABCDEF+` prefix)
   - extracted text equals the slot texts
   - DeviceCMYK operators exactly for mapped colours and only for them
   - no raster XObject for vector-only templates
   - the raster fallback triggers on an unloadable font, and the report says so
   - file size of the fixture deck under a budget well below today's raster PDF
6. **Font resolver:** host service first, then brand faces, then CSS rules; aliases applied; WOFF2 subset embedding works.
7. **PPTX:** raster requests for path shapes, icons, illustrations and frames become SVG images with PNG fallback (`svgBlip` in the slide XML). The existing `buildPptxModel` tests stay green.
8. **Render gate, new stage 3** (Playwright Docker image, CI only, never on a developer machine):
   - every template × default brand × declared format
   - the Konva PNG against the SVG rendered in Chromium (both text modes) and against the PDF rendered with pdf.js in the same page
   - a pixel threshold, and diff images on failure
   - goldens come from the Docker image
9. **Grünerator** (after the release, in the bump PR):
   - a Balken golden for SVG, PDF and PPTX (`balkenKind.golden.vitest.ts`)
   - Grüne fonts resolve through the web app's CSS `@font-face`
   - the CMYK maps of both packs produce DeviceCMYK for Tanne, Klee and Sand
   - the existing pixel differential for sharepics is unchanged

## Delivery

ggraphic pull requests, in order, each green on its own:

1. Spike (throwaway, not merged) to confirm three assumptions:
   - the buffer-canvas hook can be intercepted
   - `pdf-lib` + `@pdf-lib/fontkit` subset-embed a WOFF2 font
   - a `pptxgenjs` SVG image with PNG fallback opens in LibreOffice

   A failed assumption comes back to the maintainer before PR 2.

2. Scene recorder, IR, replay differential, guard test.
3. Fonts resolver + SVG writer + SVG in the download view.
   3b. Chart SVGs carry the brand body font (canvas change, decision 6), with a test that the chart image's `<style>` holds a data-URL `@font-face` for the resolved file.
4. PDF writer (digital, slides, print, CMYK, fallback) + download view; `BrandPack.print` in core.
5. PPTX vector images.
6. Render gate stage 3.

Then the changesets release (automated "Version Packages (alpha)" PR). Then a Grünerator PR that:

- bumps `@ggraphic/*`, with the `minimumReleaseAgeExclude` entries for the fresh versions
- adds the CMYK maps to the Grüne packs
- adds the tests from item 9

## Non-goals

- PDF/X conformance, OutputIntent and ICC profiles, CMYK conversion of photos.
- Fonts embedded in SVG.
- Server-side rendering.
- SVG import.
- Animated export (GIF/MP4).
- Changing what PPTX does natively.

## Anti-goals (failure even if it "works")

- An SVG or PDF that differs visibly from the canvas.
- An element silently missing from an export.
- A `.svg` that is a PNG in disguise.
- An export that rasters the whole page while claiming to be vector.
- A brand colour that silently comes out of the PDF in RGB although the pack defines CMYK for it.

## Left to the builder

- Exact IR types and module split.
- Arc-to-bezier precision.
- Number rounding.
- Raster island resolution (print: the format's `exportDpi`; otherwise 2×).
- How the PDF writer handles nested SVG `<use>` and patterns: support, or raster with a report.
- The render-gate thresholds, which must be justified in the PR.
- The notice wording.
