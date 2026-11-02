// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What a host calls at start-up and augments, without the editor UI or React: the register
 * functions with the format lookups its template registry needs, and the interfaces a host extends
 * with `declare module`. Its module graph holds no component, sidebar, store or primitive
 * (`hostEntry.vitest.ts`) and no React (`dataEntriesNoReact.vitest.ts`), so a host's start-up code,
 * its test setup and a server component can import it without loading the editor. Every name here
 * is also in its domain entry.
 *
 * The React parts a host reads at render time, `useCanvasEditorServices` and the block-insert
 * context, are in the client entry `@ggraphic/editor/host-react`, as light as this one: they create
 * a React context when evaluated, which fails in a server component (#136).
 * `registerKindRenderers` is not here either: it is the drawing side of a kind and loads the canvas
 * (`@ggraphic/editor/kinds`).
 */
export {
  type CanvasEditorHostServices,
  type CanvasEditorServices,
} from '../CanvasEditorProvider.js';
export {
  type BlockInsertApi,
  type BlockTarget,
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
  CANVAS_FORMAT_GROUP_ORDER,
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
export { registerHostMessages, registerMessages } from '../i18n/catalogue.js';
export { type HostMessages } from '../i18n/messages.js';
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
