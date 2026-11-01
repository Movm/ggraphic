# @ggraphic/core

> **Alpha, untested.** Early work in progress: the API and the document format can change without notice. See the [repository README](../../README.md#ggraphic).

The brand-neutral core of the ggraphic design editor. Licensed under the [Mozilla Public License 2.0](./LICENSE). Code moves in only once it passes the boundary check.

So far it holds `BrandPack`, a brand as data (colours, grounds, fonts, marks), and `brandDefault`, the neutral pack.

It also holds the data shape of every canvas element as it stands in a page's state (`src/model/`: `AdditionalText`, `ShapeInstance`, `UserImageInstance`, `IconState` and the rest). That is types and two constants and nothing else, so a server can build, read and change pages in plain Node; `src/model/nodeSafe.vitest.ts` keeps the package free of imports from outside itself. The shapes are stored in documents: add fields, never rename them.
