// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Marks an element as editor UI for `@ggraphic/editor/styles/compiled`: its rules apply only to
 * an element with this attribute and to what is inside it. The shell's root carries it, and so
 * does every element the editor portals onto `<body>` (dialogs, menus, popovers, text overlays),
 * because those sit outside the root. A new portal spreads it onto its outermost element
 * (`editorScope.vitest.ts` guards it). Hosts on Tailwind ignore it.
 */
export const EDITOR_SCOPE = { 'data-ggraphic': '' } as const;
