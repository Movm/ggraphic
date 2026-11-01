---
'@ggraphic/editor': minor
---

New `loadTemplatePack(files)` in `@ggraphic/editor/embed`: `templatePackFromJson` in a chunk of its own, returning a promise of the pack. `<GgraphicEditor templates>` accepts that promise and resolves it while the editor loads. A host that called `templatePackFromJson` at module level carried zod, the XML parser and the page config in its entry chunk; with `loadTemplatePack` they load next to the editor (a minimal Vite host: entry chunk 561 kB → 221 kB minified). `templatePackFromJson` is unchanged.
