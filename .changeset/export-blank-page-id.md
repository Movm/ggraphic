---
'@ggraphic/editor': minor
---

Export `BLANK_PAGE_ID` from `@ggraphic/editor/embed` and `@ggraphic/editor/host`: the page config id of the empty page `GgraphicEditor` registers, for a host that starts a blank design (`pages: [{ configId: BLANK_PAGE_ID, state: {} }]`). The host entry loads no React, so a server component can read it too.
