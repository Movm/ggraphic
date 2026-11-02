// SPDX-License-Identifier: MPL-2.0
'use client';
/**
 * The React parts of `@ggraphic/editor/host`: the services hook and the block-insert context a host
 * reads at render time. They create a React context when evaluated, so they are not in `host`,
 * which a server component may import (#136); this entry is a client boundary instead. Its module
 * graph is as small as `host`'s (`hostEntry.vitest.ts`): no component, store, Konva or shell.
 * Every name here is also in `@ggraphic/editor/shell`.
 */
export { useCanvasEditorServices } from '../CanvasEditorProvider.js';
export {
  BlockInsertContext,
  useBlockInsert,
} from '../components/CanvasEditor/blockInsertContext.js';
