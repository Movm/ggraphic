---
'@ggraphic/core': minor
'@ggraphic/editor': minor
---

Vector PDF: print, slide and digital PDFs are now written as vectors with real, selectable text and subset-embedded fonts, instead of page images. Print PDFs keep the bleed, trim and crop-mark geometry. If the vector export fails (a font that cannot be loaded for more than one element, a writer error, or a 60 s timeout), the download falls back to the image PDF and says so. Digital formats offer PDF too.

`BrandPack.print.cmyk` (optional, keys `#rrggbb`, values 0–100): vector fills, strokes and text in these colours, and gradients whose stops are all mapped, are written as DeviceCMYK with exactly these values. Everything else, photos included, stays RGB. The export report lists brand colours that left the PDF in RGB. New: `CanvasEditorExportApi.exportPdf`.

`@ggraphic/editor/export` also exports `exportPagesPdf` and the browser helpers the exports are wired with (`fetchImageBytes`, `reencodeImage`, `rasterizeOps`, `pngFromDataUrl`), and `PagePreview` takes an `onCanvas` callback that hands over the page's canvas handle, so a host can export the page it previews.
