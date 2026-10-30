// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { studioCatalog } from './catalog';
import { budgetFor } from './slotBudgets';

const withSlots = () =>
  studioCatalog().entries.find(
    (e) => e.kind === 'template' && Object.keys(e.template.slots).length > 0
  );

describe('budgetFor', () => {
  it('returns the slot budget and role for an element of a catalogue template page', () => {
    const entry = withSlots()!;
    expect(entry).toBeDefined();
    const [elementId, slot] = Object.entries(entry.template.slots)[0]!;
    const got = budgetFor({ templateRef: { id: entry.id, version: 0 } }, elementId);
    expect(got).toEqual({ budget: slot.budget, role: slot.role });
  });

  it('returns null for a page without templateRef', () => {
    expect(budgetFor({}, 'headline')).toBeNull();
  });

  it('returns null for a templateRef that is not in the catalogue', () => {
    expect(budgetFor({ templateRef: { id: 'no-such', version: 1 } }, 'headline')).toBeNull();
  });

  it('returns null for an element id that is not a slot', () => {
    const entry = withSlots()!;
    expect(budgetFor({ templateRef: { id: entry.id, version: 1 } }, 'not-a-slot')).toBeNull();
  });
});
