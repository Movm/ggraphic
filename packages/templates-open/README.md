# @ggraphic/templates-open

The open template pack of ggraphic: the three starter designs of the Studio (`studio-headline`, `studio-quote`, `studio-number`) as template files. Everything in this package is dedicated to the public domain under [CC0 1.0](./LICENSE).

- `OPEN_TEMPLATES` holds the raw parsed JSON of each file. Read every entry through `readTemplateFile` from `@ggraphic/schema`; the format is described in that package's `TEMPLATE_FORMAT.md`.
- `OPEN_TEMPLATE_MANIFEST` lists the assets the pack ships, each with its path, licence, source and author. It is empty: the pack uses no images.
- The templates are generic layouts with no logo of their own and no organisation's colours: they take the colours, fonts and logo of whichever brand they are placed on.

`test/test-brands.json` holds brand colour sets for tests only. It is not part of the published package.
