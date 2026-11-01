---
'@ggraphic/editor': patch
---

The mobile layout and the canvas fit follow the editor's box instead of the window (#106). An editor embedded in a box narrower than 900 px uses the phone layout also in a wide window, and its pages are sized to the box's width and height. The editor root measures itself and carries `data-canvas-mobile` while it is narrow; the `max-canvas-mobile:` / `canvas-mobile:` variants of `@ggraphic/editor/styles/tailwind` and the mobile rules of the editor stylesheet key on it. Dialogs and menus, which open over the page, still follow the window. A full-screen host measures exactly the window, so nothing changes there. `isMobile()` and `getOptimalContainerWidth()` of `@ggraphic/editor/utils/viewport` take an optional width (the window's by default).
