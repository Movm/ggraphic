// SPDX-License-Identifier: AGPL-3.0-only
/** Collaboration over Yjs: canvas and pages bindings, selection awareness and the page-doc helpers. */
export { useYjsCanvasBinding } from '../collab/useYjsCanvasBinding.js';
export { useYjsPages, type YjsPagesApi, type YjsPageView } from '../collab/useYjsPages.js';
export { bindCanvasStoreToYMap, type CanvasBinding } from '../collab/yjsBinding.js';
export { useSelectionAwareness } from '../collab/useSelectionAwareness.js';
export {
  readPages,
  type ReplaceDeckOps,
  updatePageStateById,
  serializeDeck,
  replaceDeck,
  seedPagesIfEmpty,
  appendPage,
  insertPageAt,
  removePageById,
  movePageById,
  duplicatePageById,
  setPageConfigById,
  type PageDef,
  type PageView,
  type SerializedPage,
} from '../collab/pagesDoc.js';
