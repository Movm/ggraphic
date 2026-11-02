---
'@ggraphic/editor': patch
---

Undo in a collaborative session no longer reverts other people's edits. An edit that arrives from another client is written into this client's undo history, so undo and redo only revert this client's own steps. They are patched per element and property, so an own change to another element in the same collection still undoes.
