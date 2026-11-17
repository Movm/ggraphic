---
'@ggraphic/editor': patch
---

`ConfigCanvas` and `StandaloneCanvas` take `previewCaptureRatio` and pass it to `GenericCanvas`. Until now only `preview` got through, so a host that renders offscreen through `StandaloneCanvas` could not say what it captures at: a filtered photo was cached at the offscreen stage's display scale, which settles only after the first effects. The same slide then rendered in two ways depending on whether the photo loaded before or after that scale was set, and a capture at 2x drew the photo from a cache at about 0.4.
