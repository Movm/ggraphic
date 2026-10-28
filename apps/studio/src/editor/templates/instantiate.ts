// SPDX-License-Identifier: AGPL-3.0-only
/** Places a catalogue template on a page of the Studio: the one door from template data to page state. */
import { instantiateTemplatePage, type SchemeId, type TemplateInput } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { TEMPLATE_GEOMETRY } from '@ggraphic/editor/templates/templateGeometry';
import { type TemplateFile, type TemplateFormat } from '@ggraphic/schema';

import { logoSizeOf } from '../../logoSize';
import { formatSize } from '../document';

import { formatAspect, type CatalogEntry } from './catalog';
import { fontFallbackFor } from './typography';

// A parsed template file is what placing takes; if the schema drifts from core's input, this stops compiling.
const _assert: TemplateInput = {} as TemplateFile;
void _assert;

/** `entry` placed on a `width` × `height` sheet of the given aspect; null when it cannot be placed. */
export function placeTemplate(
  entry: CatalogEntry,
  canvas: { width: number; height: number },
  format: TemplateFormat | null,
  schemeId: SchemeId | null = null
): Record<string, unknown> | null {
  if (!format) return null;
  const result = instantiateTemplatePage(entry.template, {
    brand: activeBrand(),
    canvas,
    format,
    geometry: TEMPLATE_GEOMETRY,
    locale: 'en',
    fontFallback: fontFallbackFor,
    schemeId,
    logoSizeOf,
  });
  return result.ok ? result.state : null;
}

/** The fresh page of `entry` on `formatId`, in the active brand; null when the format or the brand does not fit. */
export function templatePageState(
  entry: CatalogEntry,
  formatId: string,
  opts: { schemeId?: SchemeId | null } = {}
): Record<string, unknown> | null {
  return placeTemplate(entry, formatSize(formatId), formatAspect(formatId), opts.schemeId ?? null);
}
