// SPDX-License-Identifier: MPL-2.0
import { currentFontRole, fontRoleOptions, type Bindings, type FontRole } from '@ggraphic/core';
import { useDocumentBrand } from '@ggraphic/editor/brand/documentBrand';
import { TileCaption, useBarTiles } from '@ggraphic/editor/components/TopBar/barTiles';
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
  const tiles = useBarTiles();
  const options = fontRoleOptions(useDocumentBrand());
  const role = currentFontRole(text, options);
  const family = options.find((o) => o.role === role)?.family ?? primaryFontFamily(text.fontFamily);

  const select = (
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
      className={`${tiles ? 'h-11 -mb-3' : 'h-8 max-canvas-mobile:h-11'} max-w-36 shrink-0 rounded-md border-none bg-transparent px-1 cursor-pointer text-[13px] font-medium text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)]`}
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
  if (!tiles) return select;
  // On the mobile tile bar the select keeps its full 44 px; the caption sits in its empty
  // lower edge and lets taps through. The accessible name stays on the select.
  return (
    <div className="flex flex-col items-center justify-end gap-1 h-14 pb-2 shrink-0">
      {select}
      <TileCaption decorative>{t.topBar.tiles.fontRole}</TileCaption>
    </div>
  );
}
