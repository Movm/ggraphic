// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The text budget of a template element, for the editor's status line
 * (`CanvasEditorServices.slotBudgets`). A page made from a catalogue template
 * carries `templateRef`; its elements keep the template's element ids, which
 * are the keys of the template's `slots`.
 */
import { type SlotBudget } from '@ggraphic/core';

import { catalogTemplate } from './catalog';

/**
 * The budget and role of element `elementId` on a page in state `pageState`, or
 * null for a page that is not from a catalogue template and for an element that
 * is not a slot. The template's current version applies, whatever version the
 * page was made from.
 */
export function budgetFor(
  pageState: Readonly<Record<string, unknown>>,
  elementId: string
): { budget: SlotBudget; role: string } | null {
  const ref = pageState['templateRef'];
  if (typeof ref !== 'object' || ref === null) return null;
  const id = (ref as { id?: unknown }).id;
  if (typeof id !== 'string') return null;
  const slot = catalogTemplate(id)?.template.slots[elementId];
  return slot ? { budget: slot.budget, role: slot.role } : null;
}
