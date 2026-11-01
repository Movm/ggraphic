---
'@ggraphic/editor': minor
---

Public entry points. Each is a facade that re-exports a curated list of names:

- `@ggraphic/editor` (the same as `./embed`), `./embed`, `./page`, `./config`, `./shell`, `./canvas`, `./kinds`, `./store`, `./services`, `./brand`, `./templates`, `./elements`, `./text`, `./sidebar`, `./collab`, `./ai`, `./export`, `./i18n`;
- `./illustrations/<set>` for each of the seven illustration sets.

`./kinds` carries what a custom element kind needs, with a documented example. `./text` adds the generic text fitting (`wrapWords`, `balancedWrap`, `largestSizeWordsFit`).

`@ggraphic/editor/internal/*` reaches any compiled module, with no semver promise.

Deprecated: the deep paths (`@ggraphic/editor/utils/…`, `…/components/…` and the rest). They keep working in this alpha and are removed in the next one; move to the entries above, or to `internal/*` where an entry has no home for a name yet.
