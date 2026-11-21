# @ggraphic/editor-chrome

> **Alpha, untested.** Early work in progress: the API can change without notice. See the [repository README](../../README.md#ggraphic).

The sidebar shell of the ggraphic editor, without the canvas editor: a tab rail with a flyout panel on desktop, a bottom tab bar with a draggable sheet on mobile. No konva, tiptap, yjs or editor store. AGPL-3.0-only.

`@ggraphic/editor` builds its own sidebar from this package and re-exports it from `@ggraphic/editor/sidebar` with the editor's texts and save status. Use this package directly when a host needs the same chrome around something that is not a canvas.

## Install

Inside the monorepo: `"@ggraphic/editor-chrome": "workspace:*"`. Peers: `react`, `react-dom` (19).

## Use

```css
/* A host on Tailwind v4 */
@import 'tailwindcss';
@import '@ggraphic/editor-chrome/tokens.css'; /* optional: neutral --editor-* defaults */
@import '@ggraphic/editor-chrome/styles.css'; /* sheet motion, thin scrollbar */
@import '@ggraphic/editor-chrome/tailwind.css'; /* scan + touch-target, kbd, canvas-mobile variants */
```

A host with its own Tailwind theme that already defines `kbd`, `touch-target`, `max-canvas-mobile`/`canvas-mobile` and `animate-subsection-fade-in` adds only an `@source` for this package's `dist` instead of `tailwind.css`.

```tsx
import { CHROME_ROOT_ATTR, SidebarPanel, SidebarTabBar } from '@ggraphic/editor-chrome';

<div
  {...{ [CHROME_ROOT_ATTR]: '' }}
  className="relative flex h-dvh flex-col canvas-mobile:flex-row"
>
  <SidebarTabBar tabs={tabs} activeTab={active} onTabClick={toggle} ariaLabel="Bereiche" />
  <main className="flex-1">…</main>
  <SidebarPanel isOpen={active !== null} title={title} onClose={close}>
    …
  </SidebarPanel>
</div>;
```

Layout contract:

- The root carries `data-editor-chrome-root` and is `position: relative`. On mobile the sheet sits in the flow between the content (`order` before it) and the tab bar (`order-2`); while it closes it leaves the flow and is positioned against this root.
- The desktop panel is absolutely positioned at `top: var(--editor-topbar-height)` and `left: var(--image-studio-tab-bar-width, 76px)` of that root, 348px wide. While it is open it writes `--canvas-panel-width: 348px` on `<html>`, so the content can make room.
- Mobile means: the box of an `EditorBoxProvider` narrower than 900px, otherwise the window (`(max-width: 899px)`). `useIsCanvasMobile` answers it.
- Texts default to German; pass `ariaLabel` (tab bar), `closeLabel` and `collapseLabel` (panel), `viewLabel` (`SubsectionTabBar`) to change them.
- Keyboard focus rings (`kbd:`) need `data-focus-modality="keyboard"` on `<html>` while the last input was a key; the host sets it.
