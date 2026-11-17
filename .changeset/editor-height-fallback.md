---
'@ggraphic/editor': patch
---

The editor is as tall as the viewport again in hosts that import `@ggraphic/editor/styles/editor` without `tokens.css` and don't declare `--editor-height` themselves (#152). Its root used to read the token without a fallback, so its height became `auto`, the editor grew with its content and the canvas fit grew with it. The root now falls back to `100dvh`, the default of `tokens.css`.
