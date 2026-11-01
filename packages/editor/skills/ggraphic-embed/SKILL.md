---
name: ggraphic-embed
description: Embed the ggraphic canvas editor (@ggraphic/editor, @ggraphic/core, @ggraphic/schema, optionally @ggraphic/brand-default and @ggraphic/collab) in a React app. Use when installing ggraphic, mounting GgraphicEditor or CanvasEditorShell, defining a brand pack, loading templates, passing host services, wiring styles and fonts, or when a host build or test breaks on ggraphic (ESM-only, Tailwind classes, mocks not applying, fonts falling back).
---

# Embedding the ggraphic editor

ggraphic is alpha (`0.1.0-alpha.x`, npm dist-tag `alpha`). APIs and the document format can change between alphas, so pin exact versions.

## The short path: `GgraphicEditor`

A host supplies data and services; the component does the rest.

```tsx
import { defaultBrand } from '@ggraphic/brand-default';
import '@ggraphic/brand-default/fonts';
import '@ggraphic/editor/styles/compiled';
import {
  GgraphicEditor,
  templatePackFromJson,
  type GgraphicDocument,
} from '@ggraphic/editor/embed';

import templateFiles from './templates.json'; // template files (`@ggraphic/schema` format)

const templates = templatePackFromJson(templateFiles); // once, at module level

export function DesignEditor({
  doc,
  save,
}: {
  doc?: GgraphicDocument;
  save: (d: GgraphicDocument) => void;
}) {
  return (
    <div style={{ height: '100dvh' }}>
      <GgraphicEditor brand={defaultBrand} templates={templates} document={doc} onChange={save} />
    </div>
  );
}
```

What it does for you:

- Fills the editor's registers from the props: brand pack, messages, the pack's templates and a blank page (`ggraphic-blank`).
- Wraps the editor in a `QueryClientProvider` (its own client unless you pass `queryClient`), a `CanvasEditorProvider` with your `services`, and `CanvasEditorShell`.
- Feeds the pack's slot budgets to the editor's status line.

Props:

| Prop          | Default                                                      | Notes                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brand`       | required                                                     | `defaultBrand` from `@ggraphic/brand-default`, or your own from `defineBrand` (below).                                                                                        |
| `templates`   | required                                                     | `templatePackFromJson(files)`. Build it once, not per render. Check `templates.problems` for files that were skipped.                                                         |
| `document`    | one page of the pack's first template on `post-portrait`     | `{ formatId, pages: [{ configId, state }] }`. Read when the editor mounts; give the component a new `key` to open another document.                                           |
| `onChange`    | none                                                         | The whole document after every change (edits, added or moved pages, undo). Store it as it comes; debounce on your side if saving is expensive.                                |
| `services`    | downloads through the browser, uploads as object URLs, no AI | `CanvasEditorServices` from `@ggraphic/editor/CanvasEditorProvider`. Pass only what you have: a `mediaLibrary` for durable uploads, `aiDraft`, `iconSearch`, `fileDelivery` … |
| `locale`      | `'en'`                                                       | `'en'` or `'de'`.                                                                                                                                                             |
| `queryClient` | own client                                                   | Pass yours to share a cache with the rest of the app.                                                                                                                         |
| `title`       | none                                                         | The design's name, used for the PDF and slide-deck downloads.                                                                                                                 |

Things to know:

- **Client only, SSR-safe import.** Importing `@ggraphic/editor/embed` touches no browser global, so a server-rendered page (Next.js app router, Remix …) can import it. It renders nothing on the server and loads the editor in the browser after hydration. No `dynamic(..., { ssr: false })` needed.
- **Give it a box with a height.** The editor fills exactly the container it is rendered in (`height: 100%`): top bar, sidebar, panel and bottom bar sit inside it, and the pages scroll inside it, so your own header or sidebar can sit next to it. The container needs a definite height (`height: calc(100dvh - 56px)`, or a flex item that is stretched to one); a container that only has a `min-height` gives the editor nothing to fill. Layout and canvas follow that box, not the window: below 900 px wide the editor uses its phone layout (tabs at the bottom, panels as sheets) also in a wide window, and the pages are sized to fit the box. Dialogs and menus, which open over the whole page, still follow the window.
- **One brand and locale per page.** The registers are module-level: two `GgraphicEditor`s on one page share the brand and locale of the one rendered last. Template ids are stored in documents and never re-registered: a second pack that reuses an id keeps the first one's template.
- **No collaboration** unless you use the low-level path below.

### A brand of your own: `defineBrand`

```ts
import { defineBrand } from '@ggraphic/core';

export const brand = defineBrand({
  id: 'riverside', // stored with documents: never rename one that has shipped
  name: 'Riverside',
  colors: { primary: '#0f2352', secondary: '#1b3fae', accent: '#f5822a' },
  fonts: {
    headline: 'Anton',
    body: 'Instrument Sans',
    cuts: {
      Anton: { bold: false, italic: false },
      'Instrument Sans': { bold: true, italic: true, boldItalic: true },
    },
  },
  logo: { src: '/logo.svg', label: 'Riverside' },
});
```

The other five colour roles, the grounds and every picker are derived with WCAG contrast checks. It throws when a colour is not a colour. Load the fonts you name yourself (see Fonts).

### Templates as data: `templatePackFromJson`

Takes an array of template files (or one file) in the `@ggraphic/schema` format. `@ggraphic/templates-open` is a CC0 pack to start from. Every template becomes a page the editor opens under the template's id. A file that does not read, was written by a newer version or repeats an id is skipped and listed in `problems`; blocks are left out (they are not pages).

## Install

```bash
# --save-exact pins each package to the version its `alpha` tag points to
npm install --save-exact @ggraphic/editor@alpha @ggraphic/core@alpha @ggraphic/schema@alpha
npm install --save-exact @ggraphic/brand-default@alpha # the neutral brand and its OFL fonts
npm install react react-dom konva react-konva @tanstack/react-query
# real-time collaboration (Yjs + Hocuspocus) only:
npm install --save-exact @ggraphic/collab@alpha
```

- The packages have **independent versions** (editor and core can be on `0.1.0-alpha.1` while schema is on `0.1.0-alpha.0`). Pin each one exactly to the version npm lists under the `alpha` tag (`npm view @ggraphic/<pkg> dist-tags.alpha`). The editor's own dependencies (`npm view @ggraphic/editor@<version> dependencies`) show which `@ggraphic/core` and `@ggraphic/schema` it expects; install exactly those, so editor and collab agree on the document schema.
- The packages are **ESM-only** and need Node ≥ 22 for anything that imports them on the server.
- `konva`, `react`, `react-dom` and `react-konva` are peers. Make sure the host resolves **one** React copy (Vite: `resolve.dedupe: ['react', 'react-dom']`), or hooks fail with "Cannot read properties of null (reading 'useContext')".
- pnpm with `minimumReleaseAge`: a freshly published alpha is refused for that window. Add exact `@ggraphic/<pkg>@<version>` entries to `minimumReleaseAgeExclude` (and remove them once the version is old enough).
- pnpm 12 and later print "Agent skills awaiting approval: @ggraphic/editor" on every install: the package ships this skill, and pnpm links it into `.claude/skills/` only once the host approves it (`pnpm approve`). Without approval nothing is linked and the editor works the same.
- A host that type-checks Node-facing files (`vite.config.ts`, `playwright.config.ts`) declares `@types/node` itself. Without it, a strict pnpm host (`hoist: false`) fails tsc with `TS2688: Cannot find type definition file for 'node'` in `undici-types`; with hoisting, the copy one of the editor's dependencies brings in hides the gap.

## Styles

The components carry Tailwind v4 utility classes. Pick one of two ways to style them:

- **Any host (no Tailwind needed):** one import, everything compiled.

  ```ts
  import '@ggraphic/editor/styles/compiled';
  ```

  - Every rule sits in `@layer ggraphic`, so any unlayered host rule wins without `!important`. If your own CSS is layered, declare `ggraphic` first (`@layer ggraphic, base, …;`) to keep the same order.
  - The rules apply only inside `[data-ggraphic]`, Tailwind's reset included, so your page keeps its own reset and theme. `CanvasEditorShell` (and so `GgraphicEditor`) renders that root, and every dialog, menu and popover the editor portals onto `<body>` carries the attribute too. If you mount editor components outside the shell, wrap them in an element with `data-ggraphic` (`EDITOR_SCOPE` from `@ggraphic/editor/ui/editorScope`).
  - Do not combine it with `styles` or `styles/tailwind`.

- **Tailwind v4 host:** in your CSS, `@import 'tailwindcss'; @import '@ggraphic/editor/styles'; @import '@ggraphic/editor/styles/tailwind';`. This scans the package and maps the theme names onto the tokens. The classes then live in your Tailwind build and follow your layers.

Either way, theme the editor through the `--editor-*` custom properties. Set them on `:root` (light), on `[data-theme='dark']`, or inside `@media (prefers-color-scheme: dark)`. The defaults have zero specificity, so your values win. Dark mode follows `data-theme="dark"` on `<html>` or the system setting unless `data-theme="light"` is set.

## Fonts

Every family a brand pack names in `fonts` / `fontFaces` must actually load in the page (`@font-face` with the real files), including each cut you declare. With `defaultBrand`, `import '@ggraphic/brand-default/fonts'` does that. Declare which cuts exist in `fonts.cuts` (`{ bold, italic, boldItalic }` per family): a missing declaration makes the editor fake a cut or hide the bold/italic buttons. Families no pack declares fall back to ggraphic's open aliases.

## Testing a host

- **Jest** (e.g. jest-expo): the dist is ESM-only. Extend the preset's `transformIgnorePatterns` allowlist with `@ggraphic/` instead of writing your own pattern.
- **Vitest**: add `server.deps.inline: [/@ggraphic\//]`. Without it, `vi.mock()` of a module that ggraphic imports (`yjs`, `y-indexeddb`, `@hocuspocus/provider`, ...) does not reach the package, and module-level registries keep state across test files when `isolate: false`.
- jsdom has no canvas fonts, `matchMedia` or `scrollIntoView`: stub `document.fonts`, `matchMedia` and `Element.prototype.scrollIntoView`, and `Konva.Stage.prototype.toDataURL`. `packages/editor/src/embed/GgraphicEditor.vitest.tsx` in the ggraphic repository mounts the component this way.
- Tools that used to read editor source files from your repo (label extractors, tour-anchor checks) now have to read `node_modules/@ggraphic/editor/dist` or list what they need.

## Stored documents

Documents carry a schema version (`meta.schemaVersion`). A newer editor upgrades old documents on open; an older editor opens a newer document read-only. When you upgrade ggraphic across a schema version, ship a release that can **read** the new version before the one that **writes** it, so a rollback keeps working.

## Advanced: low-level setup

Use this when `GgraphicEditor` is not enough: your own page logic (a `FullCanvasConfig` per template), collaboration, your own page picker or document tabs, several brands per document. ggraphic Studio (`apps/studio` in the ggraphic repository) is a complete host on this path. It is **AGPL-3.0**: read it to understand, but do not copy its code into a host that is not AGPL. The packages themselves are MPL-2.0.

### Imports

Every source file is its own entry point; there is no barrel. Import the file you mean:

```ts
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { registerMessages } from '@ggraphic/editor/i18n/messages';
import { defineTemplate, registerTemplates } from '@ggraphic/editor/templates/registry';
import { createPageConfig } from '@ggraphic/editor/page/config';
import { makeSectionDefiner } from '@ggraphic/editor/configs/factory/defineSection';
import {
  CanvasEditorProvider,
  type CanvasEditorServices,
} from '@ggraphic/editor/CanvasEditorProvider';
import { CanvasEditorShell } from '@ggraphic/editor/components/CanvasEditor/CanvasEditorShell';
import { browserFileDelivery, plainImageUrls } from '@ggraphic/editor/hostServices';
import { registerAssetCatalog } from '@ggraphic/editor/utils/canvasAssets';
import { registerToast } from '@ggraphic/editor/utils/editorToast';
```

### Startup order

Fill the module-level registers once, before the first render (for example in `main.tsx`):

```ts
registerBrandPacks([myBrand]); // first pack is the default brand
registerMessages('en'); // 'de' | 'en', or a full message catalogue
registerTemplates(...myTemplates); // defineTemplate({ id, load: (formatId) => Promise.resolve(config) })
registerToast(myToast); // optional; the editor's notifications
registerAssetCatalog(myAssetCatalog); // optional; illustrations, emoji, blocks
```

Registering brand packs is not optional decoration: the packs carry the default colours, the bold families and the font cuts every render reads. A test harness or server renderer that skips it draws something no user sees (for example a synthetic bold of a regular cut).

A template is a `FullCanvasConfig` (canvas size, sidebar tabs and sections, elements, page state, actions). `createPageConfig` from `@ggraphic/editor/page/config` builds the free page `GgraphicEditor` uses (colour ground, Text/Elements/Uploads/Tools tabs, the free elements) from a seed; write your own config only for page logic of your own.

### Mounting

```tsx
<QueryClientProvider client={queryClient}>
  <CanvasEditorProvider services={services}>
    <CanvasEditorShell
      initialConfigId="my-template"
      initialProps={{}}
      formatId="post-portrait"
      onPagesChange={(pages) => save(pages)}
      onExport={(base64) => {
        /* host decides */
      }}
      onCancel={() => {
        /* leave the editor */
      }}
    />
  </CanvasEditorProvider>
</QueryClientProvider>
```

- The editor uses TanStack Query internally, so a `QueryClientProvider` must wrap it.
- `formatId` is one of the editor's formats (`@ggraphic/editor/formats/index`), e.g. `post-portrait`, `post-portrait-tall`, `profile-square`, `slide-16-9`.
- Pass `initialPages` to open a stored multi-page document; `onPagesChange` to hear every change; `exportApiRef` for programmatic export and `getPages()`; `readOnly` to lock it; `chromeLeft` / `chromeCenter` / `chromeRight` for your own top bar items.
- `collaborative` connects a page to a Yjs room (`@ggraphic/collab`); without it the host saves the document itself.
- `CanvasEditorShell` is as tall as the viewport (`--editor-height: 100dvh`), as a full-screen host expects. To make it fill a container of yours instead, set `--editor-height: 100%` on an element around it; the chrome is positioned inside the editor either way.
- Konva needs `window`: in Next.js and other SSR frameworks render the shell client-only (`'use client'` plus a dynamic import with `ssr: false`).

### Per-document brand

A document can carry its own brand: set `brand` on the template's `FullCanvasConfig` (or resolve it per page). React code inside the editor reads it through `useDocumentBrand()`; `activeBrand()` is the app-wide default. Do not re-register packs to switch brands while editors are open: it flips every open editor.

### Extending

- Your own SVG sources (an illustration library the host owns): augment the interface and register the source.

  ```ts
  declare module '@ggraphic/core' {
    interface SvgSources {
      myart: true;
    }
  }
  ```

  Recolour hints go into `illustrations.recolor` of the asset catalogue you pass to `registerAssetCatalog` (`IllustrationSources` in `@ggraphic/editor/utils/canvasAssets`).

- Extra host services: augment `CanvasEditorHostServices` from `@ggraphic/editor/CanvasEditorProvider`.
