// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the AI may choose from when a prompt becomes a design: the Studio's
 * catalogue templates of the format with the texts each one can take, and the
 * colour worlds of the active brand.
 */
import { deriveSchemes, type BrandPack } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { templateElementIds, type TemplateSlotRole } from '@ggraphic/schema';

import { type PickBody } from '../api/client';
import { templatesFor } from '../editor/templates/catalog';

type Slot = PickBody['templates'][number]['slots'][number];

const MAX_TEMPLATES = 12;
const MAX_SLOTS = 8;

/** What the AI is told a slot holds when the template gives it no label of its own. */
const ROLE_LABELS: Record<Exclude<TemplateSlotRole, 'photo'>, string> = {
  headline: 'Headline',
  subline: 'Subline',
  body: 'Body text',
  cta: 'Call to action',
  quote: 'The quotation',
  name: 'Who said it',
  number: 'The figure, e.g. 73%',
  date: 'Date',
  place: 'Place',
};

const capitalised = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** Offered per call: what `formatId` and the organisation's brand can actually place. */
export function pickOffers(
  formatId: string,
  brand: BrandPack = activeBrand()
): Pick<PickBody, 'templates' | 'schemes'> {
  const templates = templatesFor(formatId, brand)
    .flatMap((entry) => {
      const ids = entry.template.pages[0] ? templateElementIds(entry.template.pages[0].state) : [];
      const slots = ids
        .flatMap((id): Slot[] => {
          const slot = entry.template.slots[id];
          const maxChars = slot?.budget.maxChars;
          if (!slot || slot.role === 'photo' || maxChars === undefined) return [];
          return [{ id, label: slot.label?.en ?? ROLE_LABELS[slot.role], maxChars }];
        })
        .slice(0, MAX_SLOTS);
      return slots.length > 0
        ? [{ id: entry.id, label: entry.title, description: entry.description, slots }]
        : [];
    })
    .slice(0, MAX_TEMPLATES);
  const schemes = deriveSchemes(brand).map((s) => ({ id: s.id, label: capitalised(s.id) }));
  return { templates, schemes };
}
