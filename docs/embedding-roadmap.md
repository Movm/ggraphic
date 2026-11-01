# Embedding roadmap

Status: plan, 2026-11-01. Owner of the decisions: Moritz.

## Problem

Embedding ggraphic today means co-writing the editor. Every page is a `FullCanvasConfig` with its own state type, actions, sections and layout. The host writes all of it:

- **Studio:** 3,055 lines of editor host code (`apps/studio/src/editor`, `brand.ts`, `registerEditor.ts`) plus 3,618 lines of tests.
- **The Grünerator:** much more than that.

Four gaps keep it that way:

- **No neutral brand pack:** `@ggraphic/brand-default` is not started.
- **No starter template.**
- **No compiled CSS:** the components carry Tailwind v4 classes, so a host without Tailwind v4 gets an unstyled editor.
- **Studio is AGPL-3.0:** the one complete host cannot be copied into an MPL or proprietary app.

A further problem is that every source file is a public entry point (398 export-map entries). Everything is API, so semver is impossible:

- **Studio:** imports 42 distinct `@ggraphic/*` subpaths.
- **The Grünerator:** imports 253 distinct subpaths from 331 files.

## Target

A host supplies **data and services**, not editor code:

```tsx
<GgraphicEditor
  brand={defineBrand({ colors: { … }, fonts: { … }, logo })}
  templates={templatePackFromJson(json)}
  document={doc}
  onChange={save}
  services={{ upload, storage }} // everything else has defaults
/>
```

`FullCanvasConfig` stays as the escape hatch for hosts with their own page logic (the Grünerator's composer). It stops being the normal path.

## Stages

| Stage                                      | Content                                                                                                                                                                                                                                                                                                                          | Code                                                                                | Effort (agent hours) |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------- |
| **A: Generic page state and actions**      | Move Studio's generic page model into `@ggraphic/editor` under MPL-2.0. That is actions, page state, seeds, typography, fitting, hugging and the config factory. Studio then consumes it from the package.                                                                                                                       | ~1,500–2,000 lines **moved**, plus their tests (~1,500); ~200–400 new lines of glue | 8–14                 |
| **B: Brands and templates as data**        | `defineBrand()` derives a full `BrandPack` from a few inputs (colours, fonts, logo). It builds on the existing derive-brand-colors work. `@ggraphic/brand-default` is a neutral pack with OFL fonts. `templatePackFromJson()` loads the existing template format into the registry.                                              | ~600–900 new, plus tests                                                            | 8–12                 |
| **C: `<GgraphicEditor>` and compiled CSS** | One component with defaults: in-memory storage, browser downloads, no AI. CSS compiled into `@layer ggraphic` and scoped under a root selector, with no class prefix (that codemod would touch 906 distinct classes in 75k lines). The Tailwind entry stays optional.                                                            | ~600–900 new, plus a build step                                                     | 8–16                 |
| **D: Curated public API**                  | A small stable surface (~50–70 entries, derived from what Studio and the Grünerator actually import), with the rest under `internal/*`. An API report in CI and a lint rule that limits Studio to the public surface. Compatibility aliases stay for one alpha, then a codemod moves the Grünerator.                             | mostly export map and config; ~330 files touched mechanically in the Grünerator     | 20–35                |
| **E: Proof from outside**                  | `examples/vite-react` and `examples/next`, built from packed tarballs, with a package-manager matrix in CI (npm, pnpm isolated, yarn, bun): tsc, build, an SSR import check and a Playwright smoke test (mount, edit, export PNG). Then a Payload CMS plugin, written by a fresh agent with only npm and the skills, as an eval. | ~500–800, plus workflows                                                            | 16–26                |

**Total:** ~60–100 agent hours. Net new code is ~3,000–5,000 lines; the rest is moving code and mechanical renames.

**Milestones:**

- **After A–C (~25–40 h):** embedding takes about 20 lines, and the `ggraphic-embed` skill (#79) shrinks to a page. Rewrite it then.
- **After D:** semver is possible, the path to 1.0.

## Stage D in detail

Measured on 2026-11-01 (main at e233f89, the Grünerator at origin/master). D1 (#93: `docs/public-api-proposal.md` with 41 domain entry points, `docs/public-api-inventory.md` as the per-subpath mapping, and a reporting-only `pnpm api:report`) decides the public list; this section plans the code changes after it.

### Current state

- **Export map:** `@ggraphic/editor` has 408 hand-written entries, each a bare string to `./src/…`. There is no generator, no root barrel, and the build is plain `tsc`, so `dist` mirrors `src` path for path.
- **Published surface:** `publishConfig.exports` is a `"./*"` wildcard plus four CSS entries. On npm every file in `dist` is importable, not only the 408. The Grünerator already imports `utils/fontAliases`, which is not in the source map.
- **The editor imports itself:** 463 of its source files import `@ggraphic/editor/<subpath>` instead of a relative path. The export map is therefore part of the editor's own wiring, and its `vi.mock` calls depend on those specifiers.
- **Who uses what:**

  | Consumer                   | Distinct editor subpaths                                             |
  | -------------------------- | -------------------------------------------------------------------- |
  | The Grünerator             | 239 (320 of its 339 importing files are in `packages/canvas-editor`) |
  | Studio                     | 42 (38 shared with the Grünerator)                                   |
  | `@ggraphic/templates-open` | 8                                                                    |
  | **Together**               | **243**                                                              |

  Of the 408 entries, 128 are used only by the editor itself and 28 by nobody. The other packages (schema, core, collab, ai, ui) are imported through their barrels, except schema, whose `./*` wildcard exposes `document/__fixtures__/v2Fixture` (used by 3 editor files).

- **No guard reads the maps:** no publint, no attw, no API report, no `no-restricted-imports`. `check-esm-specifiers.mjs` checks relative specifiers only.
- **Studio bypasses exports:** its Vite and Vitest configs alias schema, ui and templates-open to their sources. `@ggraphic/templates-open/test/testBrands` exists only through that alias.
- **Hard-wired paths:** `sideEffects` names `**/hooks/useFontGeneration.*`; `editor.css` and `tailwind.css` `@import` `@ggraphic/editor/styles…`.

### What this changes in the plan

- **The Grünerator cannot move onto the public list alone.** Its `packages/canvas-editor` is a second editor host and needs 239 subpaths. It gets an explicit internal channel without stability promises instead of being forced onto the public list.
- **Moving files under `internal/*` first would drag the 463 self-imports along.** Those are rewritten to relative paths before anything else, so the export map stops being part of the editor's wiring.
- **The codemod in the Grünerator is smaller than estimated:** one package instead of ~330 files across the repository, plus a few hand-written spots (below).

### Steps

Each step is its own PR and can be released on its own.

| Step                                      | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Depends on                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **D2a: Relative self-imports**            | Codemod the 463 editor files from `@ggraphic/editor/<subpath>` to relative `.js` specifiers (the style the rest of the editor already uses, guarded by `check-esm-specifiers`). Rewrite the editor's own `vi.mock` targets with them. Remove the stray tracked `packages/editor/package.json.tmp`. No export-map change, no render change; the render gate proves it.                                                                                                                                                                                                                                                                                                                                            | #84, #86 and C2 (#92) merged: they touch the same files and the `exports` block |
| **D2b: Facades and the internal channel** | Following #93: public entries are facade modules under `src/entries/<name>.ts` that re-export explicit names (no `export *`); files do not move. Add their export-map entries next to the existing ones and map `./internal/*` to the compiled files. The old deep paths keep working through the existing `./*` wildcard for one alpha; the changeset announces their removal. The package root `@ggraphic/editor` becomes an alias of `./embed`. New public `./kinds` with what a custom element renderer needs, plus one example kind. `createCanvasEditorStore` and `CanvasEditorState` stay internal; the provider and selector hooks are public. The Grünerator-specific `composer/*` parts get no facade. | D1, D2a                                                                         |
| **D2c: Guards**                           | Make `pnpm api:check` from D1 blocking in CI, add publint and attw on the packed tarballs, and fail CI when an export key has no target file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | D2b                                                                             |
| **D2d: Studio on the public surface**     | Move Studio to the facades and add `no-restricted-imports` that allows only the public entries; the render gate harness (`src/gate/`) is exempt. Remove the src aliases from Studio's Vite and Vitest configs, or keep them only where a package has no build; export `testBrands` from templates-open under a test subpath or keep it local.                                                                                                                                                                                                                                                                                                                                                                    | D2b                                                                             |
| **D2e: Grünerator codemod**               | In the Grünerator, rewrite the 239 subpaths from the D1 inventory (public where it exists, `internal/*` otherwise) after a release with D2b. By hand: `generate-ui-labels.mjs` and `check-tour-anchors.mjs` build paths from strings, 39 `vi.mock` calls, CSS `@source`/`@import`, 7 `declare module`. The Grünerator takes over its own composer code (Steckbrief, Störer, `buildSharepicText`, `VORLAGE_DRAG_TYPE`). Its tests that test ggraphic behaviour rather than its own configs move into this repository. Lives in both repositories.                                                                                                                                                                 | a release with D2b                                                              |
| **D2f: Close the maps**                   | One alpha after D2b, drop the `./*` wildcards from `editor` and `schema` (`publishConfig.exports` becomes the closed list of facades, stylesheets and `./internal/*`; schema keeps its root, the fixture moves to a test-only path) and remove the Grünerator-specific composer code. The 28 unused entries disappear with the wildcard. Promote entries from `internal/*` to public only when a real host needs them.                                                                                                                                                                                                                                                                                           | D2e                                                                             |

### Decisions taken here

- **Decided by Moritz on 2026-11-01 (D1 open questions):** Grünerator-specific composer code moves back into the Grünerator, only neutral text fitting stays (public in `editor/text`); `editor/kinds` is public; the store factory and state type are internal; the root is an alias of `./embed`; Grünerator tests of ggraphic behaviour move into this repository.

- **Relative imports instead of `#internal/*` (`package.json` `imports`):** relative specifiers already make up the rest of the editor, are checked by `check-esm-specifiers`, and need no resolver support in `tsc`, Vite, Vitest or the hosts' bundlers. Subpath imports would also have to point at `dist` in the published package, which `publishConfig` has to express; that path is not verified.
- **`internal/*` is part of the published package, without semver:** first-party hosts may use it and accept breakage in any release. The public list carries the promise.
- **No change in this stage to the other packages' barrels** (core, collab, ai, ui are already single-entry).

## Later stages

Not scheduled. Recorded so the measurements and the decisions do not get lost.

### Self-hosting Studio

Scheduled out of order on 2026-11-01, as its own package next to E:

- a prebuilt multi-arch image on GHCR;
- a compose file that needs no clone;
- a CI smoke test of the image (setup token, editor, PNG export);
- rembg as a compose profile;
- a quickstart in `docs/self-hosting.md`.

Estimate: 8–18 agent hours.

### F: React Native (deferred)

Decision 2026-11-01: deferred, not dropped. Measured on main 14118a15 (non-test source):

| Part                                                                  | Lines   | On React Native                            |
| --------------------------------------------------------------------- | ------- | ------------------------------------------ |
| `core`, `schema`, `collab`                                            | ~7,400  | runs as is (plain TS, Yjs)                 |
| editor logic: stores, utils, configs, templates, AI operations        | ~34,700 | mostly reusable                            |
| Konva code: rendering, transformer, snapping, text overlay (57 files) | ~17,700 | rewrite; react-konva has no native backend |
| DOM UI: sidebar, panels, menus, Radix, Tiptap, Tailwind (141 files)   | ~24,200 | rewrite as React Native components         |

Options, in agent hours:

| Option                                           | Content                                                                                                                                                                                                                                                                                                   | Effort   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **F1: embed the web editor**                     | `@ggraphic/react-native` wraps `<GgraphicEditor>` as an Expo DOM component or WebView. A native bridge handles export, image picking and sharing. This is what the Grünerator's app already does by hand (`web-viewer.tsx`, `SharepicRenderHost.tsx`).                                                    | ~10–20   |
| **F2: native renderer, display and export only** | `react-native-skia`, with all element kinds redrawn, Skia Paragraph text layout, fonts, filters, SVG illustrations and charts. Editing stays on the web. Two renderers must stay pixel-identical, so the render gate has to cover both against the same goldens. Every new element kind then costs twice. | ~60–120  |
| **F3: fully native editor**                      | F2 plus native selection, transform, snapping and text editing (Gesture Handler, Reanimated), and the whole editor UI rebuilt in React Native. The result is two editors that drift apart with every feature.                                                                                             | ~250–450 |

Recommendation when F is picked up: F1. F2 only for a concrete need, such as native feed previews without a WebView. F3 is not recommended. F2 and F3 are rough estimates; only the split of the code was measured.

## Why this order

- **A before everything:** while the host writes state and actions, embedding stays expensive however good the docs and CSS are.
- **A is the least risky stage:** the code exists and is tested in Studio. Studio's render gate draws every template in Chromium, so a move that changes a pixel fails the gate.
- **D is the most expensive:** the Grünerator imports deeply and has to move with it. Aliases let that happen gradually. D is not needed for embeddability, only for stability promises.
- **E proves it holds:** with Studio limited to the public surface (D) and the examples in CI, every gap a host would hit shows up in this repository first.

## Rules for the work

- **Licensing:** moving Studio code into `packages/*` relicenses it from AGPL-3.0 to MPL-2.0. The copyright holder does that explicitly in the PR. Every moved file gets its SPDX header changed and `check:licences` passes.
- **Brand neutrality:** nothing brand-specific moves into the packages: no organisation names, colours, fonts, logos or wording (see CONTRIBUTING.md).
- **Pixel identity:** a move must not change a render. Studio's render gate (CI only, never run locally) and its template goldens are the proof. Take goldens only from CI artifacts.
- **Release and contribution rules:** every published-package change carries a changeset (pre mode `alpha`), commits are signed off (DCO), and only needed CI runs are triggered.
