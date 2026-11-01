---
'@ggraphic/editor': patch
---

A newly inserted element (icon, shape, chart, text, asset, ...) is now drawn on top of everything on the page and listed first in the layers, whatever its kind. Before, it was stacked among the untracked elements in per-kind order and could land under an older one.
