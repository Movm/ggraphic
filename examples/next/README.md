# ggraphic in a Next.js app

A minimal Next.js host (App Router) that embeds `<GgraphicEditor>` from `@ggraphic/editor/embed`, following the [`ggraphic-embed` skill](../../packages/editor/skills/ggraphic-embed/SKILL.md). It uses the same tarballs, brand, two templates and compiled stylesheet (no Tailwind) as the [Vite example](../vite-react/). The design is kept in `localStorage`.

- `app/page.tsx`, the start page, is a server component: pick a format, then a blank page or a template. `app/catalog.ts` reads the formats with `canvasFormats()` from `@ggraphic/editor/host` (named with `formatLabel` and `formatDescription` after `registerMessages('en')`; the editor's texts default to German) and parses `app/templates.json` with `templatePackFromJson` from `@ggraphic/editor/page`, on the server; both entries load no React. Every choice is a link.
- `app/edit/page.tsx` renders `app/Editor.tsx`, a client component (`'use client'`) that renders `GgraphicEditor`. A new design is `document={{ formatId, pages: [{ configId, state: {} }] }}`, where `configId` is a template id or `BLANK_PAGE_ID` (from `@ggraphic/editor/host`, which a server component can import); the editor seeds the empty state from it. "New design" leads back to the start page.
- The server sends the editor page without the editor; the editor loads in the browser after hydration. No `dynamic(..., { ssr: false })` is needed. It fills its host's box: the header takes its height, the editor the rest of the window.
- In the browser, `loadTemplatePack` reads the same two templates. Its parser loads in a chunk of its own next to the editor, so it stays out of the page's first JavaScript.
- A server component cannot render `GgraphicEditor` itself: the template pack and `onChange` contain functions, which cannot be passed from the server to a client component.

It is not part of the pnpm workspace. It installs the packages with npm from tarballs packed from this checkout, as an outside consumer would get them from the registry:

```bash
pnpm install && pnpm build   # in the repository root
cd examples/next
npm run pack:local           # packs with ../vite-react/scripts/pack.mjs and copies the tarballs here
npm install
npm run build                # next build, which runs tsc
npm run test:ssr             # imports the embed, host and page entries in plain Node
npx playwright install chromium
npm run test:smoke           # the server HTML, then start page → editor, add a text, export a PNG
```

The `Examples` workflow runs the same steps on every change under `packages/` or `examples/`.

Licence: MPL-2.0, like the packages. The two templates in `app/templates.json` stay CC0-1.0, as in templates-open.
