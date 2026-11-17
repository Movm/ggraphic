---
'@ggraphic/editor': minor
---

PowerPoint export: elements PowerPoint cannot draw natively (path shapes, icons, illustrations) now go into the slide as SVG pictures with a PNG preview instead of PNG only, so they stay sharp when zoomed or printed. An element that is not fully vector, carries a shadow, or whose SVG picture fails to render keeps the PNG path. `PagePreview` takes an optional `onCanvas` callback that hands over the page's canvas once it has settled.
