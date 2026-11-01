---
'@ggraphic/editor': minor
---

`<GgraphicEditor>` takes an `exportApiRef`: once the editor has loaded it receives `CanvasEditorExportApi`, so a host can render the active page or every page as PNG, export the deck as .pptx and read the pages from its own UI. `CanvasEditorExportApi` is exported from `@ggraphic/editor/embed`. The embedding skill has a new Export section.
