---
'@ggraphic/core': minor
---

Brand binding follow-ups: font bindings follow only the first family of a stack and keep its
fallbacks, `brandFingerprint` now includes `markers` (every stored brand stamp changes once, so
each project saves once on its next open), a logo swapped before its size was known carries
`pendingFit` and is fitted once the size is known, and `resolveScheme` looks only at earlier
worlds.
