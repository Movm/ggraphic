// SPDX-License-Identifier: MPL-2.0
import { useMessages, type Messages } from '../../i18n/messages.js';
import { useCanvasStoreSelector } from '../../stores/CanvasStoreProvider.js';
import { cn } from '../../utils/cn.js';
import React from 'react';

import { HIDDEN_SCROLLBAR } from '../../sidebar/sidebarStyles.js';

import { ContextControls, type ContextControlsProps } from './ContextControls.js';

import { hostElementKind } from '../../utils/elementKinds.js';

import type {
  CoreFloatingModuleType,
  FloatingModuleState,
} from '../../hooks/useFloatingModuleState.js';

const selectionLabels = (t: Messages): Record<CoreFloatingModuleType, string> => ({
  text: t.common.text,
  image: t.common.image,
  'user-image': t.common.image,
  shape: t.topBar.shape,
  icon: t.layers.icon,
  illustration: t.layers.illustration,
  asset: t.layers.graphic,
  background: t.layers.background,
  frame: t.layers.frame,
  chart: t.layers.chart,
  'pill-badge': t.layers.badgePill,
  'circle-badge': t.layers.badgePill,
});

/** The selection's kind for the label: a core module's, or a host kind's name. */
function selectionLabel(t: Messages, type: FloatingModuleState['type']): string {
  const host = hostElementKind(type);
  // Not a host kind: one of the core's modules.
  return host ? host.name() : selectionLabels(t)[type as CoreFloatingModuleType];
}

/**
 * MobileSelectionControls — the "Auswahl" block at the top of the mobile area
 * sheet, shown when the user opens a selection's area via "Mehr". It carries
 * the selection's formatting controls (the desktop ContextToolbar's content);
 * without an open sheet they live in `MobileSelectionBar`. Hidden while an AI
 * suggestion is pending.
 */
export function MobileSelectionControls(props: ContextControlsProps) {
  const t = useMessages();
  const hasPendingAiSuggestion = useCanvasStoreSelector((s) => s.pendingAiSuggestion !== null);
  if (hasPendingAiSuggestion) return null;

  const type = props.activeFloatingModule?.type;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-bold text-[var(--editor-text-muted)]">
        {t.topBar.selection}
        {type ? ` · ${selectionLabel(t, type)}` : ''}
      </span>
      <div
        className={cn(
          'canvas-scroll-fade-x flex items-center gap-1.5 overflow-x-auto -mx-5 px-5 py-1',
          HIDDEN_SCROLLBAR
        )}
      >
        <ContextControls {...props} />
      </div>
    </div>
  );
}
