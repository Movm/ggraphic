---
'@ggraphic/editor': minor
---

New export `@ggraphic/editor/styles/compiled`: one stylesheet for hosts without Tailwind. It holds
the token defaults, the editor rules and every Tailwind class the editor uses, compiled. All of it
sits in `@layer ggraphic`, so unlayered host rules win without `!important`, and it applies only
inside `[data-ggraphic]` (Tailwind's reset included), which the editor root and every portal the
editor opens on `<body>` now carry. The token defaults stay global, so theming and dark mode work
through the `--editor-*` properties as before. `styles` and `styles/tailwind` are unchanged.
