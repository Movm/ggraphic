// SPDX-License-Identifier: MPL-2.0
/** The editor shell: `CanvasEditorShell`, its provider, the shell extension points, layout, skeleton, page preview and announcements. */
export { CanvasEditorShell } from '../components/CanvasEditor/CanvasEditorShell.js';
export {
  type CanvasEditorExportApi,
  type CanvasEditorHostChrome,
  type CanvasEditorProps,
  type PageWrapperProps,
} from '../components/CanvasEditor/types.js';
export {
  type CanvasAiEditBridge,
  CanvasEditorProvider,
  type CanvasSpecEditBridge,
  type ChatSectionContentProps,
  useCanvasEditorServices,
} from '../CanvasEditorProvider.js';
export {
  type EditorPagePickerProps,
  type EditorShellProviderProps,
  type EditorTabSectionProps,
  registerEditorShell,
  type EditorPagePicker,
  type EditorTabDefinition,
  type EditorAddPage,
  type EditorShellExtensions,
  type EditorTabDropHandle,
} from '../components/CanvasEditor/editorShell.js';
export {
  type BlockInsertApi,
  BlockInsertContext,
  type BlockTarget,
  useBlockInsert,
} from '../components/CanvasEditor/blockInsertContext.js';
export { EDITOR_KEY_SHIELD_ATTRIBUTE } from '../components/CanvasEditor/hooks/usePageUndoRedoShortcuts.js';
export { CanvasEditorSkeleton } from '../components/CanvasEditorSkeleton.js';
export { PagePreview, type PagePreviewProps } from '../components/PagePreview.js';
export {
  CanvasEditorLayout,
  type CanvasEditorLayoutProps,
  SIDEBAR_FONT_SIZES,
} from '../layouts/index.js';
export { useAnnounce } from '../hooks/useAnnounce.js';
export { useIsCanvasMobile } from '../hooks/useIsCanvasMobile.js';
export { type InitialPageDef, readInitialDocument } from '../hooks/usePageManager.js';
