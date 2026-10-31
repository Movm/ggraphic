// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Text sizes fitted to the brand's fonts, up to the prototype's size (`maxFontSize`). The fit
 * itself is the gate adapter's (`TEMPLATE_GATE_ADAPTER.fitText`, the width tables the gate
 * measures with); this adds what a page knows beyond the element: the line limit of its
 * template slot and the room down to the element below it.
 */
import { roomBelow } from '@ggraphic/core';
import { TEMPLATE_GATE_ADAPTER } from '@ggraphic/editor/templates/templateGeometry';

import { budgetFor } from './slotBudgets';

/**
 * The size a text with a numeric `maxFontSize` fits at on `page` (a page of a template takes its
 * line limit from the slot of that name); null for a text without one, or one that cannot be fitted.
 */
export function fittedFontSize(
  el: Readonly<Record<string, unknown>>,
  page: Readonly<Record<string, unknown>>,
  canvasHeight: number
): number | null {
  if (typeof el['maxFontSize'] !== 'number') return null;
  const maxLines = budgetFor(page, String(el['id']))?.budget.maxLines;
  const maxHeight = roomBelow(page, 'additionalTexts', el, (k, e) =>
    TEMPLATE_GATE_ADAPTER.box(k, e, 1)
  );
  const fit = TEMPLATE_GATE_ADAPTER.fitText?.(el, {
    ...(maxLines === undefined ? {} : { maxLines }),
    ...(maxHeight === undefined ? {} : { maxHeight }),
    canvasHeight,
  });
  return fit ? fit.fontSize : null;
}
