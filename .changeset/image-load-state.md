---
'@ggraphic/editor': minor
---

`GenericCanvasRef.imageLoadState()` returns how many image elements are still loading (`pending`) and how many failed to load (`failed`). A capture is complete only when both are 0. `imagesSettled()` is also true after a failed load, so a host could not tell a complete capture from one without its photo. The deep-path context `utils/pendingImages` now holds both sets (`ImageLoads`) instead of one `Set<string>`.
