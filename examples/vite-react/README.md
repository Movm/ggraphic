# ggraphic in a Vite + React app

A minimal host that embeds `<GgraphicEditor>` from `@ggraphic/editor/embed`, following the [`ggraphic-embed` skill](../../packages/editor/skills/ggraphic-embed/SKILL.md): `@ggraphic/brand-default`, two templates from `@ggraphic/templates-open` loaded with `templatePackFromJson`, and the compiled stylesheet (no Tailwind). The design is kept in `localStorage`.

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

Licence: CC0-1.0. Copy what you need.
