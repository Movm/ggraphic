// SPDX-License-Identifier: AGPL-3.0-only
/** Canvas AI: applying operations, describing the canvas to a model, the illustration capability and the capability types. */
export {
  applyOperation,
  type ApplyResult,
  CANVAS_AI_GEOMETRY_FIELDS,
  type CanvasAiActionsBase,
} from '../ai/applyOperation.js';
export { aiLabelFormat, describeCanvasElements } from '../ai/describeCanvasElements.js';
export { buildIllustrationCapability } from '../ai/illustrationCapability.js';
export {
  type CanvasAiApplyOverride,
  type CanvasAiApplyOverrides,
  type CanvasAiHostTypes,
  type CanvasAiNamedOption,
  type HostCanvasAiCapabilities,
  type HostCanvasAiOperation,
  type HostCanvasAiSnapshot,
  type TemplateAiCapabilities,
} from '../ai/types.js';
