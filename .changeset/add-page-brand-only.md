---
'@ggraphic/editor': minor
---

`addPage` and the host's `EditorAddPage` take `inherit: boolean | PageInheritance`. `{ brand: true, background: false }` adds a page that keeps the active page's scheme and brand bindings (`colorScheme`, `colorSchemeId`, `bind`, `brandScheme`, `brandStamp`) without its background (photo, colour, composer planes). Such a page drops the bindings of background fields (for example `bind.backgroundColor`), since it carries none of those fields. `{ brand: false, background: true }` is the reverse. `true` and `false` mean what they meant before. `PageInheritance` is exported from `@ggraphic/editor/shell`, and `extractInheritablePageState` takes it as an optional third argument.
