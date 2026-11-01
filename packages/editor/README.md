# @ggraphic/editor

> **Alpha, untested.** Early work in progress: the API and the document format can change without notice. See the [repository README](../../README.md#ggraphic).

The brand-neutral canvas editor of ggraphic, built on react-konva: the editor shell with its sidebar, stage, text editing, elements (shapes, icons, illustrations, charts, badges, images), multi-page documents, undo, export (PNG, PDF, PPTX) and the Yjs page document for collaboration. Licensed under the [Mozilla Public License 2.0](./LICENSE).

## Install

```bash
npm install --save-exact @ggraphic/editor@0.1.0-alpha.0 @ggraphic/core@0.1.0-alpha.0 @ggraphic/schema@0.1.0-alpha.0
npm install react react-dom konva react-konva @tanstack/react-query
```

Releases are published under the npm dist-tag `alpha`. The package is ESM-only.

## Embedding

The editor needs a host: a brand pack, at least one template (page config), host services and styles. The step-by-step guide, with the traps hosts have hit, is the agent skill shipped in this package: [`skills/ggraphic-embed/SKILL.md`](./skills/ggraphic-embed/SKILL.md). It is plain Markdown, so it reads as documentation too. pnpm 12 and later link it into the host's `.claude/skills/` only after the host approves it (`pnpm approve`), and until then print "Agent skills awaiting approval: @ggraphic/editor" on every install; the editor works the same either way.

## Entry points

Each source file is its own entry point (a host imports `@ggraphic/editor/utils/snapping`, not a barrel), so a module keeps its identity and a test can mock it by that path. The CSS entries are `@ggraphic/editor/styles` (token defaults and editor rules) and `@ggraphic/editor/styles/tailwind` (for Tailwind v4 hosts).
