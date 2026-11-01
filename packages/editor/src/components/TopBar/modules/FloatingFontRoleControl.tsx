// SPDX-License-Identifier: MPL-2.0
import { currentFontRole, fontRoleOptions, type Bindings, type FontRole } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { primaryFontFamily } from '@ggraphic/editor/utils/fontMarkSupport';
import { requestFontFace } from '@ggraphic/editor/utils/textUtils';
import React from 'react';

/** Value of the entry that stands for a family no role has. */
const CUSTOM = '';

const stackOf = (family: string) => `"${family}", sans-serif`;

interface FloatingFontRoleControlProps {
  text: { fontFamily: string; bind?: Bindings };
  onChange: (role: FontRole) => void;
}

/**
 * The font of a free text, picked by role (Headline, Text, Condensed, Accent) and never by name:
 * only the brand's own fonts are offered, and a text picked this way stays bound to its role, so
 * a brand change takes it along. Each role is shown in its own font. A native select: keyboard
 * and screen reader for free (Safari draws the entries in the system font).
 */
export function FloatingFontRoleControl({ text, onChange }: FloatingFontRoleControlProps) {
  const t = useMessages();
  const options = fontRoleOptions(activeBrand());
  const role = currentFontRole(text, options);
  const family = options.find((o) => o.role === role)?.family ?? primaryFontFamily(text.fontFamily);

  return (
    <select
      aria-label={t.topBar.fontRole}
      title={t.topBar.fontRole}
      value={role ?? CUSTOM}
      onChange={(e) => {
        const picked = options.find((o) => o.role === e.target.value);
        if (!picked) return;
        // The face starts loading before the text is switched to it, not on the first draw.
        requestFontFace(picked.family);
        onChange(picked.role);
      }}
      style={{ fontFamily: stackOf(family) }}
      className="h-8 max-canvas-mobile:h-11 max-w-36 shrink-0 rounded-md border-none bg-transparent px-1 cursor-pointer text-[13px] font-medium text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)]"
    >
      {role === null && (
        <option value={CUSTOM} disabled>
          {t.topBar.fontRoleCustom(family)}
        </option>
      )}
      {options.map((o) => (
        <option key={o.role} value={o.role} style={{ fontFamily: stackOf(o.family) }}>
          {t.topBar.fontRoles[o.role]}
        </option>
      ))}
    </select>
  );
}
