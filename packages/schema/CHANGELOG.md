# @ggraphic/schema

## 0.1.0-alpha.6

### Patch Changes

- 68baa26: Order keys no longer grow linearly (#208). The lift and `buildStateMap` give the n ids of a list a deterministic spread set (`posRange(null, null, n)`) instead of the chain `posBetween(previous, null)`: 5,000 elements now get keys of three characters where the chain gave up to 1,000 and a 2.6 MB update. A write that places several new ids into one gap, and a re-space, use a spread set too, each key with the random suffix as before. One new key is still `posBetween(before, after)`. The key format (alphabet, plain string comparison, no trailing `0`) is unchanged, and documents lifted earlier keep their chained keys.

  This changes the bytes the lift writes, so `LIFT_ID_ALGORITHM` is now `ggraphic-lift-id/2`. A build on `ggraphic-lift-id/1` still converges with this one, but their lifts of the same state no longer merge: they meet at key level, as two lifts of different states always did. Deploy all lifting clients of one document together.

  `DOCUMENT_VERSIONING.md` specifies the spread set, corrects the old size note and records that an element restored by undo after a delete gets a fresh key between the same neighbours (#214, accepted).

## 0.1.0-alpha.5

### Patch Changes

- 49cfc0b: Deleting an element through the factory actions (`createShapeActions` and the other `create*Actions` that remove an element) now also takes its id out of the page's `layerOrder`, as the page engine already did; before, the id stayed in the stored order (`$kind: order`) until a later reorder rewrote the list (#214). `updatePageStateById` no longer writes an empty collection, id list or record to a key of the format that the page does not hold: the canvas reports every collection after an undo, and each empty write created an empty structure (about 15 per page) that could win the key against a peer's first element of that kind. A key the page holds, and an empty value of a key the format does not classify, are written as before. `DOCUMENT_VERSIONING.md`: the measured growth of the deterministic position chain (#208), no change to the chain.

## 0.1.0-alpha.4

### Minor Changes

- 6c20561: Canvas document version 4: element storage in the Y.Doc (#176). Breaking change to the stored format of collaborative documents.

  The core step 3 → 4 is the identity on JSON documents: flat documents (a host's initial state, deck autosaves, Studio projects) keep their shape and only carry `schemaVersion: 4`. In a Y.Doc, the editor now stores element collections (`shapeInstances` and the other core collections, and every registered host kind's `stateKey`), the id lists `layerOrder`, `selectedIcons` and `lockedLayerIds`, and the records `iconStates`, `templateRotations` and `templateTextAligns` as Yjs structures, so two people editing different elements, properties or ids of one page no longer lose one side's edit. Every writer of page state (`updatePageStateById`, `replaceDeck`, `setPageConfigById`, a new, seeded or duplicated page, the deck undo's restore, the legacy form-state fold) goes through `@ggraphic/core/ydoc`. The JSON view (`readPages`, `serializeDeck`, the canvas, exports) is unchanged.

  Opening a version 3 Y.Doc with a writing, synced client lifts every classed key and raises the stamp to 4 in one untracked transaction, under the deterministic lift identity of `@ggraphic/core/ydoc`: two clients that lift the same document state write identical Yjs structs, so the edits each makes afterwards, also in an offline session, merge instead of one client's lift winning over the other's. The legacy lifts (documents from before version 1) run in a transaction of their own before it. Previews and refused clients never write. Plain data found under a classed key of a version 4 document (an old writer) is lifted again on the next open and on the next write of that key. An empty document is stamped 4 by its seed, which then builds its pages structured.

  For hosts:

  - **Observe plain fallbacks** with `onStateWriteWarning(listener)` from `@ggraphic/editor/collab`: a key the format stores as a structure that a write stored as plain JSON, because its value cannot be one (duplicate ids, an element without a string id), is reported once per page and key; without a listener the editor logs it with `console.warn`. A warning carries the `doc` it is about and arrives after the write has finished; a listener may write, and one that throws is logged with `console.error`. Such a write replaces the structure, so a peer's concurrent per-element edit of that key is lost.
  - **A host that lifts documents itself** (a server, a tool) must use `transactDeterministically` with `liftSalt` exactly as the editor does, or its lifts do not merge with the editor's. A server must not lift at all; a document it creates must be seeded structured and stamped 4 in one transaction. A host migration step runs inside the lift: it must be pure, and its output is frozen once its kind version is published.
  - **Pass `collaborative.canWrite`** (new, on `usePageManager`, `CanvasEditor` and `useYjsPages`' fourth argument): the connection's write scope. `true` lifts on open and writes. `false` (a read-only share) writes nothing at all, not even on open (no lift, no stamp, no legacy lift, no seed, no canvas config); its pages stay live and every page op is a no-op. Omitted, page ops write as before but the open does not lift; a key is lifted when that client writes it. `CanvasEditor` defaults it to `!readOnly`, so a host that already passes `readOnly` for a viewer's session needs no change. A host that calls `usePageManager` or `useYjsPages` directly must pass it: a read-only connection that lifts while its server drops the update keeps its own structure winning locally over everyone's edits, so its view freezes, and its cached updates can later revert others' edits.
  - A build with version 3 or older opens a version 4 document read-only, flat or Y.Doc, and live as soon as the stamp arrives (the lift and the stamp come in one update). Roll out this build to every client before documents are opened with it, or accept that older clients go read-only on documents a newer client has opened.
  - A server-side writer of canvas Y.Docs (seeds, state patches, deck changes, version restore) must follow "Server-side writers" in `DOCUMENT_VERSIONING.md` before this build opens its documents: read and write page state only through `@ggraphic/core/ydoc` (never `toJSON()` a state value, never `state.set(key, plainJson)` over a structured key, never copy a Yjs value between maps), stamp `meta.schemaVersion` in the transaction that creates a document, refuse to write a newer or malformed document, leave the stamp of an existing document alone (write with `lift: false` below 4), pass the host's collection keys, and report a refusal as an error instead of patching a flat mirror. A writer that keeps writing whole plain values per key is an old writer: its value wins at key level as in version 3, and the next open lifts it again.
  - `@ggraphic/editor/collab`'s `updatePageStateById`, `seedPagesIfEmpty`, `replaceDeck` and `setPageConfigById` now write structured state into a document stamped 4 or above, and plain JSON below. `seedPagesIfEmpty` does not stamp: to seed structured pages, set `meta.schemaVersion` (`YDOC_KEYS` from `@ggraphic/core/ydoc`) to `CANVAS_DOCUMENT_VERSION` first, in the same transaction. Unstamped, the pages are seeded plain and the editor's open lifts them.

## 0.1.0-alpha.3

### Minor Changes

- 2297fbb: **Breaking (alpha):** the export maps are closed (D2f).

  - **`@ggraphic/editor`:** the `./*` wildcard is gone. The published entries are the facades (`@ggraphic/editor/embed`, `/host`, `/shell`, `/page`, `/config`, `/services`, `/text`, … — `api-report.md` lists every name), the stylesheets, the illustration sets and `@ggraphic/editor/internal/*`. A deep path such as `@ggraphic/editor/utils/snapping` now fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Import the name from its facade, or from `@ggraphic/editor/internal/utils/snapping`, which reaches the same file with no semver promise.
  - **`@ggraphic/schema`:** only the root is published. Every name a subpath had is exported from `@ggraphic/schema`.
  - **Module augmentation:** augment the facades (`declare module '@ggraphic/editor/host'`, `'@ggraphic/editor/services'`, `'@ggraphic/editor/kinds'`); a `declare module` on a removed deep path no longer reaches the editor's interface.
  - **Stylesheets type-check under TypeScript 6** without a `*.css` declaration (#137): every stylesheet entry, with and without `.css`, has a `types` stub.
  - **Removed Grünerator-specific code**, which hosts keep in their own code: `composer/steckbriefLayout`, the Störer fitting in `composer/textFit` (`fitStoererText`, `STOERER_*`; the generic `wrapWords`, `balancedWrap`, `largestSizeWordsFit` stay in `@ggraphic/editor/text`), `brand/composerBrand`, and the deprecated aliases `buildSharepicText`, `StudioGalleryGrid` and `VORLAGE_DRAG_TYPE`, `isVorlageDrag`, `readVorlageDrag`. Their neutral names are not public yet: `buildCanvasText` (`@ggraphic/editor/internal/configs/buildCanvasText`), `AssetGalleryGrid` (`…/internal/sidebar/sections/AssetGallery`) and `TEMPLATE_DRAG_TYPE`, `isTemplateDrag`, `readTemplateDrag` (`…/internal/utils/mediaDrop`).

## 0.1.0-alpha.2

### Minor Changes

- cfeca71: Relicensed from MPL-2.0 to AGPL-3.0-only. Versions published before this change remain available under MPL-2.0.

## 0.1.0-alpha.1

### Minor Changes

- fe90a3b: Auto-fit measures a bold word in bold. Words in `**bold**` runs were measured in the regular face, so a bold word that only fit in regular weight ran past the edge of its box. `SlotFit` gets an optional `widestWord` for callers that know the widest word better than `measureAt`, as `countLines` already does for the line count.

## 0.1.0-alpha.0

### Minor Changes

- cd4897e: Canvas document version 2 for brand bindings. The core step 1 → 2 is the identity on pages; the page keys `bind`, `brandScheme` and `brandStamp` persist, are inherited by added and converted pages, and are known to the PPTX export. A build without version 2 now opens such a document read-only.
- b9037ee: Canvas document version 3 for templates. The core step 2 → 3 is the identity on pages; the page keys `templateRef` and `groups` persist, are not inherited by added pages, and are known to the PPTX export. A build without version 3 now opens such a document read-only.
- 11295d8: Break a word that is wider than its text box at syllable boundaries with a hyphen instead of in the middle of a syllable, and add `fitFontSizeToSlot` to shrink a headline until it fits the room above the next text. The editor draws such text with the shared layout, so the canvas and the export wrap alike.
- 5807f36: Initial import of the document schema, core and canvas editor packages.
- 2956336: The versioned template file format: `templateFileSchema`, `readTemplateFile` (with `newer`/`invalid` answers and page migration through `migrateDocument`) and `templateElementIds`.
- 3711f1b: One click on a text now shows the whole text toolbar: the format buttons (bold, italic, underline,
  accent, marker, bullet and numbered list) no longer wait for the edit session. On a text that is
  selected and not edited they act on the whole text: a button is pressed when the whole text carries
  the format and the next click takes it off; bold and italic only where the font has the cuts. In the
  edit session (double click) the same buttons act on the selection, as before.

  `@ggraphic/schema` adds `setWholeTextMark`, `setWholeTextList`, `wholeTextFormat` and
  `wholeTextCanOrderedList`, pure functions on the stored markdown-lite text. In the editor, the
  buttons are split from tiptap into `TextFormatButtons`; the host handler `handleTextFormatChange`
  (`ContextControls` handlers, `GenericCanvasRef`) writes the formatted text of a free text through
  `updateAdditionalText`, so the page refits and re-hugs it like a typed edit, and of an editable
  template text under its state key. `FloatingModuleState.data` of an editable text carries `text`,
  `hasAccent` and `hasMarker`.

### Patch Changes

- 3534ffa: Replace the bundled fonts PT Sans and Vollkorn with the open Instrument Sans and Fraunces. `brandDefault.fonts` now names Raleway, Instrument Sans and Fraunces. Saved designs and brand packs that still name "PT Sans" or "Vollkorn" keep rendering: the editor maps the old families to the new ones when loading, painting, measuring and exporting to PPTX (`FONT_FAMILY_ALIASES`); stored data is not rewritten.
