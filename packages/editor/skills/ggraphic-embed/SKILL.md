---
name: ggraphic-embed
description: Embed the ggraphic canvas editor (@ggraphic/editor, @ggraphic/core, @ggraphic/schema, optionally @ggraphic/collab) in a React app. Use when installing ggraphic, mounting CanvasEditorShell, registering a brand pack, templates, messages or host services, wiring styles and fonts, or when a host build or test breaks on ggraphic (ESM-only, Tailwind classes, mocks not applying, fonts falling back).
---

# Embedding the ggraphic editor

ggraphic is alpha (`0.1.0-alpha.x`, npm dist-tag `alpha`). APIs and the document format can change between alphas, so pin exact versions.

## What you are signing up for

ggraphic ships the editor, not a ready-made product. Before the first render a host supplies:

1. **At least one brand pack** (`BrandPack` from `@ggraphic/core`): colours, palettes, fonts and font faces, markers, chart colours, logo. No neutral default pack is published yet (`@ggraphic/brand-default` is not started).
2. **At least one template**: a `FullCanvasConfig` (canvas size, sidebar tabs and sections, elements, page state, actions), registered with `defineTemplate`/`registerTemplates`. No starter config is published yet.
3. **Host services** through `CanvasEditorProvider`: uploads, media library, image URLs, file delivery and optional features (AI, background removal, icon search).
4. **Styles and fonts** (see below).

ggraphic Studio (`apps/studio` in the ggraphic repository) is a complete working host to read. It is **AGPL-3.0**: read it to understand, but do not copy its code into a host that is not AGPL. The packages themselves are MPL-2.0 and can be embedded in any app.

## Install

```bash
npm install --save-exact @ggraphic/editor@0.1.0-alpha.0 @ggraphic/core@0.1.0-alpha.0 @ggraphic/schema@0.1.0-alpha.0
npm install react react-dom konva react-konva @tanstack/react-query
# real-time collaboration (Yjs + Hocuspocus) only:
npm install --save-exact @ggraphic/collab@0.1.0-alpha.0
```

- Keep `@ggraphic/*` on the **same exact version**; editor and collab must agree on the document schema.
- The packages are **ESM-only** and need Node ≥ 22 for anything that imports them on the server.
- `konva`, `react`, `react-dom` and `react-konva` are peers. Make sure the host resolves **one** React copy (Vite: `resolve.dedupe: ['react', 'react-dom']`), or hooks fail with "Cannot read properties of null (reading 'useContext')".
- pnpm with `minimumReleaseAge`: a freshly published alpha is refused for that window. Add exact `@ggraphic/<pkg>@<version>` entries to `minimumReleaseAgeExclude` (and remove them once the version is old enough).

## Imports

Every source file is its own entry point; there is no barrel. Import the file you mean:

```ts
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { registerMessages } from '@ggraphic/editor/i18n/messages';
import { defineTemplate, registerTemplates } from '@ggraphic/editor/templates/registry';
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

## Startup order

Fill the module-level registers once, before the first render (for example in `main.tsx`):

```ts
registerBrandPacks([myBrand]); // first pack is the default brand
registerMessages('en'); // 'de' | 'en', or a full message catalogue
registerTemplates(...myTemplates); // defineTemplate({ id, load: (formatId) => Promise.resolve(config) })
registerToast(myToast); // optional; the editor's notifications
registerAssetCatalog(myAssetCatalog); // optional; illustrations, emoji, blocks
```

Registering brand packs is not optional decoration: the packs carry the default colours, the bold families and the font cuts every render reads. A test harness or server renderer that skips it draws something no user sees (for example a synthetic bold of a regular cut).

## Mounting

```tsx
<QueryClientProvider client={queryClient}>
  <CanvasEditorProvider services={services}>
    <CanvasEditorShell
      initialConfigId="my-template"
      initialProps={{}}
      formatId="post-portrait"
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
- Pass `initialPages` to open a stored multi-page document; `exportApiRef` for programmatic export; `readOnly` to lock it; `chromeLeft` / `chromeCenter` / `chromeRight` for your own top bar items.
- `collaborative` connects a page to a Yjs room (`@ggraphic/collab`); without it the host saves the document itself.
- Konva needs `window`: in Next.js and other SSR frameworks render the editor client-only (`'use client'` plus a dynamic import with `ssr: false`).

## Per-document brand

A document can carry its own brand: set `brand` on the template's `FullCanvasConfig` (or resolve it per page). React code inside the editor reads it through `useDocumentBrand()`; `activeBrand()` is the app-wide default. Do not re-register packs to switch brands while editors are open: it flips every open editor.

## Styles

```ts
import '@ggraphic/editor/styles'; // neutral --editor-* token defaults + editor rules
```

The components carry **Tailwind v4 utility classes** and no compiled Tailwind is shipped:

- Tailwind v4 host: in your CSS, `@import 'tailwindcss'; @import '@ggraphic/editor/styles'; @import '@ggraphic/editor/styles/tailwind';` (scans the package, maps the theme names onto the tokens).
- Any other host: scan `node_modules/@ggraphic/editor/dist/**/*.js` with your own Tailwind v4 build and map the same theme names, or the editor renders unstyled.
- Theme the editor by overriding the `--editor-*` custom properties after the import.

## Fonts

Every family a brand pack names in `fonts` / `fontFaces` must actually load in the page (`@font-face` with the real files), including each cut you declare. Declare which cuts exist in `fonts.cuts` (`{ bold, italic, boldItalic }` per family): a missing declaration makes the editor fake a cut or hide the bold/italic buttons. Families no pack declares fall back to ggraphic's open aliases.

## Extending

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

## Testing a host

- **Jest** (e.g. jest-expo): the dist is ESM-only. Extend the preset's `transformIgnorePatterns` allowlist with `@ggraphic/` instead of writing your own pattern.
- **Vitest**: add `server.deps.inline: [/@ggraphic\//]`. Without it, `vi.mock()` of a module that ggraphic imports (`yjs`, `y-indexeddb`, `@hocuspocus/provider`, ...) does not reach the package, and module-level registries keep state across test files when `isolate: false`.
- Render tests and harnesses call the same startup registration as the app.
- Tools that used to read editor source files from your repo (label extractors, tour-anchor checks) now have to read `node_modules/@ggraphic/editor/dist` or list what they need.

## Stored documents

Documents carry a schema version (`meta.schemaVersion`). A newer editor upgrades old documents on open; an older editor opens a newer document read-only. When you upgrade ggraphic across a schema version, ship a release that can **read** the new version before the one that **writes** it, so a rollback keeps working.
