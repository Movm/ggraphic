// SPDX-License-Identifier: MPL-2.0
// The compiled stylesheet's entry has no `.css` extension, so Vite's `*.css` declaration does not
// cover it and TypeScript 6 (`noUncheckedSideEffectImports`) rejects the import without this line.
declare module '@ggraphic/editor/styles/compiled';
