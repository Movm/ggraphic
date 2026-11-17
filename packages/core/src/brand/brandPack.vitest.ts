// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { brandDefault } from './brandDefault.js';

import type { BrandPack } from './brandPack.js';

describe('BrandPack.print', () => {
  it('carries a CMYK map keyed by #rrggbb, and brandDefault has none', () => {
    const pack = {
      ...brandDefault,
      print: { cmyk: { '#0f3a52': [100, 60, 30, 40] } },
    } satisfies BrandPack;

    expect(pack.print.cmyk['#0f3a52']).toEqual([100, 60, 30, 40]);
    // A pack without a map produces a pure RGB PDF.
    expect(brandDefault.print).toBeUndefined();
  });
});
