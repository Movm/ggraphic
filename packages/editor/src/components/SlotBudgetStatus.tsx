// SPDX-License-Identifier: MPL-2.0
import { useEffect, useRef } from 'react';

import { checkSlotBudget, type BudgetViolation } from '@ggraphic/core';

import { useCanvasEditorServices } from '../CanvasEditorProvider.js';
import { useAnnounce } from '../hooks/useAnnounce.js';
import { useMessages } from '../i18n/messages.js';
import { useCanvasStoreSelector } from '../stores/CanvasStoreProvider.js';
import { wrapTextAccurate } from '../utils/textUtils.js';

import type { AdditionalText } from '../configs/types.js';

/**
 * Shows a chip (not a live region; changes in the violated kinds are announced through the editor's own) when the selected text is over its template slot's budget (words,
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
  const announce = useAnnounce();
  const t = useMessages();

  const texts = state['additionalTexts'];
  const text =
    slotBudgets && selected && Array.isArray(texts)
      ? (texts as AdditionalText[]).find((item) => item.id === selected)
      : undefined;
  const found = text && selected ? slotBudgets?.budgetFor(state, selected) : null;

  let lineCount = 0;
  let violations: BudgetViolation[] = [];
  if (text && found) {
    lineCount = wrapTextAccurate(
      text.text,
      text.width,
      text.fontSize,
      text.fontFamily,
      text.fontStyle ?? 'normal',
      text.fontWeight ?? null,
      text.letterSpacing ?? null
    ).length;
    violations = checkSlotBudget(
      { text: text.text, fontSize: text.fontSize, canvasHeight, lineCount },
      found.budget
    );
  }

  const message = violations.map((v) => t.budget[v.kind](v.actual, v.limit)).join(' · ');
  // The editor's one live region speaks when the set of violated kinds changes
  // (none -> words, words -> words + size), not when a count changes while typing.
  const kinds = `${selected ?? ''}:${violations.map((v) => v.kind).join(',')}`;
  const lastKinds = useRef(kinds);
  const lastMessage = useRef(message);
  lastMessage.current = message;
  useEffect(() => {
    if (lastKinds.current === kinds) return;
    lastKinds.current = kinds;
    if (lastMessage.current) announce(lastMessage.current);
  }, [kinds, announce]);

  if (!text || violations.length === 0) return null;

  // 1.2 is the default line height of the text renderer (CanvasRichText).
  const bottom = text.y + lineCount * text.fontSize * (text.lineHeight ?? 1.2);
  return (
    <div
      style={{
        position: 'absolute',
        left: `${(text.x / canvasWidth) * 100}%`,
        top: `${Math.min(bottom / canvasHeight, 0.95) * 100}%`,
        pointerEvents: 'none',
        font: '500 12px/1.3 system-ui, sans-serif',
        padding: '4px 8px',
        borderRadius: 6,
        background: 'var(--editor-danger-bg)',
        color: 'var(--editor-danger-fg)',
        border: '1px solid var(--editor-danger-fg)',
        maxWidth: '90%',
      }}
    >
      {message}
    </div>
  );
}
