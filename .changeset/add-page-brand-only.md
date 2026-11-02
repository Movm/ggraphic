---
'@ggraphic/editor': minor
---

`addPage` and the host's `EditorAddPage` take `inherit: boolean | PageInheritance`. `{ brand: true, background: false }` adds a page that keeps the active page's scheme and brand bindings (`colorScheme`, `colorSchemeId`, `bind`, `brandScheme`, `brandStamp`) without its background (photo, colour, composer planes). `true` and `false` mean what they meant before. `PageInheritance` is exported from `@ggraphic/editor/shell`, and `extractInheritablePageState` takes it as an optional third argument.
