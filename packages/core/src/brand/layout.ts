// SPDX-License-Identifier: MPL-2.0
import { type BrandPack } from './brandPack.js';
import { type Box } from './logoFit.js';

export const LOGO_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export type LogoCorner = (typeof LOGO_CORNERS)[number];

/** The grid a template places its content and the logo on. */
export interface BrandLayout {
  /** Margin on every side as a fraction of the canvas short side, 0.04–0.12. */
  margin: number;
  logoCorner: LogoCorner;
  /** Logo envelope as fractions of canvas width (0.05–0.3) and height (0.03–0.12). */
  logoMaxWidth: number;
  logoMaxHeight: number;
}

/** Today's seed geometry: 9 % margin, a 22 % × 8 % logo box at the bottom right. */
export const DEFAULT_BRAND_LAYOUT: BrandLayout = {
  margin: 0.09,
  logoCorner: 'bottom-right',
  logoMaxWidth: 0.22,
  logoMaxHeight: 0.08,
};

/** The range of each number of a layout. One source: the gate, the server schema and the Studio read these. */
export const BRAND_LAYOUT_BOUNDS = {
  margin: { min: 0.04, max: 0.12 },
  logoMaxWidth: { min: 0.05, max: 0.3 },
  logoMaxHeight: { min: 0.03, max: 0.12 },
} as const;

type Canvas = { width: number; height: number };

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

/** The brand's layout, repaired: each number clamped to its range, bad values back to the default. */
export function brandLayout(brand: BrandPack): BrandLayout {
  const l: Partial<Record<keyof BrandLayout, unknown>> = brand.layout ?? {};
  const d = DEFAULT_BRAND_LAYOUT;
  const b = BRAND_LAYOUT_BOUNDS;
  return {
    margin: clamp(l.margin, b.margin.min, b.margin.max, d.margin),
    logoCorner: LOGO_CORNERS.find((c) => c === l.logoCorner) ?? d.logoCorner,
    logoMaxWidth: clamp(l.logoMaxWidth, b.logoMaxWidth.min, b.logoMaxWidth.max, d.logoMaxWidth),
    logoMaxHeight: clamp(
      l.logoMaxHeight,
      b.logoMaxHeight.min,
      b.logoMaxHeight.max,
      d.logoMaxHeight
    ),
  };
}

/** A stored layout pulled into the bounds (for data written under wider ones); never throws. */
export function clampBrandLayout(layout: BrandLayout): BrandLayout {
  return brandLayout({ layout } as BrandPack);
}

/** The canvas inside the margins. */
export function safeArea(layout: BrandLayout, canvas: Canvas): Box {
  const m = Math.round(Math.min(canvas.width, canvas.height) * layout.margin);
  return { x: m, y: m, width: canvas.width - 2 * m, height: canvas.height - 2 * m };
}

/** The box the logo may fill at `corner`, inside the margins. */
export function logoEnvelope(layout: BrandLayout, canvas: Canvas, corner: LogoCorner): Box {
  const safe = safeArea(layout, canvas);
  const width = Math.round(canvas.width * layout.logoMaxWidth);
  const height = Math.round(canvas.height * layout.logoMaxHeight);
  return {
    x: corner.endsWith('left') ? safe.x : safe.x + safe.width - width,
    y: corner.startsWith('top') ? safe.y : safe.y + safe.height - height,
    width,
    height,
  };
}
