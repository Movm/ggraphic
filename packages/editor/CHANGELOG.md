# @ggraphic/editor

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
