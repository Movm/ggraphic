---
'@ggraphic/editor': patch
---

The editor's chrome sits inside the editor instead of the viewport, so a host can put its own bar or sidebar next to it (#100). The sidebar, the panel and the bottom bar are positioned against the editor's root, and the pages scroll inside the editor instead of the host page. Its height is the new token `--editor-height`: `100dvh` by default, as before, and `100%` in `GgraphicEditor`, which now fills exactly the box the host gives it. `--canvas-host-inset-left` is no longer read; a host that set it to clear its own sidebar can drop it.
