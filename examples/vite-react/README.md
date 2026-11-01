# ggraphic in a Vite + React app

A minimal host that embeds `<GgraphicEditor>` from `@ggraphic/editor/embed`, following the [`ggraphic-embed` skill](../../packages/editor/skills/ggraphic-embed/SKILL.md): `@ggraphic/brand-default`, two templates from `@ggraphic/templates-open` loaded with `loadTemplatePack` (its parser loads in a chunk of its own, next to the editor), and the compiled stylesheet (no Tailwind). The design is kept in `localStorage`.

It is not part of the pnpm workspace. It installs the packages with npm from tarballs packed from this checkout, as an outside consumer would get them from the registry:

```bash
pnpm install && pnpm build   # in the repository root
cd examples/vite-react
npm run pack:local           # packs schema, core, brand-default and editor into tarballs/
npm install
npm run build                # tsc, then vite build
npx playwright install chromium
npm run test:smoke           # mount, add a text, export a PNG
```

The `Examples` workflow runs the same steps on every change under `packages/` or `examples/`.

Licence: MPL-2.0, like the packages. The two templates in `src/templates.json` stay CC0-1.0, as in templates-open.
