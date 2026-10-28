// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The page a legacy template id starts with. The designs themselves are template files
 * (`@ggraphic/templates-open`), placed through `instantiate.ts`; this only maps an id and a
 * sheet size to the placed page.
 */
import { type TemplateFormat } from '@ggraphic/schema';

import { catalogTemplate } from './catalog';
import { BLANK_TEMPLATE_ID } from './ids';
import { placeTemplate } from './instantiate';
import { type PageSeed } from './pageState';

/** The ids of the texts an AI draft fills, by draft field. */
export const TEXT_ROLES = {
  headline: 'headline',
  subline: 'subline',
  body: 'body',
  callToAction: 'cta',
} as const;

const ASPECTS: readonly { format: TemplateFormat; ratio: number }[] = [
  { format: '1:1', ratio: 1 },
  { format: '4:5', ratio: 4 / 5 },
  { format: '16:9', ratio: 16 / 9 },
];

/** The declared aspect closest to the sheet's. */
function aspectOfSize(width: number, height: number): TemplateFormat {
  const ratio = width / height;
  return ASPECTS.reduce((best, a) =>
    Math.abs(a.ratio - ratio) < Math.abs(best.ratio - ratio) ? a : best
  ).format;
}

/** The fresh page of `templateId` on a `width` × `height` sheet; empty for the blank page and unknown ids. */
export function seedFor(templateId: string, width: number, height: number): PageSeed {
  if (templateId === BLANK_TEMPLATE_ID) return {};
  const entry = catalogTemplate(templateId);
  if (!entry) return {};
  return (placeTemplate(entry, { width, height }, aspectOfSize(width, height)) ?? {}) as PageSeed;
}

/**
 * The seed as stored page state. A page the editor opens with (`initialPages`)
 * goes into the pages document as given, and the editor writes back only what
 * changes later: a document must therefore start with the seed spelled out,
 * or the AI draft and the autosave would see an empty page.
 */
export function seedPageState(
  templateId: string,
  width: number,
  height: number
): Record<string, unknown> {
  const seed = seedFor(templateId, width, height);
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
