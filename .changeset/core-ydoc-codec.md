---
'@ggraphic/core': minor
---

New entry `@ggraphic/core/ydoc`: the page-state codec of canvas document version 4 (`readStateKey`, `readState`, `writeStateKeys`, `buildStateMap`, `liftStateMap`, `liftDocumentState`, `mayWriteStructured`, `sameStateValue`), the key classes (`stateKeyClasses`, `CORE_ELEMENT_COLLECTION_KEYS`, `ORDERED_ID_KEYS`, `RECORD_KEYS`, the reserved names `$kind` and `$pos`), and `YDOC_KEYS`, `posBetween` and `posJitter`, moved from the editor. `yjs` is an optional peer dependency of this entry; the root entry still loads no package. `writeStateKeys` creates structure only in a document stamped version 4 or above, and rejects a write it cannot complete (unknown class, a Yjs value, a value that is not JSON) before changing anything. Nothing writes the new format yet.
