# @ggraphic/editor

## 0.1.0-alpha.4

### Patch Changes

- 0ed7bdb: A newly added text starts at 120 / 72 / 56 px (heading / subheading / text) across 80 % of a 1080 px page, and grows with the page width on every format. Before, it started at 48 / 36 / 32 px in a 400 px box and scaled only on slides, a third of the size of the headlines templates set.

## 0.1.0-alpha.3

### Minor Changes

- 532ecff: `addPage` and the host's `EditorAddPage` take `inherit: boolean | PageInheritance`. `{ brand: true, background: false }` adds a page that keeps the active page's scheme and brand bindings (`colorScheme`, `colorSchemeId`, `bind`, `brandScheme`, `brandStamp`) without its background (photo, colour, composer planes). Such a page drops the bindings of background fields (for example `bind.backgroundColor`), since it carries none of those fields. `{ brand: false, background: true }` is the reverse. `true` and `false` mean what they meant before. `PageInheritance` is exported from `@ggraphic/editor/shell`, and `extractInheritablePageState` takes it as an optional third argument.
- 5be7dcc: Export `BLANK_PAGE_ID` from `@ggraphic/editor/embed` and `@ggraphic/editor/host`: the page config id of the empty page `GgraphicEditor` registers, for a host that starts a blank design (`pages: [{ configId: BLANK_PAGE_ID, state: {} }]`). The host entry loads no React, so a server component can read it too.
- 24a0d79: `captureActivePage` takes `fontWaitMs`: the longest wait for fonts before the export, after which the fallback faces are used. Without it the export waits until the fonts settle, as before.

  A web view that cannot fetch a font file can leave its faces loading for good (WKWebView in an Expo DOM component), and `captureActivePage` then never returned. `@ggraphic/react-native` passes 3000.

- 34c88be: `GenericCanvasRef.imageLoadState()` returns how many image elements are still loading (`pending`) and how many failed to load (`failed`). A capture is complete only when both are 0. `imagesSettled()` is also true after a failed load, so a host could not tell a complete capture from one without its photo.

  `GenericCanvasRef.retryFailedImages()` loads every failed image element again and returns how many. They count as pending at once. Before, a failed image stayed failed: `use-image` loads again only for a new url.

  **Breaking for direct importers of `utils/pendingImages`** (the deep path under the `./*` export): `PendingImagesContext` now holds `ImageLoads` (`{ pending, failed }`) instead of one `Set<string>`, and the module adds `ImageRetryContext` and `useImageRetry`. The public entries are unchanged.

- 8b286ef: Export `formatLabel` and `formatDescription` from `@ggraphic/editor/host` and `@ggraphic/editor/templates`: a format's name and size line in the language of the message catalogue (`registerMessages('en' | 'de')`). The built-in formats' `label` and `description` fields stay in their original language (German); show these functions instead. The host entry loads no React, so a server component can list formats in English after `registerMessages('en')`.
- cfeca71: Relicensed from MPL-2.0 to AGPL-3.0-only. Versions published before this change remain available under MPL-2.0.
- 73f7316: An uploaded photo's durable URL replaces its `blob:` preview in the whole undo history instead of becoming an undo step of its own. Before, undo after a slow upload could bring back the revoked preview and save it, so the photo was lost for everyone. `createActions` gets an optional sixth argument, `history` (`CanvasActionHistory`), which `createUserImageActions` and `createElementActions` take as their last argument. A template that builds its own actions passes it on; without it the swap stays an undo step as before.

### Patch Changes

- 49f3140: Undo in a collaborative session no longer reverts other people's edits. An edit that arrives from another client is written into this client's undo history, so undo and redo only revert this client's own steps. They are patched per element and property, so an own change to another element in the same collection still undoes.

  The edit is measured from the value its writer started from, so an own step that lost a simultaneous write to the same key stays in the history and can be redone. Layer order and locked layers merge per id, so undo of a reorder still works after someone adds a layer. Undo of an own add removes the element even after someone else changed it. `useYjsPageStateSync` passes that starting value to `onRemoteState` as a second argument.

- 74f0c84: The editor is as tall as the viewport again in hosts that import `@ggraphic/editor/styles/editor` without `tokens.css` and don't declare `--editor-height` themselves (#152). Its root used to read the token without a fallback, so its height became `auto`, the editor grew with its content and the canvas fit grew with it. The root now falls back to `100dvh`, the default of `tokens.css`.
- 6fad500: Escape ends a pill-badge edit the way it ends a normal text edit: the typed text is kept. Before, Escape discarded the edit on badges while it committed on normal text.
- 137096d: A newly inserted element (text, shape, icon, chart, ...) is selected, and only it. Before, the previous selection stayed, and the new element had to be found and clicked first, which was awkward when it landed on top of other elements.
- Updated dependencies [cfeca71]
  - @ggraphic/core@0.1.0-alpha.2
  - @ggraphic/schema@0.1.0-alpha.2

## 0.1.0-alpha.2

### Minor Changes

- bdd1320: The canvas fills the available area on desktop and follows it when the window grows or shrinks (#112). **This is a visible size change for all hosts.**

  - **Before:** a desktop stage was effectively capped at 400 px wide: 400 × 500 for 4:5 and 400 × 225 for 16:9, at any window size. After the window had been made smaller, the stage never grew back.
  - **Now:** the stage takes the part of the canvas area that nothing covers. That is the area below the context bar slot and the page toolbar, and above the bottom bar, with the same 24 px gap above and below. Every page of a multi-page document gets that full size and is reached by scrolling.
  - **Mobile:** the mobile layout, including an open sheet, keeps its own fit and is unchanged.
  - **`CanvasStage`:** a new prop `fitToParent` (default `true`). Inside the editor it is off, because there the stage's parent sizes itself to the stage.
  - **Shell measurement:** the shell measures the area with `useMeasuredStageFit` (`hooks/stageFit`).

- 6676a77: New entry `@ggraphic/editor/host`. It holds what a host's start-up code and test setup need, without loading the editor UI:

  - the `register*` seams: element kinds, asset catalogue, formats and format groups, templates, brand packs, messages, toasts, storage keys, PPTX fonts and screen-corner reservations;
  - the format lookups a host's template registry needs: `canvasFormats`, `getCanvasFormat` and `getCanvasFormatOrDefault`;
  - `useCanvasEditorServices` and `BlockInsertContext`;
  - the interfaces a host augments: `CanvasEditorHostServices`, `HostElementKinds`, `HostCanvasActions` and `CanvasAiHostTypes`.

  It loads 17 modules, none of them a component, store or primitive. Each of `shell`, `kinds` and `elements` loads at least 31. A host that `vi.mock`s editor modules can import its start-up code from `host`, and its mocks still apply. Every name is also in its domain entry.

  Also added:

  - `CanvasAiHostTypes` in `@ggraphic/editor/ai`, so a host can augment it through a public path.
  - `stripMarks` in `@ggraphic/editor/text`.
  - `surfaceGlow` in `@ggraphic/editor/brand`.
  - `registerMeasuredCornerReservation` and its types in `@ggraphic/editor/services`.

  **Breaking (alpha):** `BlockInsertApi.bloecke` is now `blocks`. The field only lives in the React context a host provides, nothing persists it, so there is no alias: a host that provides or reads the context renames it (a type error points at each site).

  `CanvasFormatGroupDef` takes an optional `order`. It places a host group among the built-in picker groups, whose positions are in `CANVAS_FORMAT_GROUP_ORDER` (`templates`, `host`): `post` is 100, `square` 200, `slides` 300. A group without `order` follows the positioned ones, as before.

- ef97b05: Public entry points. Each is a facade that re-exports a curated list of names:

  - `@ggraphic/editor` (the same as `./embed`), `./embed`, `./page`, `./config`, `./shell`, `./canvas`, `./kinds`, `./store`, `./services`, `./brand`, `./templates`, `./elements`, `./text`, `./sidebar`, `./collab`, `./ai`, `./export`, `./i18n`;
  - `./illustrations/<set>` for each of the seven illustration sets.

  `./kinds` carries what a custom element kind needs, with a documented example. `./text` adds the generic text fitting (`wrapWords`, `balancedWrap`, `largestSizeWordsFit`).

  `@ggraphic/editor/internal/*` reaches any compiled module, with no semver promise.

  Deprecated: the deep paths (`@ggraphic/editor/utils/…`, `…/components/…` and the rest). They keep working in this alpha and are removed in the next one; move to the entries above, or to `internal/*` where an entry has no home for a name yet.

- e9a3d1a: `<GgraphicEditor>` takes an `exportApiRef`: once the editor has loaded it receives `CanvasEditorExportApi`, so a host can render the active page or every page as PNG, export the deck as .pptx and read the pages from its own UI. `CanvasEditorExportApi` is exported from `@ggraphic/editor/embed`. The embedding skill has a new Export section.
- 0a75b5c: New `loadTemplatePack(files)` in `@ggraphic/editor/embed`: `templatePackFromJson` in a chunk of its own, returning a promise of the pack. `<GgraphicEditor templates>` accepts that promise and resolves it while the editor loads. A host that called `templatePackFromJson` at module level carried zod, the XML parser and the page config in its entry chunk; with `loadTemplatePack` they load next to the editor (a minimal Vite host: entry chunk 561 kB → 221 kB minified). `templatePackFromJson` is unchanged.
- 6dd815a: `GgraphicEditor` (`@ggraphic/editor/embed`): the editor in one component. A host passes a brand pack, a template pack (`templatePackFromJson`, also exported here), the document and an `onChange`; the component fills the brand, message and template registers, provides a React Query client and the host services, and renders the shell. Defaults: browser downloads, object-URL uploads, no AI and no collaboration, English texts (`locale`). The import is SSR-safe; the editor renders in the browser only. `CanvasEditorShell` gets `onPagesChange`, called with every page after each change to the deck.
- 6c4abd9: `@ggraphic/editor/host` loads no React, so a server component (a Next.js layout, a route handler) can import it and call the `register*` functions. Before, `next build` failed with `createContext is not a function`.

  The three React names left `host` for the new client entry `@ggraphic/editor/host-react` (`'use client'`, three modules, React only). Migration:

  ```diff
  - import { useCanvasEditorServices, BlockInsertContext, useBlockInsert } from '@ggraphic/editor/host';
  + import { useCanvasEditorServices, BlockInsertContext, useBlockInsert } from '@ggraphic/editor/host-react';
  ```

  Everything else in `host` stays where it is. The three names are also still in `@ggraphic/editor/shell`.

- c8b3945: The format catalogue is now the host's. The editor ships three neutral formats; hosts add their own with `registerCanvasFormatGroups` / `registerCanvasFormats`.

  **Breaking for hosts that rely on the built-in formats.** Before this release the editor had 18 formats built in; now it has three.

  - Built in: `post-portrait` (4:5), `profile-square` (1:1) and `slide-16-9` (16:9). Their ids are unchanged.
  - Built-in groups are now `post`, `square`, `slides` and `print`. They were `sharepic`, `sharepic-tall`, `profilbild`, `praesentation` and `print`.
    - `isSlideFormat` now checks the `slides` group: a host's slide format joins it.
    - `print` has no built-in format; it holds a host's print formats.
  - Moved out: `post-portrait-tall`, the 14 `print-*` formats and the `sharepic-tall` group. A stored document with one of these ids opens again once the host registers it under the same id. Until then, a print id is refused (`UnsupportedCanvasFormatError`) and an unknown digital id falls back to `post-portrait`, as before.
  - For one alpha the moved catalogue stays unchanged in `@ggraphic/editor/formats/legacyCatalog` (deprecated):

    ```ts
    registerCanvasFormatGroups(LEGACY_CANVAS_FORMAT_GROUPS);
    registerCanvasFormats(LEGACY_CANVAS_FORMATS);
    ```

  - `pinnedFormatId` maps a host's template ids, so it moved to `formats/legacyCatalog` (deprecated). It is still re-exported from `formats/index`, but is no longer in the `templates` entry.
  - Message catalogue:
    - `formats.names` holds only the three built-ins, with neutral names ("Post 4:5", "Square 1:1", "Presentation").
    - `formats.groups` uses the new group ids.
  - Image looks `gruen` → `tinted` and `grau` → `grayscale`, with the message keys `imageLooks.*` renamed the same way. Look ids are never stored: applying a look writes its values.
  - `CoreSidebarTabId` no longer lists `'vorlagen'`. The editor has no such tab; a host tab with that id still type-checks as a `SidebarTabId`.
  - `getCanvasFormatOrDefault` warns once per unknown id (`unknown canvas format 'x', falling back to 'post-portrait'; register it with registerCanvasFormats`), so a host that forgot to register a digital format sees it in its logs instead of shipping 4:5.

- ba99f4f: Neutral names on the public surface. Every German or host-specific name reachable from the entry points is renamed; nothing here is persisted, so documents, template packs and stored state are unaffected.

  - Types and functions (the old name stays as a `@deprecated` alias on its deep path until the next alpha):
    - `CanvasImpressumService`, `CanvasImpressumParts`, `CanvasImpressumLabels`, `CanvasImpressumLocale` → `CanvasImprintService`, `CanvasImprintParts`, `CanvasImprintLabels`, `CanvasImprintLocale`
    - `CanvasStudioAssetKind`, `CanvasStudioAssetScope`, `CanvasStudioAssetItem`, `CanvasStudioAssetsFilter`, `CanvasStudioAssetsState`, `UseCanvasStudioAssets`, `useNoStudioAssets` → `CanvasAssetLibraryKind`, `CanvasAssetLibraryScope`, `CanvasAssetLibraryItem`, `CanvasAssetLibraryFilter`, `CanvasAssetLibraryState`, `UseCanvasAssetLibrary`, `useNoAssetLibrary`
    - `VORLAGE_DRAG_TYPE`, `isVorlageDrag`, `readVorlageDrag` → `TEMPLATE_DRAG_TYPE`, `isTemplateDrag`, `readTemplateDrag`
    - `DiagrammeSection`, `FormenSection` → `ChartsSection`, `ShapesSection`; `StudioGalleryGrid` → `AssetGalleryGrid`; `buildSharepicText` → `buildCanvasText`
  - Files (the old path re-exports the new one until the next alpha): `sidebar/sections/DiagrammeSection`, `FormenSection`, `RahmenSection`, `StudioGallery` → `ChartsSection`, `ShapesSection`, `FramesSection`, `AssetGallery`; `configs/buildSharepicText` → `configs/buildCanvasText`
  - Props, fields and keys (no alias; rename them in the host):
    - `CanvasEditorServices.useStudioAssets` → `useAssetLibrary`
    - `CanvasPrintService.impressum` → `imprint`; `CanvasImprintParts.anschrift` → `address`
    - `CanvasPrintSpec.seiten` → `pageCount`; `CanvasPrintSpec.impressum` → `imprint`, with the values `'jede-seite' | 'erste-seite' | 'letzte-seite'` → `'every-page' | 'first-page' | 'last-page'`
    - `PageWrapperProps.onDropVorlage` → `onDropTemplate`
    - `ChatSectionContentProps.getSharepicText` → `getCanvasText`
    - `PendingAiSuggestion.source: 'vorlage'` → `'template'`
    - Messages: `sharepicText` → `canvasText`, `sidebar.studio` → `sidebar.assetLibrary`, `shell.downloadPanel.impressum*` → `shell.downloadPanel.imprint*`
  - The template drag type is now `application/x-ggraphic-template` (it only ever lives in a drag's `DataTransfer`).

### Patch Changes

- 01c1fab: The data entries `page`, `elements`, `templates`, `text` and `config` load without React, Konva or React-dependent packages, so they work in React Server Components and plain Node. As a side effect, the `embed` entry loads under React's server build too (the editor itself stays lazy).

  - No exported name changes. Only the internal module graph does: React-free core modules sit next to the old ones, and the old modules re-export them.
    - `i18n/catalogue` (`messages()` and the registers, without `useMessages`);
    - `utils/fontGeneration`;
    - `utils/fontSpecs`;
    - `utils/framePresets`;
    - `sidebar/coreSidebar`.
  - `createPageConfig` and `createShareSection` name the core sidebar sections and tab icons by id. The editor shell provides them when its module loads. Reading a section's `component` or a tab's `icon` outside `CanvasEditorShell` throws a `coreSidebar:` error.
  - `shareTab.icon` is now a getter, so its type is `readonly`.
  - `canvasIcons` no longer registers icon sets with `@iconify/react` itself. The sidebar does that through `onIconSetLoaded`.
  - `sideEffects` now names `utils/fontGeneration` (the `document.fonts` listener moved there) instead of `hooks/useFontGeneration`.

- 0b8da42: The mobile layout and the canvas fit follow the editor's box instead of the window (#106). An editor embedded in a box narrower than 900 px uses the phone layout also in a wide window, and its pages are sized to the box's width and height. The editor root measures itself and carries `data-canvas-mobile` while it is narrow; the `max-canvas-mobile:` / `canvas-mobile:` variants of `@ggraphic/editor/styles/tailwind` and the mobile rules of the editor stylesheet key on it. Dialogs and menus, which open over the page, still follow the window. A full-screen host measures exactly the window, so nothing changes there. `isMobile()` and `getOptimalContainerWidth()` of `@ggraphic/editor/utils/viewport` take an optional width (the window's by default).
- 3211079: Declare `@tiptap/pm`, `react-is` and `y-protocols` as dependencies. The editor's tiptap packages, recharts and `@hocuspocus/provider` need them as peers; package managers that don't install missing peers (yarn) failed to build a host.
- d101d84: The editor's chrome sits inside the editor instead of the viewport, so a host can put its own bar or sidebar next to it (#100). The sidebar, the panel and the bottom bar are positioned against the editor's root, and the pages scroll inside the editor instead of the host page. Its height is the new token `--editor-height`: `100dvh` by default, as before, and `100%` in `GgraphicEditor`, which now fills exactly the box the host gives it. `--canvas-host-inset-left` is no longer read; a host that set it to clear its own sidebar can drop it.
- a95f304: Internal imports are relative; no API change.
- 89a7b84: The embedding skill notes that `@ggraphic/templates-open` ships its sample photos only from the `./photos` subpath.
- bd40ea0: The `ggraphic-embed` skill no longer asks for one shared version across `@ggraphic/*`: the packages are versioned independently, so a host pins each one to the version under the `alpha` tag and takes core and schema at the versions the editor depends on.
- feb274d: The `embed` entry (and the package root, its alias) starts with `'use client'`. A React Server Component that imports it now gets a client reference instead of failing with `createContext is not a function`. `templatePackFromJson` and `loadTemplatePack` are not server APIs: the skill now says so and shows the App Router setup.
- fe90a3b: Auto-fit measures a bold word in bold. Words in `**bold**` runs were measured in the regular face, so a bold word that only fit in regular weight ran past the edge of its box. `SlotFit` gets an optional `widestWord` for callers that know the widest word better than `measureAt`, as `countLines` already does for the line count.
- facbe6b: Importing the sidebar no longer registers the bundled icon sets with `@iconify/react`. The registration now runs when an icon first renders, so a host's `@iconify/react` mock without `addCollection` no longer fails at import.
- 45b8f3a: On mobile, a page that the height limits now fits above the tab bar (#139). The mobile fit used to take the box height minus a fixed 120 px, too little for the header, page toolbar and tab bar, so a portrait page at 500 × 701 ran 38 px under the tab bar. The shell now measures the free canvas area on mobile too (`useMeasuredStageFit`), as it does on desktop. Pages the width limits, as on most phones, keep their size.

  - **`useMeasuredStageFit(container, enabled, hold?)`:** new optional `hold`. While it is true, the last fit stays and nothing is measured. The shell sets it while a mobile sheet is open: the sheet takes space from the main column, and `useMobileSheetFit` scales the pages into what is left.

- bbede91: webpack hosts can build the embed entry again (#133). `next build --webpack` and other webpack builds stopped with `UnhandledSchemeError: Reading from "node:https"`: pptxgenjs, the writer behind the PPTX export, loads `node:fs` and `node:https` with `import()`, and webpack rejects the `node:` scheme in a browser build even inside a lazy chunk.

  - **The fix:** the package now ships a browser build of pptxgenjs 4.0.1 in `dist/vendor/pptxgen.js`, with JSZip and its dependencies. The PPTX export loads it through the package's `imports` map (`#pptxgenjs`), still lazily, and it loads no `node:` module. The licence texts of every bundled package are in `dist/vendor/pptxgen.LICENSES.txt`; JSZip is used under MIT.
  - **Dependencies:** pptxgenjs is no longer a dependency of `@ggraphic/editor`, so hosts no longer install it.
  - **Unchanged:** the export itself. Turbopack and Vite hosts were not affected.

- 7a3bf1b: The editor shell preloads the Elements and Tools panels while the browser is idle, so their first open renders directly instead of suspending behind the chunk import. Any section of the config's tabs built with `lazyWithPreload` is warmed the same way.
- 88aa4d8: The `react` and `react-dom` peer ranges now start at `^19.3.0` instead of `^19.0.0` (#134). The editor's `react-konva ^19.3.2` peer already required React 19.3, so a host on React 19.0–19.2 got `ERESOLVE` from npm naming react-konva, not the editor. Nothing changes for hosts on 19.3 or later. The README install line now uses the `alpha` dist-tag instead of a fixed version.
- 555a2e6: The stylesheet entries get a second export key with the `.css` extension: `styles/compiled.css`, `styles/index.css`, `styles/editor.css`, `styles/tokens.css` and `styles/tailwind.css`. TypeScript 6 rejects a JavaScript side-effect import of a key without the extension (TS2882), because the bundler's `declare module '*.css'` does not match it. Import the `.css` keys from JavaScript; the old keys stay and resolve to the same files.
- Updated dependencies [fe90a3b]
  - @ggraphic/schema@0.1.0-alpha.1

## 0.1.0-alpha.1

### Minor Changes

- 0a2be62: Brands and templates as data. `defineBrand` (core) derives a full `BrandPack` from an id, a name, three colours, the fonts (with `cuts`) and an optional logo: the colour roles and grounds come from `deriveBrandColors` and `deriveGrounds`, and the pickers offer the roles bound to them. `templatePackFromJson` (`@ggraphic/editor/page/templatePack`) reads template files into a pack whose `definitions` go straight into `registerTemplates`; each template is a free page (`createPageConfig`), and files that do not read are reported, not half-loaded. The new `@ggraphic/brand-default` is the neutral pack ready to render: `brandDefault` with the cuts of its families declared, and `@ggraphic/brand-default/fonts` to load the OFL families.
- ee8b50f: New export `@ggraphic/editor/styles/compiled`: one stylesheet for hosts without Tailwind. It holds
  the token defaults, the editor rules and every Tailwind class the editor uses, compiled. All of it
  sits in `@layer ggraphic`, so unlayered host rules win without `!important`, and it applies only
  inside `[data-ggraphic]` (Tailwind's reset included), which the editor root and every portal the
  editor opens on `<body>` now carry. The token defaults stay global, so theming and dark mode work
  through the `--editor-*` properties as before. `styles` and `styles/tailwind` are unchanged.
- d17ef7d: New `@ggraphic/editor/page/*` modules: the free page model a host used to write itself. `createPageConfig` builds the page config (colour ground, Text/Elements/Uploads/Tools tabs, the free elements) from a seed and the host's template lookup; `createPageActions` holds the page's actions; `pageStateFrom`, `seedFromTemplate`, `storedPageSeed`, `placeTemplate`, `fittedFontSize`, `withHuggedPlates`, `slotBudgetFor` and the typography and logo-size helpers come with it. The tab texts are new catalogue entries (`pageTabs`) in German and English. The code moved from the Studio, which now uses it from the package.

### Patch Changes

- 37bceca: Ship the `ggraphic-embed` agent skill in the package (`skills/ggraphic-embed/SKILL.md`): how to install, register, mount, style and test the editor in a host app. The README now describes the editor as it is.
- d74febd: A newly inserted element (icon, shape, chart, text, asset, ...) is now drawn on top of everything on the page and listed first in the layers, whatever its kind. Before, it was stacked among the untracked elements in per-kind order and could land under an older one.
- e092ec1: Fix three text editing details. Bold is disabled (and shown as not pressed, with an explanatory label)
  while italic is on in a font without a bold italic cut; `FontMarkSupport` gains `boldItalic`, the one
  answer `runFont` also reads. Layer names no longer show italic markers (`_text_`) literally. The
  canvas texts in the Text tab are textareas, so editing no longer drops their line breaks.
- Updated dependencies [0a2be62]
  - @ggraphic/core@0.1.0-alpha.1

## 0.1.0-alpha.0

### Minor Changes

- 6c342cb: `BrandPack.shapeCycle` (optional) names the palette ids the shape tiles cycle through, in order. Without it, or when it names no palette colour, the tiles cycle through the colour roles as before.
- 7c31154: A circle badge can be drawn as a burst or an ellipse: `CircleBadgeInstance.outline` is `'circle'`
  (the default), `'burst'` or `'ellipse'`, and `CircleBadge` takes it as a prop.
- 082e890: Compact context bar. Opacity is a popover button; Position is a text button whose popover also
  holds the layer order; gradient, outline and shadow move into a new "Effects" sidebar area
  (`EffectsSection`, tab id `effects`) opened from the bar. `MobileSelectionPill` is now
  `SelectionPill` (`variant: 'touch' | 'pointer'`) and also stands above the selection on desktop,
  with lock, duplicate, delete and a "..." menu. On mobile the "..." opens `CanvasActionSheet`, built
  from the same menu model as the desktop context menu, and the selection bar shows its tools as
  labelled tiles (`barTiles`). `FloatingGradientControl`, `FloatingOutlineControl` and
  `FloatingShadowControl` are removed. Breaking for hosts that import them or
  `components/MobileSelectionPill`.
- 07d120c: The brand of a document comes from the document. `FullCanvasConfig.brand` names the pack of a page; the shell and `GenericCanvas` provide it to the page's tree (`useDocumentBrand()`, new export `@ggraphic/editor/brand/documentBrand`), so with several packs registered a page of the second pack no longer draws the first pack's markers, swatches, effect presets, shape and chart tiles or backdrop. The element factories (`createElementActions` and the single-kind ones) take the pack as a trailing `brand` parameter, as do `markerSwatches`, `defaultMarkerFill`, `defaultTextMarker`, `markerInkOn`, `createShape`, `createFrameInstance`, `createIllustration`, `createPillBadgeInstance`, `createCircleBadgeInstance`, `duotoneLook`, `imageLookPatch`, `photoPlaceholderLook`, `headlineFontStack` and the PPTX export (`BuildPptxModelOptions.brand`, `exportPptxDeck`), all defaulting to the active brand. `FullCanvasConfig.chartColors` stays as a deprecated fallback.

  Breaking for hosts that call them: `colorName(hex, brand)` takes the pack, and `SHAPE_ITEMS` is now `shapeItems(brand)`.

- cd4897e: Canvas document version 2 for brand bindings. The core step 1 → 2 is the identity on pages; the page keys `bind`, `brandScheme` and `brandStamp` persist, are inherited by added and converted pages, and are known to the PPTX export. A build without version 2 now opens such a document read-only.
- b9037ee: Canvas document version 3 for templates. The core step 2 → 3 is the identity on pages; the page keys `templateRef` and `groups` persist, are not inherited by added pages, and are known to the PPTX export. A build without version 3 now opens such a document read-only.
- c7e390f: Two-colour duotone bound to the colour world. An image with `duotoneLow` and `duotoneHigh` maps the photo's luma between the two colours; the Duotone look binds them to the page world's `duo-low` / `duo-high`, so they follow a world change. The field names are stored, so they are fixed. Core adds `duotoneRamp`. A legacy tinted image and an image without the new fields render and export as before.
- 51310c0: A replaced family that a registered brand pack declares is no longer aliased. If a pack names "PT Sans" or "Vollkorn" in `fonts` or ships it in `fontFaces`, the editor paints, measures, loads and exports that family as it is, because the host provides the font. Documents of hosts without such a pack still map the old families to Instrument Sans and Fraunces. New: `declaredFontFamilies()` in `brand/brandRegistry`.
- f4876b4: Pick the font of a free text by brand role. When the host provides `setAdditionalTextFontRole`
  (`OptionalCanvasActions`), the context bar of a free text shows a role picker (Headline, Text,
  Condensed, Accent), each role in its own font and only the brand's own fonts offered; the text
  stays bound to its role, so a brand change takes it along. New texts from the editor's own
  `addHeader`, `addSubheader` and `addText` are born bound (`font.headline`, `font.body`).
  `FloatingModuleState.data` of a free text carries `fontFamily` and `bind`, `ToolbarStateReport`
  gains `canChangeFontRole`, and `requestFontFace` starts loading a family's face ahead of its first
  draw.
- f371673: The render gate now judges text over photos by the worst ground it can prove. A photo is any mix of its darkest and lightest colour (black and white, or its duotone pair), a translucent shape is a veil, a shade shape fades in along `SHADE_STOPS`, and the text passes only if the least contrast over all of them meets the threshold. The editor reports photos, shades and veils to the gate; tinted, masked, blended, rotated or recoloured duotone images stay not determinable. `SHADE_STOPS` and `shadeAlphaAt` move to `@ggraphic/core`.
- cc5ee96: `BrandFonts.cuts` declares the real cuts of families the host loads itself: `{ bold, italic, boldItalic }` per family. Bold and italic buttons follow it ahead of the built-in table, and a bold italic run keeps `bold italic` where `boldItalic` is set (for example a Black Italic). Fraunces stays built in. Exported page files, slider shares and ZIP entries now take their page word from the catalogue (`export.pageFile`): `seite-1.png` in German, `page-1.png` in English.
- 2761974: Hosts can ship SVG illustration sets of their own. `SvgSource` is now `keyof SvgSources`. A host adds its set with `declare module '@ggraphic/core' { interface SvgSources { mine: true } }` and lists it through `IllustrationSources.loadSvg` as before. The new `IllustrationSources.recolor` names, per set, the colour its files draw their main shapes in, and tinting swaps that colour. Open Doodles keeps its built-in `#ff5678`.
- f89e220: Add a Look control (None, Black & white, Duotone, Darken) to the top bar for the selected image. Duotone takes its colours from the page's colour world and follows it.
- 5807f36: Initial import of the document schema, core and canvas editor packages.
- e79e3e3: Undo and Redo walk the pages' element histories and the page-level history (page ops, a replaced
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
- bd901ad: Add an optional `emojiOffered(code, group)` hook to the asset catalogue, so a host that ships a subset of the Noto Emoji set offers only the emoji it serves.
- 6e580f2: Page groups: elements listed in the page's `groups` are selected together on click (a second click picks the member), "Ungroup" (Ctrl/Cmd+Shift+G) dissolves a group, and deleting members prunes the group in the same history step.

  `PagePreview`: draws one page read-only through the editor's own canvas and reports a PNG once images and fonts have settled, for template previews.

  `Messages` gained required keys `commands.ungroup` and `announce.ungrouped`, so hosts that supply their own message table must add them.

  `LiftedBlock` can carry `blockRef` (which library block it is) and `brandScheme` (the colour world its bindings were resolved in); `GenericCanvasRef.insertBlock` hands the page's `brandScheme` to the block's `make` callback (`BlockPageSurface.brandScheme`), so a host can cut a block in the page's world.

- e2e72c3: An empty photo slot, or one whose photo fails to load, shows a calm placeholder in the editor and in previews. Every export (PNG, JPEG, WebP, PDF, PPTX, share, print) leaves it out; `ExportOptions.keepPlaceholders` is for previews only.
- 3534ffa: Replace the bundled fonts PT Sans and Vollkorn with the open Instrument Sans and Fraunces. `brandDefault.fonts` now names Raleway, Instrument Sans and Fraunces. Saved designs and brand packs that still name "PT Sans" or "Vollkorn" keep rendering: the editor maps the old families to the new ones when loading, painting, measuring and exporting to PPTX (`FONT_FAMILY_ALIASES`); stored data is not rewritten.
- 92df26a: Shade shapes: a shape with `shade: 'bottom' | 'top'` paints its `fill` as a photo gradient (transparent to opaque from one edge). The field is stored, so its name is fixed.
- 34d01bb: New optional host service `slotBudgets`: while a text of a template page is selected, the editor warns when it is over its slot's budget (words, characters, lines, legible size). It warns only and clamps nothing; without the service the editor behaves as before.
- 10cce2c: `instantiateTemplatePage` places a template on a page: fractions of the brand grid become pixels, bound fields take the values of the chosen colour world, the logo goes to a free corner, and the page records its template and groups. `offeredSchemes` lists the template worlds a brand keeps.

  The editor declares per element kind how its numbers scale when a template is placed (`TEMPLATE_GEOMETRY`, `UNSCALED_FIELDS`), with a guard test per kind, and the adapter the render gate reads elements through.

  `checkTemplate` is stage 1 of the render gate: it places a template on each brand, colour world, format and logo corner and checks bounds, logo overlap, contrast, slot budgets, unbound colours, asset licences, marker roles, world coverage and logo corners (`GATE_RULES`).

  The gate fails closed: a text whose ground it cannot prove opaque and flat (a photo, a translucent or gradient shape, a badge) is a `contrast` failure. It sweeps the layout extremes (margin 0.04 and 0.12, logo box 0.3 × 0.12 and 0.05 × 0.03) for every logo corner a template declares. The gate adapter lists image fields (`assetFields`) and nested colours (`nestedColors`) and describes grounds through `cover`, which replaces `fill`.

  The logo box of a brand layout is bounded to 30 % of the canvas width and 12 % of its height (`BRAND_LAYOUT_BOUNDS`, was 40 % and 20 %); `clampBrandLayout` pulls a stored layout into the bounds.

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

- 9f91a24: `boundsOf` measures pill badges as the box they draw instead of a point, so a block made only of
  boxed lines no longer has zero width when it is placed on a page.
- 2c6031f: The element data types now come from `@ggraphic/core`. Every module that defined one (`utils/shapes`,
  `utils/userImageUtils`, `configs/types`, `configs/factory/baseTypes`, `utils/canvasAssets`,
  `utils/chartTypes`, `utils/frameUtils`, `utils/gradientFill`, `utils/illustrations/types`,
  `utils/pillBadgeUtils`, `primitives/CircleBadge`, `utils/textUtils`, `utils/textAlign`,
  `utils/cornerRadius`, `utils/shapeDevices`, `utils/externalIcons`, `sidebar/tabTypes`) still exports
  the same names, so no import path changes.
- 11295d8: Break a word that is wider than its text box at syllable boundaries with a hyphen instead of in the middle of a syllable, and add `fitFontSizeToSlot` to shrink a headline until it fits the room above the next text. The editor draws such text with the shared layout, so the canvas and the export wrap alike.
- Updated dependencies [f1886fc]
- Updated dependencies [abbea93]
- Updated dependencies [74008f0]
- Updated dependencies [6c342cb]
- Updated dependencies [7c31154]
- Updated dependencies [d9847b8]
- Updated dependencies [591386d]
- Updated dependencies [811b5f5]
- Updated dependencies [cd4897e]
- Updated dependencies [b9037ee]
- Updated dependencies [c7e390f]
- Updated dependencies [d44dc48]
- Updated dependencies [f371673]
- Updated dependencies [cc5ee96]
- Updated dependencies [2761974]
- Updated dependencies [11295d8]
- Updated dependencies [5807f36]
- Updated dependencies [3534ffa]
- Updated dependencies [45d469b]
- Updated dependencies [2956336]
- Updated dependencies [10cce2c]
- Updated dependencies [3711f1b]
  - @ggraphic/core@0.1.0-alpha.0
  - @ggraphic/schema@0.1.0-alpha.0
