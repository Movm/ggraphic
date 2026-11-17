// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { brandDefault } from './brandDefault.js';
import {
  BRAND_LAYOUT_BOUNDS,
  DEFAULT_BRAND_LAYOUT,
  LOGO_CORNERS,
  brandLayout,
  clampBrandLayout,
  logoEnvelope,
  safeArea,
} from './layout.js';

const FORMATS = [
  { width: 1080, height: 1080 },
  { width: 1080, height: 1350 },
  { width: 1920, height: 1080 },
];

describe('brand layout grid', () => {
  it('the default layout reproduces the seed envelope at 1080×1350', () => {
    const canvas = { width: 1080, height: 1350 };
    expect(safeArea(DEFAULT_BRAND_LAYOUT, canvas)).toEqual({
      x: 97,
      y: 97,
      width: 886,
      height: 1156,
    });
    expect(logoEnvelope(DEFAULT_BRAND_LAYOUT, canvas, 'bottom-right')).toEqual({
      x: 745,
      y: 1145,
      width: 238,
      height: 108,
    });
  });

  it('the default layout equals the seed geometry in all three formats', () => {
    for (const { width, height } of FORMATS) {
      // The numbers seeds.ts computes today (frameOf and logoImages).
      const m = Math.round(Math.min(width, height) * 0.09);
      const maxWidth = Math.round(width * 0.22);
      const maxHeight = Math.round(height * 0.08);
      expect(safeArea(DEFAULT_BRAND_LAYOUT, { width, height })).toEqual({
        x: m,
        y: m,
        width: width - 2 * m,
        height: height - 2 * m,
      });
      expect(logoEnvelope(DEFAULT_BRAND_LAYOUT, { width, height }, 'bottom-right')).toEqual({
        x: width - m - maxWidth,
        y: height - m - maxHeight,
        width: maxWidth,
        height: maxHeight,
      });
    }
  });

  it('top-left envelope sits at the margin', () => {
    expect(logoEnvelope(DEFAULT_BRAND_LAYOUT, { width: 1080, height: 1350 }, 'top-left')).toEqual({
      x: 97,
      y: 97,
      width: 238,
      height: 108,
    });
  });

  it('every corner stays inside the safe area', () => {
    const canvas = { width: 1920, height: 1080 };
    const safe = safeArea(DEFAULT_BRAND_LAYOUT, canvas);
    for (const corner of LOGO_CORNERS) {
      const b = logoEnvelope(DEFAULT_BRAND_LAYOUT, canvas, corner);
      expect(b.x).toBeGreaterThanOrEqual(safe.x);
      expect(b.y).toBeGreaterThanOrEqual(safe.y);
      expect(b.x + b.width).toBeLessThanOrEqual(safe.x + safe.width);
      expect(b.y + b.height).toBeLessThanOrEqual(safe.y + safe.height);
    }
  });

  it('16:9 uses the short side for the margin', () => {
    const safe = safeArea(DEFAULT_BRAND_LAYOUT, { width: 1920, height: 1080 });
    expect(safe.x).toBe(97);
    expect(safe.width).toBe(1726);
  });

  it('brandLayout clamps and repairs', () => {
    const of = (layout: object) => brandLayout({ ...brandDefault, layout } as typeof brandDefault);
    expect(of({ ...DEFAULT_BRAND_LAYOUT, margin: 0.5 }).margin).toBe(0.12);
    expect(of({ ...DEFAULT_BRAND_LAYOUT, margin: 0 }).margin).toBe(0.04);
    expect(of({ ...DEFAULT_BRAND_LAYOUT, margin: NaN }).margin).toBe(0.09);
    expect(of({ ...DEFAULT_BRAND_LAYOUT, logoMaxWidth: 9 }).logoMaxWidth).toBe(0.3);
    expect(of({ ...DEFAULT_BRAND_LAYOUT, logoMaxHeight: 0 }).logoMaxHeight).toBe(0.03);
    expect(of({ ...DEFAULT_BRAND_LAYOUT, logoMaxHeight: 0.2 }).logoMaxHeight).toBe(0.12);
    expect(of({ ...DEFAULT_BRAND_LAYOUT, logoCorner: 'middle' }).logoCorner).toBe('bottom-right');
    expect(brandLayout(brandDefault)).toEqual(DEFAULT_BRAND_LAYOUT);
  });

  it('names the bounds: margin 4–12 %, logo box up to 30 × 12 %', () => {
    expect(BRAND_LAYOUT_BOUNDS).toEqual({
      margin: { min: 0.04, max: 0.12 },
      logoMaxWidth: { min: 0.05, max: 0.3 },
      logoMaxHeight: { min: 0.03, max: 0.12 },
    });
  });

  it('clampBrandLayout pulls a stored layout into the bounds and keeps the rest', () => {
    expect(
      clampBrandLayout({
        margin: 0.2,
        logoCorner: 'top-left',
        logoMaxWidth: 0.4,
        logoMaxHeight: 0.2,
      })
    ).toEqual({ margin: 0.12, logoCorner: 'top-left', logoMaxWidth: 0.3, logoMaxHeight: 0.12 });
    expect(clampBrandLayout(DEFAULT_BRAND_LAYOUT)).toEqual(DEFAULT_BRAND_LAYOUT);
  });
});
