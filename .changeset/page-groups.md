---
'@ggraphic/editor': minor
---

Page groups: elements listed in the page's `groups` are selected together on click (a second click picks the member), "Ungroup" (Ctrl/Cmd+Shift+G) dissolves a group, and deleting members prunes the group in the same history step.

`PagePreview`: draws one page read-only through the editor's own canvas and reports a PNG once images and fonts have settled, for template previews.

The page picker's host component can now hand a page its whole new state with `onSelectTemplate(configId, state)`, also when the config stays the same (`setPageConfig(id, configId, state)`), so a gallery of templates can replace a page in place.

`LiftedBlock` can carry `blockRef` (which library block it is) and `brandScheme` (the colour world its bindings were resolved in); `GenericCanvasRef.insertBlock` hands the page's `brandScheme` to the block's `make` callback (`BlockPageSurface.brandScheme`), so a host can cut a block in the page's world.
