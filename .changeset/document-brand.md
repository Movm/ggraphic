---
'@ggraphic/editor': minor
---

The brand of a document comes from the document. `FullCanvasConfig.brand` names the pack of a page; the shell and `GenericCanvas` provide it to the page's tree (`useDocumentBrand()`, new export `@ggraphic/editor/brand/documentBrand`), so with several packs registered a page of the second pack no longer draws the first pack's markers, swatches, effect presets, shape and chart tiles or backdrop. The element factories (`createElementActions` and the single-kind ones) take the pack as a trailing `brand` parameter, as do `markerSwatches`, `defaultMarkerFill`, `defaultTextMarker`, `markerInkOn`, `createShape`, `createFrameInstance`, `createIllustration`, `createPillBadgeInstance`, `createCircleBadgeInstance`, `duotoneLook`, `imageLookPatch`, `photoPlaceholderLook`, `headlineFontStack` and the PPTX export (`BuildPptxModelOptions.brand`, `exportPptxDeck`), all defaulting to the active brand. `FullCanvasConfig.chartColors` stays as a deprecated fallback.

Breaking for hosts that call them: `colorName(hex, brand)` takes the pack, and `SHAPE_ITEMS` is now `shapeItems(brand)`.
