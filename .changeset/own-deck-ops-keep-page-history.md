---
'@ggraphic/editor': patch
---

Undoing a deck op ("apply a template to all slides", `replaceDeck`) no longer takes the step before it along. Since 0.1.0-alpha.3, this client's own writes from another stack (a deck op, its undo by the page-level `Y.UndoManager`, a version lift) were written into every entry of the page's undo history, like another client's edit. The deck op and its undo overwrote the older entries, so after undoing the deck, undo no longer reverted the step before it. Such a write now reaches only the entries that still hold the value it replaced, and its undo restores every entry. Remote edits are handled as before (#160).

`useYjsPageStateSync` passes `own` (a local Yjs transaction) to `onRemoteState` as a third argument, and the store's `rebaseHistory` takes it as a third argument.
