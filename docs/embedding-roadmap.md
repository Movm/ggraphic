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

## Why this order

- **A before everything:** while the host writes state and actions, embedding stays expensive however good the docs and CSS are.
- **A is the least risky stage:** the code exists and is tested in Studio. Studio's render gate draws every template in Chromium, so a move that changes a pixel fails the gate.
- **D is the most expensive:** the Grünerator imports deeply and has to move with it. Aliases let that happen gradually. D is not needed for embeddability, only for stability promises.
- **E proves it holds:** with Studio limited to the public surface (D) and the examples in CI, every gap a host would hit shows up in this repository first.

## Rules for the work

- **Licensing:** moving Studio code into `packages/*` relicenses it from AGPL-3.0 to MPL-2.0. The copyright holder does that explicitly in the PR. Every moved file gets its SPDX header changed and `check:licences` passes.
- **Brand neutrality:** nothing brand-specific moves into the packages (`scripts/check-ggraphic-core-boundary.mjs` rules apply).
- **Pixel identity:** a move must not change a render. Studio's render gate (CI only, never run locally) and its template goldens are the proof. Take goldens only from CI artifacts.
- **Release and contribution rules:** every published-package change carries a changeset (pre mode `alpha`), commits are signed off (DCO), and only needed CI runs are triggered.
