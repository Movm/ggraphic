# Public API proposal

Status: proposal for stage D of the [embedding roadmap](embedding-roadmap.md), 2026-11-01. Owner of the decisions: Moritz. This is D1: inventory, proposal and a report tool. D2 changes the export maps, after C2.

## Summary

- **Today everything is API:** the published export map of `@ggraphic/editor` is a `./*` wildcard. That makes 429 entries with 1,892 exported names. `@ggraphic/schema` has the same wildcard (19 entries).
- **Actual use is much smaller:**
  - Outside tests, Studio, the Grünerator and the other packages import 147 editor subpaths.
  - Tests import 105 more.
  - 177 entries have no consumer outside the editor.
- **The proposal:**
  - **Public surface:** 41 entry points, grouped by domain rather than by file. They are listed in the table under [Proposed surface](#proposed-surface).
  - **Unstable channel:** `@ggraphic/editor/internal/*`, exported on purpose, with no semver promise.
  - The Grünerator keeps working throughout: what has no public home yet goes through `internal/*` until it gets one.
- **Gaps in the public surface:** the Grünerator's deep imports point at three.
  - **Custom element kinds:** writing one needs canvas internals (transformer, snapping, lock state).
  - **Composer:** a text-fitting layer with brand-specific names in a neutral package.
  - **Store:** the store and its hooks.
- **Report tool:** `pnpm api:report` writes `packages/<name>/api-report.md`. CI runs `pnpm api:check`, which only reports.

## What is imported today

Counted from the TypeScript syntax tree, so it covers static and type imports, re-exports, `import()`, `vi.mock` and CSS `@import`. Sources:

- ggraphic `main` at `665bc6b`;
- PR #86 at `0a2be62`, for Studio after stages A and B;
- the Grünerator `master` at `ba5d8d44ba`.

The table per subpath is in [public-api-inventory.md](public-api-inventory.md).

| Consumer                                     | Files | Distinct subpaths | Outside tests |
| -------------------------------------------- | ----: | ----------------: | ------------: |
| Studio (`apps/studio`, `apps/studio-server`) |    83 |                52 |            50 |
| Studio after A and B (PR #86)                |     — |                48 |            44 |
| The Grünerator                               |   338 |               249 |           141 |
| `@ggraphic/templates-open` → other packages  |     — |                10 |            10 |
| `@ggraphic/editor` → itself, by package name |   459 |               322 |             — |

What the numbers say:

1. **The Grünerator's imports sit in one package.** `packages/canvas-editor` holds 319 of the 338 files. It re-exports ggraphic modules to the rest of the app through 31 shim files (88 re-exports). Only these places import ggraphic directly:
   - `packages/contracts` (13 files): `core`, `schema` and schema subpaths only;
   - `apps/ggraphic-demo` (3 files);
   - three test files.

   A codemod therefore touches one package plus a handful of files.

2. **Over 100 Grünerator subpaths appear only in tests:** 108 subpaths, used by 196 test files. These are integration tests against the Grünerator's own configs; only 11 share a file name with a ggraphic test. They should not shape the public surface. Tests may import `internal/*`.
3. **Studio needs little.** After stages A and B it uses 48 subpaths. Ten of them are the page model from #85 and belong behind one entry.
4. **The editor imports itself by package name:** 1,857 imports of 322 subpaths. Any change to the export map breaks these unless they become relative imports first. This is the first step of D2.
5. **Schema subpaths need no public home.** Every schema subpath the Grünerator uses (`schema/media/*`, `schema/text/*`, `schema/richtext`) is already re-exported from the `@ggraphic/schema` root. Moving the Grünerator off them is mechanical.
6. **The two export maps disagree.** 21 editor files are published through the wildcard but missing from the development export map. One example is `utils/fontAliases`, which the Grünerator imports. The API report lists them.
7. **One import exists only through a Vite alias:** Studio's render gate imports `templates-open/test/testBrands` that way. The path is not published, so it stays a monorepo-only import.

## Proposed surface

Principles:

- **Entries by domain, not by file:** an entry is a facade module that re-exports explicit names (no `export *`). The file layout can then change without an API change, and the API report changes only when the surface does.
- **No physical move:** files stay where they are. The export map does the separation. Public facades live in `src/entries/<name>.ts`, and `./internal/*` maps to the compiled files with no promise. This keeps D2 to export maps, facades and import rewrites.
- **Pure and React stay apart:**
  - `core` and `schema` stay free of React, Konva and the DOM, because the Grünerator's `contracts` runs on the server and in the mobile app.
  - Inside the editor, the data entries (`page`, `elements`, `templates`, `text`, `config` types) should load without React. This was checked only for the element utility files themselves, not for what they import transitively. D2 should add an import test that runs in Node.
- **`internal/*` is a channel, not a back door:**
  - Studio must not use it (lint rule).
  - The Grünerator may.
  - Every `internal/*` import in the Grünerator's production code is a gap: it gets an issue or a public home.

| Entry point                                                                                                   | Content                                                                                                                                                                                                                                                                                                 | Built from today                                                                                                                                                      | Used by                              |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `@ggraphic/editor/embed`                                                                                      | `<GgraphicEditor>` and its props (C2)                                                                                                                                                                                                                                                                   | new                                                                                                                                                                   | every new host                       |
| `@ggraphic/editor/page`                                                                                       | The generic page model: `createPageConfig`, `createPageActions`, `PageState`, `pageStateFrom`, seeds, `placeTemplate`, `templatePackFromJson`, `TextPreview`, typography, fitting and logo size                                                                                                         | `page/*` (#85, #86)                                                                                                                                                   | Studio                               |
| `@ggraphic/editor/config`                                                                                     | The escape hatch for hosts with their own page logic: `FullCanvasConfig` and its element configs, `loadCanvasConfig`, the factories (`makeSectionDefiner`, `create*Actions`, `carryInstanceState`, `BaseCanvasState`), `injectFeatureProps`, placeholders, `createShareSection`                         | `configs/*`                                                                                                                                                           | Grünerator (11 subpaths), Studio (6) |
| `@ggraphic/editor/shell`                                                                                      | `CanvasEditorShell`, `CanvasEditorProvider`, `useCanvasEditorServices`, `registerEditorShell`, `BlockInsertContext`, `CanvasEditorSkeleton`, `PagePreview`, `CanvasEditorLayout`, `CanvasEditorProps`, `CanvasEditorExportApi`, `InitialPageDef`, `useAnnounce`                                         | `CanvasEditorProvider`, `components/CanvasEditor/*`, `layouts/*`, `hooks/usePageManager`                                                                              | both                                 |
| `@ggraphic/editor/canvas`                                                                                     | Rendering without the shell: `GenericCanvas`, `ConfigCanvas`, `StandaloneCanvas`                                                                                                                                                                                                                        | `components/{Generic,Config,Standalone}Canvas`                                                                                                                        | Grünerator, its demo app             |
| `@ggraphic/editor/kinds`                                                                                      | Custom element kinds: `registerElementKind`, `registerKindRenderers`, `createSelectableWrapper`, and what a renderer needs from the canvas (transformer presets, snapping, lock state, focus return, stage follow). **New**, see the first borderline case below                                        | `utils/elementKinds`, `components/kindRenderers`, parts of `utils/*`                                                                                                  | Grünerator                           |
| `@ggraphic/editor/store`                                                                                      | `CanvasStoreProvider`, `useCanvasStore`, `useCanvasStoreSelector`, `useIsElementSelected`, the auto-save store; **not** `createCanvasEditorStore` (see the third borderline case below)                                                                                                                 | `stores/*`                                                                                                                                                            | Grünerator                           |
| `@ggraphic/editor/services`                                                                                   | Host service types (`CanvasEditorServices`, image URL, media library, print, imprint, feedback), `browserFileDelivery`, `plainImageUrls`, `registerToast`, `registerHostStorageKeys`                                                                                                                    | `hostServices`, `utils/editorToast`, `utils/hostStorageKeys`                                                                                                          | both                                 |
| `@ggraphic/editor/brand`                                                                                      | `registerBrandPacks`, `activeBrand`, `registeredBrands`, document brand                                                                                                                                                                                                                                 | `brand/*`                                                                                                                                                             | both                                 |
| `@ggraphic/editor/templates`                                                                                  | `defineTemplate`, `registerTemplates`, template geometry and gate adapter, formats (`CANVAS_FORMATS`, `getCanvasFormat`)                                                                                                                                                                                | `templates/*`, `formats/index`                                                                                                                                        | both, `templates-open`               |
| `@ggraphic/editor/elements`                                                                                   | The element model the editor adds to core: instance factories and types for shapes, charts, badges, frames, user images, icons, illustrations and assets (`registerAssetCatalog`); duplicating; lifted blocks                                                                                           | `utils/{shapes,chartUtils,circleBadgeUtils,pillBadgeUtils,frameUtils,userImageUtils,iconInstances,canvasIcons,canvasAssets,duplicateElement,…}`, `blocks/liftedBlock` | both                                 |
| `@ggraphic/editor/text`                                                                                       | Measuring and wrapping (`runMeasurer`, `wrapText`, `measureTextWidthWithFont`), `ensureFontsReady`, font aliases, and the generic text fitting now in `composer/textFit` (see the second borderline case below)                                                                                         | `utils/{textUtils,ensureFontsReady,fontAliases}`                                                                                                                      | both                                 |
| `@ggraphic/editor/illustrations/<set>` (7)                                                                    | One entry per illustration set, so a host bundles only the sets it uses                                                                                                                                                                                                                                 | `utils/illustrations/<set>`                                                                                                                                           | Grünerator, Studio, `templates-open` |
| `@ggraphic/editor/sidebar`                                                                                    | Building blocks for host panels: `SidebarPanel`, `SidebarTabBar`, `SubsectionTabBar`, `SidebarSlider`, `SidebarHint`, the reusable sections (`CombinedTextSection`, `ChartSettingsSection`, `ImageAdjustSection`, `FrameSettingsSection`, `ToolsSection`, `AssetsSection`, `UploadsSection`), tab types | `sidebar/*`                                                                                                                                                           | Grünerator (16), Studio (4)          |
| `@ggraphic/editor/collab`                                                                                     | Yjs: `useYjsCanvasBinding`, `useYjsPages`, `bindCanvasStoreToYMap`, `useSelectionAwareness`, page-doc helpers                                                                                                                                                                                           | `collab/*`                                                                                                                                                            | Grünerator                           |
| `@ggraphic/editor/ai`                                                                                         | `applyOperation`, `describeCanvasElements`, `buildIllustrationCapability`, the AI capability types                                                                                                                                                                                                      | `ai/*`                                                                                                                                                                | Grünerator                           |
| `@ggraphic/editor/export`                                                                                     | PPTX (`registerPptxFonts`, model types), print and PDF, zipped page images                                                                                                                                                                                                                              | `export/*`, `utils/zipPageImages`                                                                                                                                     | Grünerator                           |
| `@ggraphic/editor/i18n`                                                                                       | `messages`, `registerMessages`, `registerHostMessages`, `useMessages`                                                                                                                                                                                                                                   | `i18n/*`                                                                                                                                                              | both                                 |
| `@ggraphic/editor/styles`, `…/styles/editor`, `…/styles/tokens`, `…/styles/tailwind`, `…/styles/compiled` (5) | Stylesheets (`compiled` from C1, #84)                                                                                                                                                                                                                                                                   | unchanged                                                                                                                                                             | both                                 |
| `@ggraphic/core`                                                                                              | unchanged (134 names)                                                                                                                                                                                                                                                                                   |                                                                                                                                                                       | all                                  |
| `@ggraphic/schema`                                                                                            | the root only; drop the `./*` wildcard                                                                                                                                                                                                                                                                  |                                                                                                                                                                       | all                                  |
| `@ggraphic/ui` (1 + 4 stylesheets)                                                                            | unchanged                                                                                                                                                                                                                                                                                               |                                                                                                                                                                       | Studio                               |
| `@ggraphic/ai`, `@ggraphic/collab`, `@ggraphic/templates-open`, `@ggraphic/brand-default`                     | the root of each, unchanged                                                                                                                                                                                                                                                                             |                                                                                                                                                                       |                                      |

**Count:** 41 entry points.

| Package                                                             | Entries | Of which                                            |
| ------------------------------------------------------------------- | ------: | --------------------------------------------------- |
| `@ggraphic/editor`                                                  |      30 | 18 code entries, 7 illustration sets, 5 stylesheets |
| `@ggraphic/ui`                                                      |       5 | the root and 4 stylesheets                          |
| `core`, `schema`, `ai`, `collab`, `templates-open`, `brand-default` |       6 | one root each                                       |

Measured against what consumers use today:

- The editor entries carry about 330 of the editor names that Studio, the Grünerator and the packages use outside tests.
- About 60 names, the borderline cases below, stay in `internal/*` for now.

This is below the roadmap's estimate of 50–70 entries because the entries group by domain. Keeping today's file paths would need about 150 public entries, one per subpath used outside tests, and would freeze the file layout.

The root `@ggraphic/editor` stays without content for now. Whether it should become an alias of `./embed` once C2 has landed is one of the [open questions](#open-questions).

## Borderline cases

The Grünerator's production code imports 33 subpaths that have no public home in this proposal. They fall into five groups.

1. **Custom element kinds (renderer kit), 17 subpaths.**
   - **Where:**
     - Most come from one custom kind, `primitives/BalkenGroup.tsx`, and its registration `brand/grueneKinds.tsx`.
     - Two are host seams: `registerMeasuredCornerReservation` and `surfaceGlow`.
     - The rest pass through the Grünerator's re-export shims (`utils/index.ts`, `index.ts`).
   - **What it uses:**
     - `ELEMENT_TRANSFORMER`, `LOCKED_TRANSFORMER`, `useIsItemLocked`;
     - `snapByBounds`, `useSnapScheduler`, `isGroupDrag`;
     - `captureFocusOrigin`, `returnFocus`, `followStage`;
     - `applyPixelHitArea`, `normalizeRotation`.
   - **Diagnosis:** a gap in the public surface, not a shortcut. `registerKindRenderers` is public in spirit, but a renderer cannot be written without these.
   - **Proposal:** a curated `editor/kinds` entry with exactly what a renderer needs, documented with one example kind. The rest of `utils/*` stays internal.
2. **Composer, 4 subpaths, used by 13 Grünerator layout files.**
   - **Generic part:** `composer/textFit` holds generic text fitting (`wrapWords`, `balancedWrap`, `largestSizeWordsFit`).
   - **Brand-specific part:** `composer/textFit` also holds `fitStoererText` and the `STOERER_*` constants (German "Störer", a burst badge). `composer/steckbriefLayout` and `configs/buildSharepicText` are Grünerator formats. So is `VORLAGE_DRAG_TYPE` in `utils/mediaDrop`. `sidebar/sections/StudioGallery` sits in the editor under a Studio name.
   - **Conflict:** this clashes with the brand-neutrality rule in CONTRIBUTING.md.
   - **Proposal:**
     - The generic fitting goes public in `editor/text` under neutral names.
     - Steckbrief, Störer and Sharepic text move back into the Grünerator.
     - The section names in German (`DiagrammeSection`, `FormenSection`, `RahmenSection`) are renamed when they become public.
3. **Store internals, 3 subpaths.**
   - **What:** the Grünerator calls `createCanvasEditorStore` and reads `CanvasEditorState` directly.
   - **Cost:** making those public turns the whole store shape into API, and every new field becomes a semver question.
   - **Proposal:** publish the provider and the selector hooks. Keep the factory and state type internal until the Grünerator's composer has moved to `<GgraphicEditor>` or `FullCanvasConfig` callbacks, then look again.
4. **Editor UI primitives and `cn`, 4 subpaths, one of them (`cn`) counted under group 1.**
   - **What:** `ui/alert-dialog`, `ui/button`, `ui/skeleton` and `utils/cn`, used in Grünerator panels.
   - **Proposal:** these are the editor's own shadcn copies, so they stay internal. A host uses its own UI or `@ggraphic/ui`.
5. **Smaller items.**
   - **Duplicate of core:** `utils/colorLuminance` duplicates `contrastRatio` in `@ggraphic/core`; use core.
   - **No public home yet:** `hooks/useFontGeneration`, `hooks/useIconCatalog`, `utils/canvasImageSource` and `utils/printImageInfo` stay internal until a second host needs them. The last two are counted under group 1.
   - **Unnecessary `export *`:** the Grünerator's shims re-export whole modules (`hooks/index`, `utils/canvasLayerManager`, `utils/canvasValueResolver`, `utils/canvasClipboard`, `utils/snapping`). The codemod should replace them with the names actually used.

## D2 in order

1. **Self-imports:** turn the editor's own `@ggraphic/editor/*` imports into relative ones (codemod, `.js` suffixes for `check:esm`).
2. **Facades:** add the facades under `src/entries/` and their export-map entries next to the existing ones. Map `./internal/*` to the compiled files. Regenerate the API report and review the facade sections.
3. **Studio:**
   - Move Studio to the facades.
   - Add a `no-restricted-imports` rule that allows only the public entries.
   - Exempt the render gate harness (`src/gate/`): it uses the monorepo-only `templates-open/test/testBrands`.
   - The render gate proves the move.
4. **One alpha with aliases:** the old deep paths keep working through the existing `./*` wildcard. The changeset announces their removal.
5. **Grünerator codemod:**
   - The table in the inventory is the mapping from subpath to entry.
   - Imports with a public home move to it; the rest move to `internal/*`.
   - Each remaining `internal/*` import in production code gets a Grünerator issue.
6. **Next alpha:** drop the `./*` wildcards from `editor` and `schema`.

## The API report

- **Command:** `pnpm api:report` (`scripts/api-report.mjs`) writes `packages/<name>/api-report.md` for each package. Each file has one section per entry of the published export map. A wildcard is expanded over the files that `tsconfig.build.json` compiles, so tests and fixtures stay out, as in the tarball. Each section lists every exported name with its signature.
- **Speed:** a full run takes about 3.5 s and 0.9 GB.
- **Signatures:**
  - Interfaces list their own members and their `extends` clause, not inherited members, so DOM props do not flood the file.
  - A signature longer than 400 characters is cut and stamped with a hash of the full text, so a change in the cut part still shows.
- **Development map:** each report also lists published entries that are missing from the development export map.
- **In CI:** `pnpm api:check` runs in the `check` job after `typecheck`. It compares with the committed reports. On a difference it prints the added, removed and changed entries, writes a warning annotation and a step summary, and exits 0. It never blocks a merge. A pull request that changes the surface on purpose runs `pnpm api:report` and commits the result, so the change is reviewed as a diff.
- **Why not api-extractor:**
  - It needs built declaration files, so the report would need a build first.
  - It reads one entry per run, and today the editor has 429.
  - After D2, with about 40 entries, it could be reconsidered. Its main gain would be `@public`/`@internal` release tags.

## Open questions

1. **Gap or move back:** is the composer text fitting generic enough for `editor/text`? Or does all of `composer/*` move back into the Grünerator?
2. **Custom element kinds:** should `editor/kinds` be public in D2? Or should it stay in `internal/*` until a second host writes a custom kind?
3. **Package root:** should the root `@ggraphic/editor` become an alias of `./embed` once C2 has landed?
4. **Grünerator tests on internals:** should they stay on `internal/*`, or should the ones that test ggraphic behaviour rather than Grünerator configs move into this repository?
