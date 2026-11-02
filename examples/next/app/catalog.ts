// SPDX-License-Identifier: MPL-2.0
// What a design can start from, read on the server. `@ggraphic/editor/host` and
// `@ggraphic/editor/page` load no React and no editor UI, so a server component can import them;
// the client component `Editor` reads the same file with `loadTemplatePack`.
import { canvasFormats, type CanvasFormat } from '@ggraphic/editor/host';
import { aspectOfSize, templatePackFromJson } from '@ggraphic/editor/page';

import { type NewDesign } from './design';
import templateFiles from './templates.json';

/** The empty page `GgraphicEditor` registers next to the pack's templates. */
export const BLANK = 'ggraphic-blank';

/** Parsed once per server process. */
const pack = templatePackFromJson(templateFiles);
if (pack.problems.length > 0) console.warn('Skipped templates', pack.problems);

export const formatById = (id: string | undefined): CanvasFormat | null =>
  canvasFormats().find((format) => format.id === id) ?? null;

/** The format's aspect, as template files name it (`4:5`). */
export const aspectOf = (format: CanvasFormat) => aspectOfSize(format.width, format.height);

/** The templates that can be placed on `format`, with their English texts. */
export function templatesFor(format: CanvasFormat) {
  const aspect = aspectOf(format);
  return pack.templates
    .filter((template) => template.formats.includes(aspect))
    .map((template) => ({
      id: template.id,
      title: template.title.en,
      description: template.description.en,
    }));
}

/** The new design the start page asked for, or null when the format or the page does not exist. */
export function newDesign(formatId: unknown, configId: unknown): NewDesign | null {
  const format = typeof formatId === 'string' ? formatById(formatId) : null;
  if (!format || typeof configId !== 'string') return null;
  const known =
    configId === BLANK || templatesFor(format).some((template) => template.id === configId);
  return known ? { formatId: format.id, configId } : null;
}
