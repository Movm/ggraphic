---
'@ggraphic/editor-chrome': minor
'@ggraphic/editor': minor
---

Add `@ggraphic/editor-chrome`: the sidebar shell (`SidebarTabBar`, `SidebarPanel`, `SubsectionTabBar`, `useIsCanvasMobile`, `EditorBoxProvider`, the mobile sheet) with its tokens, rules and Tailwind entry, without konva, tiptap, yjs or the editor store. `@ggraphic/editor` builds its sidebar from it and keeps exporting the same names from `./sidebar` and `./shell`. New for hosts of the chrome: `SidebarTabBar` takes `footer` and `ariaLabel`, `SidebarPanel` takes `closeLabel` and `collapseLabel`, `SubsectionTabBar` takes `viewLabel`; the panel finds its layout root by `data-editor-chrome-root` (the editor's layout sets it) instead of `.canvas-editor-layout`.
