---
'@ggraphic/schema': minor
'@ggraphic/editor': patch
---

Picking the text colour of a whole text element now recolours the whole text. An accent in its own colour (`=={#RRGGBB}…==`) used to cover the picked `fill`, so a text whose accent spanned all of it could not be recoloured from the colour button at all, and the button showed `fill` while the page showed the accent colour. The pick now takes coloured accents off in the same step (free texts through `updateAdditionalText`, template text fields together with their colour key and their `on<Key>Change` callback); accents in the template's colour stay. The colour button shows the accent colour when one coloured accent covers the whole text. New in `@ggraphic/schema`: `withoutAccentColors(text)`. `ToolbarStateBridge` and `useFloatingModuleHandlers` take the host's `callbacks` as an optional option.
