// SPDX-License-Identifier: MPL-2.0
/**
 * The brand binding keys of a page (`bind`, `brandScheme`, `brandStamp`) go
 * through every door a page key has: the persisted and emitted lists, page
 * inheritance (add page, template convert) and the PPTX classification.
 */
import { describe, expect, it } from 'vitest';

import { extractInheritablePageState } from '../configs/pageInheritance.js';
import { buildPptxModel } from '../export/pptx/buildPptxModel.js';

import { hostEmittedStateKeys, pagePersistedStateKeys } from './pageElementStateKeys.js';

const BRAND_KEYS = ['bind', 'brandScheme', 'brandStamp'] as const;

const brandState = () => ({
  bind: { backgroundColor: { ref: 'surface', value: '#ffffff' } },
  brandScheme: 'light',
  brandStamp: 'a1b2c3d4',
});

describe("a page's bind, brandScheme and brandStamp", () => {
  it('survive reload and re-seed: persisted and emitted back to the host', () => {
    expect(pagePersistedStateKeys()).toEqual(expect.arrayContaining([...BRAND_KEYS]));
    expect(hostEmittedStateKeys()).toEqual(expect.arrayContaining([...BRAND_KEYS]));
  });

  it('are kept by an added or converted page', () => {
    expect(extractInheritablePageState(brandState())).toMatchObject(brandState());
  });

  it('pptx export reports no unknown keys for bind, brandScheme, brandStamp', () => {
    const slide = buildPptxModel([brandState() as never], { width: 100, height: 200 } as never)
      .slides[0]!;
    expect(slide.unknownKeys).toEqual([]);
  });
});
