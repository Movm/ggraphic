---
'@ggraphic/editor': minor
'@ggraphic/schema': minor
---

**Breaking (alpha):** the export maps are closed (D2f).

- **`@ggraphic/editor`:** the `./*` wildcard is gone. The published entries are the facades (`@ggraphic/editor/embed`, `/host`, `/shell`, `/page`, `/config`, `/services`, `/text`, … — `api-report.md` lists every name), the stylesheets, the illustration sets and `@ggraphic/editor/internal/*`. A deep path such as `@ggraphic/editor/utils/snapping` now fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Import the name from its facade, or from `@ggraphic/editor/internal/utils/snapping`, which reaches the same file with no semver promise.
- **`@ggraphic/schema`:** only the root is published. Every name a subpath had is exported from `@ggraphic/schema`.
- **Module augmentation:** augment the facades (`declare module '@ggraphic/editor/host'`, `'@ggraphic/editor/services'`, `'@ggraphic/editor/kinds'`); a `declare module` on a removed deep path no longer reaches the editor's interface.
- **Stylesheets type-check under TypeScript 6** without a `*.css` declaration (#137): every stylesheet entry, with and without `.css`, has a `types` stub.
- **Removed Grünerator-specific code**, which hosts keep in their own code: `composer/steckbriefLayout`, the Störer fitting in `composer/textFit` (`fitStoererText`, `STOERER_*`; the generic `wrapWords`, `balancedWrap`, `largestSizeWordsFit` stay in `@ggraphic/editor/text`), `brand/composerBrand`, and the deprecated aliases `buildSharepicText`, `StudioGalleryGrid` and `VORLAGE_DRAG_TYPE`, `isVorlageDrag`, `readVorlageDrag`. Their neutral names are not public yet: `buildCanvasText` (`@ggraphic/editor/internal/configs/buildCanvasText`), `AssetGalleryGrid` (`…/internal/sidebar/sections/AssetGallery`) and `TEMPLATE_DRAG_TYPE`, `isTemplateDrag`, `readTemplateDrag` (`…/internal/utils/mediaDrop`).
