---
'@ggraphic/core': minor
'@ggraphic/editor': minor
---

Two-colour duotone bound to the colour world. An image with `duotoneLow` and `duotoneHigh` maps the photo's luma between the two colours; the Duotone look binds them to the page world's `duo-low` / `duo-high`, so they follow a world change. The field names are stored, so they are fixed. Core adds `duotoneRamp`. A legacy tinted image and an image without the new fields render and export as before.
