---
'@ggraphic/editor': minor
---

The format catalogue is now the host's. The editor ships three neutral formats; hosts add their own with `registerCanvasFormatGroups` / `registerCanvasFormats`.

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
