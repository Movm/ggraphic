// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the AI may choose from when a prompt becomes a design: the Studio's
 * templates (minus the blank page) with the texts each one can take, and the
 * colour worlds of the active brand. Built from the template registry, so an
 * offered id is always one the seeds carry.
 */
import { deriveSchemes, type BrandPack } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';

import { type PickBody } from '../api/client';
import { templatesFor } from '../editor/templates/catalog';
import {
  HEADLINE_TEMPLATE_ID,
  NUMBER_TEMPLATE_ID,
  QUOTE_TEMPLATE_ID,
} from '../editor/templates/ids';
import { seedFor } from '../editor/templates/seeds';

type Slot = PickBody['templates'][number]['slots'][number];

/**
 * The texts of each template the AI writes, by seed text id. A seed text not listed
 * here (the quotation mark) is decoration and stays as it is.
 */
const SLOTS: Partial<Record<string, Record<string, Slot>>> = {
  [HEADLINE_TEMPLATE_ID]: {
    headline: { id: 'headline', label: 'Headline', maxChars: 60 },
    subline: { id: 'subline', label: 'Subline', maxChars: 100 },
    body: { id: 'body', label: 'Body text', maxChars: 200 },
    cta: { id: 'cta', label: 'Call to action', maxChars: 30 },
  },
  [QUOTE_TEMPLATE_ID]: {
    headline: { id: 'headline', label: 'The quotation', maxChars: 160 },
    subline: { id: 'subline', label: 'Who said it', maxChars: 50 },
  },
  [NUMBER_TEMPLATE_ID]: {
    number: { id: 'number', label: 'The figure, e.g. 73%', maxChars: 8 },
    headline: { id: 'headline', label: 'What the figure means', maxChars: 80 },
    subline: { id: 'subline', label: 'Source or context', maxChars: 80 },
  },
};

const capitalised = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** Offered per call: what `formatId` and the organisation's brand can actually place. */
export function pickOffers(
  formatId: string,
  brand: BrandPack = activeBrand()
): Pick<PickBody, 'templates' | 'schemes'> {
  const templates = templatesFor(formatId, brand).flatMap((entry) => {
    const slots = (seedFor(entry.id, 1080, 1080).additionalTexts ?? []).flatMap((text) => {
      const slot = SLOTS[entry.id]?.[text.id];
      return slot ? [slot] : [];
    });
    return [{ id: entry.id, label: entry.title, description: entry.description, slots }];
  });
  const schemes = deriveSchemes(brand).map((s) => ({ id: s.id, label: capitalised(s.id) }));
  return { templates, schemes };
}
