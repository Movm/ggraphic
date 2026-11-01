// SPDX-License-Identifier: MPL-2.0
/** Host services: the service types `CanvasEditorProvider` takes, their browser defaults, toasts and storage keys. */
export {
  type CanvasEditorServices,
  type CanvasEditorHostServices,
  type CanvasSlotBudgetService,
} from '../CanvasEditorProvider.js';
export {
  browserFileDelivery,
  type CanvasCarouselService,
  type CanvasFeedbackService,
  type CanvasImageUrlService,
  type CanvasImpressumParts,
  type CanvasImpressumService,
  type CanvasMediaItem,
  type CanvasMediaLibraryService,
  type CanvasMediaUploadResult,
  type CanvasMediaUploadState,
  type CanvasPrintService,
  plainImageUrls,
} from '../hostServices.js';
export {
  type EditorToast,
  type EditorToastOptions,
  registerToast,
  type EditorToastAction,
} from '../utils/editorToast.js';
export { registerHostStorageKeys, type HostStorageKeyName } from '../utils/hostStorageKeys.js';
