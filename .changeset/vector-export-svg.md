---
'@ggraphic/editor': minor
---

SVG download: every page can be downloaded as a real vector SVG, recorded from what Konva draws. Text is written as outlines by default, or as editable `<text>` with the switch "Text bearbeitbar lassen". Icons, illustrations and charts stay vector, and only what has no vector form (filtered photos, unknown effects) is embedded as an image and listed in a notice. New: `CanvasEditorExportApi.exportSvg`, the optional host service `exportFonts`, and `@ggraphic/editor/export` exports the recorder (`recordPageScene`, `resolveScene`), `writeSvg` and `resolveFontFiles`.

Visible change: chart labels now draw in the brand body font on the canvas too (the font is embedded in the chart SVG), so canvas and export match. Chart colours that are not plain colours are replaced by the brand chart colour.
