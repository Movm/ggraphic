# @ggraphic/templates-open

> **Alpha, untested.** Early work in progress: the API and the document format can change without notice. See the [repository README](../../README.md#ggraphic).

The open template pack of ggraphic: the Studio's 79 templates as template files: the three starter designs (`studio-headline`, `studio-quote`, `studio-number`) and the template families (dates, quotes, numbers, calls to action and more). Everything in this package is dedicated to the public domain under [CC0 1.0](./LICENSE).

- `OPEN_TEMPLATES` holds the raw parsed JSON of each file. Read every entry through `readTemplateFile` from `@ggraphic/schema`; the format is described in that package's `TEMPLATE_FORMAT.md`.
- `OPEN_TEMPLATE_MANIFEST` lists the assets the templates use, each with its path, licence, source and author. It is empty: no template carries an image of its own.
- `SAMPLE_PHOTOS` are 24 CC0 photos made for ggraphic (listed with source and author in `src/samples/samples.json`). They fill empty photo slots in previews and render-gate goldens only; they are never stored in a document or exported.
- The templates are generic layouts with no logo of their own and no organisation's colours: they take the colours, fonts and logo of whichever brand they are placed on.

`test/test-brands.json` holds brand colour sets for tests only. It is not part of the published package.
