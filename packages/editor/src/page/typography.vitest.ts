// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { fontFallbackFor, fontStackFor } from './typography.js';

describe('fontFallbackFor', () => {
  it('falls back to a serif stack for the serif roles', () => {
    for (const role of ['quoteShort', 'quoteEmphasis', 'serif']) {
      expect(fontFallbackFor(role), role).toBe('Georgia, serif');
    }
  });

  it('falls back to a sans stack for the others, condensed included', () => {
    for (const role of ['headline', 'body', 'condensed']) {
      expect(fontFallbackFor(role), role).toBe('Arial, sans-serif');
    }
  });

  it('builds the stack from the family and the fallback', () => {
    expect(fontStackFor('serif', 'Lora')).toBe('Lora, Georgia, serif');
    expect(fontStackFor('condensed', 'Oswald')).toBe('Oswald, Arial, sans-serif');
  });
});
