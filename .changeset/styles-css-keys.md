---
'@ggraphic/editor': patch
---

The stylesheet entries get a second export key with the `.css` extension: `styles/compiled.css`, `styles/index.css`, `styles/editor.css`, `styles/tokens.css` and `styles/tailwind.css`. TypeScript 6 rejects a JavaScript side-effect import of a key without the extension (TS2882), because the bundler's `declare module '*.css'` does not match it. Import the `.css` keys from JavaScript; the old keys stay and resolve to the same files.
