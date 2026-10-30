// SPDX-License-Identifier: MPL-2.0
import { useMessages } from '@ggraphic/editor/i18n/messages';
import {
  currentImageLook,
  IMAGE_LOOK_IDS,
  type ImageLookId,
  type LookFields,
} from '@ggraphic/editor/utils/imageLook';
import React from 'react';

interface FloatingImageLookControlProps {
  image: LookFields;
  onChange: (look: ImageLookId) => void;
}

/** Look of the selected image: None, Black & white, Duotone, Darken. A native select: keyboard and screen reader for free. */
export function FloatingImageLookControl({ image, onChange }: FloatingImageLookControlProps) {
  const t = useMessages();
  const labels: Record<ImageLookId, string> = {
    none: t.topBar.imageLookNone,
    bw: t.topBar.imageLookBw,
    duotone: t.topBar.imageLookDuotone,
    darken: t.topBar.imageLookDarken,
  };
  return (
    <select
      aria-label={t.topBar.imageLook}
      title={t.topBar.imageLook}
      value={currentImageLook(image)}
      onChange={(e) => onChange(e.target.value as ImageLookId)}
      className="h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border-none bg-transparent px-1 cursor-pointer text-[13px] font-medium text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)]"
    >
      {IMAGE_LOOK_IDS.map((id) => (
        <option key={id} value={id}>
          {labels[id]}
        </option>
      ))}
    </select>
  );
}
