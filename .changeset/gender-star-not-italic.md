---
'@ggraphic/schema': patch
---

`parseInlineMarks` no longer reads a single `*` inside a word as an italic delimiter. The German gender star in `Bürger*innen, Eigentümer*innen und Mieter*innen` used to pair across the line, drop both stars and set the text between them in italics. A single `*` now behaves like `_`: it cannot open directly after a word character. `*kursiv*` at a word start and `**fett**` are unchanged, and `serializeInlineMarks` never relied on a mid-word `*`.
