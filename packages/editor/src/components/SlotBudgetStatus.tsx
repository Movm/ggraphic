// SPDX-License-Identifier: MPL-2.0
import { checkSlotBudget, type BudgetViolation } from '@ggraphic/core';

import { useCanvasEditorServices } from '../CanvasEditorProvider.js';
import { useMessages } from '../i18n/messages.js';
import { useCanvasStoreSelector } from '../stores/CanvasStoreProvider.js';
import { wrapTextAccurate } from '../utils/textUtils.js';

import type { AdditionalText } from '../configs/types.js';

/**
 * Says so when the selected text is over its template slot's budget (words,
 * characters, lines, legible size). Warns only: nothing is clamped or cut while
 * typing. Plain DOM beside the Konva stage, so no export captures it; it takes
 * no focus and no pointer events. Renders nothing without the host's
 * `slotBudgets` service, for an element without a budget, or within budget.
 */
export function SlotBudgetStatus({
  state,
  canvasWidth,
  canvasHeight,
}: {
  state: Readonly<Record<string, unknown>>;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const { slotBudgets } = useCanvasEditorServices();
  const selected = useCanvasStoreSelector((s) => s.selectedElement);
  const t = useMessages();
  if (!slotBudgets || !selected) return null;

  const texts = state['additionalTexts'];
  const text = Array.isArray(texts)
    ? (texts as AdditionalText[]).find((item) => item.id === selected)
    : undefined;
  const found = text ? slotBudgets.budgetFor(state, selected) : null;
  if (!text || !found) return null;

  const lineCount = wrapTextAccurate(
    text.text,
    text.width,
    text.fontSize,
    text.fontFamily,
    text.fontStyle ?? 'normal'
  ).length;
  const violations = checkSlotBudget(
    { text: text.text, fontSize: text.fontSize, canvasHeight, lineCount },
    found.budget
  );
  if (violations.length === 0) return null;

  const message = (v: BudgetViolation): string => t.budget[v.kind](v.actual, v.limit);
  const bottom = text.y + lineCount * text.fontSize * (text.lineHeight ?? 1.2);
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        left: `${(text.x / canvasWidth) * 100}%`,
        top: `${Math.min(bottom / canvasHeight, 0.95) * 100}%`,
        pointerEvents: 'none',
        font: '500 12px/1.3 system-ui, sans-serif',
        padding: '4px 8px',
        borderRadius: 6,
        background: '#fff3cd',
        color: '#4d3a00',
        border: '1px solid #d9b44a',
        maxWidth: '90%',
      }}
    >
      {violations.map(message).join(' · ')}
    </div>
  );
}
