# ggraphic

ggraphic is a brand-neutral, template-based, AI-centred open-source design editor, built on [react-konva](https://konvajs.org/docs/react/). Think of a Canva-like editor you can embed in your own app or host yourself: documents are described by a typed schema, rendered and edited by a core and an editor UI, and can be created or modified by AI.

> Status: skeleton. Packages are imported into this repository in a separate step (see [scripts/import-from-gruenerator.md](./scripts/import-from-gruenerator.md)).

## Packages

| Package                             | npm                       | Path                     | Licence  | Status                 |
| ----------------------------------- | ------------------------- | ------------------------ | -------- | ---------------------- |
| Document schema                     | `@ggraphic/schema`        | `packages/schema`        | MPL-2.0  | planned (first import) |
| Core (state, operations, rendering) | `@ggraphic/core`          | `packages/core`          | MPL-2.0  | planned (first import) |
| Editor UI                           | `@ggraphic/editor`        | `packages/editor`        | MPL-2.0  | planned (first import) |
| AI helpers                          | `@ggraphic/ai`            | `packages/ai`            | MPL-2.0  | later                  |
| Default brand                       | `@ggraphic/brand-default` | `packages/brand-default` | MPL-2.0  | later                  |
| ggraphic Studio (hostable app)      | n/a                       | `apps/studio`            | AGPL-3.0 | later                  |

## Licence model

- **Libraries (`packages/*`): MPL-2.0.** File-level copyleft: changes to our files stay open, but you can embed the packages in proprietary or differently licensed applications.
- **ggraphic Studio (`apps/studio`): AGPL-3.0.** The complete hostable application; if you run a modified Studio as a network service you must offer its source to your users.
- Full texts: [LICENSE](./LICENSE) (MPL-2.0), [LICENSES/MPL-2.0.txt](./LICENSES/MPL-2.0.txt), [LICENSES/AGPL-3.0.txt](./LICENSES/AGPL-3.0.txt). Each package and app carries its own `LICENSE` file.
- Contributions are made under the [DCO](./DCO).

## Provenance

Originally developed as part of netzbegruenung/Gruenerator (AGPL-3.0); relicensed by the copyright holder under MPL-2.0.

## Self-hosting

TODO: Docker image and configuration for ggraphic Studio once `apps/studio` lands.

## Development

Requires Node >= 22 and pnpm (see `packageManager` in `package.json`).

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
```

### Adding a changeset

Every change to a published package needs a changeset:

```bash
pnpm changeset
```

Choose the affected packages and bump type, write a summary, and commit the generated `.changeset/*.md` file with your PR. On `main`, the release workflow opens a "Version Packages" PR and publishes to npm (with provenance) when it is merged.

See [CONTRIBUTING.md](./CONTRIBUTING.md).
