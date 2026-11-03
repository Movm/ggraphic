---
'@ggraphic/editor': patch
---

Two brand leaks in a document of another pack. The image tint fallback follows the document's brand: its accent when that is one of its tint swatches, else the first swatch, and the „Stärke" slider on an image without a tint now writes that colour, so the highlighted swatch and the painted colour are always one the picker offers. The Elemente tab offers the logos and marks of the document's audience, the host's `deckLocale(pages)` when it registered one, instead of the user's locale; a host without `deckLocale` keeps following `userLocale`.
