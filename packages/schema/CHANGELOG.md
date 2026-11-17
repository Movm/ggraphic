# @ggraphic/schema

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
