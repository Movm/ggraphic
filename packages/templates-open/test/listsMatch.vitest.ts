// SPDX-License-Identifier: CC0-1.0
import { LOGO_CORNERS, SCHEME_IDS } from '@ggraphic/core';
import { TEMPLATE_LOGO_CORNERS, TEMPLATE_SCHEME_IDS } from '@ggraphic/schema';
import { expect, it } from 'vitest';

it('TEMPLATE_SCHEME_IDS equals SCHEME_IDS', () => {
  expect([...TEMPLATE_SCHEME_IDS]).toEqual([...SCHEME_IDS]);
});

it('TEMPLATE_LOGO_CORNERS equals LOGO_CORNERS', () => {
  expect([...TEMPLATE_LOGO_CORNERS]).toEqual([...LOGO_CORNERS]);
});
