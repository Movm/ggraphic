---
'@ggraphic/core': minor
'@ggraphic/editor': minor
'@ggraphic/schema': patch
'@ggraphic/studio': minor
'@ggraphic/studio-server': minor
---

Replace the bundled fonts PT Sans and Vollkorn with the open Instrument Sans and Fraunces. `brandDefault.fonts` now names Raleway, Instrument Sans and Fraunces. Saved designs and brand packs that still name "PT Sans" or "Vollkorn" keep rendering: the editor maps the old families to the new ones when loading, painting, measuring and exporting to PPTX (`FONT_FAMILY_ALIASES`); stored data is not rewritten.
