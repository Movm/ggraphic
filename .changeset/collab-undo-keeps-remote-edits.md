---
'@ggraphic/editor': patch
---

Undo in a collaborative session no longer reverts other people's edits. An edit that arrives from another client is written into this client's undo history, so undo and redo only revert this client's own steps. They are patched per element and property, so an own change to another element in the same collection still undoes.

The edit is measured from the value its writer started from, so an own step that lost a simultaneous write to the same key stays in the history and can be redone. Layer order and locked layers merge per id, so undo of a reorder still works after someone adds a layer. Undo of an own add removes the element even after someone else changed it. `useYjsPageStateSync` passes that starting value to `onRemoteState` as a second argument.
