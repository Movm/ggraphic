---
'@ggraphic/editor': patch
---

`YDOC_KEYS`, `posBetween` and `sameStateValue` now come from `@ggraphic/core/ydoc`; the editor's `collab/ydocKeys` and `collab/pagesDoc` modules (reachable as `@ggraphic/editor/internal/collab/…`) re-export them, so every import keeps working. No behaviour change.
