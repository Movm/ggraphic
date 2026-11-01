// SPDX-License-Identifier: MPL-2.0
/** Places a template on a page: the one door from template data to page state. */
import {
  instantiateTemplatePage,
  type BrandPack,
  type SchemeId,
  type TemplateInput,
} from '@ggraphic/core';
import { activeBrand } from '../brand/brandRegistry.js';
import { TEMPLATE_GATE_ADAPTER, TEMPLATE_GEOMETRY } from '../templates/templateGeometry.js';
import { type TemplateFile, type TemplateFormat } from '@ggraphic/schema';

import { HUG_ADAPTER } from './hug.js';
import { logoSizeOf } from './logoSize.js';
import { fontFallbackFor } from './typography.js';

// A parsed template file is what placing takes; if the schema drifts from core's input, this stops compiling.
const _assert: TemplateInput = {} as TemplateFile;
void _assert;

/** `template` placed on a `width` × `height` sheet of the given aspect; null when it cannot be placed. */
export function placeTemplate(
  template: TemplateFile,
  canvas: { width: number; height: number },
  format: TemplateFormat | null,
  schemeId: SchemeId | null = null,
  brand: BrandPack = activeBrand()
): Record<string, unknown> | null {
  if (!format) return null;
  const result = instantiateTemplatePage(template, {
    brand,
    canvas,
    format,
    geometry: TEMPLATE_GEOMETRY,
    locale: 'en',
    fontFallback: fontFallbackFor,
    fitText: TEMPLATE_GATE_ADAPTER.fitText,
    boxOf: (key, el) => TEMPLATE_GATE_ADAPTER.box(key, el, 1),
    hug: HUG_ADAPTER,
    schemeId,
    logoSizeOf,
  });
  return result.ok ? result.state : null;
}
