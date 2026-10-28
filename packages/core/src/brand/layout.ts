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
  /** Logo envelope as fractions of canvas width (0.05–0.4) and height (0.03–0.2). */
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

type Canvas = { width: number; height: number };

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

/** The brand's layout, repaired: each number clamped to its range, bad values back to the default. */
export function brandLayout(brand: BrandPack): BrandLayout {
  const l: Partial<Record<keyof BrandLayout, unknown>> = brand.layout ?? {};
  const d = DEFAULT_BRAND_LAYOUT;
  return {
    margin: clamp(l.margin, 0.04, 0.12, d.margin),
    logoCorner: LOGO_CORNERS.find((c) => c === l.logoCorner) ?? d.logoCorner,
    logoMaxWidth: clamp(l.logoMaxWidth, 0.05, 0.4, d.logoMaxWidth),
    logoMaxHeight: clamp(l.logoMaxHeight, 0.03, 0.2, d.logoMaxHeight),
  };
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
