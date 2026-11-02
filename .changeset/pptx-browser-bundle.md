---
'@ggraphic/editor': patch
---

webpack hosts can build the embed entry again (#133). `next build --webpack` and other webpack builds stopped with `UnhandledSchemeError: Reading from "node:https"`: pptxgenjs, the writer behind the PPTX export, loads `node:fs` and `node:https` with `import()`, and webpack rejects the `node:` scheme in a browser build even inside a lazy chunk.

- **The fix:** the package now ships a browser build of pptxgenjs 4.0.1 in `dist/vendor/pptxgen.js`, with JSZip and its dependencies. The PPTX export loads it through the package's `imports` map (`#pptxgenjs`), still lazily, and it loads no `node:` module. The licence texts of every bundled package are in `dist/vendor/pptxgen.LICENSES.txt`; JSZip is used under MIT.
- **Dependencies:** pptxgenjs is no longer a dependency of `@ggraphic/editor`, so hosts no longer install it.
- **Unchanged:** the export itself. Turbopack and Vite hosts were not affected.
