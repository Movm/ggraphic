---
'@ggraphic/editor': patch
---

Two brand leaks in a document of another pack. The image tint fallback follows the document's brand: its accent when that is one of its tint swatches, else the first swatch, and the „Stärke" slider on an image without a tint now writes that colour, so the highlighted swatch and the painted colour are always one the picker offers. `registerEditorShell` takes an optional `documentAudience(pages)`: whose assets (logos, marks) the Elemente tab offers for the document, `null` for the user's locale. A host without it keeps following `userLocale`. It is separate from `deckLocale`, which only says whose fonts a deck carries.
