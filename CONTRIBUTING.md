# Contributing to ggraphic

## Developer Certificate of Origin

Contributions are accepted under the [DCO](./DCO) (version 1.1). Sign off every commit:

```bash
git commit -s -m "feat(core): add layer lock"
```

This adds a `Signed-off-by: Your Name <you@example.com>` trailer. CI rejects pull requests with unsigned commits.

Your contribution is licensed under the licence of the part you change: MPL-2.0 for `packages/*`, AGPL-3.0 for `apps/studio`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), in English, subject in lower case after the colon: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`. Optional scope is the package, e.g. `fix(editor): ...`.

## Changesets

Any change that affects a published package needs a changeset:

```bash
pnpm changeset
```

Pick the packages, the bump type (patch/minor/major) and write a short summary. Commit the generated file in `.changeset/`.

## Local checks

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

## Render gate goldens

Stage 2 of the template render gate draws every template of the open pack in Chromium
(`apps/studio/e2e/renderGate.spec.ts`) and compares the default brand's pages with PNG goldens in
`apps/studio/e2e/__goldens__/`. The goldens depend on the browser's text rasteriser, so they are
made and checked only in the official Playwright image, `mcr.microsoft.com/playwright:v<version>-noble`
with the `@playwright/test` version of `apps/studio/package.json`. Docker is all it needs:

```bash
scripts/gate-render-docker.sh          # check; the same run as the CI job `render-gate`
scripts/gate-render-docker.sh update   # rewrite the goldens, then look at the changed PNGs
```

Run `update` when a template, the brand defaults or the renderer changed on purpose, review the
image diff in your change, and commit the PNGs with it. A golden that changed without a reason is
the gate doing its job. Do not run `pnpm gate:render` on the host: a macOS or Windows rasteriser
draws the same text a few pixels differently. When you raise `@playwright/test`, change the image
tag in `.github/workflows/ci.yml` to the same version and regenerate the goldens.

## Conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
