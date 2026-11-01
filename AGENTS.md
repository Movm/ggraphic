# Agent guide for ggraphic

Instructions for coding agents (Claude Code, Codex, Cursor, …) working in this repository. Humans: the same rules live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Repository

pnpm monorepo, Node ≥ 22, ESM only. Packages in `packages/*` (MPL-2.0; `templates-open` CC0-1.0), Studio in `apps/studio` and `apps/studio-server` (AGPL-3.0). Every source file of a package is its own entry point; there is no barrel.

## Rules

- **Brand-neutral packages.** Never put a real organisation's name, colours, fonts, logos or wording into `packages/*`.
- **SPDX header** on every new source file, matching the package licence. Do not move code from `apps/*` into `packages/*` unless the task says the copyright holder approved the relicensing.
- **ESM:** relative imports end in `.js`.
- **Commits:** Conventional Commits in English, subject lower case after the colon, signed off (`git commit -s`). One logical change per commit.
- **Changeset** for every change to a published package (`pnpm changeset`; pre mode `alpha`).
- **No new dependency** without saying why; prefer what is already installed.

## Checks

Run them one at a time, for the package you changed:

```bash
pnpm --filter @ggraphic/<package> typecheck
pnpm --filter @ggraphic/<package> exec vitest run <file> --maxWorkers=2
pnpm exec eslint <files> && pnpm exec prettier --check <files>
pnpm check:licences && pnpm check:esm
```

- Do not run the whole test suite of every package in parallel; it is memory-heavy.
- **Render gate:** never run `pnpm gate:render` on a developer machine; goldens come from the Playwright Docker image (`scripts/gate-render-docker.sh`) or from CI artifacts. A changed golden needs a reason in the pull request.
- **CI minutes are limited:** push when a change is ready, not after every commit.

## Pull requests

English title and description; what changed, why, how it was tested; `Closes #<issue>`. Never merge without a maintainer's approval.

## Embedding questions

How a host uses the packages: [`packages/editor/skills/ggraphic-embed/SKILL.md`](./packages/editor/skills/ggraphic-embed/SKILL.md).
