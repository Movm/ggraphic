---
'@ggraphic/core': minor
'@ggraphic/editor': minor
---

Vector export follow-ups. `defineBrand` takes `print.cmyk` and validates it. A variable TTF is exported at the requested weight; a variable WOFF/WOFF2 or CFF2 font that cannot be set is listed in the new `ExportReport.defaultInstanceFonts`. A regular cut that stands in for a bold is emboldened like the canvas draws it. The soft hyphen no longer moves the PDF pen. `ExportReport.fallback` is now `{ kind: 'fonts' | 'timeout' | 'error', reason }`, and the download notice names the actual reason; raster islands no longer count against the 60 s timeout. Raster islands above 16.7 MP are scaled down and listed in `ExportReport.reducedRasters`. SVG shadows are written as filter primitives instead of `feDropShadow`. An image without an element id is rasterised instead of reported missing. SVG assets from the host catalogue are exported as trusted, so hosts must not list user uploads there. `isSafeColor` accepts `oklch()`, `lab()`, `color-mix()` and angle units. The text baseline falls back to measured ascents in engines without `alphabeticBaseline`.
