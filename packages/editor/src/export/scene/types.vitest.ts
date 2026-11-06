// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { emptyReport, mergeReports } from './types.js';

describe('export report', () => {
  it('emptyReport has no entries and no fallback', () => {
    expect(emptyReport()).toEqual({
      rasterIslands: [],
      unknownCalls: [],
      missingElements: [],
      missingGlyphs: [],
      outlinedForLicence: [],
      rgbBrandColors: [],
      fallback: null,
    });
  });

  it('emptyReport returns a fresh object each time', () => {
    expect(emptyReport()).not.toBe(emptyReport());
    expect(emptyReport().rasterIslands).not.toBe(emptyReport().rasterIslands);
  });

  it('mergeReports concatenates entries, de-duplicates name lists and keeps the first fallback', () => {
    const a = emptyReport();
    a.rasterIslands.push({ page: 0, elementId: 'a', reason: 'filter' });
    a.unknownCalls.push({ page: 0, elementId: 'a', call: 'getImageData' });
    a.outlinedForLicence.push('Brand Sans');
    a.rgbBrandColors.push('#00ff00');
    a.fallback = { reason: 'first' };
    const b = emptyReport();
    b.rasterIslands.push({ page: 1, elementId: null, reason: 'shadow' });
    b.missingElements.push({ page: 1, elementId: 'c', reason: 'image-unreadable' });
    b.missingGlyphs.push({ page: 1, elementId: 'd', text: '→' });
    b.outlinedForLicence.push('Brand Sans', 'Other');
    b.rgbBrandColors.push('#00ff00', '#ff00ff');
    b.fallback = { reason: 'second' };

    const merged = mergeReports(a, b);
    expect(merged.rasterIslands.map((r) => r.page)).toEqual([0, 1]);
    expect(merged.unknownCalls).toHaveLength(1);
    expect(merged.missingElements).toHaveLength(1);
    expect(merged.missingGlyphs).toHaveLength(1);
    expect(merged.outlinedForLicence).toEqual(['Brand Sans', 'Other']);
    expect(merged.rgbBrandColors).toEqual(['#00ff00', '#ff00ff']);
    expect(merged.fallback).toEqual({ reason: 'first' });
    // The inputs are left alone.
    expect(a.rasterIslands).toHaveLength(1);
    expect(b.outlinedForLicence).toEqual(['Brand Sans', 'Other']);
  });

  it('mergeReports takes the second fallback when the first has none', () => {
    const b = emptyReport();
    b.fallback = { reason: 'second' };
    expect(mergeReports(emptyReport(), b).fallback).toEqual({ reason: 'second' });
  });
});
