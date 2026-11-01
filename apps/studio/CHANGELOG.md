# @ggraphic/studio

## 0.1.0-alpha.0

### Minor Changes

- 3534ffa: Replace the bundled fonts PT Sans and Vollkorn with the open Instrument Sans and Fraunces. `brandDefault.fonts` now names Raleway, Instrument Sans and Fraunces. Saved designs and brand packs that still name "PT Sans" or "Vollkorn" keep rendering: the editor maps the old families to the new ones when loading, painting, measuring and exporting to PPTX (`FONT_FAMILY_ALIASES`); stored data is not rewritten.
- b647e71: Add `PromptComposer`, `ChipGroup`, `PromptHero`, `Tile`/`TileList` and `Avatar` to `@ggraphic/ui`, and rebuild the Studio start page with them: dark prompt band, format chips inside the prompt card, recent projects in a scrolling row and a "Start from a template" gallery.

### Patch Changes

- Updated dependencies [9f91a24]
- Updated dependencies [f1886fc]
- Updated dependencies [abbea93]
- Updated dependencies [74008f0]
- Updated dependencies [6c342cb]
- Updated dependencies [7c31154]
- Updated dependencies [082e890]
- Updated dependencies [d9847b8]
- Updated dependencies [591386d]
- Updated dependencies [811b5f5]
- Updated dependencies [07d120c]
- Updated dependencies [cd4897e]
- Updated dependencies [b9037ee]
- Updated dependencies [c7e390f]
- Updated dependencies [2c6031f]
- Updated dependencies [51310c0]
- Updated dependencies [d44dc48]
- Updated dependencies [f4876b4]
- Updated dependencies [f371673]
- Updated dependencies [cc5ee96]
- Updated dependencies [2761974]
- Updated dependencies [11295d8]
- Updated dependencies [f89e220]
- Updated dependencies [5807f36]
- Updated dependencies [e79e3e3]
- Updated dependencies [bd901ad]
- Updated dependencies [6e580f2]
- Updated dependencies [e2e72c3]
- Updated dependencies [3534ffa]
- Updated dependencies [92df26a]
- Updated dependencies [34d01bb]
- Updated dependencies [45d469b]
- Updated dependencies [b647e71]
- Updated dependencies [2956336]
- Updated dependencies [10cce2c]
- Updated dependencies [2d94890]
- Updated dependencies [3711f1b]
- Updated dependencies [ddc790b]
- Updated dependencies [42124f6]
  - @ggraphic/editor@0.1.0-alpha.0
  - @ggraphic/core@0.1.0-alpha.0
  - @ggraphic/schema@0.1.0-alpha.0
  - @ggraphic/ui@0.1.0-alpha.0
  - @ggraphic/templates-open@0.1.0-alpha.0
