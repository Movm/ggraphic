---
'@ggraphic/schema': minor
'@ggraphic/editor': patch
---

Auto-fit measures a bold word in bold. Words in `**bold**` runs were measured in the regular face, so a bold word that only fit in regular weight ran past the edge of its box. `SlotFit` gets an optional `widestWord` for callers that know the widest word better than `measureAt`, as `countLines` already does for the line count.
