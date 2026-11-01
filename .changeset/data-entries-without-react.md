---
'@ggraphic/editor': patch
---

The data entries `page`, `elements`, `templates`, `text` and `config` load without React, Konva or React-dependent packages, so they work in React Server Components and plain Node. As a side effect, the `embed` entry loads under React's server build too (the editor itself stays lazy).

- No exported name changes. Only the internal module graph does: React-free core modules sit next to the old ones, and the old modules re-export them.
  - `i18n/catalogue` (`messages()` and the registers, without `useMessages`);
  - `utils/fontGeneration`;
  - `utils/fontSpecs`;
  - `utils/framePresets`;
  - `sidebar/coreSidebar`.
- `createPageConfig` and `createShareSection` name the core sidebar sections and tab icons by id. The editor shell provides them when its module loads. Reading a section's `component` or a tab's `icon` outside `CanvasEditorShell` throws a `coreSidebar:` error.
- `shareTab.icon` is now a getter, so its type is `readonly`.
- `canvasIcons` no longer registers icon sets with `@iconify/react` itself. The sidebar does that through `onIconSetLoaded`.
- `sideEffects` now names `utils/fontGeneration` (the `document.fonts` listener moved there) instead of `hooks/useFontGeneration`.
