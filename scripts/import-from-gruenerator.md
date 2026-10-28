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

## Re-import (three-way)

Later imports are three-way merges, so ggraphic's own changes to the core packages survive.

1. **Import commit on the previous import.** Branch a local `import/gruenerator-<sha>` from the previous import commit (for example `c55d402`). `rsync -a --delete` the export of each `packages/ggraphic-<p>/` over `packages/<p>/`, excluding the files rewritten at the last import: the four package `tsconfig.json` files and `packages/editor/package.json`. For those files, replay Gruenerator's own delta by hand: `diff` the previous export against the new one and apply that delta to the ggraphic version. An empty delta keeps the file as is. Never take Gruenerator's version wholesale.
2. **Check the commit holds only the package trees**: `git status --short | grep -v '^.. packages/\(schema\|core\|editor\|collab\)/'` prints nothing.
3. **Commit with `git commit -s`** and the verbatim provenance line `Initial import from netzbegruenung/Gruenerator@<full sha>` in the body, plus the four source packages and the Gruenerator PR whose head the tree equals.
4. **Merge with `--no-ff`** into a branch created from `main`. Resolve conflicts file by file and keep both intents. Then build and typecheck: a clean textual merge can still leave duplicate identifiers or imports.
5. **Keep the import branch local**, never push it. After the merge its commit is reachable, so delete the branch with `git branch -D`.
