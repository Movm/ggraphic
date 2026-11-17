<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# Canvas document versioning

ggraphic's neutral, public format is the **canvas document**: its pages, each
page's canvas state (element instance lists, rich text, styling keys) and the
element kinds that live in that state. Once the core is published, self-hosted
instances store such documents in databases nobody else can migrate. Every
change to the stored shape therefore needs a version number and a migration
_before_ the first foreign instance writes a document. This note records where
documents cross a storage boundary today and how versioning is wired in.

## What "the document" is

```ts
{
  schemaVersion?: number,            // core format version; absent = 1
  kindVersions?: Record<string, number>, // per host stateKey; absent = 1
  pages?: Array<{
    id?: string,                     // stable page id (deck patches address it)
    configId: string,                // which template config renders the page
    state: Record<string, unknown>,  // the page's canvas state
    config?: Record<string, unknown>,// per-page editor config (Yjs `config` map)
  }>,
  ...                                // anything else is opaque and passed through
}
```

A page's `state` holds the template's own fields (text keys, colours,
positions, rich text) and the element instance lists of every kind, keyed by
the kind's `stateKey`: `selectedIcons`/`iconStates`, `shapeInstances`,
`frameInstances`, `additionalTexts`, `illustrationInstances`,
`assetInstances`, `circleBadgeInstances`, `pillBadgeInstances`,
`userImageInstances`, `chartInstances`, `layerOrder`, plus the host kinds'
lists (`registerElementKind`, e.g. the test kind's `stampInstances`). All these keys
are F0: stored in canvases and templates, never renamed.

In a Y.Doc the same document is spread over shared types (`collab/pagesDoc.ts`):
`pagesById` (Y.Map of page Y.Maps with `id`, `configId`, `pos`, `state`,
`config`) and `meta` (seed watermark and one-shot legacy markers). From
version 4 some keys of a page's `state` hold Yjs structures instead of one JSON
value (see "Version 4"). The
pre-`pagesById` topologies (`pages` Y.Array, `legacy_root`, root `formState`)
are older than version 1; `migrateLegacyDoc` and
`foldLegacyFormStateIntoFirstPage` already lift them into the v1 shape on open
and stay as they are.

## Where documents are serialised and deserialised today

| Path                                                                                    | Direction  | Where                                                                                  | Covered by                                                                                                                                            |
| --------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collaborative Y.Doc (the host's sync server) and the local Y.Doc of a non-collab editor | read/write | `collab/useYjsPages.ts` (setup effect after sync, seeding), `collab/pagesDoc.ts`       | `migrateYDocument` runs in the setup transaction after the legacy lift; seeding stamps the version into `meta`; a newer doc refuses writes            |
| Page state ↔ component state                                                            | read/write | `useYjsPageStateSync`, `wrapCallbacksWithPageSync`, `yjsBinding.ts` (`config`)         | Runs only on a doc that passed the version check (the page manager mounts no live pages for a refused doc)                                            |
| Initial document of a canvas (the host's stored initial state)                          | read       | host → `readInitialDocument` (`usePageManager.ts`) → `initialPages` seed / preview     | `migrateDocument`; a newer or malformed envelope comes back as a refusal and no pages; the host mounts no writing editor                              |
| Gallery deck autosave (`metadata.content`)                                              | write      | `hooks/useDeckAutoSave.ts`                                                             | Stamped with `stampDocument` (`schemaVersion` beside `pages`, additive). No reader of `content.pages` exists today                                    |
| Legacy per-page autosave (`metadata.content.canvasState`)                               | write      | `hooks/useCanvasAutoSave.ts`                                                           | Disabled in the multi-page editor (`autoSave={false}`); left as is, its shape stays read-only for old drafts                                          |
| Host template snapshots (a template freezes a copy of a canvas)                         | read/write | host server: copies the Y.Doc's pages into a new canvas's initial state                | Read back through the initial-document path above. Server side not versioned in this change — see risks                                               |
| Server-side Y.Doc writers (seed, state patches, deck changes, version restore)          | write      | host server, outside the core                                                          | Not versioned in this change: they write v1 shapes into docs with no stamp, which reads as v1. Must be versioned before the first v2 — see risks      |
| Clipboard                                                                               | in memory  | `utils/canvasClipboard.ts` (session-level, never persisted)                            | Not a storage boundary; one session runs one version                                                                                                  |
| AI operations                                                                           | transient  | `@ggraphic/schema` `ai/operations.ts`, applied by `ai/applyOperation.ts` to live state | Applied to the already-migrated live state; ops are model output, never stored. Their schema is versioned with the package (semver), not per document |
| Mobile render (`/mobile-render`, WebView)                                               | transient  | renders `initialProps` handed in by the app                                            | Not stored; the WebView runs the deployed web code                                                                                                    |
| Export (PNG, PDF, PPTX)                                                                 | transient  | `export/` reads live state                                                             | Reads migrated live state; nothing stored                                                                                                             |

## Design

### (a) Version fields

- `schemaVersion` (integer ≥ 1) carries the **core** format version.
  `CANVAS_DOCUMENT_VERSION` in `@ggraphic/schema` is the version this build
  writes.
- `kindVersions` (stateKey → integer ≥ 1) carries the version of each **host
  kind's** list. Host kinds evolve with the host, not with the core; sharing
  one counter would let a host's v2 collide with the core's v2.
- Absent means 1, in both fields. The envelope is checked with Zod
  (`canvasDocumentSchema`); everything else in the object passes through
  untouched, so a host's own top-level keys (the reference host keeps flat
  cover keys next to `pages` in its initial state) survive.

### (b) Migration registry

`createMigrationRegistry(coreMigrations)` builds a registry; the core's
default registry (`documentMigrations`) ships with three steps (1 → 2, 2 → 3
and 3 → 4, each the identity on pages; see "Version 2" to "Version 4"), so
`CANVAS_DOCUMENT_VERSION` is 4.

- A core step is `{ from: n, migrate(doc) }` and lifts the whole document from
  n to n + 1. Steps must be contiguous from 1.
- A host step is `{ from: n, migrate(list) }` for one `stateKey`; it lifts the
  value under that key in every page's state. A host registers its steps with
  `ElementKindRegistration.migrations`; `registerElementKind` forwards them
  (`registerStateKeyMigrations`). A kind without steps is registered too, at
  version 1, so the registry knows the key and can refuse a newer one.
- Every step must be **pure, deterministic and idempotent**
  (`f(f(x)) = f(x)`, and `f` of already lifted data is a no-op). This is
  tested, not trusted: `verifyMigrationRegistry(registry, corpus)` checks
  every registered core and host step over a corpus of stored documents, and
  the core and each host run it in their tests with their kinds registered.
  Determinism makes two clients migrating the same doc write identical
  values, which Yjs merges into one. Idempotence makes it harmless when a
  step meets data that is already lifted (a server seed that copied migrated
  pages but no stamp, two clients racing).
- Idempotence is **not** a repair mechanism. Steps run only when the stored
  version is below this build's. Data written in the old shape _after_ the
  stamp was raised — by an old bundle, or by a peer that lost the race but
  kept writing before its observer fired — reads as current, and no step
  runs again (see "Old writers" below).
- Host kinds register before the first load (`registerElementKind` at start
  up, before the first render). A load before that treats the kind's list as
  opaque: it is neither lifted nor refused.

### (c) `migrateDocument(raw)` on every load, stamp on write

`migrateDocument` returns a discriminated result:

- `current` — nothing to do; `document` **is the input object** (byte-identical
  round-trip, no stamp added, nothing rewritten).
- `migrated` — a structured clone lifted step by step, carrying the new
  `schemaVersion` / `kindVersions`. Feeding it back yields `current`.
- `newer` — the document carries a version this build does not know (core, or
  a host kind this build has registered). Data is untouched.
- `invalid` — the envelope's version fields are malformed or the input is not
  an object.

Writers stamp with `stampDocument` (adds `schemaVersion`, and `kindVersions`
only for kinds above 1). Seeding a Y.Doc stamps `meta.schemaVersion`.

### (d) Forward compatibility

A client that sees a newer version must not write: it would store the old
shape into a newer document. `newer` and `invalid` both become a refusal:

- Y.Doc: `useYjsPages` skips the legacy lift, seeding and migration; its API
  marks the doc refused and its mutators do nothing. `usePageManager` then
  shows the doc's pages as a read-only preview (no page is bound to its
  Y.Map) and returns `schemaRefusal`; the shell shows an alert
  (`shell.schemaRefusal`).
- Initial document: `readInitialDocument` returns the refusal and no pages.
  The host must not mount a writing editor on it; the reference host shows an
  alert page instead, with the same wording as the shell.

### (e) Yjs

- The version lives in the doc's `meta` map: `meta.schemaVersion` for the core
  and `meta['kindVersion:<stateKey>']` per host kind — flat keys, so two
  clients bumping different kinds do not overwrite each other's map.
- Only upgrade: `migrateYDocument` writes a version key only when the stored
  value is lower than the one it migrated to. It writes page values only where
  they differ (`replacePageState`'s JSON-equality guard), so an identity
  migration writes nothing at all.
- Migration runs once per doc in the setup transaction (`SETUP_ORIGIN`,
  untracked by undo), after the sync, never on the unsynced IndexedDB cache.
- Concurrent clients: same version → same deterministic writes, Yjs converges.
  Different versions: the meta observer re-checks on every remote change. A
  newer stamp flips the older client to read-only, live. A stamp that went
  _down_ (last-writer-wins between an older and a newer migrating client)
  makes the newer client re-run its idempotent migration and stamp again; the
  older one, now seeing a newer stamp, stops writing. No loop: a client writes
  only while the stored version is below its own, and stops once it is equal
  or above. The re-lift is triggered by the **stamp**, not the data: if the
  newer stamp wins, whatever the older client wrote in its own shape before
  it saw that stamp stays as written. Version 4 adds a data trigger for the
  page-state format (see "Lift and re-lift").
- Migrations must keep the page ids; a step that changes the set of pages is
  rejected as `invalid` on a Y.Doc (structural page ops are not migrations).

### (f) F0

Documents stored by the reference host today carry no version, so they **are** version 1,
unchanged. Versioning itself rewrote nothing at rest. Since v2, opening an
unstamped or v1 Y.Doc runs the identity step and writes the `schemaVersion`
stamp once, nothing else; a newer doc is never written. Read-only enforcement
for viewers belongs to the collab host (server-side), as it already did for the
legacy lift and kind migrations. `initial_state` is read as before. No stored field is renamed. The only new bytes are additive: a
`schemaVersion` key in the `meta` of newly seeded Y.Docs and in newly written
gallery deck drafts.

## Version 2

Version 2 admits three page-state keys for brand bindings: `bind`
(field → `{ ref, value }`), `brandScheme` (a scheme id) and `brandStamp` (an
8-hex string). The core step 1 → 2 is the identity: `migrate` returns the
document unchanged, and the loader only raises `schemaVersion` to 2. A version
1 page never carries these keys, so there is nothing to rewrite.

Why bump at all: a build that predates the keys does not know them and would
drop them on its next write (no `on<Key>Change` writer, not inherited by added
pages). Version 2 makes such a build refuse the document read-only (`newer`)
instead. The keys are F0: names and shapes are additive-only from here.

`colorScheme` / `colorSchemeId` are a different, host-owned pair and not part
of this; the brand key is `brandScheme` on purpose.

## Version 3

Version 3 admits two page-state keys for templates: `templateRef`
(`{ id, version }`, the template a page came from; `version` an integer ≥ 1)
and `groups` (a list of `{ id, blockRef?, elementIds }`, element groups). The
core step 2 → 3 is the identity: `migrate` returns the document unchanged, and
the loader only raises `schemaVersion` to 3. A version 2 page never carries
these keys, so there is nothing to rewrite. Opening a v2 Y.Doc writes the v3
stamp once, nothing else; a v4 document is refused read-only (`newer`).

Why bump at all: a build that predates the keys would drop them on its next
write. The keys are F0: names and shapes are additive-only from here. They are
persisted and emitted like any page key, but deliberately **not** inherited by
an added or converted page (they describe one page), and the PPTX export
classifies them as unmapped: `templateRef` has nothing to draw, and group
members are exported one by one.

## Version 4

Version 4 changes how a page's state is **stored in a Y.Doc**, not its JSON.
Before it, every state key held one JSON value, so two clients editing
different elements of one collection (`shapeInstances` holds every shape of
the page) resolved last-writer-wins on the whole array, and one side's edits
were lost without a trace. From version 4, element collections, id lists and
three records are Yjs structures that merge per element, per property and per
id.

The core step 3 → 4 is the identity on the JSON document: flat documents (a
host's initial state, deck autosaves, Studio documents) keep their shape and
only carry the new stamp. A build without version 4 therefore also refuses a
flat v4 document read-only, although it could read it. This is accepted: one
counter for both forms is simpler than a Y.Doc-only marker that old clients
would not obey.

Everything below is about the Y.Doc. Its JSON view, the one every consumer
sees (`readPages`, `serializeDeck`, the canvas, exports, a server's flat
mirror), comes from one codec (`@ggraphic/core/ydoc`: `readStateKey`,
`readState`, `writeStateKeys`) and is exactly the version 3 JSON, up to the
order of object keys.

### Stored structure

A structured value is a `Y.Map` under the same state key. It carries a
reserved entry `$kind` that names its class.

| Class      | Keys                                                                                                                                                                                                                        | Stored as                                                                                                                                                      | Reads back as                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `elements` | `shapeInstances`, `frameInstances`, `additionalTexts`, `illustrationInstances`, `assetInstances`, `circleBadgeInstances`, `pillBadgeInstances`, `userImageInstances`, `chartInstances`, and every host kind's `stateKey`    | `$kind: 'elements'`, then element id → `Y.Map` of that element's properties (one entry per property, its value plain JSON) plus `$pos`, a fractional order key | `[{ id, …props }]` in (`$pos`, id) order; `$pos` is stripped, `id` is the map key |
| `order`    | `layerOrder`, `selectedIcons`, `lockedLayerIds`                                                                                                                                                                             | `$kind: 'order'`, then id → fractional order key                                                                                                               | `string[]` in (key, id) order                                                     |
| `record`   | `iconStates`, `templateRotations`, `templateTextAligns`                                                                                                                                                                     | `$kind: 'record'`, then key → plain JSON                                                                                                                       | `Record<string, unknown>`                                                         |
| plain      | everything else: scalars, positions, colours, template text fields, `backgroundImageAdjustments`, `backgroundImageRotation`, `bind`, `brandScheme`, `brandStamp`, `templateRef`, `groups`, `stashedComposerPlanes`, `notes` | the JSON value, as before                                                                                                                                      | the value                                                                         |

Why these classes:

- **`elements`.** The unit people edit concurrently is one property of one
  element: a drag writes `x` and `y`, the colour picker writes `fill`. Nested
  values (`crop`, `filters`, gradients, text runs) stay one JSON value per
  property; a deeper split would multiply the structures to test for a case
  nobody reported. The id is not stored as a property, so no second copy of it
  can disagree with the key.
- **`order` for all three id lists.** `layerOrder` is an order.
  `selectedIcons` looks like a set but is the icon kind's list: an icon that
  `layerOrder` does not track is drawn in `selectedIcons` order
  (`buildCanvasItems` and `buildSortedRenderList` in the editor's
  `utils/canvasLayerManager.ts`), so its order is visible and must survive.
  `lockedLayerIds` is read as a set (`utils/layerLock.ts`); giving it the same
  class saves a fourth structure and reads back today's order exactly. Each id
  is a map key, so no id can be in a list twice.
- **`record` for the three records.** Their entries are independent: one
  icon's state, one template element's rotation or alignment. An entry stays
  one plain JSON value, so two people changing different properties of the
  _same_ icon still resolve last-writer-wins on that icon's `IconState` (see
  "Concurrency"). This is decided, not deferred: a property map per entry
  would be a fourth structure for an edit nobody reported.
- **Plain for the rest.** Scalars have nothing to merge. `bind`, `groups` and
  `backgroundImageAdjustments` are containers too; they stay plain in version
  4 (decided), because no concurrent partial edit of them has been reported
  and every class is more to test. Because readers and writers follow the marker and not a key list, a
  later build can move such a key into a class **without a version step**
  (see "Reading without a registry").

What the structure cannot represent stays plain JSON under the key, and is read
as it is:

- an `elements` value that is not an array of objects with distinct string
  ids, or that has an element with a property named `$pos`;
- an `order` value that is not an array of distinct strings;
- a `record` value that is not a plain object;
- any value with an id or record key that starts with `$` (reserved, see
  "F0 in version 4").

The lift and the writers check this, so reading a structured value always
gives back the value that was written.

### Reading without a registry

A reader must tell a structured value's class without knowing the keys: a
server that does not know a host's element kinds must never read a host
collection back in the wrong shape.

| Option                                                  | Verdict                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Take the class from a key registry                      | Rejected. A reader without the host's registrations (a server, a tool, an older build) would fall back to `toJSON()`, an object keyed by id. That is the failure the format must exclude.                                                                             |
| Infer the class from the value's shape                  | Rejected. An empty map has no shape, but an empty collection must read `[]` and an empty record `{}`. An `order` map (id → string) cannot be told from a record of strings (`templateTextAligns` maps ids to `'left'`). The guess would also change as values change. |
| A class registry in `meta` (for example `stateKinds`)   | Rejected. It splits one fact over two shared types: a peer can receive a value before its class, and two clients registering at once resolve last-writer-wins.                                                                                                        |
| **A reserved entry `$kind` inside each structured map** | **Chosen.** The value describes itself, arrives in the same update as its content and cannot disagree with it; an empty map still knows its class. Cost: one entry per structured value, and `$` as a reserved prefix.                                                |

Reading rules (`readStateKey`):

- A value that is not a Yjs type is returned as it is: every plain key, a
  structured key in a document from before version 4, and plain JSON written
  later by an old writer.
- A `Y.Map` whose `$kind` is `elements`, `order` or `record` is read as that
  class.
- A `Y.Map` whose `$kind` is any other value is **unreadable** and reads as
  absent. A new class needs a new document version, so a build that meets one
  has already refused the document and only shows a preview.
- Any other Yjs type, and a `Y.Map` without `$kind`, reads as its `toJSON()`.
  No writer creates one.

Only the **lift** and the **first structured write of a key** need to know
which keys belong to which class: the key classes in `@ggraphic/core/ydoc`,
plus the host kinds' `stateKey`s the caller passes in. Every later write diffs
into whatever structure the marker names.

### Element order

The elements of a collection are ordered by `$pos`, the ids of an `order` map
by their value. Both are fractional keys from `posBetween`, the scheme the
page order already uses (header of the editor's `collab/pagesDoc.ts`). Ties
are broken by id; a writer that needs a key between two tied neighbours
re-spaces that list first, every key with the random suffix, so two clients
re-spacing at once do not tie again.

A valid key is a non-empty string of alphabet characters that does not end in
`0`; only such keys can bound `posBetween`. Readers sort whatever is stored as
plain strings; a writer treats a stored key of any other form (or a missing
one) as no key and gives that id a fresh one.

- The lift writes the deterministic chain (`posBetween(previous, null)`,
  without a random suffix, as seeding does for pages), so two clients lifting
  the same JSON write equal values. The chain grows by about one character per
  six entries: 20 characters at the 100th.
- A user insert or move writes `posBetween(before, after)` plus the
  two-character random suffix pages use, so two clients inserting into the same
  gap do not mint the same key.
- A move writes one entry: the element's `$pos`, or the id's key.

Why not a `Y.Array` of ids or of element maps: a move in a `Y.Array` is a
delete plus an insert. Two clients moving the same element at once leave it in
the array twice, and a moved element map would have to be cloned, dropping
the edits another client made to it meanwhile. A fractional key is one map
entry: concurrent moves of one element end in one position, and the element
keeps its identity.

### Version and marker

`meta.schemaVersion` 4 is the marker of the format. There is **no**
`meta.stateFormat` key:

- Old clients obey `schemaVersion` only (`readYDocRefusal`); a second marker
  would protect nobody.
- Readers do not need it: each structured value carries `$kind`.
- The lift does not need it: it is triggered by the data as well (below), so a
  document-level "lifted" flag would repeat what the values already say.
- A second marker can disagree with the stamp (both are last-writer-wins
  entries in `meta`) and would need rules of its own for that.

Two rules tie the stamp to the data:

1. **A writer creates a structured value only in a document at version 4 or
   above, or in one it stamps 4 in the same transaction** (a seed, a newly
   created document). In a document below 4 it writes plain JSON.
2. **The open-time lift and the raise of the stamp to 4 happen in one
   transaction.** A version 3 client receives both in one update, so the
   update that first shows it a structured value also turns it read-only.

### Concurrency

| Two clients at the same time                                       | Version 3 (one JSON value per key)     | Version 4                                                                                                            |
| ------------------------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Edit different elements of one collection                          | one array wins, the other edit is lost | both edits survive                                                                                                   |
| Add different elements to one collection                           | one added element is lost              | both survive; their relative order is arbitrary but the same everywhere                                              |
| Edit different properties of one element                           | one is lost                            | both survive                                                                                                         |
| Edit the same property of one element                              | last writer wins                       | last writer wins (Yjs order). Accepted: there is nothing to merge                                                    |
| Edit different properties of one icon (an `iconStates` entry)      | one is lost                            | last writer wins on that icon's `IconState`: a record entry is one value                                             |
| Delete an element while the other edits it                         | whichever array wins                   | the delete wins; the edit lands in a removed map                                                                     |
| Move the same element (`$pos`, or one id in `layerOrder`)          | one array wins                         | one position wins; the element is never duplicated                                                                   |
| Move different elements                                            | one array wins                         | both moves apply                                                                                                     |
| Lock or unlock different layers                                    | one list wins                          | both apply                                                                                                           |
| Both lock (or both unlock) the same layer                          | one list wins                          | one entry (or none)                                                                                                  |
| Delete an element while the other moves it in `layerOrder`         | one list wins                          | the move survives, so `layerOrder` may keep an id without an element; `buildSortedRenderList` already skips such ids |
| Both add the first element of a kind where the key is still absent | one array wins                         | one new structured value wins at key level, so one side's first element is lost (see "Risks")                        |
| An old writer writes plain JSON under a structured key             | —                                      | its whole value wins at key level, as in version 3; the key is lifted again later                                    |

### Lift and re-lift

- **When:** on open, by a client that may write the document (not refused),
  after the sync, never on the unsynced local cache. It runs in the setup
  transaction (`SETUP_ORIGIN`, untracked by undo) together with the legacy
  lift, the form-state fold and `migrateYDocument`, in that order, so lift and
  stamp reach peers in one update (rule 2). It runs again whenever the `meta`
  observer re-settles the version. A lift is never part of an undo step.
- **An empty document** (no pages, no seed watermark) is neither stamped nor
  lifted on open: there is nothing to lift, and its seed stamps it. The seed
  raises the stamp first and then builds its pages structured, in one
  transaction (rule 1; a state map built outside the document cannot read the
  stamp, so the order matters).
- **Trigger: the stamp or the data.** It runs when the stored version is below
  4, and also when a key the client classes as structured still holds a plain
  value the structure can represent. This is the old-shape detection that
  "Old writers" asks the first real step to bring: the old shape is
  recognisable because it is not a Yjs type.
- **What it writes:** per such key one structured value built from the plain
  JSON, so `readStateKey` returns what was there before. It is deterministic
  (the chain above), idempotent (a structured key is left alone) and the
  identity on the JSON view.
- **Two clients lifting at once** write two structured values with equal
  content under one key, and one wins at key level (in Yjs the entry of the
  higher client id). What a client wrote _into_ the losing value before it saw
  the winner is lost; the window is from its open until the peer's lift
  arrives, one round trip. The loss is whole: the losing client's elements
  read as the winner's, never as a mix.
- **Lift on write:** a version 4 writer that writes a key it classes as
  structured and finds plain JSON there writes the new value structured. The
  lift is then part of that write, and of its undo step if the write is
  tracked; the plain value before it stays readable.
- **Previews and refused clients never lift.** They read both forms through
  the codec. A build that has the codec but is still at version 3 (the readers
  release) therefore shows a v4 document correctly, read-only.

### Old writers in version 4

- **A build with the refusal** (every published version since
  `0.1.0-alpha.0`) sees `schemaVersion` 4 and turns read-only, also live
  through the `meta` observer, and by rule 2 in the same update that brings the
  first structured values. A build without the codec reads a structured value
  as an opaque object: `carryInstanceState` reads a list that is no array as
  `[]`, so its read-only page shows without those elements. It writes nothing.
  The exception is the race in which its own stamp write wins over a newer one
  (see "(e) Yjs"): until the newer client stamps again it may write, and what
  it writes is plain JSON.
- **A build from before the refusal** (none is published; whether host bundles
  from before the core was published still run is _unverified_) reads
  structured values as opaque objects as well, so its lists read as empty, and
  its next write of such a key replaces the structured value with an array of
  only what it knows. Those elements are lost, and no reader can bring them
  back. The format cannot protect against a writer that ignores the stamp;
  only retiring such bundles can.
- **Why a lenient reader and the data-triggered re-lift are enough** for every
  other writer: a writer that obeys the stamp writes the old shape only before
  it sees the stamp, or in the race window. What it writes is plain JSON under
  one key, which the codec reads as it is. That is the path every plain key
  takes, so this lenient reader is permanent, not a window of N releases. The
  next open, or the next version 4 write of that key, lifts it again. Its write
  wins at key level over concurrent structured edits of that key: version 3's
  behaviour, not a new loss.
- **No dual write.** Writing both shapes would double the document, keep the
  old copy under key-level last-writer-wins (so an old writer still wins), and
  need a rule for which copy is true when they disagree.

### Server-side writers

A server that writes canvas Y.Docs (the host's sync server: seeds, state
patches, deck changes, version restore) must:

1. **Read and write page state only through the codec.** `toJSON()` of a
   structured value is an object keyed by id with `$kind` and `$pos` in it,
   not the document's shape, and `state.set(key, value)` with plain JSON over
   a structured value is an old writer. A Yjs value cannot be copied into
   another map either (an integrated type cannot be inserted twice): read
   plain, write through the codec.
2. **Stamp `meta.schemaVersion`** with the version it writes, in the same
   transaction that creates the document (a seed into an empty document, pages
   written into a document that had none). Only then may it write structured
   values (rule 1).
3. **Refuse to write into a newer document**: when `meta.schemaVersion` or a
   `kindVersion:<stateKey>` is above what it knows, or malformed, it writes
   nothing, like `readYDocRefusal` on a client.
4. **Leave the stamp of an existing document alone.** It cannot run a host's
   kind migrations. In a document below 4 it writes through the codec with
   lifting off, so its values stay plain until a client opens and lifts the
   document.
5. **Pass the host's collection keys** to the codec when it writes. Without
   them, a host collection that is still absent or plain is written as plain
   JSON: correct, but merged per key until a client lifts it.
6. **Report a refusal as an error.** The caller must not answer it by
   patching a flat JSON mirror of the document instead: the next open reads
   the Y.Doc, not the mirror, so the edit would exist in one copy only.

### F0 in version 4

Once a version 4 document is stored, these are permanent:

- `$kind`, the reserved entry of every structured `Y.Map`, and its values
  `elements`, `order` and `record`.
- `$pos`, the reserved property of every element map in an `elements` value.
- The fractional key format of `$pos` and of `order` values: the page-order
  alphabet (`0-9A-Za-z`, compared as plain strings), ties broken by id; a
  valid key is non-empty and does not end in `0`.
- `$` as a reserved prefix: no element id, `order` id or record key starting
  with `$` is stored in a structured value.
- The class of each key listed above. A key may later join a class (additive:
  readers follow the marker), but never leave one or change it.
- `schemaVersion` 4 meaning "page state may hold structured values".

Not introduced: `meta.stateFormat`. The codec's names (`@ggraphic/core/ydoc`,
`readStateKey`, `readState`, `writeStateKeys`) are public API under semver,
not stored data.

## Deliberately left out

- **Server-side writers and readers** (the reference host's sync-server
  internal API, its deck changes, version restore, template snapshots) are not
  changed by the core. Version 4 states the rules they must follow
  ("Server-side writers" there); implementing them is the host's change.
- **Rewriting at rest.** Old documents are lifted on open, lazily, never by a
  batch job.
- **Downgrades.** There is no `vN → vN-1`; an older client goes read-only.
- **Composer specs.** A host's content spec and composer are not the neutral
  format (decision of 27.10.2026) and are versioned by the host, if at all.
- **Per-element versions.** One number per namespace (core, each host kind) is
  enough; an element-level version would multiply the states to test.

## Old writers

A writer that does not run this mechanism writes the old shape into a
document whose stamp is already raised: bundles from before it (desktop
builds, cached service workers, open tabs), server-side writers (below), a
peer in the short window before its observer sees a newer stamp. Such a
writer never touches the stamp, so every newer client then reads the doc as
`current` and never lifts that data. Idempotence does not help there. What
does:

- **Lenient readers.** For N releases after a step ships, the code that reads
  the migrated keys also accepts the previous shape (the step's input), so
  old-shape data written late still renders and edits correctly. Only after
  that window may a reader drop the old shape.
- **Old-shape detection.** A step whose input shape is recognisable can come
  with a detector; a load that finds old-shape data under a current stamp then
  re-lifts those keys (steps are idempotent, so this is safe). Version 4 is
  the first step with one: a key classed as structured that holds plain JSON
  is lifted again on the next open, and on the next write of that key (see
  "Version 4", "Lift and re-lift"). For version 4 the lenient reader is
  permanent, because the old shape is the plain shape every other key keeps.

## Risks

- **Server-side and out-of-hook Y.Doc writers** bypass the client lift and
  never check the stamp: the host's sync-server seed and state patches, its
  deck-changes endpoint, version restore, and the AI/chat edit paths that
  write a canvas through the server. With version 1 harmless; before the
  first v2 each must refuse a newer doc, or migrate what it writes, and the
  snapshot copies must carry the stamp. From version 4 a server that copies
  whole values per key is an old writer: it reads structured values in the
  wrong shape and writes plain JSON over them. It must follow "Server-side
  writers" in "Version 4" before the first client writes version 4.
- **Old bundles** keep writing the old shape (see "Old writers"): mitigated
  only by lenient readers and detectors, not by the stamp.
- A migration that rewrites a whole instance list races with a concurrent edit
  of that list on a not-yet-migrated peer; Yjs keeps one of the two values.
  The version 4 lift has the same race for the round trip after open.
- **Version 4 keeps key-level last-writer-wins in three places, all
  accepted:** two clients creating the same absent structured key at once (the
  first element of a kind on a page), the same property of one element, and
  one entry of a record. Pages are not pre-created with empty structured
  collections to close the first case: that would add about 15 entries per
  page and turn an absent key into `[]` in the JSON view, for a race of one
  round trip. Whether pages are already built with every collection present
  as `[]` (which would narrow it further) is _unverified_.
- **A build from before the refusal** that meets version 4 data loses the
  elements of every collection it writes (see "Old writers in version 4").
- Host top-level keys outside `pages` (the reference host's flat cover
  state in its initial state) are opaque to the core; a host step does not reach them.
