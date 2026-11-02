---
'@ggraphic/editor': minor
---

`@ggraphic/editor/host` loads no React, so a server component (a Next.js layout, a route handler) can import it and call the `register*` functions. `useCanvasEditorServices`, `BlockInsertContext` and `useBlockInsert` left the entry: they create a React context when evaluated, which failed `next build` with `createContext is not a function`. Import them from `@ggraphic/editor/shell`.
