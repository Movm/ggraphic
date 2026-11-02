// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The text budget of a template element, for the editor's status line
 * (`CanvasEditorServices.slotBudgets`) and for fitting. A page made from a catalogue template
 * carries `templateRef`; its elements keep the template's element ids, which
 * are the keys of the template's `slots`.
 */
import { type SlotBudget } from '@ggraphic/core';
import { type TemplateFile } from '@ggraphic/schema';

/** The host's catalogue: the template file of id `id`, or null when it has none of that id. */
export type TemplateLookup = (id: string) => TemplateFile | null;

/** A catalogue with no templates: pages that carry no `templateRef` need nothing more. */
export const noTemplates: TemplateLookup = () => null;

/**
 * The budget and role of element `elementId` on a page in state `pageState`, or
 * null for a page that is not from a template of `templateOf` and for an element that
 * is not a slot. The template's current version applies, whatever version the
 * page was made from.
 */
export function slotBudgetFor(
  pageState: Readonly<Record<string, unknown>>,
  elementId: string,
  templateOf: TemplateLookup
): { budget: SlotBudget; role: string } | null {
  const ref = pageState['templateRef'];
  if (typeof ref !== 'object' || ref === null) return null;
  const id = (ref as { id?: unknown }).id;
  if (typeof id !== 'string') return null;
  const slot = templateOf(id)?.slots[elementId];
  return slot ? { budget: slot.budget, role: slot.role } : null;
}
