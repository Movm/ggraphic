# ggraphic in a Next.js app

A minimal Next.js host (App Router) that embeds `<GgraphicEditor>` from `@ggraphic/editor/embed`, following the [`ggraphic-embed` skill](../../packages/editor/skills/ggraphic-embed/SKILL.md). It uses the same tarballs, brand, two templates and compiled stylesheet (no Tailwind) as the [Vite example](../vite-react/). The design is kept in `localStorage`.

- `app/page.tsx` is a server component. It renders the host page and `app/Editor.tsx`, a client component (`'use client'`) that renders `GgraphicEditor`.
- The server sends the page without the editor; the editor loads in the browser after hydration. No `dynamic(..., { ssr: false })` is needed.
- A server component cannot render `GgraphicEditor` itself: the template pack and `onChange` contain functions, which cannot be passed from the server to a client component.

It is not part of the pnpm workspace. It installs the packages with npm from tarballs packed from this checkout, as an outside consumer would get them from the registry:

```bash
pnpm install && pnpm build   # in the repository root
cd examples/next
npm run pack:local           # packs with ../vite-react/scripts/pack.mjs and copies the tarballs here
npm install
npm run build                # next build, which runs tsc
npm run test:ssr             # imports @ggraphic/editor/embed in plain Node and renders it to a string
npx playwright install chromium
npm run test:smoke           # the server HTML, then mount, add a text, export a PNG
```

The `Examples` workflow runs the same steps on every change under `packages/` or `examples/`.

Licence: MPL-2.0, like the packages. The two templates in `app/templates.json` stay CC0-1.0, as in templates-open.
