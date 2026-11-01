// SPDX-License-Identifier: MPL-2.0
/** Templates and formats: defining and registering templates, template geometry and the render-gate adapter, canvas formats. */
export {
  defineTemplate,
  registerTemplates,
  type TemplateDefinition,
  type TemplateId,
  type TemplatePickerInfo,
  getTemplate,
} from '../templates/registry.js';
export {
  createTemplateGateAdapter,
  illustrationLookup,
  TEMPLATE_GATE_ADAPTER,
  TEMPLATE_GEOMETRY,
} from '../templates/templateGeometry.js';
export {
  type BuiltInCanvasFormatGroup,
  CANVAS_FORMATS,
  type CanvasExportType,
  type CanvasFormat,
  type CanvasFormatCategory,
  type CanvasFormatGroup,
  type CanvasFormatGroupDef,
  canvasFormatGroupLabel,
  canvasFormatGroupOrder,
  type CanvasFormatIconKey,
  canvasFormats,
  type CanvasPrintSpec,
  DEFAULT_FORMAT_ID,
  getCanvasFormat,
  getCanvasFormatOrDefault,
  insertScaleFor,
  isPrintFormat,
  isSlideFormat,
  isUnsupportedFormatId,
  mmToPx,
  type PrintCanvasFormat,
  printGeometry,
  type PrintRect,
  registerCanvasFormatGroups,
  registerCanvasFormats,
  UnsupportedCanvasFormatError,
} from '../formats/index.js';
