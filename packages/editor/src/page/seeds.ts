// SPDX-License-Identifier: MPL-2.0
/** What a fresh page starts with: a template placed on the sheet, and that seed as stored state. */
import { type TemplateFile, type TemplateFormat } from '@ggraphic/schema';

import { placeTemplate } from './instantiate.js';
import { type PageSeed } from './pageState.js';

const ASPECTS: readonly { format: TemplateFormat; ratio: number }[] = [
  { format: '1:1', ratio: 1 },
  { format: '4:5', ratio: 4 / 5 },
  { format: '16:9', ratio: 16 / 9 },
];

/** The declared aspect closest to the sheet's. */
export function aspectOfSize(width: number, height: number): TemplateFormat {
  const ratio = width / height;
  return ASPECTS.reduce((best, a) =>
    Math.abs(a.ratio - ratio) < Math.abs(best.ratio - ratio) ? a : best
  ).format;
}

/** The fresh page of `template` on a `width` × `height` sheet; empty without a template. */
export function seedFromTemplate(
  template: TemplateFile | null,
  width: number,
  height: number
): PageSeed {
  if (!template) return {};
  // The nearest aspect is picked from all three, not from the template's: say so here instead of
  // leaving it to the placer, so a template never lands on a sheet it did not declare.
  const aspect = aspectOfSize(width, height);
  if (!template.formats.includes(aspect)) return {};
  return (placeTemplate(template, { width, height }, aspect) ?? {}) as PageSeed;
}

/**
 * The seed as stored page state. A page the editor opens with (`initialPages`)
 * goes into the pages document as given, and the editor writes back only what
 * changes later: a document must therefore start with the seed spelled out,
 * or the AI draft and the autosave would see an empty page.
 */
export function storedPageSeed(seed: PageSeed): Record<string, unknown> {
  const shapes = seed.shapeInstances ?? [];
  const texts = seed.additionalTexts ?? [];
  const images = seed.userImageInstances ?? [];
  return {
    ...(seed as Record<string, unknown>),
    shapeInstances: shapes,
    ...(images.length ? { userImageInstances: images } : {}),
    additionalTexts: texts,
    layerOrder: [...shapes, ...images, ...texts].map((e) => e.id),
  };
}
