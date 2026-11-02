# ggraphic

ggraphic is a brand-neutral, template-based, AI-centred open-source design editor, built on [react-konva](https://konvajs.org/docs/react/). Think of a Canva-like editor you can embed in your own app or host yourself: documents are described by a typed schema, rendered and edited by a core and an editor UI, and can be created or modified by AI.

> [!WARNING]
> **Alpha.** ggraphic is early work in progress. So far it runs in ggraphic Studio and in the Grünerator, the app it was extracted from.
>
> - **No stability promise:** APIs, the document format and database migrations can change between alphas. Pin exact versions.
> - **Testing:** CI runs typecheck, lint and the test suites on every pull request, and a browser render gate when a pull request touches the render path. There has been no security review.
> - **Releases:** alpha versions are published to npm under the dist-tag `alpha` (`npm install @ggraphic/editor@alpha`), with provenance. `latest` still points at the empty `0.0.0` placeholder.
>
> Try it, read it, open issues, but do not rely on it for anything you cannot afford to lose.

## Packages

| Package                             | npm                        | Path                      | Licence       | Status      |
| ----------------------------------- | -------------------------- | ------------------------- | ------------- | ----------- |
| Document schema                     | `@ggraphic/schema`         | `packages/schema`         | AGPL-3.0-only | alpha       |
| Core (state, operations, rendering) | `@ggraphic/core`           | `packages/core`           | AGPL-3.0-only | alpha       |
| Editor UI                           | `@ggraphic/editor`         | `packages/editor`         | AGPL-3.0-only | alpha       |
| Real-time collaboration (Yjs)       | `@ggraphic/collab`         | `packages/collab`         | AGPL-3.0-only | alpha       |
| UI kit (Studio components, tokens)  | `@ggraphic/ui`             | `packages/ui`             | AGPL-3.0-only | alpha       |
| AI helpers                          | `@ggraphic/ai`             | `packages/ai`             | AGPL-3.0-only | alpha       |
| Default brand                       | `@ggraphic/brand-default`  | `packages/brand-default`  | AGPL-3.0-only | not started |
| Open template pack                  | `@ggraphic/templates-open` | `packages/templates-open` | CC0-1.0       | alpha       |
| ggraphic Studio (hostable app)      | n/a                        | `apps/studio`             | AGPL-3.0-only | alpha       |
| ggraphic Studio server              | n/a                        | `apps/studio-server`      | AGPL-3.0-only | alpha       |

## Licence model

- **Libraries (`packages/*`): AGPL-3.0-only.** If you embed the libraries in an application that you distribute or offer over a network, that application's source must be available under AGPL-compatible terms. There is no commercial licence for now. Versions published to npm before this change (up to and including the current alphas) stay available under MPL-2.0.
- **Open template pack (`packages/templates-open`): CC0-1.0.** The template files are public domain, so anyone can copy and adapt them freely; the pack's few source files are CC0 too. `pnpm check:licences` verifies that every file's SPDX id matches its package's licence.
- **Host examples (`examples/*`): MIT.** Copy the example code freely; the AGPL obligation comes from the libraries it embeds, not from the example.
- **ggraphic Studio (`apps/studio`): AGPL-3.0-only.** The complete hostable application; if you run a modified Studio as a network service you must offer its source to your users.
- Full texts: [LICENSE](./LICENSE) (AGPL-3.0), [LICENSES/AGPL-3.0.txt](./LICENSES/AGPL-3.0.txt), [LICENSES/CC0-1.0.txt](./LICENSES/CC0-1.0.txt), [LICENSES/MIT.txt](./LICENSES/MIT.txt), [LICENSES/MPL-2.0.txt](./LICENSES/MPL-2.0.txt) (earlier published versions and MPL-licensed dependencies). Each package and app carries its own `LICENSE` file.
- Contributions are made under the [DCO](./DCO).

## Provenance

Originally developed as part of netzbegruenung/Gruenerator (AGPL-3.0); relicensed by the copyright holder, first under MPL-2.0 and since then under AGPL-3.0-only for the packages.

## Embedding the editor

To put the editor into your own React app, follow [`packages/editor/skills/ggraphic-embed/SKILL.md`](./packages/editor/skills/ggraphic-embed/SKILL.md). It ships inside `@ggraphic/editor`, so coding agents find it in `node_modules` too.

## Self-hosting

Run ggraphic Studio on your own machine with Docker Compose and the published image `ghcr.io/movm/ggraphic-studio` (linux/amd64 and linux/arm64), without cloning this repository:

```bash
mkdir ggraphic-studio && cd ggraphic-studio
curl -fsSLO https://raw.githubusercontent.com/Movm/ggraphic/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/Movm/ggraphic/main/.env.example -o .env
sed -i.bak "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env && rm .env.bak
docker compose up -d
docker compose logs studio   # the one-time setup token for the admin account
```

Then open <http://localhost:8080>. Configuration, background removal, backups and upgrades are in [docs/self-hosting.md](./docs/self-hosting.md). The image is built from this repository. Studio is AGPL-3.0: if you run a modified version as a service, offer your users its source.

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

Studio is not on npm, but it is published as an image. `@ggraphic/studio` and `@ggraphic/studio-server` share one version (a fixed group in `.changeset/config.json`). When the "Version Packages" PR raises it, `studio-image.yml` publishes the image under that version. A change that should reach the image therefore needs a changeset for one of the two.

See [CONTRIBUTING.md](./CONTRIBUTING.md).
