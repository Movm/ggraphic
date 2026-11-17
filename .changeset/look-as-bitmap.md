---
'@ggraphic/editor': minor
---

A photo's look (adjustments, background tint) is now a bitmap made once per look instead of Konva filters run over the node's cache. Panning, zooming and dragging the crop frame of a filtered photo (background or framed) no longer filter again; a slider drag shows a small bitmap and builds the full one once the look rests. Flip and vignette are drawn over the frame; the vignette darkens only the photo's own pixels. A filtered photo now exports as an image of its bitmap instead of a raster island. Removed `cacheFiltered`, `cropGhostSource`, `recacheNextFrame` and `straightSceneFunc` (no consumers).
