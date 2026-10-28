// SPDX-License-Identifier: AGPL-3.0-only
import { activeBrand, registeredBrands } from '@ggraphic/editor/brand/brandRegistry';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { studioBrand } from './brand';
import { applyBrandPack } from './brandLoader';

const orgPack = {
  ...studioBrand,
  id: 'org-1',
  name: 'Org',
  fontFaces: [{ family: 'Org Sans', src: '/api/brand-assets/abc.woff2', weight: 700 }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  void applyBrandPack(null);
});

describe('applyBrandPack', () => {
  it('registers the organisation pack first and keeps the Studio pack known', async () => {
    const added: unknown[] = [];
    const load = vi.fn(() => Promise.resolve());
    vi.stubGlobal(
      'FontFace',
      vi.fn(function (this: Record<string, unknown>, family: string, source: string, d: object) {
        Object.assign(this, { family, source, ...d, load });
      })
    );
    Object.assign(document.fonts, { add: (f: unknown) => added.push(f) });
    await applyBrandPack(orgPack);
    expect(activeBrand().id).toBe('org-1');
    expect(registeredBrands().map((b) => b.id)).toEqual(['org-1', 'studio']);
    expect(added).toEqual([
      expect.objectContaining({
        family: 'Org Sans',
        source: 'url("/api/brand-assets/abc.woff2")',
        weight: '700',
        style: 'normal',
      }),
    ]);
    expect(load).toHaveBeenCalled();
  });

  it('falls back to the Studio pack alone', async () => {
    await applyBrandPack(null);
    expect(registeredBrands().map((b) => b.id)).toEqual(['studio']);
  });
});
