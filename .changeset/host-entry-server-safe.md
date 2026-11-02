---
'@ggraphic/editor': minor
---

`@ggraphic/editor/host` loads no React, so a server component (a Next.js layout, a route handler) can import it and call the `register*` functions. Before, `next build` failed with `createContext is not a function`.

The three React names left `host` for the new client entry `@ggraphic/editor/host-react` (`'use client'`, three modules, React only). Migration:

```diff
- import { useCanvasEditorServices, BlockInsertContext, useBlockInsert } from '@ggraphic/editor/host';
+ import { useCanvasEditorServices, BlockInsertContext, useBlockInsert } from '@ggraphic/editor/host-react';
```

Everything else in `host` stays where it is. The three names are also still in `@ggraphic/editor/shell`.
