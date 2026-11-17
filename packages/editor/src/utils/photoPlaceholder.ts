// SPDX-License-Identifier: AGPL-3.0-only
import {
  mixColors,
  resolveScheme,
  SCHEME_IDS,
  type BrandPack,
  type SchemeId,
} from '@ggraphic/core';

import { activeBrand } from '../brand/brandRegistry.js';

/** Share of the ink mixed into the ground for the placeholder fill. */
const FILL_INK = 0.12;
/** Icon edge as a share of the shorter side of the frame. */
const ICON_SHARE = 0.18;
const ICON_OPACITY = 0.6;
const FALLBACK_FILL = '#ececec';
const FALLBACK_ICON = '#8a8a8a';

/**
 * Where and in which colours the placeholder of an empty photo slot is drawn,
 * in the local coordinates of the slot's frame. The colours come from the
 * page's colour world (none: `primary`); a brand that yields no world gets grey.
 */
export function photoPlaceholderLook(
  brandScheme: string | null | undefined,
  width: number,
  height: number,
  /** The pack of the document the slot sits in; the active brand by default. */
  brand: BrandPack = activeBrand()
) {
  const id: SchemeId = (SCHEME_IDS as readonly string[]).includes(brandScheme ?? '')
    ? (brandScheme as SchemeId)
    : 'primary';
  const roles = resolveScheme(brand, id)?.roles;
  const size = ICON_SHARE * Math.min(width, height);
  return {
    fill: (roles && mixColors(roles.ground, roles.ink, FILL_INK)) ?? FALLBACK_FILL,
    circleRadius: Math.min(width, height) / 2,
    icon: {
      x: (width - size) / 2,
      y: (height - size) / 2,
      opacity: ICON_OPACITY,
      color: roles?.ink2 ?? FALLBACK_ICON,
      stroke: Math.max(1, size * 0.07),
      // A mountain range and a sun in an icon box of `size` px.
      mountain: [0, 0.9, 0.3, 0.45, 0.5, 0.7, 0.68, 0.5, 1, 0.9].map((v) => v * size),
      sun: { x: 0.74 * size, y: 0.22 * size, r: 0.1 * size },
    },
  };
}
