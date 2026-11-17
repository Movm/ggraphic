---
'@ggraphic/editor': patch
'@ggraphic/schema': patch
---

Deleting an element through the factory actions (`createShapeActions` and the other `create*Actions` that remove an element) now also takes its id out of the page's `layerOrder`, as the page engine already did; before, the id stayed in the stored order (`$kind: order`) until a later reorder rewrote the list (#214). `updatePageStateById` no longer writes an empty collection, id list or record to a key of the format that the page does not hold: the canvas reports every collection after an undo, and each empty write created an empty structure (about 15 per page) that could win the key against a peer's first element of that kind. A key the page holds, and an empty value of a key the format does not classify, are written as before. `DOCUMENT_VERSIONING.md`: the measured growth of the deterministic position chain (#208), no change to the chain.
