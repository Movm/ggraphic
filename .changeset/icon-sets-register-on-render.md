---
'@ggraphic/editor': patch
---

Importing the sidebar no longer registers the bundled icon sets with `@iconify/react`. The registration now runs when an icon first renders, so a host's `@iconify/react` mock without `addCollection` no longer fails at import.
