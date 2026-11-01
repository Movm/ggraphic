// SPDX-License-Identifier: MPL-2.0
/**
 * What a host calls at start-up, reads from its services, and augments, without the editor UI: the
 * register functions with the format lookups its template registry needs, the services hook, the
 * block-insert context and the interfaces a host extends with `declare module`. Its module graph holds no component, sidebar, store or primitive
 * (`hostEntry.vitest.ts` keeps it that way), so a host's start-up code and its test setup can import
 * it without loading the editor. Every name here is also in its domain entry.
 *
 * `registerKindRenderers` is not here: it is the drawing side of a kind and loads the canvas
 * (`@ggraphic/editor/kinds`).
 */
export {
  type CanvasEditorHostServices,
  type CanvasEditorServices,
  useCanvasEditorServices,
} from '../CanvasEditorProvider.js';
export {
  BlockInsertContext,
  type BlockInsertApi,
  type BlockTarget,
  useBlockInsert,
} from '../components/CanvasEditor/blockInsertContext.js';
export { registerElementKind, type ElementKindRegistration } from '../utils/elementKinds.js';
export { type HostElementKinds } from '../utils/canvasItem.js';
export { type HostCanvasActions } from '../hooks/useCanvasElementHandlers.js';
export { type CanvasAiHostTypes } from '../ai/types.js';
export {
  assetMatchesLocale,
  type AssetAudience,
  type CanvasAssetCatalog,
  emojiCodeAssetId,
  getAssetById,
  type IllustrationSources,
  registerAssetCatalog,
  type UniversalAsset,
} from '../utils/canvasAssets.js';
export {
  type CanvasFormat,
  type CanvasFormatGroupDef,
  canvasFormats,
  getCanvasFormat,
  getCanvasFormatOrDefault,
  registerCanvasFormatGroups,
  registerCanvasFormats,
} from '../formats/index.js';
export {
  defineTemplate,
  registerTemplates,
  type TemplateDefinition,
  type TemplateId,
  type TemplatePickerInfo,
} from '../templates/registry.js';
export { registerBrandPacks } from '../brand/brandRegistry.js';
export { type HostMessages, registerHostMessages, registerMessages } from '../i18n/messages.js';
export {
  type EditorToast,
  type EditorToastAction,
  type EditorToastOptions,
  registerToast,
} from '../utils/editorToast.js';
export { type HostStorageKeyName, registerHostStorageKeys } from '../utils/hostStorageKeys.js';
export { type PptxFontMapper, registerPptxFonts } from '../export/pptx/pptxFonts.js';
export {
  type MeasuredCornerReservation,
  type MeasuredCornerReservationHook,
  registerMeasuredCornerReservation,
  type ScreenCorner,
} from '../utils/cornerReservation.js';
