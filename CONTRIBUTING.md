# Contributing to ggraphic

Thanks for helping. ggraphic is alpha, and its APIs and document format still move. Before a larger change, a short issue saves both sides work.

## Where to start

- **Bugs:** open an issue with the bug form. A minimal reproduction (a document JSON, a template id, or steps in Studio) is worth more than a description.
- **Features and API changes:** open an issue first and describe the use case. The direction is in [docs/embedding-roadmap.md](./docs/embedding-roadmap.md).
- **Small fixes** (typos, docs, an obvious bug with a test): a pull request is fine without an issue.
- **First contribution:** issues labelled `good first issue` are scoped for it.
- **Questions:** see [SUPPORT.md](./SUPPORT.md).
- **Vulnerabilities:** never in public issues, see [SECURITY.md](./SECURITY.md).

## Setup

Node ≥ 22 (see `.nvmrc`) and pnpm (the version in `packageManager`, via `corepack enable`).

```bash
pnpm install
```

For Studio, the reference host, run the server and the client:

```bash
pnpm --filter @ggraphic/studio-server dev   # API on :8080, needs DATABASE_URL (see .env.example)
pnpm --filter @ggraphic/studio dev          # Vite, proxies /api to :8080
```

To run Studio with Docker Compose instead, see [docs/self-hosting.md](./docs/self-hosting.md).

## Repository layout

| Path                                | What                                              | Licence  |
| ----------------------------------- | ------------------------------------------------- | -------- |
| `packages/schema`                   | Document schema: types, validation, versions      | MPL-2.0  |
| `packages/core`                     | Element model, brand packs, operations, rendering | MPL-2.0  |
| `packages/editor`                   | The editor UI (react-konva)                       | MPL-2.0  |
| `packages/collab`                   | Real-time collaboration (Yjs, Hocuspocus)         | MPL-2.0  |
| `packages/ai`                       | AI helpers                                        | MPL-2.0  |
| `packages/ui`                       | UI kit used by Studio                             | MPL-2.0  |
| `packages/templates-open`           | Open template pack                                | CC0-1.0  |
| `apps/studio`, `apps/studio-server` | ggraphic Studio, the hostable app                 | AGPL-3.0 |

## Rules that keep the packages usable

- **Brand-neutral packages.** Nothing in `packages/*` names a real organisation or its colours, fonts, logos or wording. Brands come in through brand packs. Host-specific behaviour goes behind a host service or a module augmentation.
- **One entry point per file.** A host imports `@ggraphic/editor/utils/snapping`, not a barrel.
- **ESM only.** Relative imports carry the `.js` extension; `pnpm check:esm` checks this.
- **Licence headers.** Every source file starts with the SPDX id of its package (`// SPDX-License-Identifier: MPL-2.0`); `pnpm check:licences` verifies it. Code moved from `apps/*` into a package changes from AGPL-3.0 to MPL-2.0. Only the copyright holder can approve that, so say so in the pull request.
- **Third-party assets** (fonts, icons, images) need a compatible licence and an entry in the package's `THIRD_PARTY_NOTICES`.

## Developer Certificate of Origin

Contributions are accepted under the [DCO](./DCO) (version 1.1). Sign off every commit:

```bash
git commit -s -m "feat(core): add layer lock"
```

This adds a `Signed-off-by: Your Name <you@example.com>` trailer. CI rejects pull requests with unsigned commits.

Your contribution is licensed under the licence of the part you change: MPL-2.0 for `packages/*`, CC0-1.0 for `packages/templates-open`, AGPL-3.0 for `apps/*`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/), in English, with the subject in lower case after the colon: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`. The optional scope is the package, e.g. `fix(editor): ...`. One logical change per commit.

## Changesets

Any change that affects a published package needs a changeset:

```bash
pnpm changeset
```

Pick the packages and the bump type (patch/minor/major), and write a short summary for users of the package. Commit the generated file in `.changeset/`.

The repository is in changesets pre mode (`alpha`), so versions come out as `0.x.y-alpha.n`. On `main`, the release workflow opens a "Version Packages" pull request. Merging it publishes to npm with provenance.

## Release checklist (maintainers)

The release workflow publishes through npm trusted publishing (OIDC). Two steps are still done by hand.

**A new package needs its first publish from a maintainer's terminal.** A trusted publisher can only be configured for a package that exists on npm. Until it is, the release run fails on that package. So, once per new package:

1. Publish it by hand (npm asks for the 2FA code).
2. Make the release workflow its trusted publisher:

   ```bash
   npx -y npm@11 trust github @ggraphic/<pkg> --file release.yml --repo Movm/ggraphic --allow-publish -y
   ```

**After every release, point `latest` at the new version.** In pre mode, `changeset publish` publishes with the `alpha` tag only, and `latest` stays where it was. The `0.0.0` placeholders are deprecated, so without this step a plain `npm install @ggraphic/<pkg>` gets an outdated or deprecated version. For each package the run published:

```bash
npm dist-tag add @ggraphic/<pkg>@<version> latest
```

The release run's log and the GitHub releases list the published packages and versions.

## Tests and checks

Run the checks for what you changed, one package at a time:

```bash
pnpm --filter @ggraphic/<package> typecheck
pnpm --filter @ggraphic/<package> test
pnpm lint && pnpm format:check
pnpm check:licences && pnpm check:esm
```

A bug fix comes with a test that fails without it. Tests live next to the code (`*.vitest.ts`, `*.vitest.tsx`, `*.test.ts`).

## Render gate goldens

Stage 2 of the template render gate draws every template of the open pack in Chromium
(`apps/studio/e2e/renderGate.spec.ts`). It compares the default brand's pages with PNG goldens in
`apps/studio/e2e/__goldens__/`.

The goldens depend on the browser's text rasteriser. So they are made and checked only in the
official Playwright image, `mcr.microsoft.com/playwright:v<version>-noble`, with the
`@playwright/test` version of `apps/studio/package.json`. Docker is all it needs:

```bash
scripts/gate-render-docker.sh          # check; the same run as the CI job `render-gate`
scripts/gate-render-docker.sh update   # rewrite the goldens, then look at the changed PNGs
```

Run `update` when a template, the brand defaults or the renderer changed on purpose. Review the
image diff in your change and commit the PNGs with it. A golden that changed without a reason is
the gate doing its job.

Do not run `pnpm gate:render` on the host: a macOS or Windows rasteriser draws the same text a few
pixels differently. When you raise `@playwright/test`, change the image tag in
`.github/workflows/ci.yml` to the same version and regenerate the goldens.

## Pull requests

- Fill in the template: what changed, why, how you tested it, and the changeset.
- Keep a pull request to one topic. Refactors and behaviour changes go in separate pull requests.
- Link the issue with a closing keyword (`Closes #123`) in the description.
- CI must be green:
  - typecheck, lint and tests
  - the licence and ESM checks
  - DCO
  - the render gate, when the change touches the render path
- A maintainer reviews and merges. Merges are merge commits, not squashes.

## AI-assisted contributions

Using coding agents is fine, but you are responsible for every line. Read the diff, run the checks, and do not submit code you cannot explain. Agents working in this repository read [AGENTS.md](./AGENTS.md).

## Conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
