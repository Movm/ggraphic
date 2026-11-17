// SPDX-License-Identifier: AGPL-3.0-only
'use client';
// A client boundary: a React Server Component that imports this entry (or the package root, its
// alias) gets a client reference instead of evaluating the editor, whose modules call
// `createContext` at load time, which the server build of React does not have.
/** The editor in one component: `<GgraphicEditor>`, its props and the document it stores. The package root is an alias of this entry. */
export {
  BLANK_PAGE_ID,
  type CanvasEditorExportApi,
  GgraphicEditor,
  type GgraphicDocument,
  type GgraphicEditorProps,
  loadTemplatePack,
  templatePackFromJson,
  type TemplatePack,
} from '../embed/index.js';
