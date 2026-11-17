---
'@ggraphic/editor': minor
---

A failed upload no longer leaves an undo step that brings back its revoked `blob:` preview. The new `discardPlacedUserImage` action takes the placement out of the canvas and the history; wire the uploads section's `onRemovePlaced` to it. `createActions`' history argument gains `rewriteHistory`, and the store gains `rewriteHistory` too.
