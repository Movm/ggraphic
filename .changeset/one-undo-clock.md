---
'@ggraphic/editor': minor
---

Undo and Redo walk the pages' element histories and the page-level history (page ops, a replaced
deck) in the order the steps were taken, from one clock (`utils/historyStamp`, a new export). Undo
used to prefer the active page's element history whenever it held any step, so a deck replacement
(a Vorlage for all slides) only reverted the active page and the next Undo took an older edit.
Breaking for hosts that call the hooks themselves: `usePageUndoRedoShortcuts` takes
`activePageStamps` and `pageOpStamps` instead of `activePageCanUndo`, `activePageCanRedo`,
`canUndoPageOp` and `canRedoPageOp`; `useToolbarHandlers` takes `pageOpStamps` instead of
`toolbarState`, `canUndoPageOp` and `canRedoPageOp`. `YjsPagesApi` and `usePageManager` gain
`pageOpStamps` (`canUndoPageOp` and `canRedoPageOp` stay, for the buttons), `GenericCanvasRef`
gains `historyStamps`, and `useCanvasUndoRedo` and `useCanvasHistorySetup` return
`flushPendingSaves`. The `timestamp` of a history entry now comes from that clock: strictly
increasing, roughly `Date.now()`.
