// SPDX-License-Identifier: MPL-2.0
import { type TemplateFile } from '@ggraphic/schema';
import { describe, expect, it } from 'vitest';

import { noTemplates, slotBudgetFor, type TemplateLookup } from './slotBudgets.js';

const headline = { role: 'headline', budget: { maxChars: 40, maxLines: 2 } };
const template = { id: 'tpl', slots: { headline } } as unknown as TemplateFile;
const templateOf: TemplateLookup = (id) => (id === 'tpl' ? template : null);

describe('slotBudgetFor', () => {
  it('returns the slot budget and role for an element of a template page', () => {
    const got = slotBudgetFor({ templateRef: { id: 'tpl', version: 0 } }, 'headline', templateOf);
    expect(got).toEqual({ budget: headline.budget, role: 'headline' });
  });

  it('returns null for a page without templateRef', () => {
    expect(slotBudgetFor({}, 'headline', templateOf)).toBeNull();
  });

  it('returns null for a templateRef that is not in the catalogue', () => {
    const page = { templateRef: { id: 'no-such', version: 1 } };
    expect(slotBudgetFor(page, 'headline', templateOf)).toBeNull();
    expect(
      slotBudgetFor({ templateRef: { id: 'tpl', version: 1 } }, 'headline', noTemplates)
    ).toBeNull();
  });

  it('returns null for an element id that is not a slot', () => {
    const page = { templateRef: { id: 'tpl', version: 1 } };
    expect(slotBudgetFor(page, 'not-a-slot', templateOf)).toBeNull();
  });
});
