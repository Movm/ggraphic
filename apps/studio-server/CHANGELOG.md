# @ggraphic/studio-server

## 0.1.0-alpha.1

### Patch Changes

- Updated dependencies [0a2be62]
  - @ggraphic/core@0.1.0-alpha.1

## 0.1.0-alpha.0

### Minor Changes

- 3534ffa: Replace the bundled fonts PT Sans and Vollkorn with the open Instrument Sans and Fraunces. `brandDefault.fonts` now names Raleway, Instrument Sans and Fraunces. Saved designs and brand packs that still name "PT Sans" or "Vollkorn" keep rendering: the editor maps the old families to the new ones when loading, painting, measuring and exporting to PPTX (`FONT_FAMILY_ALIASES`); stored data is not rewritten.
- 86595b8: Studio is single-user for now: the organisation, member and invitation routes are gone (tables and `/api/orgs/:orgId/...` URLs stay), and every account gets a personal organisation. Deleted projects move to a 30-day trash (restore, delete now, a purge job; `TRASH_PURGE_ENABLED=false` switches it off). The brand `PUT` takes three colours and derives the other roles and the grounds.

### Patch Changes

- Updated dependencies [45adebc]
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
  - @ggraphic/ai@0.1.0-alpha.0
  - @ggraphic/core@0.1.0-alpha.0
  - @ggraphic/schema@0.1.0-alpha.0
