// SPDX-License-Identifier: MPL-2.0
export { useElementSnapping } from './useElementSnapping.js';
export type { UseElementSnappingResult } from './useElementSnapping.js';
export { useCanvasUndoRedo } from './useCanvasUndoRedo.js';

export { useCanvasInteractions } from './useCanvasInteractions.js';
export type {
  UseCanvasInteractionsOptions,
  UseCanvasInteractionsResult,
} from './useCanvasInteractions.js';

export { useCanvasStoreReset } from './useCanvasStoreReset.js';

export { useCanvasHistorySetup } from './useCanvasHistorySetup.js';
export type { UseCanvasHistorySetupResult } from './useCanvasHistorySetup.js';

export { useImageCoverFit } from './useImageCoverFit.js';
export type { CoverFitDimensions } from './useImageCoverFit.js';

export { useFloatingModuleState } from './useFloatingModuleState.js';
export type {
  FloatingModuleState,
  UseFloatingModuleStateOptions,
} from './useFloatingModuleState.js';

export { useFloatingModuleHandlers } from './useFloatingModuleHandlers.js';
export type {
  UseFloatingModuleHandlersOptions,
  UseFloatingModuleHandlersResult,
} from './useFloatingModuleHandlers.js';

export { useCanvasElementHandlers } from './useCanvasElementHandlers.js';
export type {
  UseCanvasElementHandlersOptions,
  UseCanvasElementHandlersResult,
} from './useCanvasElementHandlers.js';

export { useCanvasKeyboardHandlers } from './useCanvasKeyboardHandlers.js';
export type { UseCanvasKeyboardHandlersOptions } from './useCanvasKeyboardHandlers.js';

export { useFontGeneration } from './useFontGeneration.js';
export { useFontLoader } from './useFontLoader.js';
export type { UseFontLoaderOptions, UseFontLoaderResult } from './useFontLoader.js';

export { usePaginatedIcons } from './usePaginatedIcons.js';

export { useMultiPageExport } from './useMultiPageExport.js';
export type {
  UseMultiPageExportProps,
  UseMultiPageExportReturn,
  ExportProgress,
} from './useMultiPageExport.js';

export { usePageManager, parseInitialPages, readInitialDocument } from './usePageManager.js';
export { useDeckAutoSave, SHARE_ORIGINAL_IMAGE_SRC } from './useDeckAutoSave.js';
export type {
  InitialPageDef,
  UsePageManagerOptions,
  UsePageManagerReturn,
} from './usePageManager.js';

export { usePageThumbnails } from './usePageThumbnails.js';

export { useMobileSheet } from './useMobileSheet.js';
