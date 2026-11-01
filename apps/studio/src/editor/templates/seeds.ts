// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The page a legacy template id starts with. The designs themselves are template files
 * (`@ggraphic/templates-open`), placed through `@ggraphic/editor/page/seeds`; this only maps an
 * id to its template.
 */
import { type PageSeed } from '@ggraphic/editor/page/pageState';
import { seedFromTemplate, storedPageSeed } from '@ggraphic/editor/page/seeds';

import { catalogTemplate } from './catalog';
import { BLANK_TEMPLATE_ID } from './ids';

/** The ids of the texts an AI draft fills, by draft field. */
export const TEXT_ROLES = {
  headline: 'headline',
  subline: 'subline',
  body: 'body',
  callToAction: 'cta',
} as const;

/** The fresh page of `templateId` on a `width` × `height` sheet; empty for the blank page and unknown ids. */
export function seedFor(templateId: string, width: number, height: number): PageSeed {
  if (templateId === BLANK_TEMPLATE_ID) return {};
  return seedFromTemplate(catalogTemplate(templateId)?.template ?? null, width, height);
}

/** The seed of `templateId` as stored page state (`storedPageSeed`). */
export function seedPageState(
  templateId: string,
  width: number,
  height: number
): Record<string, unknown> {
  return storedPageSeed(seedFor(templateId, width, height));
}
