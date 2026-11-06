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
import '@ggraphic/editor/styles/compiled.css';
import { GgraphicEditor, loadTemplatePack, type GgraphicDocument } from '@ggraphic/editor/embed';

import templateFiles from './templates.json'; // template files (`@ggraphic/schema` format)

const templates = loadTemplatePack(templateFiles); // once, at module level

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

- Fills the editor's registers from the props: brand pack, messages, the pack's templates and a blank page, whose page config id is `BLANK_PAGE_ID` (from `@ggraphic/editor/embed`, or from `@ggraphic/editor/host` in a server component).
- Wraps the editor in a `QueryClientProvider` (its own client unless you pass `queryClient`), a `CanvasEditorProvider` with your `services`, and `CanvasEditorShell`.
- Feeds the pack's slot budgets to the editor's status line.

Props:

| Prop           | Default                                                      | Notes                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brand`        | required                                                     | `defaultBrand` from `@ggraphic/brand-default`, or your own from `defineBrand` (below).                                                                                                                               |
| `templates`    | required                                                     | `loadTemplatePack(files)`, a promise the editor resolves while it loads. Create it once, not per render. Await it to read `problems` (files that were skipped). A pack from `templatePackFromJson` works too.        |
| `document`     | one page of the pack's first template on `post-portrait`     | `{ formatId, pages: [{ configId, state }] }`. Read when the editor mounts; give the component a new `key` to open another document. A new design is `state: {}` with a template id or `BLANK_PAGE_ID` as `configId`. |
| `onChange`     | none                                                         | The whole document after every change (edits, added or moved pages, undo). Store it as it comes; debounce on your side if saving is expensive.                                                                       |
| `services`     | downloads through the browser, uploads as object URLs, no AI | `CanvasEditorServices` from `@ggraphic/editor/CanvasEditorProvider`. Pass only what you have: a `mediaLibrary` for durable uploads, `aiDraft`, `iconSearch`, `fileDelivery` …                                        |
| `locale`       | `'en'`                                                       | `'en'` or `'de'`.                                                                                                                                                                                                    |
| `queryClient`  | own client                                                   | Pass yours to share a cache with the rest of the app.                                                                                                                                                                |
| `title`        | none                                                         | The design's name, used for the PDF and slide-deck downloads.                                                                                                                                                        |
| `exportApiRef` | none                                                         | A ref that receives `CanvasEditorExportApi` once the editor has loaded (see Export).                                                                                                                                 |

Things to know:

- **Client only, SSR-safe import.** Importing `@ggraphic/editor/embed` touches no browser global, so a server-rendered page (Next.js app router, Remix …) can import it. It renders nothing on the server and loads the editor in the browser after hydration. No `dynamic(..., { ssr: false })` needed.
- **React Server Components.** The entry (and the package root) is marked `'use client'`, so importing it from a server component gives a client reference instead of failing on `createContext`. Render the editor from your own `'use client'` component that builds the brand and the template pack: props passed from a server component must be serialisable, and a template pack holds functions. Rendering `<GgraphicEditor>` straight from a server component therefore only works if every prop you pass is plain data.
- **Give it a box with a height.** The editor fills exactly the container it is rendered in (`height: 100%`): top bar, sidebar, panel and bottom bar sit inside it, and the pages scroll inside it, so your own header or sidebar can sit next to it. The container needs a definite height (`height: calc(100dvh - 56px)`, or a flex item that is stretched to one); a container that only has a `min-height` gives the editor nothing to fill. Layout and canvas follow that box, not the window: below 900 px wide the editor uses its phone layout (tabs at the bottom, panels as sheets) also in a wide window, and the pages are sized to fit the box. Dialogs and menus, which open over the whole page, still follow the window.
- **One brand and locale per page.** The registers are module-level: two `GgraphicEditor`s on one page share the brand and locale of the one rendered last. Template ids are stored in documents and never re-registered: a second pack that reuses an id keeps the first one's template.
- **No collaboration** unless you use the low-level path below.

### Export

The editor's own Share menu downloads PNG, SVG, PDF and slide decks. To export from your own UI (a "Save PNG" button, a thumbnail on save), pass `exportApiRef`:

```tsx
import { type CanvasEditorExportApi } from '@ggraphic/editor/embed';

const [api, setApi] = useState<CanvasEditorExportApi | null>(null);

<GgraphicEditor brand={defaultBrand} templates={templates} exportApiRef={setApi} />;

<button
  disabled={!api}
  onClick={async () => {
    const png = await api?.captureActivePage({ pixelRatio: 2 });
    if (png) download(png, 'design.png'); // a data URL
  }}
>
  Save PNG
</button>;
```

- The api arrives after the editor has loaded in the browser, and goes back to `null` when it unmounts. A callback ref (`setApi` above) tells you when; a `useRef` works too if you only read it on click.
- `captureActivePage({ pixelRatio, transparent })`: the active page as a PNG data URL, or `null` while its canvas is not mounted.
- `capturePages({ pixelRatio })`: every page as a PNG data URL, in order.
- `exportPptx()`: the deck as an editable .pptx `Blob`.
- `exportSvg({ pages, text, transparent })`: vector SVG, resolving to `{ blob, filename, report }`. `pages` is `'current'` or `'all'`; one page gives the SVG itself, several give a ZIP of SVGs. `text` is `'outlines'` (glyph outlines, looks the same everywhere) or `'editable'` (live `<text>`, which needs the font where the file is opened). `transparent` leaves out the page background. It rejects when a page cannot be rendered.
- `exportPdf()`: every page as one vector PDF, resolving to `{ blob, filename, report }`: print pages with bleed, trim and crop marks, slides at slide size, other pages at 1 px to the pt. Text is real and selectable, fonts are subset-embedded. It rejects when a page cannot be rendered; when the document cannot be made as vector at all, the PDF is made of page pictures and `report.fallback` says why.
- `getPages()`: the document's pages as `onChange` reports them.
- `undo()` / `redo()`.

Both vector exports return an `ExportReport` (type from `@ggraphic/editor/export`): what could not stay vector (`rasterIslands`, each with a reason), glyphs a font lacks (`missingGlyphs`), images that could not be read (`missingElements`), fonts whose licence only allows outlines (`outlinedForLicence`), brand colours that left a PDF in RGB (`rgbBrandColors`) and `fallback`. Show it to the person who exported; the editor's own Share menu does.

To hide the editor's own Share menu, use the low-level path (`showShare={false}` on `CanvasEditorShell`).

To export a page you only preview (a gallery, a server-less render queue), mount `PagePreview` (from `@ggraphic/editor/shell`) and take its optional `onCanvas` callback: it receives the page's canvas handle (`GenericCanvasRef`) once the page has settled, just before the PNG is encoded, and the handle stays valid while the preview is mounted. The handle's `recordScene({ page, transparent })` is the `recordPage` dependency of `exportPagesSvg` / `exportPagesPdf` from `@ggraphic/editor/export`, which come with the browser helpers they are wired with (`fetchImageBytes`, `reencodeImage`, `rasterizeOps`, `pngFromDataUrl`).

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

**CMYK for print PDFs.** `BrandPack.print.cmyk` is optional: keys are `#rrggbb` (lower case), values are `[c, m, y, k]` from 0 to 100. In a vector PDF, fills, strokes and text in a listed colour, and gradients whose stops are all listed, are written as DeviceCMYK with exactly those values; every other colour, photos included, stays RGB, and a colour without a print value is never derived. Without the map the PDF is pure RGB, and `report.rgbBrandColors` lists the brand colours that left it that way. `defineBrand` does not take `print`; add it to the pack it returns: `{ ...defineBrand({ … }), print: { cmyk: { '#0f2352': [100, 85, 30, 40] } } }`.

### Templates as data: `loadTemplatePack`

`loadTemplatePack(files)` returns a promise of the pack and loads the parser (the schema validators and the page config, several hundred kB) in a chunk of its own, next to the editor. `templatePackFromJson(files)` does the same work synchronously, but whatever imports it carries that code: called at module level, it more than doubles a host's entry chunk. Use it where you need the pack before rendering. Neither is a server API: both are exported from the `'use client'` entry, so a server component that imports them gets a client reference, not the function, and the pack they return holds functions that cannot cross to the client.

Both take an array of template files (or one file) in the `@ggraphic/schema` format. `@ggraphic/templates-open` is a CC0 pack to start from; its root entry ships no images, and its sample photos for previews (`SAMPLE_PHOTOS`) load only from `@ggraphic/templates-open/photos`. Every template becomes a page the editor opens under the template's id. A file that does not read, was written by a newer version or repeats an id is skipped and listed in `problems`; blocks are left out (they are not pages).

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
- `konva`, `react`, `react-dom` and `react-konva` are peers. React and React DOM must be **19.3 or later** (`^19.3.0`): react-konva 19.3 requires it, and npm stops with `ERESOLVE` on an older React. Make sure the host resolves **one** React copy (Vite: `resolve.dedupe: ['react', 'react-dom']`), or hooks fail with "Cannot read properties of null (reading 'useContext')".
- pnpm with `minimumReleaseAge`: a freshly published alpha is refused for that window. Add exact `@ggraphic/<pkg>@<version>` entries to `minimumReleaseAgeExclude` (and remove them once the version is old enough).
- pnpm 12 and later print "Agent skills awaiting approval: @ggraphic/editor" on every install: the package ships this skill, and pnpm links it into `.claude/skills/` only once the host approves it (`pnpm approve`). Without approval nothing is linked and the editor works the same.
- A host that type-checks Node-facing files (`vite.config.ts`, `playwright.config.ts`) declares `@types/node` itself. Without it, a strict pnpm host (`hoist: false`) fails tsc with `TS2688: Cannot find type definition file for 'node'` in `undici-types`; with hoisting, the copy one of the editor's dependencies brings in hides the gap.

## Styles

The components carry Tailwind v4 utility classes. Pick one of two ways to style them:

- **Any host (no Tailwind needed):** one import, everything compiled.

  ```ts
  import '@ggraphic/editor/styles/compiled.css';
  ```

  - Import the stylesheets from JavaScript with the `.css` key (`styles/compiled.css`, `styles/index.css`, `styles/editor.css`, `styles/tokens.css`, `styles/tailwind.css`). The bundler's `declare module '*.css'` matches only those; the keys without the extension fail TypeScript 6 with TS2882. Both resolve to the same file, and CSS `@import`s can use either.

  - Every rule sits in `@layer ggraphic`, so any unlayered host rule wins without `!important`. If your own CSS is layered, declare `ggraphic` first (`@layer ggraphic, base, …;`) to keep the same order.
  - The rules apply only inside `[data-ggraphic]`, Tailwind's reset included, so your page keeps its own reset and theme. `CanvasEditorShell` (and so `GgraphicEditor`) renders that root, and every dialog, menu and popover the editor portals onto `<body>` carries the attribute too. If you mount editor components outside the shell, wrap them in an element with `data-ggraphic` (`EDITOR_SCOPE` from `@ggraphic/editor/ui/editorScope`).
  - Do not combine it with `styles` or `styles/tailwind`.

- **Tailwind v4 host:** in your CSS, `@import 'tailwindcss'; @import '@ggraphic/editor/styles'; @import '@ggraphic/editor/styles/tailwind';`. This scans the package and maps the theme names onto the tokens. The classes then live in your Tailwind build and follow your layers.

Either way, theme the editor through the `--editor-*` custom properties. Set them on `:root` (light), on `[data-theme='dark']`, or inside `@media (prefers-color-scheme: dark)`. The defaults have zero specificity, so your values win. Dark mode follows `data-theme="dark"` on `<html>` or the system setting unless `data-theme="light"` is set.

## Fonts

Every family a brand pack names in `fonts` / `fontFaces` must actually load in the page (`@font-face` with the real files), including each cut you declare. With `defaultBrand`, `import '@ggraphic/brand-default/fonts'` does that. Declare which cuts exist in `fonts.cuts` (`{ bold, italic, boldItalic }` per family): a missing declaration makes the editor fake a cut or hide the bold/italic buttons. Families no pack declares fall back to ggraphic's open aliases.

The SVG and PDF exports embed or outline the glyphs themselves, so they need the font files, not only a loaded `@font-face`. They look in this order: the optional host service `exportFonts`, the brand pack's `fontFaces`, then the page's own `@font-face` rules (same-origin, or cross-origin with CORS headers, so `fetch` can read them). A host whose fonts are not reachable that way (signed URLs, files behind an API, cross-origin fonts without CORS) passes `exportFonts` in `services`:

```tsx
import { type CanvasExportFontService } from '@ggraphic/editor/services';

const exportFonts: CanvasExportFontService = {
  // The file for one face: TTF, OTF, WOFF or WOFF2; null when you have none.
  load: async ({ family, weight, style }) => {
    const res = await fetch(fontUrl(family, weight, style));
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  },
};

<GgraphicEditor brand={brand} templates={templates} services={{ exportFonts }} />;
```

`load` is asked for the face the export resolved, which is not always the one the document names:

- `family` is already resolved through ggraphic's open font aliases (a document that says an aliased name is asked for its replacement) and has no CSS quotes.
- For a bold request (weight 600 and up) of a regular family that the brand pack's `fonts.boldFamilies` maps to a bold-only family, `load` is first asked for that bold family at weight `400`, because its regular cut is the bold. Answer weight-400 requests for such a family with its file; if you return `null`, `load` is asked again for the regular family at the bold weight.
- An answer of `null`, or a `load` that throws or rejects, means "no file from you": the brand's `fontFaces` and the page's `@font-face` rules are tried next.

A face no source has a file for does not break the export: in an SVG its text stays a live `<text>` with the family name; in a PDF it becomes a picture (`rasterIslands`, reason `font-unavailable`), and when that hits the text of more than one element the PDF is made of page pictures (`report.fallback`).

## Testing a host

- **Jest** (e.g. jest-expo): the dist is ESM-only. Extend the preset's `transformIgnorePatterns` allowlist with `@ggraphic/` instead of writing your own pattern.
- **Vitest**: add `server.deps.inline: [/@ggraphic\//]`. Without it, `vi.mock()` of a module that ggraphic imports (`yjs`, `y-indexeddb`, `@hocuspocus/provider`, ...) does not reach the package, and module-level registries keep state across test files when `isolate: false`.
- jsdom has no canvas fonts, `matchMedia` or `scrollIntoView`: stub `document.fonts`, `matchMedia` and `Element.prototype.scrollIntoView`, and `Konva.Stage.prototype.toDataURL`. `packages/editor/src/embed/GgraphicEditor.vitest.tsx` in the ggraphic repository mounts the component this way.
- Tools that used to read editor source files from your repo (label extractors, tour-anchor checks) now have to read `node_modules/@ggraphic/editor/dist` or list what they need.

## Stored documents

Documents carry a schema version (`meta.schemaVersion`). A newer editor upgrades old documents on open; an older editor opens a newer document read-only. When you upgrade ggraphic across a schema version, ship a release that can **read** the new version before the one that **writes** it, so a rollback keeps working.

## Advanced: low-level setup

Use this when `GgraphicEditor` is not enough: your own page logic (a `FullCanvasConfig` per template), collaboration, your own page picker or document tabs, several brands per document. ggraphic Studio (`apps/studio` in the ggraphic repository) is a complete host on this path. It is **AGPL-3.0-only**, and so are the packages themselves: a host that embeds them and is distributed or offered over a network must make its source available under AGPL-compatible terms. Versions published before the relicensing stay MPL-2.0. The `examples/*` are MIT and free to copy.

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
- `formatId` is a built-in format (`post-portrait`, `profile-square`, `slide-16-9`) or one the host added with `registerCanvasFormatGroups` / `registerCanvasFormats` from `@ggraphic/editor/templates`. A format joins the `slides` group to become a slide deck; print formats go in `print`.
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
