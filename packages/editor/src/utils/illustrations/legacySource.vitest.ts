// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { findIllustrationById } from './registry.js';

// Documents saved while 'undraw' was a source still carry it on the instance.
// Rendering resolves by illustrationId, so such an id is simply unknown now and
// must resolve to nothing instead of throwing.
describe('illustration saved with the retired undraw source', () => {
  it('resolves to no definition without throwing', async () => {
    await expect(findIllustrationById('undraw-legacy-id')).resolves.toBeUndefined();
  });
});
