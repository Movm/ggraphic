// SPDX-License-Identifier: MPL-2.0
import { duotoneLook, withoutDuotone } from './imageFilters.js';

import type { Bindings } from '@ggraphic/core';

/** The four looks of the top-bar control; each is derived from stored fields, none is stored. */
export const IMAGE_LOOK_IDS = ['none', 'bw', 'duotone', 'darken'] as const;
export type ImageLookId = (typeof IMAGE_LOOK_IDS)[number];

/** Black & white: grayscale with the prototype's `contrast(1.12)` (Task 4 measurement). */
const BW_CONTRAST = 6;
const DARKEN_BRIGHTNESS = -0.3;

export interface LookFields {
  grayscale?: boolean;
  contrast?: number;
  brightness?: number;
  duotoneLow?: string | null;
  duotoneHigh?: string | null;
  bind?: Bindings;
}

/** Duotone if both colours are set, else B/W if grayscale, else Darken at exactly -0.3, else None. */
export function currentImageLook(img: LookFields): ImageLookId {
  if (img.duotoneLow && img.duotoneHigh) return 'duotone';
  if (img.grayscale) return 'bw';
  if (img.brightness === DARKEN_BRIGHTNESS) return 'darken';
  return 'none';
}

/** The fields one choice writes. Duotone takes its colours from the page's world. */
export function imageLookPatch(
  look: ImageLookId,
  img: LookFields,
  brandScheme: string | null | undefined
): Record<string, unknown> {
  switch (look) {
    case 'none':
      return {
        grayscale: false,
        ...(img.contrast === BW_CONTRAST && { contrast: 0 }),
        ...(img.brightness === DARKEN_BRIGHTNESS && { brightness: 0 }),
        ...withoutDuotone(img),
      };
    case 'bw':
      return { grayscale: true, contrast: BW_CONTRAST, ...withoutDuotone(img) };
    case 'duotone':
      return duotoneLook(img, brandScheme) ?? {};
    case 'darken':
      return { brightness: DARKEN_BRIGHTNESS };
  }
}
