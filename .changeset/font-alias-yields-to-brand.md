---
'@ggraphic/editor': minor
---

A replaced family that a registered brand pack declares is no longer aliased. If a pack names "PT Sans" or "Vollkorn" in `fonts` or ships it in `fontFaces`, the editor paints, measures, loads and exports that family as it is, because the host provides the font. Documents of hosts without such a pack still map the old families to Instrument Sans and Fraunces. New: `declaredFontFamilies()` in `brand/brandRegistry`.
