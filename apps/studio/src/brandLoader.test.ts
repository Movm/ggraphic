// SPDX-License-Identifier: AGPL-3.0-only
import { activeBrand, registeredBrands } from '@ggraphic/editor/brand';
import * as logoSize from '@ggraphic/editor/page';
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
  vi.restoreAllMocks();
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

  it('measures both logos', async () => {
    const measure = vi.spyOn(logoSize, 'measureLogo').mockResolvedValue(undefined as never);
    await applyBrandPack({
      ...studioBrand,
      id: 'org-2',
      logo: { src: '/api/brand-assets/a.png', label: 'A' },
      logoAlt: { src: '/api/brand-assets/b.png', label: 'B', ground: 'light' },
    });
    expect(measure.mock.calls.map((c) => c[0])).toEqual([
      '/api/brand-assets/a.png',
      '/api/brand-assets/b.png',
    ]);
  });

  it('falls back to the Studio pack alone', async () => {
    await applyBrandPack(null);
    expect(registeredBrands().map((b) => b.id)).toEqual(['studio']);
  });
});
