// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The native side: what runs in the React Native app. Nothing here loads the editor; the editor
 * runs in an Expo DOM component, which answers the commands with the events of `./bridge`.
 */
export {
  isGgraphicDocument,
  parseEditorCommand,
  parseEditorEvent,
  pngBase64,
  type EditorCommand,
  type EditorCommandBody,
  type EditorEvent,
  type EditorResult,
  type GgraphicDocument,
} from './bridge.js';
export { createEditorClient, type EditorClient, type EditorClientOptions } from './client.js';
export { useGgraphicEditor, type GgraphicEditorBridge } from './useGgraphicEditor.js';
