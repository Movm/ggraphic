---
'@ggraphic/core': minor
'@ggraphic/editor': minor
---

`BrandFonts.cuts` declares the real cuts of families the host loads itself: `{ bold, italic, boldItalic }` per family. Bold and italic buttons follow it ahead of the built-in table, and a bold italic run keeps `bold italic` where `boldItalic` is set (for example a Black Italic). Fraunces stays built in. Exported page files, slider shares and ZIP entries now take their page word from the catalogue (`export.pageFile`): `seite-1.png` in German, `page-1.png` in English.
