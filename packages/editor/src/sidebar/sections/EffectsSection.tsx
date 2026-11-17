// SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';

import { effectsFor } from './effects/effectsFor.js';
import { GradientSettings } from './effects/GradientSettings.js';
import { OutlineSettings } from './effects/OutlineSettings.js';
import { ShadowSettings } from './effects/ShadowSettings.js';
import { SIDEBAR_SECTION } from '../sidebarStyles.js';

import type { ShadowPatch } from '../../hooks/useFloatingModuleHandlers.js';
import type { FloatingModuleState } from '../../hooks/useFloatingModuleState.js';
import type { GradientFill } from '../../utils/gradientFill.js';

export interface EffectsSectionProps {
  module: FloatingModuleState | null;
  onGradientChange?: (gradient: GradientFill | null) => void;
  onOutlineChange?: (id: string, patch: { stroke?: string; strokeWidth?: number }) => void;
  onShadowChange?: (id: string, patch: ShadowPatch, type: string) => void;
}

/**
 * „Effekte“: Farbverlauf, Kontur und Schatten der Auswahl, geöffnet über den
 * gleichnamigen Knopf der Kontextleiste. Wie die Ebenen hängt der Editor den
 * Bereich selbst an — er liest die Auswahl aus dem Bericht der Seite, nicht
 * aus `state`/`actions` einer Config-Section.
 */
export function EffectsSection({
  module,
  onGradientChange,
  onOutlineChange,
  onShadowChange,
}: EffectsSectionProps) {
  const available = effectsFor(module);
  const gradient = available.gradient && onGradientChange;
  const outline = available.outline && onOutlineChange;
  const shadow = available.shadow && onShadowChange;

  // Ohne Effekte schließt der Editor den Bereich (`CanvasEditorShell`).
  if (!module || (!gradient && !outline && !shadow)) return null;
  const { data } = module;

  return (
    <div className={SIDEBAR_SECTION}>
      {gradient && (
        <GradientSettings
          currentColor={data.fill ?? '#000000'}
          gradient={data.fillGradient ?? null}
          onChange={onGradientChange}
        />
      )}
      {outline && (
        <OutlineSettings
          stroke={data.stroke}
          strokeWidth={data.strokeWidth}
          onChange={(patch) => onOutlineChange(data.id, patch)}
        />
      )}
      {shadow && (
        <ShadowSettings
          shadowColor={data.shadowColor}
          shadowBlur={data.shadowBlur}
          shadowOffsetX={data.shadowOffsetX}
          shadowOffsetY={data.shadowOffsetY}
          shadowOpacity={data.shadowOpacity}
          onChange={(patch) => onShadowChange(data.id, patch, module.type)}
        />
      )}
    </div>
  );
}
