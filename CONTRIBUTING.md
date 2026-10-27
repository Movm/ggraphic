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

## Conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
