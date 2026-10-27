# Import from Gruenerator

One-time (repeatable) import of the packages into this repository. No history is carried over.

Source packages -> destination:

| Source (`netzbegruenung/Gruenerator`) | Destination                            |
| ------------------------------------- | -------------------------------------- |
| `packages/ggraphic-schema`            | `packages/schema` (`@ggraphic/schema`) |
| `packages/ggraphic-core`              | `packages/core` (`@ggraphic/core`)     |
| `packages/ggraphic-editor`            | `packages/editor` (`@ggraphic/editor`) |

## Steps

1. **Pick a tagged SHA** in Gruenerator (tag the export commit, e.g. `ggraphic-export-YYYYMMDD`). Record `<sha>`.
2. **Export a clean copy** of the three source directories at that SHA (`git archive <sha> <paths> | tar -x -C <tmp>`), never from a working tree.
3. **Run the boundary check on the export** (before copying): no imports of `@gruenerator/*`, no references to the host app, no brand, party or political strings, colours or assets, no internal-content paths. Fix in Gruenerator and re-export if anything is found.
4. **Run the licence check on the export**: every file is eligible for MPL-2.0 relicensing (only copyright-holder-owned code, no third-party code under an incompatible licence, no vendored assets with unclear terms). Dependency licences must be compatible; list them.
5. **Copy** into `packages/schema`, `packages/core`, `packages/editor`. Rename npm names to `@ggraphic/*`, rewrite internal dependencies to `workspace:*`, add per-package `LICENSE` (MPL-2.0), `README.md`, `tsconfig.json` extending `../../tsconfig.base.json`.
6. **Validate locally**: `pnpm install && pnpm typecheck && pnpm lint && pnpm test`, then the boundary and licence checks on the destination.
7. **Add a changeset** (initial minor/`0.1.0`) and commit.

## First commit message

```
feat: initial import from netzbegruenung/Gruenerator@<sha>

Initial import from netzbegruenung/Gruenerator@<sha>

Imported without history: packages/ggraphic-schema, packages/ggraphic-core,
packages/ggraphic-editor.

Signed-off-by: <Name> <email>
```

The body line "Initial import from netzbegruenung/Gruenerator@<sha>" must stay verbatim so provenance is greppable.
