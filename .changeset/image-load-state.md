---
'@ggraphic/editor': minor
---

`GenericCanvasRef.imageLoadState()` returns how many image elements are still loading (`pending`) and how many failed to load (`failed`). A capture is complete only when both are 0. `imagesSettled()` is also true after a failed load, so a host could not tell a complete capture from one without its photo.

`GenericCanvasRef.retryFailedImages()` loads every failed image element again and returns how many. They count as pending at once. Before, a failed image stayed failed: `use-image` loads again only for a new url.

**Breaking for direct importers of `utils/pendingImages`** (the deep path under the `./*` export): `PendingImagesContext` now holds `ImageLoads` (`{ pending, failed }`) instead of one `Set<string>`, and the module adds `ImageRetryContext` and `useImageRetry`. The public entries are unchanged.
