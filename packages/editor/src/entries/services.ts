// SPDX-License-Identifier: MPL-2.0
/** Host services: the service types `CanvasEditorProvider` takes, their browser defaults, toasts, storage keys and screen-corner reservations. */
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
  type CanvasImprintParts,
  type CanvasImprintService,
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
export {
  type MeasuredCornerReservation,
  type MeasuredCornerReservationHook,
  registerMeasuredCornerReservation,
  type ScreenCorner,
} from '../utils/cornerReservation.js';
