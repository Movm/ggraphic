# Element-level storage in the page Y.Doc (document version 4)

Status: implemented, 2026-11-17, including the review decisions at the end of this note (deterministic lift identity, plain-fallback reports, write capability). PR 3.A (the codec in core, every reader through it: #207, #210), then PR 3.C (the writers, the lift on open, document version 4; fixes #176); 3.E (one `Y.UndoManager` per page) is open. F0 names and open questions were decided by the maintainer on 2026-11-17. Refs #176. The normative format is `packages/schema/DOCUMENT_VERSIONING.md`, section "Version 4"; this note is how to build it. Line numbers are from `origin/main` at `e6908cb`. Anything marked _unverified_ is a reading of the code, not a test.

## Why

A page's state lives in a `Y.Map` (`pagesById/<page>/state`), and every element collection is one key holding the whole JSON array. Two clients editing different elements of one page at once, or one of them offline, resolve last-writer-wins on the whole array, and one side's edits disappear. The host's sync server, which applies AI chat edits, races the same way. The repro is `packages/editor/src/collab/concurrentKeyEdits.vitest.tsx` on `origin/repro/concurrent-key-lww` (red on purpose).

## Decisions (maintainer, not reopened here)

1. The codec lives in `packages/core/src/ydoc/`, exported as `@ggraphic/core/ydoc`, with `yjs` as an optional peer dependency. (Reason given: depending on the editor would add about 175 MB and 45 packages to the sync server's image; core has no dependencies. Not re-measured here.)
2. `collab/ydocKeys.ts` and `posBetween` (`packages/editor/src/collab/pagesDoc.ts:62`) move to core with it; the editor keeps re-exporting them from the old paths.
3. The list of collection keys becomes data in core. The editor derives its lists from it where the types allow, and a guard test keeps both equal.
4. Readers first everywhere, then writers. No dual write. `CANVAS_DOCUMENT_VERSION` 3 → 4 with an identity JSON step.
5. Replacing the snapshot undo history with one `Y.UndoManager` per page is not part of this work (plan step 3.E). Today's undo machinery must keep working.

## Decisions made in this design

| Decision                                                                                                       | Reason                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three classes: `elements`, `order`, `record`; everything else plain                                            | One structure per kind of concurrent edit. Keys and reasons in "Version 4", "Stored structure".                                                                                                                   |
| `selectedIcons` and `lockedLayerIds` are `order`, not sets                                                     | `selectedIcons` order is the draw order of icons `layerOrder` does not track (`utils/canvasLayerManager.ts:44-66`, `:84-114`). One class for all id lists; reads back today's order byte for byte.                |
| The class is a reserved entry `$kind` in each structured map                                                   | The only option that lets a reader without a registry (the host's sync server) never read a value in the wrong shape. Comparison in "Reading without a registry".                                                 |
| No `meta.stateFormat`                                                                                          | Old clients obey `schemaVersion` only; readers follow `$kind`; the lift is triggered by the data. A second `meta` entry could disagree with the stamp.                                                            |
| The lift runs in the same transaction as the raise to 4                                                        | An old client then receives both in one update and refuses in the same update. Today legacy lift and version migration are two transactions (`useYjsPages.ts:310-314`); they become one.                          |
| Writers create structure only in a document at ≥ 4 or one they stamp 4 in the same transaction (`lift` option) | Otherwise a v4-aware server writing into a v3 document would put structure under stamp 3, which a v3 client does not refuse.                                                                                      |
| Unrepresentable values stay plain                                                                              | Duplicate ids, ids starting with `$`, non-arrays under a collection key. The lift is then exactly the identity on the JSON view; no repair inside the format.                                                     |
| The codec memoises its plain reads per `Y.Map`, with structural sharing                                        | `shallowEqualState` (`useYjsPages.ts:246`) compares state values by reference. Without a memo every read builds new arrays and every page view is rebuilt on every change.                                        |
| Comparisons across the codec boundary become order-insensitive                                                 | The reader cannot reproduce every writer's key order (`id` is the map key, not a property; properties added later come last). `rebaseHistoryState.ts:25` and `applyOwnWrite` compare with `JSON.stringify` today. |
| Sync hook: `base` of a structured key is the hook's cache of the key's last plain value                        | With per-element merge a remote write can no longer overwrite an own write it did not see, except on one leaf, where the cached base gives the same rebase. Argument in "The sync hook".                          |

## The codec: `@ggraphic/core/ydoc`

### Files

| File                                        | Content                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/core/src/ydoc/ydocKeys.ts`        | `YDOC_KEYS`, `YDocKey`, moved from `packages/editor/src/collab/ydocKeys.ts` unchanged                      |
| `packages/core/src/ydoc/pos.ts`             | `posBetween`, `posJitter` (today private, `pagesDoc.ts:183`), the alphabet; moved from `pagesDoc.ts:52-77` |
| `packages/core/src/ydoc/stateKeyClasses.ts` | the key-class data                                                                                         |
| `packages/core/src/ydoc/codec.ts`           | read, write, build, memo                                                                                   |
| `packages/core/src/ydoc/lift.ts`            | the lift                                                                                                   |
| `packages/core/src/ydoc/index.ts`           | the entry                                                                                                  |

`packages/core/package.json`: `./ydoc` in `exports` (`development`/`types` → `./src/ydoc/index.ts`, `import`/`default` → `./dist/ydoc/index.js`) and in `publishConfig.exports`; `yjs` in `peerDependencies` (`^13.6.33`, the editor's range) with `peerDependenciesMeta.yjs.optional: true`, and in `devDependencies`. `src/index.ts` must not import `./ydoc/`, so `@ggraphic/core` stays dependency-free.

`packages/core/src/model/nodeSafe.vitest.ts` rejects every non-relative import in `packages/core/src` today. It must allow `yjs`, and only in files under `src/ydoc/`; add a case that `src/index.ts` does not reach `src/ydoc/` through its import graph.

The codec uses `instanceof Y.Map`, so it must see the same `yjs` module instance as the caller's documents. That is what a peer dependency gives; a host that bundles two copies of `yjs` breaks it (Yjs warns about this itself).

Editor side: `packages/editor/src/collab/ydocKeys.ts` becomes `export { YDOC_KEYS, type YDocKey } from '@ggraphic/core/ydoc';`, `pagesDoc.ts` re-exports `posBetween` and uses the moved `posJitter`. The comment at `ydocKeys.ts:7-9` ("the Hocuspocus service … has zero cross-package deps and re-declares these literals inline") is wrong after the move and goes.

### API

```ts
import type * as Y from 'yjs';

/** The class of a structured state value; stored as `$kind`. F0. */
export type StateKeyClass = 'elements' | 'order' | 'record';

export const STATE_KIND_KEY = '$kind'; // F0
export const ELEMENT_POS_KEY = '$pos'; // F0
export const RESERVED_PREFIX = '$'; // F0
/** The document version from which page state may hold structured values. */
export const ELEMENT_STORAGE_VERSION = 4;

export const CORE_ELEMENT_COLLECTION_KEYS = [
  'shapeInstances',
  'frameInstances',
  'additionalTexts',
  'illustrationInstances',
  'assetInstances',
  'circleBadgeInstances',
  'pillBadgeInstances',
  'userImageInstances',
  'chartInstances',
] as const;
export const ORDERED_ID_KEYS = ['layerOrder', 'selectedIcons', 'lockedLayerIds'] as const;
export const RECORD_KEYS = ['iconStates', 'templateRotations', 'templateTextAligns'] as const;

/** Which key is which class; plain keys are absent. */
export type StateKeyClasses = ReadonlyMap<string, StateKeyClass>;
/** The core's classes plus a host's collection keys (its element kinds' `stateKey`s). */
export function stateKeyClasses(hostCollectionKeys?: readonly string[]): StateKeyClasses;

/** The plain JSON under `key`: exactly the version 3 value. `undefined` when absent or unreadable. */
export function readStateKey(stateY: Y.Map<unknown>, key: string): unknown;
/** Every key of the state map, read with `readStateKey`. */
export function readState(stateY: Y.Map<unknown>): Record<string, unknown>;

export interface StateWriteOptions {
  classes: StateKeyClasses;
  /**
   * May a key the classes name, holding plain JSON or absent, be written structured?
   * True only in a document at ≥ ELEMENT_STORAGE_VERSION, or one stamped in the same transaction.
   */
  lift: boolean;
}
/**
 * Write each key of `partial`. A structured key is diffed into its structure (only changed
 * elements, properties, ids and positions are written); a plain key is set when its value
 * changed (canonical JSON equality, as `sameStateValue`). Call inside the caller's transaction.
 */
export function writeStateKeys(
  stateY: Y.Map<unknown>,
  partial: Record<string, unknown>,
  options: StateWriteOptions
): void;
/** A fresh, not yet integrated state map holding `state`; reads nothing back. */
export function buildStateMap(
  state: Record<string, unknown>,
  options: StateWriteOptions
): Y.Map<unknown>;

/** Lift every classed key of one state map that holds a representable plain value. Returns the lifted keys. */
export function liftStateMap(stateY: Y.Map<unknown>, classes: StateKeyClasses): string[];
/** `liftStateMap` over every page of `pagesById`. Call inside the setup transaction. */
export function liftDocumentState(doc: Y.Doc, classes: StateKeyClasses): number;
/** Does the doc's `meta.schemaVersion` allow structured writes (≥ ELEMENT_STORAGE_VERSION)? */
export function mayWriteStructured(doc: Y.Doc): boolean;

/** Order-insensitive JSON equality; moved from `pagesDoc.ts:333`. */
export function sameStateValue(a: unknown, b: unknown): boolean;

export { YDOC_KEYS, type YDocKey } from './ydocKeys.js';
export { posBetween, posJitter } from './pos.js';
```

Notes for the builder:

- **Deleting a key** stays `stateY.delete(key)`: it is the same in both forms. No codec function is needed for it.
- **`undefined` values** are passed through as today (stored plain); `applyOwnWrite` and `planHistoryRebase` distinguish a present `undefined` from an absent key with `Object.hasOwn`, so turning it into a delete would be a behaviour change.
- **Unrepresentable values** (see "Version 4") under a classed key are written plain. Over an existing structured value that replaces the structure; the next lift tries again and leaves it plain again. Deterministic, no loop.
- **The diff of an `elements` value** against the live structure: delete removed ids; create a map for added ids (properties plus `$pos`); per kept element set changed properties (`sameStateValue`) and delete absent ones; for order, keep the ids on one longest increasing subsequence of their current positions in the new order and give the others a new `$pos` between their new neighbours (`posBetween` + `posJitter`; re-space the list first when the neighbours tie). `order` values diff the same way with the key as the value. Records diff per entry.
- **The diff reads live, not the caller's base.** That is today's guard (`pagesDoc.ts:288`) at finer grain. A writer whose React state is stale (it emits a whole array that predates a remote edit it has already received) still writes the stale values of that element back. Version 3 writes the whole stale array, so this is no regression. A three-way diff (`partial` against the value the emitter last saw) would close it; decided against for now, because it needs a base at every writer and the window is no worse than today.
- **Lift chain vs jitter:** the lift and `buildStateMap` use the deterministic chain (no jitter), like `seedPagesIfEmpty`; user writes use jitter.

### The memo

`readStateKey` of a structured value builds arrays and objects. To keep reference identity for unchanged values (`shallowEqualState`, `useYjsPages.ts:246`, and the memoised page wrappers behind it):

- Cache per structured `Y.Map` (a `WeakMap`) its last plain value, and per element map its plain element object. An unchanged element keeps its object when a sibling changes; an unchanged collection keeps its array.
- Invalidate on the doc's `beforeObserverCalls` event: for every type in `transaction.changed`, drop it and each ancestor (`type._item.parent` up to the root). Register that listener once per doc, lazily. Observers run after `beforeObserverCalls` (yjs 13.6.33 `src/utils/Transaction.js:270-312`), so they read fresh values. `afterTransaction` would be too late: it fires after the observers.
- Inside a transaction (`doc._transaction !== null`) read fresh and neither use nor fill the cache: writers read their own writes back within one transaction (`replaceDeck` reads pages between writes, `restoreDeckStates` compares live values).
- Plain values are returned as they are, as today (Yjs hands out the stored object, `typeMapGet` in `src/types/AbstractType.js:889-893`). Callers must not mutate what they read; that contract exists today.

### Key-class data and the guard

`stateKeyClasses.ts` holds the three lists above. The editor:

- builds its classes as `stateKeyClasses(hostElementKinds().map((k) => k.stateKey))`, memoised with `fromHostKinds` (`utils/elementKinds.ts`), and passes them to every write;
- keeps `CARRIED_INSTANCE_KEYS` (`configs/factory/carryInstanceState.ts:77-95`) and `ELEMENT_KINDS` (`utils/elementKinds.ts:48-57`) where they are (they carry types and the `remove` action names, which core does not know). A guard test, `packages/editor/src/collab/stateKeyClasses.vitest.ts`, asserts:
  - `ELEMENT_KINDS` state keys = `CORE_ELEMENT_COLLECTION_KEYS` ∪ {`selectedIcons`};
  - `CARRIED_INSTANCE_KEYS` = `CORE_ELEMENT_COLLECTION_KEYS` ∪ `ORDERED_ID_KEYS` ∪ `RECORD_KEYS` ∪ {`backgroundImageAdjustments`, `backgroundImageRotation`};
  - every registered host kind's `stateKey` is classed `elements` by the editor's classes;
  - `ELEMENT_STORAGE_VERSION` ≤ `CANVAS_DOCUMENT_VERSION` (core does not depend on schema, so the number is duplicated and the test binds them).

## The sync hook after the change

`useYjsPageStateSync` (`packages/editor/src/collab/useYjsPageStateSync.ts`) observes the **page** map deep (`pageYMap.observeDeep`, `:128`) and today handles only events whose target is the current `state` map (`:111`).

### The `(partial, base, own)` contract, as it is today

Read in `useYjsPageStateSync.ts`, `GenericCanvas.tsx:553-567` (`handleRemotePageState`), `stores/createCanvasEditorStore.ts:342-376` (`rebaseHistory`) and `utils/rebaseHistoryState.ts`:

1. One call per transaction that changed the current state map and did not carry `PAGES_STATE_ORIGIN`. `partial` holds every top-level key that transaction changed, with its new value (absent = deleted).
2. `base[key]` is the value the writer started from, as far as this client's history is concerned: the value the write replaced here, except when it replaced an own write it had not seen; then the last own value it saw, or the value the own run replaced (`baseOverOwn`, `:90-103`). Only for remote writes.
3. `own` is `transaction.local`: a local write with another origin (deck op, deck undo restore, version lift). `rebaseHistory` then applies it per whole key where a snapshot still holds the replaced value (`applyOwnWrite`), instead of planning a remote edit.
4. Own `PAGES_STATE_ORIGIN` writes are never reported, but they are tracked (`track`, `:68-80`) so a later remote write's base can skip them.
5. `handleRemotePageState` rebases the history from `createInitialState({...committed, ...base})` to `createInitialState({...committed, ...partial})` and merges `partial` into the canvas state.

### After the change

Per handler call (one transaction):

- **Map each event to a top-level key.** `event.path` is relative to the observed page map. An event whose target is the current state map has path `['state']`; its keys are in `event.changes.keys`. A deeper event has path `['state', key, …]`; the key is `path[1]`. Events under a state map that is no longer the page's (`path[0] !== 'state'`, or a replaced map) are ignored, as today.
- **Plain keys** (the key's old and new value are both plain): exactly today's path. `partial[key] = readStateKey(stateY, key)` (a plain value, unchanged), `base[key]` from `change.oldValue` or `baseOverOwn`, and the item tracking stays: `stateY._map.get(key)`, `item.origin`, `doc.store` are still right, because a plain key's top-level item still changes with every write.
- **Structured keys** (the key's value is structured after the transaction, or was before it): `partial[key] = readStateKey(stateY, key)`, `base[key] = cache.get(key)`. The cache holds, per structured key, the plain value as of the end of the last transaction this hook saw, own `PAGES_STATE_ORIGIN` writes included. It is filled at mount (`:81-83`) and updated after every transaction for every key it touched. The item tracking is not used for these keys: their top-level item belongs to whoever lifted the key and does not change when an element does.
- **A key whose plain value did not change** (a peer's lift, a re-lift, a format change of an equal value) is not reported.
- `own` stays `events[0].transaction.local`. `PAGES_STATE_ORIGIN` transactions update the cache and the tracking and report nothing.

Why the cache is a correct `base` for structured keys: the `baseOverOwn` walk exists because a whole-value write could replace an own write it had not seen, and the diff would then count the own change as part of the remote edit (#176 in miniature). With per-element merge a remote write cannot touch an element, id or property it did not change, so own unseen writes elsewhere are still in `partial` and in the cache, and the diff ignores them. What remains is one leaf both sides wrote. There the plan's effect does not depend on the base: `planCollection` records the leaf as a changed field and `applyFields` sets the snapshot's field to the new value whatever it held; `planIds` marks the id moved and places it by its new neighbours; a removed element is removed. So the cache base and the walk's base give the same rebase. _Unverified by a test_; the regression net below must show it.

Invariants kept: 1, 3, 4 and 5 as they are; 2 for plain keys exactly, for structured keys up to the leaf argument above. `GenericCanvas.handleRemotePageState`, `rebaseHistory`, `planHistoryRebase` and `applyOwnWrite` keep their signatures.

What else must change around it:

- `utils/rebaseHistoryState.ts:25-26` (`jsonEqual`, used by the planner, `applyFields`, `applyCollection` and `applyOwnWrite`) must compare order-insensitively (`sameStateValue`). History snapshots come from React state, `prev`/`next` from the codec; a key-order difference would make `applyOwnWrite` think a snapshot no longer holds the replaced value and drop an own deck op from the history (#183). The neighbour check in `rebaseHistory` (`createCanvasEditorStore.ts:366-375`, `JSON.stringify`) only errs towards keeping a step and may stay.
- The cache must be rebuilt when the page's state map is replaced (convert, `setPageConfigById`). The canvas is keyed by `page.id:stateEpoch` (`components/CanvasEditor/CanvasEditorShell.tsx:1911`), so the hook remounts then; keep a check that the cached map is the current one anyway.

### Regression net

These suites cover collaborative undo and must stay green in 3.A and 3.C:

- `packages/editor/src/collab/undoKeepsRemoteEdits.vitest.tsx`: #160 (commit `49f3140`), #171 (`1563874`, `b49ef89`), #183 (`a9a467c`, "own writes from another stack").
- `packages/editor/src/collab/remoteWriteBase.vitest.tsx`: the `base` contract (#171, `b49ef89`, `2e42f4e`). It writes strings under `shapeInstances`, which stay plain under version 4, so it keeps testing the plain path. Add a structured counterpart.
- `packages/editor/src/utils/rebaseHistoryState.vitest.ts` and `packages/editor/src/stores/__tests__/historyRebase.vitest.ts`.
- Also `collab/remoteEditKeepsAddedElements.vitest.tsx`, `collab/replaceDeckUndoAfterWriteBack.vitest.tsx`, `collab/discardReplaceDeck.vitest.tsx`, `collab/undoReachesTheDocument.vitest.tsx`, `collab/documentVersion.vitest.ts`.

One of them asserts version 3 behaviour and changes in 3.C on purpose: `undoKeepsRemoteEdits.vitest.tsx:269` "a write from a stale view: B loses its own step to A on the key but can redo it" asserts the #176 loss (`xOf(live.state, 's1')` is 100 after reconnect). Under version 4 both moves survive; the test becomes "both survive, undo reverts only B's move, redo brings it back". (`replaceDeckUndoAfterWriteBack.vitest.tsx:157`, two concurrent deck replacements, edits the plain `headline` only and is not affected.)

## Sites

### PR 3.A: codec in core, every reader through it

Nothing writes the new shape. Writers keep `stateY.set`, but their equality guards read through the codec, so a 3.A client never rewrites a structured value with an equal plain one.

| Site                                                        | Today                                                        | 3.A                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collab/pagesDoc.ts:106` `pageToView`                       | `Object.fromEntries(stateY.entries())`                       | `readState(stateY)`. Covers `readPages`, `serializeDeck` (`:426`), `snapshotStates` (`useYjsPages.ts:95`), `migrateYDocument`'s read (`documentVersion.ts:141`), `usePageManager.ts:260,388,471`, every `serializeDeck` caller in `CanvasEditorShell.tsx` and `useDeckAutoSave.ts:161` |
| `collab/pagesDoc.ts:288` `updatePageStateById` guard        | `jsonEqual(stateY.get(k), v)`                                | `sameStateValue(readStateKey(stateY, k), v)`                                                                                                                                                                                                                                           |
| `collab/pagesDoc.ts:318` `replacePageState` guard           | same                                                         | same change                                                                                                                                                                                                                                                                            |
| `collab/pagesDoc.ts:350,353` `restorePageStateKeys`         | `untouched(k, stateY.get(k))`, `jsonEqual` guard             | `readStateKey` for both                                                                                                                                                                                                                                                                |
| `collab/pagesDoc.ts:511` `foldLegacyFormStateIntoFirstPage` | `stateY.get(key) !== value`                                  | compare `readStateKey`                                                                                                                                                                                                                                                                 |
| `collab/useYjsPageStateSync.ts:83,118`                      | `stateY.get(key)` into `partial` and the tracking            | `readStateKey`, so a structured value never reaches React state as a `Y.Map`                                                                                                                                                                                                           |
| `collab/useYjsPages.ts:246` `shallowEqualState`             | reference equality                                           | unchanged; relies on the memo                                                                                                                                                                                                                                                          |
| `collab/pagesDoc.ts:141-170` `clonePage`                    | clones Yjs values (`v.clone()`), `structuredClone`s the rest | unchanged in 3.A (a 3.A client never duplicates a page of a v4 document: refused)                                                                                                                                                                                                      |
| `collab/ydocKeys.ts`, `pagesDoc.ts:52-77`                   | definitions                                                  | re-exports from `@ggraphic/core/ydoc`                                                                                                                                                                                                                                                  |

Why the sync hook's read belongs in 3.A: when a v4 client lifts and stamps, a 3.A client receives both in one update. Its sync handler runs in the same observer pass as its `meta` observer, before the refusal renders. With `stateY.get(key)` the new `Y.Map` would go into React state, `carryInstanceState` would read it as `[]`, and the emitter could write `[]` back if the refusal had not reached the writer yet. With the codec it reads the equal plain value and reports nothing. (Whether the writer sees the refused API in time is a question of React batching: `usePageManager.ts:418-419` updates `liveRef` during render; _unverified_ by a test.)

### PR 3.C: writers, lift, version 4

| Site                                                                   | Change                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collab/pagesDoc.ts:129` `buildPage`                                   | `buildStateMap(def.state, …)`. Reaches `insertPageAt`, `appendPage`, `seedPagesIfEmpty` (`:418`), `replaceDeck` inserts, `migrateLegacyDoc` (`:476`)                                                                                                        |
| `collab/pagesDoc.ts:141-170` `cloneYMapShallow` for state, `clonePage` | `buildStateMap(readState(source state))`: a deep copy with fresh order keys, no shared plain objects. `cloneYMapShallow` stays for `config`                                                                                                                 |
| `collab/pagesDoc.ts:287-289` `updatePageStateById`                     | `writeStateKeys(stateY, partial, …)`                                                                                                                                                                                                                        |
| `collab/pagesDoc.ts:305-307` `setPageConfigById`                       | `buildStateMap(newState, …)`                                                                                                                                                                                                                                |
| `collab/pagesDoc.ts:314-319` `replacePageState`                        | delete absent keys, then `writeStateKeys`. Reaches `replaceDeck` (`:383`) and `migrateYDocument` (`documentVersion.ts:170`)                                                                                                                                 |
| `collab/pagesDoc.ts:349-356` `restorePageStateKeys`                    | `writeStateKeys` per untouched key; delete as today. Reaches `restoreDeckStates` (`useYjsPages.ts:142`)                                                                                                                                                     |
| `collab/pagesDoc.ts:509-512` `foldLegacyFormStateIntoFirstPage`        | `writeStateKeys`                                                                                                                                                                                                                                            |
| `collab/useYjsPages.ts:297-316` open and `settleVersion`               | one `SETUP_ORIGIN` transaction: `migrateLegacyDoc`, `foldLegacyFormStateIntoFirstPage`, `migrateYDocument`, and, unless that returned `invalid`, `liftDocumentState`. `settleVersion` (also run by the `meta` observer, `:318-327`) does the last two       |
| `collab/useYjsPages.ts:404-417` `seedIfEmpty`                          | **Changed in 3.C:** stamp first, then seed and fold, in one transaction. The seed stamped after building its pages, and `buildStateMap` cannot read the stamp, so the pages came out plain. The open no longer stamps an empty, unseeded doc; the seed does |
| `collab/useYjsPages.ts:485-486` `replaceDeckOp` `changed`              | `JSON.stringify` compare; may stay (a false "changed" only keeps an extra page in `DECK_STATES`), or use `sameStateValue`                                                                                                                                   |
| `collab/useYjsPageStateSync.ts`                                        | deep events and the cache ("The sync hook")                                                                                                                                                                                                                 |
| `utils/rebaseHistoryState.ts:25-26`                                    | order-insensitive `jsonEqual`                                                                                                                                                                                                                               |
| `packages/schema/src/document/migrations.ts:13, :131-134`              | `CANVAS_DOCUMENT_VERSION = 4`; add `{ from: 3, migrate: (doc) => doc }`; extend the comment above it                                                                                                                                                        |
| editor: the classes and `lift`                                         | every write passes the editor's classes; `lift: true` on a non-refused document (the open has raised it to 4), `buildStateMap` in a seed is stamped in the same transaction                                                                                 |

`documentVersion.ts` itself needs no change beyond what it reaches through `serializeDeck` and `replacePageState`; `replaceConfig` (`:112`) is the `config` map and stays.

## Tests

### PR 3.A

Two measurements must be done in 3.A, before anything writes the new shape (3.C), and their results go into the 3.C PR:

- **Reserved prefix:** whether any stored id or record key in templates (the open pack and hosts' templates), AI operations or test fixtures starts with `$`. A hit means that value stays plain forever under version 4, so it must be known before the format ships.
- **Size:** the encoded size of a representative Y.Doc (a multi-page deck with many elements and some edit history) before and after the lift, and after a typical editing session on each.

Tests:

- `packages/core/src/ydoc/codec.vitest.ts`: round trip `readState(buildStateMap(x)) ≈ x` (`sameStateValue`) for every built-in kind and one host kind; plain values read as they are; each unrepresentable value stays plain; unknown `$kind` reads as absent; a `Y.Map` without `$kind` reads as `toJSON()`; `writeStateKeys` writes only changed elements, properties and positions (count the updates); the memo keeps identity of unchanged elements and collections, invalidates before observers, and is bypassed inside a transaction.
- `packages/core/src/ydoc/pos.vitest.ts`: the `posBetween` tests moved from `collab/pagesDoc.vitest.ts:62` plus `posJitter`.
- `packages/core/src/model/nodeSafe.vitest.ts`: `yjs` allowed only under `src/ydoc/`; `src/index.ts` does not reach it.
- `packages/editor/src/collab/stateKeyClasses.vitest.ts`: the guard above.
- `packages/editor/src/collab/pagesDoc.vitest.ts`: `readPages` and `serializeDeck` of a hand-built structured state equal its plain form; the guards of `updatePageStateById`, `replacePageState` and `restorePageStateKeys` write nothing for an equal plain value over a structured one.
- The sync hook reports a plain value for a structured key (not a `Y.Map`).

### PR 3.C

Red first, then green:

- **Concurrency**, two mounted canvases with a delivery queue: take `concurrentKeyEdits.vitest.tsx` from `origin/repro/concurrent-key-lww` (change its SPDX header from `MPL-2.0` to `AGPL-3.0-only`; the repository was relicensed since) and add: different properties of one element; the same property (last writer wins, documented); delete versus edit; concurrent reorder of one layer (no duplicate in `layerOrder`, one position); concurrent lock and unlock of different layers; offline, three edits on one side against one on the other, all on different elements, all four survive. The repro seeds with `seedPagesIfEmpty` directly, so it exercises the writers without the lift; add a variant that seeds the version 3 shape and opens through `useYjsPages`.
- **Migration**: opening a v3 document lifts every classed key in one `SETUP_ORIGIN` transaction that also raises the stamp to 4, and the deck undo stack stays empty; a second open writes nothing; two clients lifting at once converge; a plain value written under a structured key after the lift is lifted on the next open and on the next write; an unrepresentable value stays plain on every open; a v3 build (pin `readYDocRefusal` to a v3 registry) turns read-only on the update that brings the lift.
- **Sync hook**: deep events report the right key with `partial` and `base`; own `PAGES_STATE_ORIGIN` writes update the cache and report nothing; a peer's lift reports nothing; a local deck op on a structured key reports `own: true`; the structured counterpart of `remoteWriteBase.vitest.tsx` (same-leaf overwrite of an unseen own write gives the same rebase as today).
- **Collab undo**: the regression net above stays green, except the test named there, which is rewritten with the reason in the PR. Add: undo of an own reorder after a remote insert; undo of an own add after a remote edit of that element removes it; undo of an own delete after a remote edit elsewhere; redo after a remote edit made while undone; remote add together with a `layerOrder` change.
- **Version**: `packages/schema/src/document/migrations.vitest.ts` (`:37-105`, `:213`, `:232` pin 3 and use 4 as "newer"), `packages/schema/src/document/corpus.vitest.ts:102`, `apps/studio/src/editor/document.test.ts:28-29` move to 4 and 5.
- The render gate in CI shows no pixel changed (the JSON view is the same). Not run locally.

## Where the issue's plan is wrong or outdated

- **Codec location.** The plan puts it in `collab/pageStateCodec.ts` behind an `@ggraphic/editor/collab-codec` entry. Superseded by decision 1 (`@ggraphic/core/ydoc`).
- **Keys "typed by the element registry, not by guessing from values".** A registry-typed reader is exactly what a server without the host's registrations cannot be. Reading follows the `$kind` marker; the registry is needed only for the lift and the first structured write.
- **`meta.stateFormat`** (absent = 1, element storage = 2) is not introduced. Reasons in "Version and marker" of the spec.
- **`lockedLayerIds`, `selectedIcons` as `Y.Map<id, true>`.** `selectedIcons` order is visible (`canvasLayerManager.ts:61-62` iterates `kindList` in array order; untracked items keep that order, `:84-114`). A set would reorder icons on read. Both are `order` maps (id → fractional key).
- **`useYjsPageStateSync` "maps an event deep in a collection back to its top-level key (`event.path[0]`) and re-reads that key".** The hook observes the page map, so `path[0]` is `'state'` and the key is `path[1]`. And re-reading is not enough since #171 and #183: the hook reports `base` and tracks own writes through Yjs items (`:64-103`), which do not change for an element edit. The design above adds the per-key cache.
- **"The #171 rebase then sees per-element events and stays correct."** It also needs the order-insensitive comparison in `rebaseHistoryState.ts:25` (see "The sync hook"); without it `applyOwnWrite` can drop an own deck op from the history.
- **The lift "next to `migrateLegacyDoc` and `settleVersion`, inside the existing SETUP transaction".** There are two transactions today (`useYjsPages.ts:310-313` and `:299`). The lift must share the transaction that raises the stamp.
- **"Two new clients lifting at once … identical in content."** True, but edits a client made into the losing structure before it synced are lost.
- **Rollout step 5, "drop the lenient reader for the old shape".** For version 4 the old shape is the plain value every other key keeps, and unrepresentable values stay plain forever; there is nothing to drop.
- **Line numbers.** `useYjsPages.ts:301-331` (refusal and `meta` observer) is now `:297-327`; the deck manager at `:345` is now `:341`.
- **Tests.** The plan does not mention that `undoKeepsRemoteEdits.vitest.tsx:269` asserts the #176 loss and must be rewritten, nor that `nodeSafe.vitest.ts` forbids any package import in core today.
- **Server writes into a v3 document.** The plan has the internal API write through `writeStateKeys` everywhere. Writing structure into a document still at 3 would put structured values under a stamp v3 clients accept. Hence rule 1 and the `lift` option.

## Decided after review (maintainer, 2026-11-17)

The F0 names in the spec were approved as written: `$kind` (`elements`, `order`, `record`), `$pos`, `$` as the reserved prefix, the key classes, `schemaVersion` 4, and no `meta.stateFormat`.

1. **An `iconStates` entry stays one value per icon.** Concurrent edits of different properties of one icon stay last-writer-wins; a property map per entry would be a fourth structure for an edit nobody reported.
2. **`bind`, `groups` and `backgroundImageAdjustments` stay plain in version 4.** No concurrent partial edit of them is reported, and one can join a class later without a version step.
3. **The first element of a kind on a page keeps the key-level race.** Pages are not pre-created with empty structured collections: that would add about 15 entries per page and turn an absent key into `[]` in the JSON view, for a race of one round trip.
4. **No three-way diff in `writeStateKeys` for now.** It would need a base at every writer, and the stale-emit window it closes is no worse than version 3.
5. **Older builds refuse version 4 documents read-only, flat ones included.** One counter for both forms is the accepted price; a Y.Doc-only marker would not be obeyed by old clients.

## Decided after the review of #211 (maintainer, 2026-11-17)

1. **Concurrent lifts: deterministic lift identity.** Two clients that lift the same document state write identical Yjs structs, so Yjs keeps one copy and later edits on both sides merge, also after a whole offline session. Normative in `DOCUMENT_VERSIONING.md`, "Deterministic lift identity", and F0. As built:
   - `@ggraphic/core/ydoc` `transactDeterministically(doc, salt, fn, origin)` runs `fn` in an outermost transaction under `deterministicClientId(doc, salt)`, a `cyrb53` (byte variant, seed 0) hash of the algorithm tag, the salt (`liftSalt`: target versions and key classes) and `Y.encodeSnapshot(Y.snapshot(doc))` (state vector and delete set), mapped into [2^32, 2^53), rehashed while the id already has structs. The own id is set back at the end of the body, before observers and `update` handlers.
   - The lift transaction holds `migrateYDocument` and `liftDocumentState`, both written as pure functions of the state: canonical key order everywhere (`StateWriteOptions.deterministic`, `canonicalJsonValue`), no jitter, pages and keys in UTF-16 code-unit order, kind stamps sorted, the version steps' input canonical. Reports to hooks (`onPlainFallback`) are delivered after the transaction, never inside it. The written bytes are pinned by golden tests (`core/src/ydoc/deterministic.vitest.ts`, `editor/src/collab/liftGoldenBytes.vitest.tsx`, yjs 13.6.33); the reference implementation plus these tests is the specification.
   - Moved out, to a transaction under the own id before it: `migrateLegacyDoc` (a `legacy-${Date.now()}` id, replica-order iteration) and `foldLegacyFormStateIntoFirstPage`. They write only into documents from before version 1 or not yet folded.
   - Still lost: edits made into the losing structure when two clients lift **different** states (an update reached one of them and not the other before it opened, while the document was unlifted for both). Through a relay server only non-lift writes cause that (old builds, `canWrite` omitted, server-side plain patches, legacy lifts); a non-causal transport can also deliver a peer's plain edit before the lift it had received. A lift's derived id is above every real client id, so it always wins a concurrent conflict on one key. Pinned in `collab/concurrentLiftOffline.vitest.tsx`, "remaining case".
2. **A non-representable write: accept and report.** The key is stored plain as before; the codec calls `StateWriteOptions.onPlainFallback` once per state map and key (core never logs), and the editor forwards it to `onStateWriteWarning` listeners (`@ggraphic/editor/collab`), else `console.warn`.
3. **Write capability.** `collaborative.canWrite` (`usePageManager`, `CanvasEditor`, `useYjsPages`): `false` writes nothing, not even the open's lift; `CanvasEditor` derives it from `readOnly`.

## Unverified

- That no element id, `order` id or record key in stored documents or in hosts' templates starts with `$`. The editor's ids are `prefix-timestamp-random` (`utils/duplicateElement.ts:107-109`); templates and AI operations were not checked. Measured in 3.A (see "Tests").
- Whether pages are already built with every carried collection as `[]`, which would narrow the first-element race (decision 3).
- That property order never matters to a consumer other than the comparisons named above.
- The size effect on stored Y.Docs (one item per property instead of one per array; drags write two small items instead of a whole array). Not measured yet; measured in 3.A (see "Tests").
- That a v3 build's writer sees the refused API before its emitter runs (React batching of the `meta` observer and the sync handler in one update). Still unverified after 3.C: it is a property of the readers release, which this repository no longer builds.
- Which host bundles from before `0.1.0-alpha.0` still run.
- The reference host's sync server details (it re-declares the keys, copies values per key, never touches `meta.schemaVersion`, and its API falls back to patching a flat mirror): taken from the brief for this design, not read here.
- The 175 MB / 45 packages measurement behind decision 1.
