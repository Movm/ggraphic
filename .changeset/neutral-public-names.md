---
'@ggraphic/editor': minor
---

Neutral names on the public surface. Every German or host-specific name reachable from the entry points is renamed; nothing here is persisted, so documents, template packs and stored state are unaffected.

- Types and functions (the old name stays as a `@deprecated` alias on its deep path until the next alpha):
  - `CanvasImpressumService`, `CanvasImpressumParts`, `CanvasImpressumLabels`, `CanvasImpressumLocale` → `CanvasImprintService`, `CanvasImprintParts`, `CanvasImprintLabels`, `CanvasImprintLocale`
  - `CanvasStudioAssetKind`, `CanvasStudioAssetScope`, `CanvasStudioAssetItem`, `CanvasStudioAssetsFilter`, `CanvasStudioAssetsState`, `UseCanvasStudioAssets`, `useNoStudioAssets` → `CanvasAssetLibraryKind`, `CanvasAssetLibraryScope`, `CanvasAssetLibraryItem`, `CanvasAssetLibraryFilter`, `CanvasAssetLibraryState`, `UseCanvasAssetLibrary`, `useNoAssetLibrary`
  - `VORLAGE_DRAG_TYPE`, `isVorlageDrag`, `readVorlageDrag` → `TEMPLATE_DRAG_TYPE`, `isTemplateDrag`, `readTemplateDrag`
  - `DiagrammeSection`, `FormenSection` → `ChartsSection`, `ShapesSection`; `StudioGalleryGrid` → `AssetGalleryGrid`; `buildSharepicText` → `buildCanvasText`
- Files (the old path re-exports the new one until the next alpha): `sidebar/sections/DiagrammeSection`, `FormenSection`, `RahmenSection`, `StudioGallery` → `ChartsSection`, `ShapesSection`, `FramesSection`, `AssetGallery`; `configs/buildSharepicText` → `configs/buildCanvasText`
- Props, fields and keys (no alias; rename them in the host):
  - `CanvasEditorServices.useStudioAssets` → `useAssetLibrary`
  - `CanvasPrintService.impressum` → `imprint`; `CanvasImprintParts.anschrift` → `address`
  - `CanvasPrintSpec.seiten` → `pageCount`; `CanvasPrintSpec.impressum` → `imprint`, with the values `'jede-seite' | 'erste-seite' | 'letzte-seite'` → `'every-page' | 'first-page' | 'last-page'`
  - `PageWrapperProps.onDropVorlage` → `onDropTemplate`
  - `ChatSectionContentProps.getSharepicText` → `getCanvasText`
  - `PendingAiSuggestion.source: 'vorlage'` → `'template'`
  - Messages: `sharepicText` → `canvasText`, `sidebar.studio` → `sidebar.assetLibrary`, `shell.downloadPanel.impressum*` → `shell.downloadPanel.imprint*`
- The template drag type is now `application/x-ggraphic-template` (it only ever lives in a drag's `DataTransfer`).
